using System;
using System.Collections.Specialized;
using System.Linq;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Platform.Storage;
using Avalonia.Threading;
using ScratchEngineManager.ViewModels;

namespace ScratchEngineManager.Views;

public partial class MainWindow : Window
{
    private const double AutoScrollThreshold = 1.0;
    private ScrollViewer? _logScrollViewer;
    private INotifyCollectionChanged? _logEntries;
    private bool _autoScrollEnabled = true;
    private TabControl? _configTabs;
    private TabItem? _gameConfigTab;
    private TabItem? _buildConfigTab;

    public MainWindow()
    {
        InitializeComponent();
        _logScrollViewer = this.FindControl<ScrollViewer>("LogScrollViewer");
        _configTabs = this.FindControl<TabControl>("ConfigTabs");
        _gameConfigTab = this.FindControl<TabItem>("GameConfigTab");
        _buildConfigTab = this.FindControl<TabItem>("BuildConfigTab");

        if (_logScrollViewer is not null)
        {
            _logScrollViewer.ScrollChanged += OnLogScrollChanged;
        }

        AddHandler(KeyDownEvent, OnWindowKeyDown, RoutingStrategies.Tunnel);
        DataContextChanged += OnDataContextChanged;
        Closing += OnWindowClosing;
    }

    private void OnDataContextChanged(object? sender, EventArgs e)
    {
        if (_logEntries is not null)
        {
            _logEntries.CollectionChanged -= OnLogEntriesChanged;
        }

        if (DataContext is MainWindowViewModel viewModel)
        {
            _logEntries = viewModel.LogEntries;
            _logEntries.CollectionChanged += OnLogEntriesChanged;
        }
        else
        {
            _logEntries = null;
        }
    }

    private void OnLogEntriesChanged(object? sender, NotifyCollectionChangedEventArgs e)
    {
        if (!_autoScrollEnabled || _logScrollViewer is null)
        {
            return;
        }

        Dispatcher.UIThread.Post(ScrollLogToBottom, DispatcherPriority.Background);
    }

    private void OnLogScrollChanged(object? sender, ScrollChangedEventArgs e)
    {
        if (_logScrollViewer is null)
        {
            return;
        }

        _autoScrollEnabled = IsAtBottom(_logScrollViewer);
    }

    private void ScrollLogToBottom()
    {
        if (_logScrollViewer is null)
        {
            return;
        }

        _logScrollViewer.Offset = new Vector(_logScrollViewer.Offset.X, _logScrollViewer.Extent.Height);
    }

    private static bool IsAtBottom(ScrollViewer scrollViewer)
    {
        var maxOffset = scrollViewer.Extent.Height - scrollViewer.Viewport.Height;
        return scrollViewer.Offset.Y >= maxOffset - AutoScrollThreshold;
    }

    private void OnWindowKeyDown(object? sender, KeyEventArgs e)
    {
        if (!IsSaveShortcut(e) || DataContext is not MainWindowViewModel viewModel)
        {
            return;
        }

        var selectedTab = _configTabs?.SelectedItem as TabItem;
        if (selectedTab == _gameConfigTab && viewModel.SaveGameConfigCommand.CanExecute(null))
        {
            viewModel.SaveGameConfigCommand.Execute(null);
            e.Handled = true;
            return;
        }

        if (selectedTab == _buildConfigTab && viewModel.SaveBuildConfigCommand.CanExecute(null))
        {
            viewModel.SaveBuildConfigCommand.Execute(null);
            e.Handled = true;
        }
    }

    private static bool IsSaveShortcut(KeyEventArgs e)
    {
        if (e.Key != Key.S)
        {
            return false;
        }

        var modifiers = e.KeyModifiers;
        return modifiers.HasFlag(KeyModifiers.Control) || modifiers.HasFlag(KeyModifiers.Meta);
    }

    private void OnWindowClosing(object? sender, WindowClosingEventArgs e)
    {
        if (DataContext is MainWindowViewModel viewModel)
        {
            viewModel.StopLocalServer();
        }
    }

    private void OnAssetPreviewDoubleTapped(object? sender, TappedEventArgs e)
    {
        if (sender is Control control &&
            control.DataContext is AssetFileEntry entry &&
            DataContext is MainWindowViewModel viewModel)
        {
            viewModel.OpenAssetFile(entry);
        }
    }

    private void OnAssetPreviewDragOver(object? sender, DragEventArgs e)
    {
        if (sender is not Control control || control.DataContext is not AssetFileEntry)
        {
            e.DragEffects = DragDropEffects.None;
            return;
        }

        e.DragEffects = e.Data.Contains(DataFormats.Files) ? DragDropEffects.Copy : DragDropEffects.None;
    }

    private void OnAssetPreviewDrop(object? sender, DragEventArgs e)
    {
        if (sender is not Control control ||
            control.DataContext is not AssetFileEntry entry ||
            DataContext is not MainWindowViewModel viewModel)
        {
            return;
        }

        var file = e.Data.GetFiles()?.FirstOrDefault();
        if (file is null)
        {
            return;
        }

        var localPath = file.TryGetLocalPath();
        if (string.IsNullOrWhiteSpace(localPath))
        {
            return;
        }

        viewModel.ReplaceAssetFile(entry, localPath);
    }
}
