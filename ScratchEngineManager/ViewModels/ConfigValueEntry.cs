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

public abstract partial class ConfigDisplayItem : ObservableObject
{
    protected ConfigDisplayItem(int depth)
    {
        Depth = depth;
    }

    public int Depth { get; }

    [ObservableProperty]
    private bool isVisible = true;

    public Thickness Indent => new(Depth * 16, 0, 0, 0);
}

public sealed partial class ConfigGroupEntry : ConfigDisplayItem
{
    private readonly Action<ConfigGroupEntry>? onToggle;

    public ConfigGroupEntry(string label, int depth, Action<ConfigGroupEntry>? onToggle = null)
        : base(depth)
    {
        Label = label;
        this.onToggle = onToggle;
    }

    public string Label { get; }

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
        Action<ConfigValueEntry>? onValueChanged = null)
        : base(depth)
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

    [ObservableProperty]
    private IReadOnlyList<ConfigPathDisplaySegment> displaySegments = Array.Empty<ConfigPathDisplaySegment>();

    [ObservableProperty]
    private Thickness itemMargin = new(0, 0, 0, 10);

    [ObservableProperty]
    private string value = string.Empty;

    partial void OnValueChanged(string value)
    {
        onValueChanged?.Invoke(this);
    }
}
