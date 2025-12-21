using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;
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
    private string gameConfigSnapshot = string.Empty;
    private string buildConfigSnapshot = string.Empty;
    private readonly object localServerLock = new();
    private Process? localServerProcess;
    private JsonNode? gameConfigNode;
    private JsonNode? buildConfigNode;

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

    public ObservableCollection<ConfigValueEntry> GameConfigEntries { get; } = new();

    public ObservableCollection<ConfigValueEntry> BuildConfigEntries { get; } = new();

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
        gameConfigNode = TryParseJson(GameConfigText);
        buildConfigNode = TryParseJson(BuildConfigText);
        PopulateConfigEntries(GameConfigEntries, gameConfigNode, OnGameConfigEntryChanged);
        PopulateConfigEntries(BuildConfigEntries, buildConfigNode, OnBuildConfigEntryChanged);
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
        ObservableCollection<ConfigValueEntry> target,
        JsonNode? rootNode,
        Action<ConfigValueEntry> onValueChanged)
    {
        target.Clear();
        if (rootNode is null)
        {
            return;
        }

        var path = new List<ConfigPathSegment>();
        CollectConfigEntries(rootNode, path, target, onValueChanged);
        ApplyHierarchyPresentation(target);
    }

    private void CollectConfigEntries(
        JsonNode? node,
        List<ConfigPathSegment> path,
        ObservableCollection<ConfigValueEntry> target,
        Action<ConfigValueEntry> onValueChanged)
    {
        if (node is null)
        {
            return;
        }

        if (node is JsonObject obj)
        {
            foreach (var entry in obj)
            {
                path.Add(new ConfigPathSegment(entry.Key, null));
                CollectConfigEntries(entry.Value, path, target, onValueChanged);
                path.RemoveAt(path.Count - 1);
            }

            return;
        }

        if (node is JsonArray array)
        {
            for (var i = 0; i < array.Count; i++)
            {
                path.Add(new ConfigPathSegment(null, i));
                CollectConfigEntries(array[i], path, target, onValueChanged);
                path.RemoveAt(path.Count - 1);
            }

            return;
        }

        if (node is JsonValue valueNode)
        {
            var displayPath = BuildDisplayPath(path);
            var (valueText, valueType) = ExtractValue(valueNode);
            var segments = path.ToArray();
            target.Add(new ConfigValueEntry(displayPath, segments, valueText, valueType, onValueChanged));
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

    private void ApplyHierarchyPresentation(ObservableCollection<ConfigValueEntry> target)
    {
        var groupColors = new Dictionary<string, IBrush>(StringComparer.Ordinal);
        var random = new Random(7319);
        IReadOnlyList<ConfigPathSegment>? previousSegments = null;

        foreach (var entry in target)
        {
            entry.DisplaySegments = BuildDisplaySegments(entry.Segments, groupColors, random);
            entry.ItemMargin = BuildHierarchyMargin(entry.Segments, previousSegments);
            previousSegments = entry.Segments;
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
}
