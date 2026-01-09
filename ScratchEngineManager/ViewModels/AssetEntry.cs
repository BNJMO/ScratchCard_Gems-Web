using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Diagnostics;
using System.IO;
using System.Media;
using Avalonia;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.Svg.Skia;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

namespace ScratchEngineManager.ViewModels;

public abstract partial class AssetEntryBase : ObservableObject
{
    protected AssetEntryBase(string name, int depth)
    {
        Name = name;
        Depth = depth;
        Indent = new Thickness(depth * 16, 0, 0, 0);
    }

    public string Name { get; }

    public int Depth { get; }

    public Thickness Indent { get; }
}

public sealed partial class AssetFolderEntry : AssetEntryBase
{
    public AssetFolderEntry(string name, int depth)
        : base(name, depth)
    {
    }

    public ObservableCollection<AssetEntryBase> Children { get; } = new();

    [ObservableProperty]
    private bool isExpanded = true;

    public string ExpansionGlyph => IsExpanded ? "▼" : "▶";

    partial void OnIsExpandedChanged(bool value)
    {
        OnPropertyChanged(nameof(ExpansionGlyph));
    }
}

public sealed partial class AssetFileEntry : AssetEntryBase
{
    private static readonly HashSet<string> ImageExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".bmp",
        ".webp",
        ".svg"
    };
    private SoundPlayer? soundPlayer;

    public AssetFileEntry(string filePath, int depth)
        : base(Path.GetFileName(filePath), depth)
    {
        FullPath = filePath;
        FileName = Path.GetFileName(filePath);
        Extension = Path.GetExtension(filePath);
        RefreshPreview();
    }

    public string FileName { get; }

    public string Extension { get; }

    public string FullPath { get; private set; }

    public bool IsImage => PreviewImage is not null;

    [ObservableProperty]
    private bool isAudio;

    [ObservableProperty]
    private IImage? previewImage;

    public bool HasPreviewSquare => IsImage || IsAudio;

    public void RefreshPreview()
    {
        PreviewImage = LoadPreviewImage();
        IsAudio = string.Equals(Extension, ".wav", StringComparison.OrdinalIgnoreCase);
        ResetAudioPlayer();
        OnPropertyChanged(nameof(IsImage));
        OnPropertyChanged(nameof(HasPreviewSquare));
    }

    public void UpdateFilePath(string filePath)
    {
        FullPath = filePath;
        RefreshPreview();
    }

    [RelayCommand]
    private void OpenFile()
    {
        if (!File.Exists(FullPath))
        {
            return;
        }

        Process.Start(new ProcessStartInfo(FullPath)
        {
            UseShellExecute = true
        });
    }

    partial void OnIsAudioChanged(bool value)
    {
        PlayAudioCommand.NotifyCanExecuteChanged();
        StopAudioCommand.NotifyCanExecuteChanged();
        OnPropertyChanged(nameof(HasPreviewSquare));
    }

    [RelayCommand(CanExecute = nameof(CanPlayAudio))]
    private void PlayAudio()
    {
        if (!IsAudio)
        {
            return;
        }

        try
        {
            soundPlayer ??= new SoundPlayer(FullPath);
            soundPlayer.Play();
            IsAudioPlaying = true;
        }
        catch
        {
            IsAudioPlaying = false;
        }
    }

    private bool CanPlayAudio() => IsAudio && !IsAudioPlaying;

    [RelayCommand(CanExecute = nameof(CanStopAudio))]
    private void StopAudio()
    {
        if (!IsAudio)
        {
            return;
        }

        soundPlayer?.Stop();
        IsAudioPlaying = false;
    }

    private bool CanStopAudio() => IsAudio && IsAudioPlaying;

    [ObservableProperty]
    private bool isAudioPlaying;

    partial void OnIsAudioPlayingChanged(bool value)
    {
        PlayAudioCommand.NotifyCanExecuteChanged();
        StopAudioCommand.NotifyCanExecuteChanged();
    }

    private void ResetAudioPlayer()
    {
        if (soundPlayer is null)
        {
            return;
        }

        soundPlayer.Stop();
        soundPlayer.Dispose();
        soundPlayer = null;
        IsAudioPlaying = false;
    }

    private IImage? LoadPreviewImage()
    {
        if (!ImageExtensions.Contains(Extension))
        {
            return null;
        }

        if (!File.Exists(FullPath))
        {
            return null;
        }

        try
        {
            if (string.Equals(Extension, ".svg", StringComparison.OrdinalIgnoreCase))
            {
                var source = SvgSource.Load(FullPath);
                return new SvgImage { Source = source };
            }

            return new Bitmap(FullPath);
        }
        catch
        {
            return null;
        }
    }
}
