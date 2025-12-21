using System;
using System.Collections.ObjectModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Avalonia.Media;
using Avalonia.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

namespace ScratchEngineManager.ViewModels;

public partial class MainWindowViewModel : ViewModelBase
{
    private readonly string? repositoryRoot;
    private readonly string? gameConfigPath;
    private readonly string? buildConfigPath;
    private string gameConfigSnapshot = string.Empty;
    private string buildConfigSnapshot = string.Empty;
    private readonly object localServerLock = new();
    private Process? localServerProcess;

    public MainWindowViewModel()
    {
        repositoryRoot = FindRepositoryRoot();
        gameConfigPath = repositoryRoot is null ? null : Path.Combine(repositoryRoot, "src", "gameConfig.json");
        buildConfigPath = repositoryRoot is null ? null : Path.Combine(repositoryRoot, "buildConfig.json");
        VariationOptions = new ObservableCollection<string>(LoadVariations(repositoryRoot));
        SelectedVariation = VariationOptions.FirstOrDefault();
        LoadConfigText();
    }

    public ObservableCollection<string> VariationOptions { get; }

    public ObservableCollection<LogEntry> LogEntries { get; } = new();

    [ObservableProperty]
    private string? selectedVariation;

    [ObservableProperty]
    private string gameConfigText = string.Empty;

    [ObservableProperty]
    private string buildConfigText = string.Empty;

    [ObservableProperty]
    private bool isGameConfigDirty;

    [ObservableProperty]
    private bool isBuildConfigDirty;

    [ObservableProperty]
    private bool isBuildRunning;

    [ObservableProperty]
    private bool isLocalServerRunning;

    [ObservableProperty]
    private string localServerButtonLabel = "Start Local Server";

    [RelayCommand]
    private void ReplaceAssets()
    {
        AppendBlankLine();
        if (string.IsNullOrWhiteSpace(repositoryRoot))
        {
            AppendError("Could not locate repository root. Replace Assets aborted.");
            return;
        }

        if (string.IsNullOrWhiteSpace(SelectedVariation))
        {
            AppendError("No variation selected. Replace Assets aborted.");
            return;
        }

        var variationRoot = Path.Combine(repositoryRoot, "Variations", SelectedVariation);
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

            AppendSuccess("Asset replacement complete.");
            LoadConfigText();
        }
        catch (Exception ex)
        {
            AppendError($"Error during replacement: {ex.Message}");
        }
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
    private async Task ToggleLocalServerAsync()
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

    private static string[] LoadVariations(string? rootPath)
    {
        if (string.IsNullOrWhiteSpace(rootPath))
        {
            return Array.Empty<string>();
        }

        var variationsPath = Path.Combine(rootPath, "Variations");
        if (!Directory.Exists(variationsPath))
        {
            return Array.Empty<string>();
        }

        return Directory.GetDirectories(variationsPath)
            .Select(Path.GetFileName)
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
            .ToArray()!;
    }

    private void LoadConfigText()
    {
        GameConfigText = LoadConfigFile(gameConfigPath);
        BuildConfigText = LoadConfigFile(buildConfigPath);
        gameConfigSnapshot = GameConfigText;
        buildConfigSnapshot = BuildConfigText;
        IsGameConfigDirty = false;
        IsBuildConfigDirty = false;
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

    private void AppendSuccess(string message) => AppendLogEntry(message, Brushes.LightGreen);

    private void AppendError(string message) => AppendLogEntry(message, Brushes.IndianRed);

    private void AppendLogEntry(string message, IBrush brush)
    {
        void AddEntry() => LogEntries.Add(new LogEntry(message, brush));

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

    partial void OnBuildConfigTextChanged(string value)
    {
        IsBuildConfigDirty = !string.Equals(value, buildConfigSnapshot, StringComparison.Ordinal);
    }

    partial void OnIsBuildRunningChanged(bool value)
    {
        StartBuildCommand.NotifyCanExecuteChanged();
    }

    partial void OnIsLocalServerRunningChanged(bool value)
    {
        LocalServerButtonLabel = value ? "Stop Local Server" : "Start Local Server";
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

    private async Task MonitorLocalServerAsync(Process process)
    {
        try
        {
            await process.WaitForExitAsync();
        }
        catch (Exception ex)
        {
            AppendError($"Local server monitoring error: {ex.Message}");
        }
        finally
        {
            if (!IsLocalServerRunning)
            {
                return;
            }

            var exitCode = process.ExitCode;
            if (exitCode == 0)
            {
                AppendSuccess("Local server stopped.");
            }
            else
            {
                AppendError($"Local server exited with code {exitCode}.");
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
}
