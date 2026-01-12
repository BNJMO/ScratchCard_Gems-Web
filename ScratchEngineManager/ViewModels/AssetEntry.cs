using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Diagnostics;
using System.IO;
using System.Media;
using System.Runtime.Versioning;
using System.Threading.Tasks;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
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
    public AssetFolderEntry(string name, string folderPath, int depth)
        : base(name, depth)
    {
        FolderPath = folderPath;
    }

    public string FolderPath { get; }

    public ObservableCollection<AssetEntryBase> Children { get; } = new();

    [ObservableProperty]
    private bool isExpanded;

    public Thickness ChildIndent => new((Depth + 1) * 16, 0, 0, 0);

    public string ExpansionGlyph => IsExpanded ? "▼" : "▶";

    [ObservableProperty]
    private string newFileName = "newFile.ext";

    partial void OnIsExpandedChanged(bool value)
    {
        OnPropertyChanged(nameof(ExpansionGlyph));
    }

    [RelayCommand]
    private void CreateFile()
    {
        if (string.IsNullOrWhiteSpace(NewFileName))
        {
            return;
        }

        var trimmedName = Path.GetFileName(NewFileName.Trim());
        if (string.IsNullOrWhiteSpace(trimmedName))
        {
            return;
        }

        var newFilePath = Path.Combine(FolderPath, trimmedName);
        try
        {
            Directory.CreateDirectory(FolderPath);
            if (!File.Exists(newFilePath))
            {
                using var _ = File.Create(newFilePath);
            }

            Children.Add(new AssetFileEntry(newFilePath, Depth + 1, entry => Children.Remove(entry)));
            NewFileName = "newFile.ext";
        }
        catch
        {
            // ignore - creation failures will be reflected by missing file
        }
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

    private static string? clipboardFilePath;
    private SoundPlayer? soundPlayer;

    public AssetFileEntry(string filePath, int depth, Action<AssetFileEntry>? removeAction = null)
        : base(Path.GetFileName(filePath), depth)
    {
        FullPath = filePath;
        FileName = Path.GetFileName(filePath);
        Extension = Path.GetExtension(filePath);
        removeFromParent = removeAction;
        RefreshPreview();
    }

    private readonly Action<AssetFileEntry>? removeFromParent;

    [ObservableProperty]
    private string fileName;

    [ObservableProperty]
    private string extension;

    public string FullPath { get; private set; }

    public bool IsImage => PreviewImage is not null;

    [ObservableProperty]
    private bool isAudio;

    [ObservableProperty]
    private IImage? previewImage;

    [ObservableProperty]
    private bool isEmpty;

    [ObservableProperty]
    private bool isRenaming;

    [ObservableProperty]
    private string editableFileName = string.Empty;

    public bool IsNotRenaming => !IsRenaming;

    public bool HasPreviewSquare => IsImage || IsAudio || IsEmpty;

    public void RefreshPreview()
    {
        PreviewImage = LoadPreviewImage();
        IsAudio = string.Equals(Extension, ".wav", StringComparison.OrdinalIgnoreCase)
            && OperatingSystem.IsWindows();
        IsEmpty = IsEmptyFile();
        if (OperatingSystem.IsWindows())
        {
            ResetAudioPlayer();
        }
        else
        {
            IsAudioPlaying = false;
        }
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

    partial void OnIsEmptyChanged(bool value)
    {
        OnPropertyChanged(nameof(HasPreviewSquare));
    }

    partial void OnIsRenamingChanged(bool value)
    {
        OnPropertyChanged(nameof(IsNotRenaming));
    }

    [RelayCommand]
    private void BeginRename()
    {
        EditableFileName = FileName;
        IsRenaming = true;
    }

    [RelayCommand]
    private void CancelRename()
    {
        EditableFileName = FileName;
        IsRenaming = false;
    }

    [RelayCommand]
    private async Task CopyFileAsync()
    {
        if (!File.Exists(FullPath))
        {
            return;
        }

        clipboardFilePath = FullPath;
        if (TryGetClipboard() is { } clipboard)
        {
            await clipboard.SetTextAsync(FullPath);
        }
    }

    [RelayCommand]
    private void PasteFile()
    {
        if (string.IsNullOrWhiteSpace(clipboardFilePath) || !File.Exists(clipboardFilePath))
        {
            return;
        }

        try
        {
            File.Copy(clipboardFilePath, FullPath, true);
            RefreshPreview();
        }
        catch
        {
            // ignore - paste failures will be reflected by the current file contents
        }
    }

    private static IClipboard? TryGetClipboard()
    {
        if (Application.Current?.ApplicationLifetime is not IClassicDesktopStyleApplicationLifetime lifetime)
        {
            return null;
        }

        return lifetime.MainWindow?.Clipboard;
    }

    [RelayCommand]
    private void CommitRename()
    {
        if (!IsRenaming)
        {
            return;
        }

        var trimmedName = Path.GetFileName(EditableFileName?.Trim() ?? string.Empty);
        if (string.IsNullOrWhiteSpace(trimmedName) || string.Equals(trimmedName, FileName, StringComparison.Ordinal))
        {
            IsRenaming = false;
            return;
        }

        var directory = Path.GetDirectoryName(FullPath);
        if (string.IsNullOrWhiteSpace(directory))
        {
            IsRenaming = false;
            return;
        }

        var newPath = Path.Combine(directory, trimmedName);
        try
        {
            if (File.Exists(FullPath))
            {
                File.Move(FullPath, newPath, overwrite: false);
            }
            else
            {
                using var _ = File.Create(newPath);
            }

            FullPath = newPath;
            FileName = trimmedName;
            Extension = Path.GetExtension(trimmedName);
            RefreshPreview();
        }
        catch
        {
            EditableFileName = FileName;
        }
        finally
        {
            IsRenaming = false;
        }
    }

    [RelayCommand]
    private void DeleteFile()
    {
        try
        {
            if (File.Exists(FullPath))
            {
                File.Delete(FullPath);
            }
        }
        catch
        {
            return;
        }

        removeFromParent?.Invoke(this);
    }

    [SupportedOSPlatform("windows")]
    [RelayCommand(CanExecute = nameof(CanPlayAudio))]
    private void PlayAudio()
    {
        if (!IsAudio || !OperatingSystem.IsWindows())
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

    [SupportedOSPlatform("windows")]
    [RelayCommand(CanExecute = nameof(CanStopAudio))]
    private void StopAudio()
    {
        if (!IsAudio || !OperatingSystem.IsWindows())
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
        if (!OperatingSystem.IsWindows())
        {
            return;
        }

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

    private bool IsEmptyFile()
    {
        if (!File.Exists(FullPath))
        {
            return false;
        }

        try
        {
            return new FileInfo(FullPath).Length == 0;
        }
        catch
        {
            return false;
        }
    }
}
