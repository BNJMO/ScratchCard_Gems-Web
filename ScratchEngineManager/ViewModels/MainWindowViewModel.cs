using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.IO;
using System.Linq;
using System.Text.Json;
using Avalonia.Media;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

namespace ScratchEngineManager.ViewModels;

public partial class MainWindowViewModel : ViewModelBase
{
    private readonly string? repositoryRoot;
    private readonly string? gameConfigPath;
    private readonly string? buildConfigPath;

    public MainWindowViewModel()
    {
        repositoryRoot = FindRepositoryRoot();
        gameConfigPath = repositoryRoot is null ? null : Path.Combine(repositoryRoot, "src", "gameConfig.json");
        buildConfigPath = repositoryRoot is null ? null : Path.Combine(repositoryRoot, "buildConfig.json");
        VariationOptions = new ObservableCollection<string>(LoadVariations(repositoryRoot));
        SelectedVariation = VariationOptions.FirstOrDefault();
        GameConfigFields = LoadConfigFields(gameConfigPath);
        BuildConfigFields = LoadConfigFields(buildConfigPath);
    }

    public ObservableCollection<string> VariationOptions { get; }

    public ObservableCollection<LogEntry> LogEntries { get; } = new();

    public ObservableCollection<ConfigField> GameConfigFields { get; }

    public ObservableCollection<ConfigField> BuildConfigFields { get; }

    [ObservableProperty]
    private string? selectedVariation;

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
            ReloadConfigFields();
        }
        catch (Exception ex)
        {
            AppendError($"Error during replacement: {ex.Message}");
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

    private ObservableCollection<ConfigField> LoadConfigFields(string? configPath)
    {
        var fields = new ObservableCollection<ConfigField>();
        if (string.IsNullOrWhiteSpace(configPath) || !File.Exists(configPath))
        {
            return fields;
        }

        try
        {
            using var stream = File.OpenRead(configPath);
            using var document = JsonDocument.Parse(stream);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                return fields;
            }

            foreach (var property in document.RootElement.EnumerateObject())
            {
                var valueKind = property.Value.ValueKind;
                fields.Add(new ConfigField(
                    property.Name,
                    GetValueString(property.Value),
                    valueKind,
                    newValue => SaveConfigField(configPath, fields, property.Name, valueKind, newValue)));
            }
        }
        catch (Exception ex)
        {
            AppendError($"Error loading config {configPath}: {ex.Message}");
        }

        return fields;
    }

    private void ReloadConfigFields()
    {
        ReloadConfigCollection(GameConfigFields, gameConfigPath);
        ReloadConfigCollection(BuildConfigFields, buildConfigPath);
    }

    private void ReloadConfigCollection(ObservableCollection<ConfigField> target, string? configPath)
    {
        target.Clear();
        foreach (var field in LoadConfigFields(configPath))
        {
            target.Add(field);
        }
    }

    private void SaveConfigField(
        string configPath,
        ObservableCollection<ConfigField> fields,
        string key,
        JsonValueKind originalKind,
        string? newValue)
    {
        try
        {
            var output = new Dictionary<string, object?>();
            foreach (var field in fields)
            {
                output[field.Key] = field.Key == key
                    ? ConvertValue(newValue, originalKind)
                    : ConvertValue(field.Value, field.ValueKind);
            }

            var json = JsonSerializer.Serialize(output, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(configPath, json);
            AppendSuccess($"Saved {Path.GetFileName(configPath)}.");
        }
        catch (Exception ex)
        {
            AppendError($"Error saving {Path.GetFileName(configPath)}: {ex.Message}");
        }
    }

    private static object? ConvertValue(string? value, JsonValueKind kind)
    {
        if (kind == JsonValueKind.Null)
        {
            return null;
        }

        if (kind == JsonValueKind.True || kind == JsonValueKind.False)
        {
            return bool.TryParse(value, out var boolValue) ? boolValue : false;
        }

        if (kind == JsonValueKind.Number)
        {
            return decimal.TryParse(value, out var number) ? number : 0;
        }

        return value ?? string.Empty;
    }

    private static string GetValueString(JsonElement element)
    {
        return element.ValueKind switch
        {
            JsonValueKind.String => element.GetString() ?? string.Empty,
            JsonValueKind.Number => element.GetRawText(),
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            JsonValueKind.Null => "null",
            _ => element.GetRawText(),
        };
    }

    private void AppendBlankLine()
    {
        if (LogEntries.Count > 0)
        {
            LogEntries.Add(new LogEntry(string.Empty, Brushes.Transparent));
        }
    }

    private void AppendInfo(string message) => LogEntries.Add(new LogEntry(message, Brushes.WhiteSmoke));

    private void AppendSuccess(string message) => LogEntries.Add(new LogEntry(message, Brushes.LightGreen));

    private void AppendError(string message) => LogEntries.Add(new LogEntry(message, Brushes.IndianRed));

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

    public sealed partial class ConfigField : ObservableObject
    {
        private readonly Action<string?>? onValueChanged;

        public ConfigField(string key, string value, JsonValueKind valueKind, Action<string?>? onValueChanged)
        {
            Key = key;
            this.value = value;
            ValueKind = valueKind;
            this.onValueChanged = onValueChanged;
        }

        public string Key { get; }

        public JsonValueKind ValueKind { get; }

        [ObservableProperty]
        private string value;

        partial void OnValueChanged(string value)
        {
            onValueChanged?.Invoke(value);
        }
    }

    public sealed record LogEntry(string Message, IBrush Foreground);
}
