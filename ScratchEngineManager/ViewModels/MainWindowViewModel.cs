using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using Avalonia;
using System.Diagnostics;
using System.Threading.Tasks;
using Avalonia.Media;
using Avalonia.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

namespace ScratchEngineManager.ViewModels;

public partial class MainWindowViewModel : ViewModelBase
{
    private static readonly IBrush DefaultLeafBrush = new SolidColorBrush(Color.Parse("#AAB2C0"));
    private readonly string? repositoryRoot;
    private readonly string? gameConfigPath;
    private readonly string? buildConfigPath;
    private readonly string? gitAuthConfigPath;
    private const string DefaultVariationOption = "Select Variation";
    private const string DefaultLocalServerUrl = "Local Server URL";
    private const int LocalServerPort = 3000;
    private string gameConfigSnapshot = string.Empty;
    private string buildConfigSnapshot = string.Empty;
    private string variationGameConfigSnapshot = string.Empty;
    private string variationBuildConfigSnapshot = string.Empty;
    private readonly object localServerLock = new();
    private Process? localServerProcess;
    private JsonNode? gameConfigNode;
    private JsonNode? buildConfigNode;
    private JsonNode? variationGameConfigNode;
    private JsonNode? variationBuildConfigNode;

    private GitAuthConfig gitAuthConfig = new();

    public MainWindowViewModel()
    {
        repositoryRoot = FindRepositoryRoot();
        gameConfigPath = repositoryRoot is null ? null : Path.Combine(repositoryRoot, "src", "gameConfig.json");
        buildConfigPath = repositoryRoot is null ? null : Path.Combine(repositoryRoot, "buildConfig.json");
        gitAuthConfigPath = repositoryRoot is null ? null : Path.Combine(repositoryRoot, "ScratchEngineManager", "config.json");
        VariationOptions = new ObservableCollection<string>(BuildVariationOptions(repositoryRoot));
        SelectedVariation = DefaultVariationOption;
        LoadGitAuthConfig();
        LoadConfigText();
        LoadVariationConfigText();
        LoadAssetEntries();
    }

    public ObservableCollection<string> VariationOptions { get; }

    public ObservableCollection<LogEntry> LogEntries { get; } = new();

    [ObservableProperty]
    private string logText = string.Empty;

    public ObservableCollection<ConfigDisplayItem> GameConfigEntries { get; } = new();

    public ObservableCollection<ConfigDisplayItem> BuildConfigEntries { get; } = new();

    public ObservableCollection<ConfigDisplayItem> VariationGameConfigEntries { get; } = new();

    public ObservableCollection<ConfigDisplayItem> VariationBuildConfigEntries { get; } = new();

    public ObservableCollection<AssetEntryBase> GameAssetEntries { get; } = new();

    public ObservableCollection<AssetEntryBase> VariationAssetEntries { get; } = new();

    [ObservableProperty]
    private string? selectedVariation;

    [ObservableProperty]
    private bool isVariationSelected;

    [ObservableProperty]
    private string gameConfigText = string.Empty;

    [ObservableProperty]
    private string buildConfigText = string.Empty;

    [ObservableProperty]
    private string variationGameConfigText = string.Empty;

    [ObservableProperty]
    private string variationBuildConfigText = string.Empty;

    [ObservableProperty]
    private bool isGameConfigDirty;

    [ObservableProperty]
    private bool isBuildConfigDirty;

    [ObservableProperty]
    private bool isVariationGameConfigDirty;

    [ObservableProperty]
    private bool isVariationBuildConfigDirty;

    [ObservableProperty]
    private bool isBuildRunning;

    [ObservableProperty]
    private bool isUpdatingEngine;

    public bool CanUpdateEngine => !IsUpdatingEngine;

    public Func<Task<GitCredentialPromptResult?>>? RequestGitCredentialsAsync { get; set; }

    partial void OnIsUpdatingEngineChanged(bool value)
    {
        OnPropertyChanged(nameof(CanUpdateEngine));
    }

    public string GameConfigTabHeader => IsGameConfigDirty ? "Game Config *" : "Game Config";

    public string BuildConfigTabHeader => IsBuildConfigDirty ? "Build Config *" : "Build Config";

    public string VariationGameConfigTabHeader => IsVariationGameConfigDirty ? "Variation Game Config *" : "Variation Game Config";

    public string VariationBuildConfigTabHeader => IsVariationBuildConfigDirty ? "Variation Build Config *" : "Variation Build Config";
    
    [ObservableProperty]
    private bool isLocalServerRunning;

    [ObservableProperty]
    private string localServerButtonLabel = "Start Local Server";

    [ObservableProperty]
    private string localServerUrl = DefaultLocalServerUrl;

    [RelayCommand]
    private void ReplaceAssets()
    {
        AppendBlankLine();
        if (string.IsNullOrWhiteSpace(repositoryRoot))
        {
            AppendError("Could not locate repository root. Load Selected Variation To Game aborted.");
            return;
        }

        if (!IsActualVariation(SelectedVariation))
        {
            AppendError("No variation selected. Load Selected Variation To Game aborted.");
            return;
        }

        var variationName = SelectedVariation!;
        var variationRoot = Path.Combine(repositoryRoot, "Variations", variationName);
        if (!Directory.Exists(variationRoot))
        {
            AppendError($"Variation folder not found: {variationRoot}");
            return;
        }

        var oldAssetsRoot = Path.Combine(repositoryRoot, "old_assets");

        try
        {
            AppendInfo("Starting asset replacement...");
            Directory.CreateDirectory(oldAssetsRoot);

            var sourceAssets = Path.Combine(repositoryRoot, "assets");
            var sourceBuildConfig = Path.Combine(repositoryRoot, "buildConfig.json");
            var sourceGameConfig = Path.Combine(repositoryRoot, "src", "gameConfig.json");

            AppendInfo("Backing up current assets and configs...");
            if (Directory.Exists(sourceAssets))
            {
                CopyDirectory(sourceAssets, Path.Combine(oldAssetsRoot, "assets"), true);
                Directory.Delete(sourceAssets, true);
            }
            else
            {
                AppendInfo($"Warning: assets folder not found at {sourceAssets}.");
            }

            if (File.Exists(sourceBuildConfig))
            {
                File.Copy(sourceBuildConfig, Path.Combine(oldAssetsRoot, "buildConfig.json"), true);
                File.Delete(sourceBuildConfig);
            }
            else
            {
                AppendInfo($"Warning: buildConfig.json not found at {sourceBuildConfig}.");
            }

            if (File.Exists(sourceGameConfig))
            {
                Directory.CreateDirectory(Path.Combine(oldAssetsRoot, "src"));
                File.Copy(sourceGameConfig, Path.Combine(oldAssetsRoot, "src", "gameConfig.json"), true);
                File.Delete(sourceGameConfig);
            }
            else
            {
                AppendInfo($"Warning: gameConfig.json not found at {sourceGameConfig}.");
            }

            AppendInfo("Copying selected variation assets and configs...");
            var variationAssets = Path.Combine(variationRoot, "assets");
            var variationBuildConfig = Path.Combine(variationRoot, "buildConfig.json");
            var variationGameConfig = Path.Combine(variationRoot, "src", "gameConfig.json");

            if (Directory.Exists(variationAssets))
            {
                CopyDirectory(variationAssets, sourceAssets, true);
            }
            else
            {
                AppendError($"Variation assets folder not found at {variationAssets}.");
            }

            if (File.Exists(variationBuildConfig))
            {
                File.Copy(variationBuildConfig, sourceBuildConfig, true);
            }
            else
            {
                AppendError($"Variation buildConfig.json not found at {variationBuildConfig}.");
            }

            if (File.Exists(variationGameConfig))
            {
                Directory.CreateDirectory(Path.Combine(repositoryRoot, "src"));
                File.Copy(variationGameConfig, sourceGameConfig, true);
            }
            else
            {
                AppendError($"Variation gameConfig.json not found at {variationGameConfig}.");
            }

            AppendSuccess("Load Selected Variation To Game complete.");
            LoadConfigText();
            LoadAssetEntries();
        }
        catch (Exception ex)
        {
            AppendError($"Error during replacement: {ex.Message}");
        }
    }

    [RelayCommand]
    private void UpdateSelectedVariationAssets()
    {
        AppendBlankLine();
        if (string.IsNullOrWhiteSpace(repositoryRoot))
        {
            AppendError("Could not locate repository root. Replace Selected Variation From Game aborted.");
            return;
        }

        if (!IsActualVariation(SelectedVariation))
        {
            AppendError("No variation selected. Replace Selected Variation From Game aborted.");
            return;
        }

        var variationName = SelectedVariation!;
        var variationRoot = Path.Combine(repositoryRoot, "Variations", variationName);
        if (!Directory.Exists(variationRoot))
        {
            AppendError($"Variation folder not found: {variationRoot}");
            return;
        }

        try
        {
            AppendInfo($"Updating {variationName} variation assets...");

            var sourceAssets = Path.Combine(repositoryRoot, "assets");
            var sourceBuildConfig = Path.Combine(repositoryRoot, "buildConfig.json");
            var sourceGameConfig = Path.Combine(repositoryRoot, "src", "gameConfig.json");

            var variationAssets = Path.Combine(variationRoot, "assets");
            var variationBuildConfig = Path.Combine(variationRoot, "buildConfig.json");
            var variationGameConfig = Path.Combine(variationRoot, "src", "gameConfig.json");

            AppendInfo("Copying current assets to selected variation...");
            
            if (Directory.Exists(sourceAssets))
            {
                if (Directory.Exists(variationAssets))
                {
                    Directory.Delete(variationAssets, true);
                }
                CopyDirectory(sourceAssets, variationAssets, true);
            }
            else
            {
                AppendInfo($"Source assets folder not found at {sourceAssets}.");
            }

            if (File.Exists(sourceBuildConfig))
            {
                Directory.CreateDirectory(Path.GetDirectoryName(variationBuildConfig)!);
                File.Copy(sourceBuildConfig, variationBuildConfig, true);
            }
            else
            {
                AppendInfo($"Source buildConfig.json not found at {sourceBuildConfig}.");
            }

            if (File.Exists(sourceGameConfig))
            {
                Directory.CreateDirectory(Path.GetDirectoryName(variationGameConfig)!);
                File.Copy(sourceGameConfig, variationGameConfig, true);
            }
            else
            {
                AppendInfo($"Source gameConfig.json not found at {sourceGameConfig}.");
            }

            AppendSuccess($"{variationName} variation replaced from game successfully.");
            LoadAssetEntries();
        }
        catch (Exception ex)
        {
            AppendError($"Error replacing selected variation from game: {ex.Message}");
        }
    }

    [RelayCommand]
    private void RefreshGameConfig()
    {
        if (string.IsNullOrWhiteSpace(gameConfigPath))
        {
            AppendError("Game config path not found.");
            return;
        }

        GameConfigText = LoadConfigFile(gameConfigPath);
        gameConfigNode = TryParseJson(GameConfigText);
        PopulateConfigEntries(GameConfigEntries, gameConfigNode, OnGameConfigEntryChanged);
        gameConfigSnapshot = GameConfigText;
        IsGameConfigDirty = false;
        AppendSuccess("Reloaded gameConfig.json.");
    }

    [RelayCommand]
    private void RefreshBuildConfig()
    {
        if (string.IsNullOrWhiteSpace(buildConfigPath))
        {
            AppendError("Build config path not found.");
            return;
        }

        BuildConfigText = LoadConfigFile(buildConfigPath);
        buildConfigNode = TryParseJson(BuildConfigText);
        PopulateConfigEntries(BuildConfigEntries, buildConfigNode, OnBuildConfigEntryChanged);
        buildConfigSnapshot = BuildConfigText;
        IsBuildConfigDirty = false;
        AppendSuccess("Reloaded buildConfig.json.");
    }

    [RelayCommand]
    private void SaveGameConfig()
    {
        if (string.IsNullOrWhiteSpace(gameConfigPath))
        {
            AppendError("Game config path not found.");
            return;
        }

        try
        {
            File.WriteAllText(gameConfigPath, GameConfigText);
            gameConfigSnapshot = GameConfigText;
            IsGameConfigDirty = false;
            AppendSuccess("Saved gameConfig.json.");
        }
        catch (Exception ex)
        {
            AppendError($"Error saving gameConfig.json: {ex.Message}");
        }
    }

    [RelayCommand]
    private void SaveBuildConfig()
    {
        if (string.IsNullOrWhiteSpace(buildConfigPath))
        {
            AppendError("Build config path not found.");
            return;
        }

        try
        {
            File.WriteAllText(buildConfigPath, BuildConfigText);
            buildConfigSnapshot = BuildConfigText;
            IsBuildConfigDirty = false;
            AppendSuccess("Saved buildConfig.json.");
        }
        catch (Exception ex)
        {
            AppendError($"Error saving buildConfig.json: {ex.Message}");
        }
    }

    [RelayCommand]
    private void SaveVariationGameConfig()
    {
        if (!IsVariationSelected || string.IsNullOrWhiteSpace(repositoryRoot))
        {
            AppendError("No variation selected.");
            return;
        }

        var variationRoot = Path.Combine(repositoryRoot, "Variations", SelectedVariation!);
        var variationGameConfigPath = Path.Combine(variationRoot, "src", "gameConfig.json");

        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(variationGameConfigPath)!);
            File.WriteAllText(variationGameConfigPath, VariationGameConfigText);
            variationGameConfigSnapshot = VariationGameConfigText;
            IsVariationGameConfigDirty = false;
            AppendSuccess($"Saved variation gameConfig.json for {SelectedVariation}.");
        }
        catch (Exception ex)
        {
            AppendError($"Error saving variation gameConfig.json: {ex.Message}");
        }
    }

    [RelayCommand]
    private void SaveVariationBuildConfig()
    {
        if (!IsVariationSelected || string.IsNullOrWhiteSpace(repositoryRoot))
        {
            AppendError("No variation selected.");
            return;
        }

        var variationRoot = Path.Combine(repositoryRoot, "Variations", SelectedVariation!);
        var variationBuildConfigPath = Path.Combine(variationRoot, "buildConfig.json");

        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(variationBuildConfigPath)!);
            File.WriteAllText(variationBuildConfigPath, VariationBuildConfigText);
            variationBuildConfigSnapshot = VariationBuildConfigText;
            IsVariationBuildConfigDirty = false;
            AppendSuccess($"Saved variation buildConfig.json for {SelectedVariation}.");
        }
        catch (Exception ex)
        {
            AppendError($"Error saving variation buildConfig.json: {ex.Message}");
        }
    }

    [RelayCommand]
    private void RefreshVariationGameConfig()
    {
        if (!IsVariationSelected || string.IsNullOrWhiteSpace(repositoryRoot))
        {
            AppendError("No variation selected.");
            return;
        }

        var variationRoot = Path.Combine(repositoryRoot, "Variations", SelectedVariation!);
        var variationGameConfigPath = Path.Combine(variationRoot, "src", "gameConfig.json");

        VariationGameConfigText = LoadConfigFile(variationGameConfigPath);
        variationGameConfigNode = TryParseJson(VariationGameConfigText);
        PopulateConfigEntries(VariationGameConfigEntries, variationGameConfigNode, OnVariationGameConfigEntryChanged);
        variationGameConfigSnapshot = VariationGameConfigText;
        IsVariationGameConfigDirty = false;
        AppendSuccess($"Reloaded variation gameConfig.json for {SelectedVariation}.");
    }

    [RelayCommand]
    private void RefreshVariationBuildConfig()
    {
        if (!IsVariationSelected || string.IsNullOrWhiteSpace(repositoryRoot))
        {
            AppendError("No variation selected.");
            return;
        }

        var variationRoot = Path.Combine(repositoryRoot, "Variations", SelectedVariation!);
        var variationBuildConfigPath = Path.Combine(variationRoot, "buildConfig.json");

        VariationBuildConfigText = LoadConfigFile(variationBuildConfigPath);
        variationBuildConfigNode = TryParseJson(VariationBuildConfigText);
        PopulateConfigEntries(VariationBuildConfigEntries, variationBuildConfigNode, OnVariationBuildConfigEntryChanged);
        variationBuildConfigSnapshot = VariationBuildConfigText;
        IsVariationBuildConfigDirty = false;
        AppendSuccess($"Reloaded variation buildConfig.json for {SelectedVariation}.");
    }

    [RelayCommand]
    private void ToggleLocalServer()
    {
        if (IsLocalServerRunning)
        {
            StopLocalServer();
            return;
        }

        AppendBlankLine();
        if (string.IsNullOrWhiteSpace(repositoryRoot))
        {
            AppendError("Could not locate repository root. Server start aborted.");
            return;
        }

        try
        {
            AppendInfo("Starting local server...");
            Process? process;
            if (OperatingSystem.IsWindows())
            {
                process = StartLocalServerProcess("cmd.exe", "/c start-server.bat", repositoryRoot);
            }
            else if (OperatingSystem.IsMacOS())
            {
                process = StartLocalServerProcess("/bin/bash", "start-server.sh", repositoryRoot);
            }
            else
            {
                AppendError("Local server supported only on Windows or macOS.");
                return;
            }

            if (process is null)
            {
                AppendError("Failed to start local server process.");
                return;
            }

            lock (localServerLock)
            {
                localServerProcess = process;
            }

            LocalServerUrl = BuildLocalServerUrl();
            IsLocalServerRunning = true;
            _ = MonitorLocalServerAsync(process);
        }
        catch (Exception ex)
        {
            AppendError($"Local server failed: {ex.Message}");
        }
    }

    private bool CanStartBuild() => !IsBuildRunning;

    [RelayCommand(CanExecute = nameof(CanStartBuild))]
    private async Task StartBuildAsync()
    {
        AppendBlankLine();
        if (!OperatingSystem.IsWindows())
        {
            AppendError("Build currently supported only on Windows.");
            return;
        }

        if (string.IsNullOrWhiteSpace(repositoryRoot))
        {
            AppendError("Could not locate repository root. Build aborted.");
            return;
        }

        IsBuildRunning = true;

        try
        {
            AppendInfo("Starting build process...");
            var exitCode = await RunProcessAsync("cmd.exe", "/c start-build.bat --no-pause", repositoryRoot);

            if (exitCode == 0)
            {
                AppendSuccess("Build completed successfully.");
                LoadConfigText();
            }
            else
            {
                AppendError($"Build failed with exit code {exitCode}.");
            }
        }
        catch (Exception ex)
        {
            AppendError($"Build failed: {ex.Message}");
        }
        finally
        {
            IsBuildRunning = false;
        }
    }

    public async Task UpdateEngineAsync()
    {
        AppendBlankLine();
        if (IsUpdatingEngine)
        {
            AppendInfo("Update Engine already in progress.");
            return;
        }

        if (string.IsNullOrWhiteSpace(repositoryRoot))
        {
            AppendError("Could not locate repository root. Update Engine aborted.");
            return;
        }

        IsUpdatingEngine = true;

        try
        {
            AppendInfo("Validating git availability...");
            var gitVersionResult = await RunProcessWithResultAsync("git", "--version", repositoryRoot);
            if (gitVersionResult.ExitCode != 0)
            {
                AppendError("Git is not available. Please install Git and ensure it is on your PATH.");
                return;
            }

            AppendInfo("Updating engine from git...");
            if (!await RunGitCommandAsync("reset --hard", "Git reset failed."))
            {
                return;
            }

            if (!await RunGitCommandAsync("clean -df", "Git clean failed."))
            {
                return;
            }

            if (!await RunGitCommandAsync("checkout main", "Git checkout failed."))
            {
                return;
            }

            if (!await RunGitCommandAsync("pull", "Git pull failed. Please verify your credentials and remote access."))
            {
                return;
            }

            AppendSuccess("Update Engine complete.");
            LoadConfigText();
            LoadVariationConfigText();
        }
        catch (Win32Exception)
        {
            AppendError("Git is not installed or not available on PATH. Please install Git and restart the app.");
        }
        catch (Exception ex)
        {
            AppendError($"Update Engine failed: {ex.Message}");
        }
        finally
        {
            IsUpdatingEngine = false;
        }
    }

    private async Task<bool> RunGitCommandAsync(string arguments, string failureMessage)
    {
        var result = await RunProcessWithResultAsync("git", arguments, repositoryRoot!);
        if (result.ExitCode != 0)
        {
            if (arguments == "pull" && IsGitAuthFailure(result.StandardError))
            {
                var retrySucceeded = await TryPullWithCredentialsAsync();
                if (retrySucceeded)
                {
                    return true;
                }
            }

            AppendError(failureMessage);
            if (arguments == "pull")
            {
                AppendGitAuthGuidanceIfNeeded(result.StandardError);
            }
            return false;
        }

        return true;
    }

    private static string? FindRepositoryRoot()
    {
        var current = new DirectoryInfo(AppContext.BaseDirectory);

        while (current != null)
        {
            var variationsPath = Path.Combine(current.FullName, "Variations");
            if (Directory.Exists(variationsPath))
            {
                return current.FullName;
            }

            current = current.Parent;
        }

        return null;
    }

    private static IEnumerable<string> BuildVariationOptions(string? rootPath)
    {
        yield return DefaultVariationOption;

        if (string.IsNullOrWhiteSpace(rootPath))
        {
            yield break;
        }

        var variationsPath = Path.Combine(rootPath, "Variations");
        if (!Directory.Exists(variationsPath))
        {
            yield break;
        }

        foreach (var name in Directory.GetDirectories(variationsPath)
            .Select(Path.GetFileName)
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .OrderBy(name => name, StringComparer.OrdinalIgnoreCase))
        {
            yield return name!;
        }
    }

    partial void OnSelectedVariationChanged(string? value)
    {
        IsVariationSelected = IsActualVariation(value);
        LoadVariationConfigText();
        LoadVariationAssetEntries();
    }

    private static bool IsActualVariation(string? variation) =>
        !string.IsNullOrWhiteSpace(variation) &&
        !string.Equals(variation, DefaultVariationOption, StringComparison.Ordinal);

    private void LoadConfigText()
    {
        GameConfigText = LoadConfigFile(gameConfigPath);
        BuildConfigText = LoadConfigFile(buildConfigPath);
        gameConfigNode = TryParseJson(GameConfigText);
        buildConfigNode = TryParseJson(BuildConfigText);
        PopulateConfigEntries(GameConfigEntries, gameConfigNode, OnGameConfigEntryChanged);
        PopulateConfigEntries(BuildConfigEntries, buildConfigNode, OnBuildConfigEntryChanged);
        gameConfigSnapshot = GameConfigText;
        buildConfigSnapshot = BuildConfigText;
        IsGameConfigDirty = false;
        IsBuildConfigDirty = false;
    }

    private void LoadVariationConfigText()
    {
        if (!IsVariationSelected || string.IsNullOrWhiteSpace(repositoryRoot))
        {
            VariationGameConfigText = string.Empty;
            VariationBuildConfigText = string.Empty;
            variationGameConfigNode = null;
            variationBuildConfigNode = null;
            VariationGameConfigEntries.Clear();
            VariationBuildConfigEntries.Clear();
            return;
        }

        var variationRoot = Path.Combine(repositoryRoot, "Variations", SelectedVariation!);
        var variationGameConfigPath = Path.Combine(variationRoot, "src", "gameConfig.json");
        var variationBuildConfigPath = Path.Combine(variationRoot, "buildConfig.json");

        VariationGameConfigText = LoadConfigFile(variationGameConfigPath);
        VariationBuildConfigText = LoadConfigFile(variationBuildConfigPath);
        variationGameConfigNode = TryParseJson(VariationGameConfigText);
        variationBuildConfigNode = TryParseJson(VariationBuildConfigText);
        PopulateConfigEntries(VariationGameConfigEntries, variationGameConfigNode, OnVariationGameConfigEntryChanged);
        PopulateConfigEntries(VariationBuildConfigEntries, variationBuildConfigNode, OnVariationBuildConfigEntryChanged);
        
        variationGameConfigSnapshot = VariationGameConfigText;
        variationBuildConfigSnapshot = VariationBuildConfigText;
        IsVariationGameConfigDirty = false;
        IsVariationBuildConfigDirty = false;
    }

    private void LoadAssetEntries()
    {
        if (string.IsNullOrWhiteSpace(repositoryRoot))
        {
            GameAssetEntries.Clear();
            VariationAssetEntries.Clear();
            return;
        }

        var assetsRoot = Path.Combine(repositoryRoot, "assets");
        PopulateAssetEntries(GameAssetEntries, assetsRoot);
        LoadVariationAssetEntries();
    }

    private void LoadVariationAssetEntries()
    {
        VariationAssetEntries.Clear();
        if (!IsVariationSelected || string.IsNullOrWhiteSpace(repositoryRoot))
        {
            return;
        }

        var variationRoot = Path.Combine(repositoryRoot, "Variations", SelectedVariation!);
        var variationAssets = Path.Combine(variationRoot, "assets");
        PopulateAssetEntries(VariationAssetEntries, variationAssets);
    }

    private static void PopulateAssetEntries(ObservableCollection<AssetEntryBase> target, string assetsRoot)
    {
        target.Clear();
        if (!Directory.Exists(assetsRoot))
        {
            return;
        }

        foreach (var directory in Directory.GetDirectories(assetsRoot).OrderBy(Path.GetFileName, StringComparer.OrdinalIgnoreCase))
        {
            target.Add(BuildFolderEntry(directory, 0));
        }

        foreach (var file in Directory.GetFiles(assetsRoot).OrderBy(Path.GetFileName, StringComparer.OrdinalIgnoreCase))
        {
            target.Add(CreateFileEntry(target, file, 0));
        }
    }

    private static AssetFolderEntry BuildFolderEntry(string folderPath, int depth)
    {
        var entry = new AssetFolderEntry(Path.GetFileName(folderPath), folderPath, depth);

        foreach (var directory in Directory.GetDirectories(folderPath).OrderBy(Path.GetFileName, StringComparer.OrdinalIgnoreCase))
        {
            entry.Children.Add(BuildFolderEntry(directory, depth + 1));
        }

        foreach (var file in Directory.GetFiles(folderPath).OrderBy(Path.GetFileName, StringComparer.OrdinalIgnoreCase))
        {
            entry.Children.Add(CreateFileEntry(entry.Children, file, depth + 1));
        }

        return entry;
    }

    private static AssetFileEntry CreateFileEntry(ObservableCollection<AssetEntryBase> owner, string filePath, int depth)
    {
        return new AssetFileEntry(filePath, depth, entry => owner.Remove(entry));
    }

    [RelayCommand]
    private void RefreshGameAssets()
    {
        LoadAssetEntries();
    }

    [RelayCommand]
    private void RefreshVariationAssets()
    {
        LoadVariationAssetEntries();
    }

    public void ReplaceAssetFile(AssetFileEntry entry, string sourcePath)
    {
        if (!File.Exists(sourcePath))
        {
            return;
        }

        try
        {
            var destinationPath = entry.FullPath;
            var destinationDirectory = Path.GetDirectoryName(destinationPath);
            if (!string.IsNullOrWhiteSpace(destinationDirectory))
            {
                Directory.CreateDirectory(destinationDirectory);
            }

            File.Copy(sourcePath, destinationPath, true);
            entry.RefreshPreview();
            AppendSuccess($"Replaced asset: {entry.FileName}");
        }
        catch (Exception ex)
        {
            AppendError($"Failed to replace asset {entry.FileName}: {ex.Message}");
        }
    }

    public void CommitPendingAssetRenames()
    {
        CommitRenamesInCollection(GameAssetEntries);
        CommitRenamesInCollection(VariationAssetEntries);
    }

    private static void CommitRenamesInCollection(IEnumerable<AssetEntryBase> entries)
    {
        foreach (var entry in entries)
        {
            switch (entry)
            {
                case AssetFileEntry fileEntry when fileEntry.IsRenaming:
                    fileEntry.CommitRenameCommand.Execute(null);
                    break;
                case AssetFolderEntry folderEntry:
                    CommitRenamesInCollection(folderEntry.Children);
                    break;
            }
        }
    }

    private string LoadConfigFile(string? configPath)
    {
        if (string.IsNullOrWhiteSpace(configPath) || !File.Exists(configPath))
        {
            return string.Empty;
        }

        try
        {
            return File.ReadAllText(configPath);
        }
        catch (Exception ex)
        {
            AppendError($"Error loading config {configPath}: {ex.Message}");
            return string.Empty;
        }
    }

    private void AppendBlankLine()
    {
        if (LogEntries.Count == 0)
        {
            return;
        }

        AppendLogEntry(string.Empty, Brushes.Transparent);
    }

    private void AppendInfo(string message) => AppendLogEntry(message, Brushes.WhiteSmoke);

    private void AppendSuccess(string message) => AppendLogEntry(message, Brushes.LimeGreen);

    private void AppendError(string message) => AppendLogEntry(message, Brushes.Red);

    private void AppendLogEntry(string message, IBrush brush)
    {
        void AddEntry()
        {
            LogEntries.Add(new LogEntry(message, brush));
            LogText = string.IsNullOrEmpty(LogText) ? message : $"{LogText}{Environment.NewLine}{message}";
        }

        if (Dispatcher.UIThread.CheckAccess())
        {
            AddEntry();
        }
        else
        {
            Dispatcher.UIThread.Post(AddEntry);
        }
    }

    private static void CopyDirectory(string sourcePath, string destinationPath, bool overwrite)
    {
        var sourceInfo = new DirectoryInfo(sourcePath);
        if (!sourceInfo.Exists)
        {
            return;
        }

        Directory.CreateDirectory(destinationPath);

        foreach (var file in sourceInfo.GetFiles())
        {
            var targetFilePath = Path.Combine(destinationPath, file.Name);
            file.CopyTo(targetFilePath, overwrite);
        }

        foreach (var directory in sourceInfo.GetDirectories())
        {
            var targetDirectoryPath = Path.Combine(destinationPath, directory.Name);
            CopyDirectory(directory.FullName, targetDirectoryPath, overwrite);
        }
    }

    public sealed record LogEntry(string Message, IBrush Foreground);

    partial void OnGameConfigTextChanged(string value)
    {
        IsGameConfigDirty = !string.Equals(value, gameConfigSnapshot, StringComparison.Ordinal);
    }

    partial void OnIsGameConfigDirtyChanged(bool value)
    {
        OnPropertyChanged(nameof(GameConfigTabHeader));
    }

    partial void OnBuildConfigTextChanged(string value)
    {
        IsBuildConfigDirty = !string.Equals(value, buildConfigSnapshot, StringComparison.Ordinal);
    }

    partial void OnIsBuildConfigDirtyChanged(bool value)
    {
        OnPropertyChanged(nameof(BuildConfigTabHeader));
    }

    private static JsonNode? TryParseJson(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        try
        {
            return JsonNode.Parse(text);
        }
        catch
        {
            return null;
        }
    }

    private void PopulateConfigEntries(
        ObservableCollection<ConfigDisplayItem> target,
        JsonNode? rootNode,
        Action<ConfigValueEntry> onValueChanged)
    {
        target.Clear();
        if (rootNode is null)
        {
            return;
        }

        var path = new List<ConfigPathSegment>();
        var items = new List<ConfigDisplayItem>();
        CollectConfigItems(rootNode, path, items, 0, onValueChanged, () => UpdateVisibility(items));
        ApplyHierarchyPresentation(items);
        UpdateVisibility(items);

        foreach (var item in items)
        {
            target.Add(item);
        }
    }

    private void CollectConfigItems(
        JsonNode? node,
        List<ConfigPathSegment> path,
        List<ConfigDisplayItem> target,
        int depth,
        Action<ConfigValueEntry> onValueChanged,
        Action visibilityUpdater)
    {
        if (node is null)
        {
            return;
        }

        if (node is JsonObject obj)
        {
            var isRoot = path.Count == 0;
            if (!isRoot)
            {
                target.Add(new ConfigGroupEntry(GetCurrentLabel(path), path.ToArray(), depth, _ => visibilityUpdater()));
            }

            var childDepth = isRoot ? depth : depth + 1;
            foreach (var entry in obj)
            {
                path.Add(new ConfigPathSegment(entry.Key, null));
                CollectConfigItems(entry.Value, path, target, childDepth, onValueChanged, visibilityUpdater);
                path.RemoveAt(path.Count - 1);
            }

            return;
        }

        if (node is JsonArray array)
        {
            if (path.Count > 0)
            {
                target.Add(new ConfigGroupEntry(GetCurrentLabel(path), path.ToArray(), depth, _ => visibilityUpdater()));
            }

            for (var i = 0; i < array.Count; i++)
            {
                path.Add(new ConfigPathSegment(null, i));
                CollectConfigItems(array[i], path, target, depth + 1, onValueChanged, visibilityUpdater);
                path.RemoveAt(path.Count - 1);
            }

            return;
        }

        if (node is JsonValue valueNode)
        {
            var displayPath = BuildDisplayPath(path);
            var (valueText, valueType) = ExtractValue(valueNode);
            var segments = path.ToArray();
            target.Add(new ConfigValueEntry(displayPath, segments, valueText, valueType, depth, onValueChanged));
        }
    }

    private static string BuildDisplayPath(IReadOnlyList<ConfigPathSegment> path)
    {
        var result = string.Empty;
        foreach (var segment in path)
        {
            if (!string.IsNullOrWhiteSpace(segment.PropertyName))
            {
                result = string.IsNullOrEmpty(result) ? segment.PropertyName! : $"{result}.{segment.PropertyName}";
            }

            if (segment.Index is not null)
            {
                result = $"{result}[{segment.Index}]";
            }
        }

        return result;
    }

    private static string GetCurrentLabel(IReadOnlyList<ConfigPathSegment> path)
    {
        if (path.Count == 0)
        {
            return string.Empty;
        }

        var segment = path[^1];
        return segment.PropertyName ?? $"[{segment.Index}]";
    }

    private void UpdateVisibility(IReadOnlyList<ConfigDisplayItem> items)
    {
        var expansionStack = new Stack<bool>();

        foreach (var item in items)
        {
            while (expansionStack.Count > item.Depth)
            {
                expansionStack.Pop();
            }

            var ancestorsExpanded = expansionStack.All(expanded => expanded);
            item.IsVisible = ancestorsExpanded;

            if (item is ConfigGroupEntry group)
            {
                expansionStack.Push(group.IsExpanded);
            }
        }
    }

    private static (string valueText, ConfigValueType valueType) ExtractValue(JsonValue node)
    {
        if (node.TryGetValue<string>(out var stringValue))
        {
            return (stringValue ?? string.Empty, ConfigValueType.String);
        }

        if (node.TryGetValue<bool>(out var boolValue))
        {
            return (boolValue ? "true" : "false", ConfigValueType.Boolean);
        }

        if (node.TryGetValue<long>(out var longValue))
        {
            return (longValue.ToString(CultureInfo.InvariantCulture), ConfigValueType.Number);
        }

        if (node.TryGetValue<double>(out var doubleValue))
        {
            return (doubleValue.ToString(CultureInfo.InvariantCulture), ConfigValueType.Number);
        }

        if (node.TryGetValue<decimal>(out var decimalValue))
        {
            return (decimalValue.ToString(CultureInfo.InvariantCulture), ConfigValueType.Number);
        }

        var json = node.ToJsonString();
        if (string.Equals(json, "null", StringComparison.OrdinalIgnoreCase))
        {
            return ("null", ConfigValueType.Null);
        }

        return (json.Trim('"'), ConfigValueType.Unknown);
    }

    private void ApplyHierarchyPresentation(IReadOnlyList<ConfigDisplayItem> items)
    {
        var groupColors = new Dictionary<string, IBrush>(StringComparer.Ordinal);
        var random = new Random(7319);
        IReadOnlyList<ConfigPathSegment>? previousSegments = null;

        foreach (var item in items)
        {
            switch (item)
            {
                case ConfigValueEntry entry:
                    entry.DisplaySegments = BuildDisplaySegments(entry.Segments, groupColors, random);
                    entry.ItemMargin = BuildHierarchyMargin(entry.Segments, previousSegments);
                    previousSegments = entry.Segments;
                    break;
                case ConfigGroupEntry group:
                    group.LabelBrush = GetGroupLabelBrush(group.Segments, groupColors, random);
                    previousSegments = null;
                    break;
                default:
                    previousSegments = null;
                    break;
            }
        }
    }

    private static IReadOnlyList<ConfigPathDisplaySegment> BuildDisplaySegments(
        IReadOnlyList<ConfigPathSegment> segments,
        IDictionary<string, IBrush> groupColors,
        Random random)
    {
        if (segments.Count == 0)
        {
            return Array.Empty<ConfigPathDisplaySegment>();
        }

        var displaySegments = new List<ConfigPathDisplaySegment>(segments.Count);
        for (var i = 0; i < segments.Count; i++)
        {
            var segment = segments[i];
            var text = segment.PropertyName ?? $"[{segment.Index}]";
            if (i < segments.Count - 1 && segment.PropertyName is not null)
            {
                text = AbbreviatePathSegment(segment.PropertyName);
            }
            if (i < segments.Count - 1 && ShouldAppendDot(segment, segments[i + 1]))
            {
                text += ".";
            }

            var brush = i == segments.Count - 1
                ? DefaultLeafBrush
                : GetBrushForPrefix(segments, i, groupColors, random);
            displaySegments.Add(new ConfigPathDisplaySegment(text, brush));
        }

        return displaySegments;
    }

    private static string AbbreviatePathSegment(string propertyName)
    {
        if (string.IsNullOrWhiteSpace(propertyName))
        {
            return string.Empty;
        }

        var abbreviation = new StringBuilder(propertyName.Length);
        var previousWasSeparator = true;

        for (var i = 0; i < propertyName.Length; i++)
        {
            var current = propertyName[i];
            if (!char.IsLetterOrDigit(current))
            {
                previousWasSeparator = true;
                continue;
            }

            var previous = i > 0 ? propertyName[i - 1] : '\0';
            var isBoundary = previousWasSeparator
                || (char.IsUpper(current) && i > 0 && char.IsLower(previous))
                || (char.IsDigit(current) && i > 0 && !char.IsDigit(previous));

            if (isBoundary)
            {
                abbreviation.Append(current);
            }

            previousWasSeparator = false;
        }

        return abbreviation.Length == 0 ? propertyName : abbreviation.ToString();
    }

    private static IBrush GetGroupLabelBrush(
        IReadOnlyList<ConfigPathSegment> segments,
        IDictionary<string, IBrush> groupColors,
        Random random)
    {
        if (segments.Count == 0)
        {
            return Brushes.WhiteSmoke;
        }

        return GetBrushForPrefix(segments, segments.Count - 1, groupColors, random);
    }

    private static Thickness BuildHierarchyMargin(
        IReadOnlyList<ConfigPathSegment> current,
        IReadOnlyList<ConfigPathSegment>? previous)
    {
        if (previous is null || previous.Count == 0 || current.Count == 0)
        {
            return new Thickness(0, 0, 0, 10);
        }

        var sharedDepth = 0;
        var maxDepth = Math.Min(current.Count, previous.Count);
        while (sharedDepth < maxDepth && SegmentEquals(current[sharedDepth], previous[sharedDepth]))
        {
            sharedDepth++;
        }

        var sameParentDepth = maxDepth - 1;
        if (sharedDepth >= sameParentDepth)
        {
            return new Thickness(0, 0, 0, 10);
        }

        var topMargin = sharedDepth switch
        {
            0 => 14,
            1 => 10,
            _ => 6,
        };
        return new Thickness(0, topMargin, 0, 10);
    }

    private static bool SegmentEquals(ConfigPathSegment left, ConfigPathSegment right)
    {
        return string.Equals(left.PropertyName, right.PropertyName, StringComparison.Ordinal)
            && left.Index == right.Index;
    }

    private static bool ShouldAppendDot(ConfigPathSegment current, ConfigPathSegment next)
    {
        return next.PropertyName is not null && (current.PropertyName is not null || current.Index is not null);
    }

    private static IBrush GetBrushForPrefix(
        IReadOnlyList<ConfigPathSegment> segments,
        int segmentIndex,
        IDictionary<string, IBrush> groupColors,
        Random random)
    {
        var prefix = BuildPrefixKey(segments, segmentIndex);
        if (!groupColors.TryGetValue(prefix, out var brush))
        {
            brush = CreateRandomBrush(random);
            groupColors[prefix] = brush;
        }

        return brush;
    }

    private static string BuildPrefixKey(IReadOnlyList<ConfigPathSegment> segments, int lastIndex)
    {
        var result = string.Empty;
        for (var i = 0; i <= lastIndex; i++)
        {
            var segment = segments[i];
            if (!string.IsNullOrWhiteSpace(segment.PropertyName))
            {
                result = string.IsNullOrEmpty(result) ? segment.PropertyName! : $"{result}.{segment.PropertyName}";
            }

            if (segment.Index is not null)
            {
                result = $"{result}[{segment.Index}]";
            }
        }

        return result;
    }

    private static IBrush CreateRandomBrush(Random random)
    {
        var hue = random.NextDouble() * 360.0;
        var saturation = 0.5 + random.NextDouble() * 0.25;
        var lightness = 0.55 + random.NextDouble() * 0.15;
        return new SolidColorBrush(FromHsl(hue, saturation, lightness));
    }

    private static Color FromHsl(double hue, double saturation, double lightness)
    {
        var c = (1 - Math.Abs(2 * lightness - 1)) * saturation;
        var x = c * (1 - Math.Abs((hue / 60.0 % 2) - 1));
        var m = lightness - c / 2;

        double r;
        double g;
        double b;
        if (hue < 60)
        {
            r = c;
            g = x;
            b = 0;
        }
        else if (hue < 120)
        {
            r = x;
            g = c;
            b = 0;
        }
        else if (hue < 180)
        {
            r = 0;
            g = c;
            b = x;
        }
        else if (hue < 240)
        {
            r = 0;
            g = x;
            b = c;
        }
        else if (hue < 300)
        {
            r = x;
            g = 0;
            b = c;
        }
        else
        {
            r = c;
            g = 0;
            b = x;
        }

        return Color.FromRgb(
            (byte)Math.Round((r + m) * 255),
            (byte)Math.Round((g + m) * 255),
            (byte)Math.Round((b + m) * 255));
    }

    private void OnGameConfigEntryChanged(ConfigValueEntry entry)
    {
        if (gameConfigNode is null)
        {
            return;
        }

        if (TryUpdateJsonValue(gameConfigNode, entry))
        {
            GameConfigText = gameConfigNode.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
            IsGameConfigDirty = !string.Equals(GameConfigText, gameConfigSnapshot, StringComparison.Ordinal);
        }
    }

    private void OnBuildConfigEntryChanged(ConfigValueEntry entry)
    {
        if (buildConfigNode is null)
        {
            return;
        }

        if (TryUpdateJsonValue(buildConfigNode, entry))
        {
            BuildConfigText = buildConfigNode.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
            IsBuildConfigDirty = !string.Equals(BuildConfigText, buildConfigSnapshot, StringComparison.Ordinal);
        }
    }

    private void OnVariationGameConfigEntryChanged(ConfigValueEntry entry)
    {
        if (variationGameConfigNode is null)
        {
            return;
        }

        if (TryUpdateJsonValue(variationGameConfigNode, entry))
        {
            VariationGameConfigText = variationGameConfigNode.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
            IsVariationGameConfigDirty = !string.Equals(VariationGameConfigText, variationGameConfigSnapshot, StringComparison.Ordinal);
        }
    }

    private void OnVariationBuildConfigEntryChanged(ConfigValueEntry entry)
    {
        if (variationBuildConfigNode is null)
        {
            return;
        }

        if (TryUpdateJsonValue(variationBuildConfigNode, entry))
        {
            VariationBuildConfigText = variationBuildConfigNode.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
            IsVariationBuildConfigDirty = !string.Equals(VariationBuildConfigText, variationBuildConfigSnapshot, StringComparison.Ordinal);
        }
    }

    private static bool TryUpdateJsonValue(JsonNode rootNode, ConfigValueEntry entry)
    {
        if (entry.Segments.Count == 0)
        {
            return false;
        }

        JsonNode? current = rootNode;
        for (var i = 0; i < entry.Segments.Count - 1; i++)
        {
            var segment = entry.Segments[i];
            current = GetSegmentNode(current, segment);
            if (current is null)
            {
                return false;
            }
        }

        var last = entry.Segments[^1];
        var replacement = CreateValueNode(entry.Value, entry.ValueType);
        if (current is JsonObject obj && last.PropertyName is not null)
        {
            obj[last.PropertyName] = replacement;
            return true;
        }

        if (current is JsonArray array && last.Index is not null)
        {
            array[last.Index.Value] = replacement;
            return true;
        }

        return false;
    }

    private static JsonNode? GetSegmentNode(JsonNode? node, ConfigPathSegment segment)
    {
        if (node is null)
        {
            return null;
        }

        if (segment.PropertyName is not null && node is JsonObject obj)
        {
            return obj[segment.PropertyName];
        }

        if (segment.Index is not null && node is JsonArray array && segment.Index.Value < array.Count)
        {
            return array[segment.Index.Value];
        }

        return null;
    }

    private static JsonNode? CreateValueNode(string value, ConfigValueType valueType)
    {
        switch (valueType)
        {
            case ConfigValueType.Boolean:
                if (bool.TryParse(value, out var boolValue))
                {
                    return JsonValue.Create(boolValue);
                }

                return JsonValue.Create(value);
            case ConfigValueType.Number:
                if (long.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var longValue))
                {
                    return JsonValue.Create(longValue);
                }

                if (double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var doubleValue))
                {
                    return JsonValue.Create(doubleValue);
                }

                if (decimal.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var decimalValue))
                {
                    return JsonValue.Create(decimalValue);
                }

                return JsonValue.Create(value);
            case ConfigValueType.Null:
                return string.Equals(value.Trim(), "null", StringComparison.OrdinalIgnoreCase)
                    ? null
                    : JsonValue.Create(value);
            case ConfigValueType.String:
                return JsonValue.Create(value);
            case ConfigValueType.Unknown:
            default:
                return JsonValue.Create(value);
        }
    }
    
    partial void OnIsBuildRunningChanged(bool value)
    {
        StartBuildCommand.NotifyCanExecuteChanged();
    }

    partial void OnIsLocalServerRunningChanged(bool value)
    {
        LocalServerButtonLabel = value ? "Stop Local Server" : "Start Local Server";
        if (!value)
        {
            LocalServerUrl = DefaultLocalServerUrl;
        }
    }

    public void StopLocalServer()
    {
        AppendBlankLine();
        AppendInfo("Stopping local server...");
        Process? process;
        lock (localServerLock)
        {
            process = localServerProcess;
        }

        if (process is null || process.HasExited)
        {
            AppendInfo("Local server is not running.");
            IsLocalServerRunning = false;
            return;
        }

        try
        {
            process.Kill(entireProcessTree: true);
            process.WaitForExit();
            AppendSuccess("Local server stopped.");
        }
        catch (Exception ex)
        {
            AppendError($"Failed to stop local server: {ex.Message}");
        }
        finally
        {
            IsLocalServerRunning = false;
            lock (localServerLock)
            {
                localServerProcess = null;
            }
        }
    }

    private async Task<int> RunProcessAsync(string fileName, string arguments, string workingDirectory)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = fileName,
            Arguments = arguments,
            WorkingDirectory = workingDirectory,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        using var process = new Process { StartInfo = startInfo };
        process.Start();

        var outputTask = ReadStreamAsync(process.StandardOutput, AppendInfo);
        var errorTask = ReadStreamAsync(process.StandardError, AppendError);

        await Task.WhenAll(outputTask, errorTask, process.WaitForExitAsync());

        return process.ExitCode;
    }

    private async Task<ProcessResult> RunProcessWithResultAsync(
        string fileName,
        string arguments,
        string workingDirectory,
        IReadOnlyDictionary<string, string>? environmentVariables = null)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = fileName,
            Arguments = arguments,
            WorkingDirectory = workingDirectory,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        if (environmentVariables is not null)
        {
            foreach (var (key, value) in environmentVariables)
            {
                startInfo.Environment[key] = value;
            }
        }

        using var process = new Process { StartInfo = startInfo };
        process.Start();

        var outputBuilder = new StringBuilder();
        var errorBuilder = new StringBuilder();

        void AppendInfoLine(string line)
        {
            outputBuilder.AppendLine(line);
            AppendInfo(line);
        }

        void AppendErrorLine(string line)
        {
            errorBuilder.AppendLine(line);
            AppendError(line);
        }

        var outputTask = ReadStreamAsync(process.StandardOutput, AppendInfoLine);
        var errorTask = ReadStreamAsync(process.StandardError, AppendErrorLine);

        await Task.WhenAll(outputTask, errorTask, process.WaitForExitAsync());

        return new ProcessResult(process.ExitCode, outputBuilder.ToString(), errorBuilder.ToString());
    }

    private Process? StartLocalServerProcess(string fileName, string arguments, string workingDirectory)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = fileName,
            Arguments = arguments,
            WorkingDirectory = workingDirectory,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        var process = new Process { StartInfo = startInfo, EnableRaisingEvents = true };

        if (!process.Start())
        {
            return null;
        }

        _ = ReadStreamAsync(process.StandardOutput, AppendInfo);
        _ = ReadStreamAsync(process.StandardError, AppendError);

        return process;
    }

    private string BuildLocalServerUrl()
    {
        var ip = GetLocalIpAddress() ?? "localhost";
        return $"http://{ip}:{LocalServerPort}";
    }

    private static string? GetLocalIpAddress()
    {
        try
        {
            foreach (var ip in Dns.GetHostEntry(Dns.GetHostName()).AddressList)
            {
                if (ip.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(ip))
                {
                    return ip.ToString();
                }
            }
        }
        catch
        {
            // ignored - fallback will be used
        }

        return null;
    }

    private async Task MonitorLocalServerAsync(Process process)
    {
        var shouldReportExit = true;

        try
        {
            await process.WaitForExitAsync();
        }
        catch (Exception ex)
        {
            AppendError($"Local server monitoring error: {ex.Message}");
            shouldReportExit = false;
        }
        finally
        {
            if (!IsLocalServerRunning)
            {
                shouldReportExit = false;
            }

            if (shouldReportExit)
            {
                var exitCode = process.ExitCode;
                if (exitCode == 0)
                {
                    AppendSuccess("Local server stopped.");
                }
                else
                {
                    AppendError($"Local server exited with code {exitCode}.");
                }
            }

            IsLocalServerRunning = false;
            lock (localServerLock)
            {
                if (ReferenceEquals(localServerProcess, process))
                {
                    localServerProcess = null;
                }
            }
        }
    }

    private static async Task ReadStreamAsync(StreamReader reader, Action<string> appendLine)
    {
        while (await reader.ReadLineAsync() is { } line)
        {
            if (!string.IsNullOrWhiteSpace(line))
            {
                appendLine(line);
            }
        }
    }

    private void AppendGitAuthGuidanceIfNeeded(string errorOutput)
    {
        if (string.IsNullOrWhiteSpace(errorOutput))
        {
            return;
        }

        var normalized = errorOutput.ToLowerInvariant();
        if (normalized.Contains("permission denied (publickey)") ||
            normalized.Contains("could not read from remote repository") ||
            normalized.Contains("authentication failed"))
        {
            AppendInfo("Git authentication failed. If using SSH, ensure your SSH key is added to the agent and uploaded to your Git host.");
            AppendInfo("If using HTTPS, update stored credentials (Windows Credential Manager / macOS Keychain) or switch the remote URL to HTTPS.");
            AppendInfo("You can verify the remote URL with: git remote -v");
        }
    }

    private static bool IsGitAuthFailure(string errorOutput)
    {
        if (string.IsNullOrWhiteSpace(errorOutput))
        {
            return false;
        }

        var normalized = errorOutput.ToLowerInvariant();
        return normalized.Contains("permission denied (publickey)") ||
               normalized.Contains("could not read from remote repository") ||
               normalized.Contains("authentication failed") ||
               normalized.Contains("fatal: authentication failed");
    }

    private async Task<bool> TryPullWithCredentialsAsync()
    {
        if (TryGetConfigCredentials(out var configCredentials))
        {
            var configSuccess = await TryPullWithCredentialsAsync(configCredentials, saveOnSuccess: false);
            if (configSuccess)
            {
                return true;
            }

            AppendInfo("Stored credentials failed. Please enter updated credentials.");
        }

        if (RequestGitCredentialsAsync is null)
        {
            return false;
        }

        var credentials = await RequestGitCredentialsAsync();
        if (credentials is null)
        {
            AppendInfo("Update Engine canceled. No credentials provided.");
            return false;
        }

        return await TryPullWithCredentialsAsync(credentials, saveOnSuccess: true);
    }

    private async Task<bool> TryPullWithCredentialsAsync(GitCredentialPromptResult credentials, bool saveOnSuccess)
    {
        var originUrlResult = await RunProcessWithResultAsync("git", "config --get remote.origin.url", repositoryRoot!);
        if (originUrlResult.ExitCode != 0 || string.IsNullOrWhiteSpace(originUrlResult.StandardOutput))
        {
            AppendError("Unable to determine the remote origin URL for credential-based pull.");
            return false;
        }

        var originUrl = originUrlResult.StandardOutput.Trim();
        var httpsUrl = NormalizeToHttpsRemote(originUrl);
        if (string.IsNullOrWhiteSpace(httpsUrl))
        {
            AppendError("Remote origin URL is not compatible with credential-based pull. Configure an HTTPS remote and retry.");
            return false;
        }

        var authHeader = BuildBasicAuthHeader(credentials.UserName, credentials.Token);
        var pullArguments = $"-c http.extraheader=\"AUTHORIZATION: basic {authHeader}\" pull \"{httpsUrl}\"";
        var env = new Dictionary<string, string> { ["GIT_TERMINAL_PROMPT"] = "0" };
        var pullResult = await RunProcessWithResultAsync("git", pullArguments, repositoryRoot!, env);
        if (pullResult.ExitCode != 0)
        {
            AppendError("Git pull with the provided credentials failed.");
            AppendGitAuthGuidanceIfNeeded(pullResult.StandardError);
            return false;
        }

        if (saveOnSuccess)
        {
            gitAuthConfig.GitUsername = credentials.UserName;
            gitAuthConfig.GitPersonalAccessToken = credentials.Token;
            SaveGitAuthConfig();
        }

        return true;
    }

    private static string? NormalizeToHttpsRemote(string originUrl)
    {
        if (originUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            return originUrl;
        }

        if (originUrl.StartsWith("http://", StringComparison.OrdinalIgnoreCase))
        {
            return "https://" + originUrl.Substring("http://".Length);
        }

        if (originUrl.StartsWith("git@", StringComparison.OrdinalIgnoreCase))
        {
            var separatorIndex = originUrl.IndexOf(':');
            if (separatorIndex <= 0)
            {
                return null;
            }

            var host = originUrl.Substring(4, separatorIndex - 4);
            var path = originUrl[(separatorIndex + 1)..];
            return $"https://{host}/{path}";
        }

        if (originUrl.StartsWith("ssh://", StringComparison.OrdinalIgnoreCase))
        {
            if (Uri.TryCreate(originUrl, UriKind.Absolute, out var uri))
            {
                var host = uri.Host;
                var path = uri.AbsolutePath.TrimStart('/');
                return $"https://{host}/{path}";
            }
        }

        return null;
    }

    private static string BuildBasicAuthHeader(string userName, string token)
    {
        var payload = $"{userName}:{token}";
        return Convert.ToBase64String(Encoding.UTF8.GetBytes(payload));
    }

    private void LoadGitAuthConfig()
    {
        gitAuthConfig = new GitAuthConfig();
        if (string.IsNullOrWhiteSpace(gitAuthConfigPath) || !File.Exists(gitAuthConfigPath))
        {
            return;
        }

        try
        {
            var json = File.ReadAllText(gitAuthConfigPath);
            var config = JsonSerializer.Deserialize<GitAuthConfig>(json);
            if (config is not null)
            {
                gitAuthConfig = config;
            }
        }
        catch (Exception ex)
        {
            AppendError($"Failed to read git credentials config: {ex.Message}");
        }
    }

    private void SaveGitAuthConfig()
    {
        if (string.IsNullOrWhiteSpace(gitAuthConfigPath))
        {
            return;
        }

        try
        {
            var json = JsonSerializer.Serialize(gitAuthConfig, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(gitAuthConfigPath, json);
        }
        catch (Exception ex)
        {
            AppendError($"Failed to save git credentials config: {ex.Message}");
        }
    }

    private bool TryGetConfigCredentials(out GitCredentialPromptResult credentials)
    {
        var userName = gitAuthConfig.GitUsername?.Trim() ?? string.Empty;
        var token = gitAuthConfig.GitPersonalAccessToken?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(userName) || string.IsNullOrWhiteSpace(token))
        {
            credentials = new GitCredentialPromptResult(string.Empty, string.Empty);
            return false;
        }

        credentials = new GitCredentialPromptResult(userName, token);
        return true;
    }

    private sealed record ProcessResult(int ExitCode, string StandardOutput, string StandardError);

    public sealed record GitCredentialPromptResult(string UserName, string Token);

    private sealed class GitAuthConfig
    {
        [JsonPropertyName("gitUsername")]
        public string GitUsername { get; set; } = string.Empty;

        [JsonPropertyName("gitPersonalAccessToken")]
        public string GitPersonalAccessToken { get; set; } = string.Empty;
    }
}
