using System;
using System.Collections.Generic;
using Avalonia;
using Avalonia.Media;
using CommunityToolkit.Mvvm.ComponentModel;

namespace ScratchEngineManager.ViewModels;

public enum ConfigValueType
{
    String,
    Number,
    Boolean,
    Null,
    Unknown,
}

public readonly record struct ConfigPathSegment(string? PropertyName, int? Index);

public sealed record ConfigPathDisplaySegment(string Text, IBrush Foreground);

public enum ConfigTarget
{
    Game,
    Build,
    VariationGame,
    VariationBuild,
}

public abstract partial class ConfigDisplayItem : ObservableObject
{
    protected ConfigDisplayItem(int depth, ConfigTarget target)
    {
        Depth = depth;
        Target = target;
    }

    public int Depth { get; }

    public ConfigTarget Target { get; }

    [ObservableProperty]
    private bool isVisible = true;

    public Thickness Indent => new(Depth * 16, 0, 0, 0);
}

public sealed partial class ConfigGroupEntry : ConfigDisplayItem
{
    private readonly Action<ConfigGroupEntry>? onToggle;

    public ConfigGroupEntry(
        string label,
        IReadOnlyList<ConfigPathSegment> segments,
        int depth,
        ConfigTarget target,
        Action<ConfigGroupEntry>? onToggle = null)
        : base(depth, target)
    {
        Label = label;
        Segments = segments;
        this.onToggle = onToggle;
    }

    public string Label { get; }

    public IReadOnlyList<ConfigPathSegment> Segments { get; }

    [ObservableProperty]
    private IBrush labelBrush = Brushes.WhiteSmoke;

    [ObservableProperty]
    private bool isExpanded;

    public string ExpansionGlyph => IsExpanded ? "▼" : "▶";

    partial void OnIsExpandedChanged(bool value)
    {
        OnPropertyChanged(nameof(ExpansionGlyph));
        onToggle?.Invoke(this);
    }
}

public sealed partial class ConfigValueEntry : ConfigDisplayItem
{
    private readonly Action<ConfigValueEntry>? onValueChanged;

    public ConfigValueEntry(
        string path,
        IReadOnlyList<ConfigPathSegment> segments,
        string value,
        ConfigValueType valueType,
        int depth,
        ConfigTarget target,
        Action<ConfigValueEntry>? onValueChanged = null)
        : base(depth, target)
    {
        Path = path;
        Segments = segments;
        ValueType = valueType;
        this.onValueChanged = onValueChanged;
        this.value = value;
    }

    public string Path { get; }

    public IReadOnlyList<ConfigPathSegment> Segments { get; }

    public ConfigValueType ValueType { get; }

    public bool IsKeyEditable => Segments.Count > 0 && Segments[^1].PropertyName is not null;

    [ObservableProperty]
    private IReadOnlyList<ConfigPathDisplaySegment> displaySegments = Array.Empty<ConfigPathDisplaySegment>();

    [ObservableProperty]
    private IReadOnlyList<ConfigPathDisplaySegment> prefixDisplaySegments = Array.Empty<ConfigPathDisplaySegment>();

    [ObservableProperty]
    private ConfigPathDisplaySegment? leafDisplaySegment;

    [ObservableProperty]
    private Thickness itemMargin = new(0, 0, 0, 10);

    [ObservableProperty]
    private string value = string.Empty;

    [ObservableProperty]
    private string editableKey = string.Empty;

    [ObservableProperty]
    private bool isRenaming;

    partial void OnValueChanged(string value)
    {
        onValueChanged?.Invoke(this);
    }
}

public sealed partial class ConfigAddEntry : ConfigDisplayItem
{
    public ConfigAddEntry(
        IReadOnlyList<ConfigPathSegment> segments,
        int depth,
        ConfigTarget target)
        : base(depth, target)
    {
        Segments = segments;
    }

    public IReadOnlyList<ConfigPathSegment> Segments { get; }
}
