using System;
using System.Collections.Generic;
using Avalonia;
using Avalonia.Media;
using CommunityToolkit.Mvvm.ComponentModel;

namespace ScratchEngineManager.ViewModels;

public abstract partial class AssetDisplayItem : ObservableObject
{
    protected AssetDisplayItem(IReadOnlyList<string> segments, int depth)
    {
        Segments = segments;
        Depth = depth;
    }

    public IReadOnlyList<string> Segments { get; }

    public int Depth { get; }

    [ObservableProperty]
    private bool isVisible = true;

    public Thickness Indent => new(Depth * 16, 0, 0, 0);
}

public sealed partial class AssetFolderEntry : AssetDisplayItem
{
    private readonly Action<AssetFolderEntry>? onToggle;

    public AssetFolderEntry(
        string label,
        IReadOnlyList<string> segments,
        int depth,
        Action<AssetFolderEntry>? onToggle = null)
        : base(segments, depth)
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

public sealed partial class AssetFileEntry : AssetDisplayItem
{
    public AssetFileEntry(
        string fileName,
        string fullPath,
        IReadOnlyList<string> segments,
        int depth,
        IImage? previewImage)
        : base(segments, depth)
    {
        FileName = fileName;
        FullPath = fullPath;
        this.previewImage = previewImage;
    }

    public string FileName { get; }

    public string FullPath { get; }

    [ObservableProperty]
    private IImage? previewImage;

    public bool HasPreview => PreviewImage is not null;

    partial void OnPreviewImageChanged(IImage? value)
    {
        OnPropertyChanged(nameof(HasPreview));
    }
}
