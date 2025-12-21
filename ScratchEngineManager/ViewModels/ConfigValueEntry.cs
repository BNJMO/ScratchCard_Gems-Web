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

public sealed partial class ConfigValueEntry : ObservableObject
{
    private readonly Action<ConfigValueEntry>? onValueChanged;

    public ConfigValueEntry(
        string path,
        IReadOnlyList<ConfigPathSegment> segments,
        string value,
        ConfigValueType valueType,
        Action<ConfigValueEntry>? onValueChanged = null)
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
