using System.Collections.Specialized;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Threading;
using ScratchEngineManager.ViewModels;

namespace ScratchEngineManager.Views;

public partial class MainWindow : Window
{
    private const double AutoScrollThreshold = 1.0;
    private ScrollViewer? _logScrollViewer;
    private INotifyCollectionChanged? _logEntries;
    private bool _autoScrollEnabled = true;

    public MainWindow()
    {
        InitializeComponent();
        _logScrollViewer = this.FindControl<ScrollViewer>("LogScrollViewer");

        if (_logScrollViewer is not null)
        {
            _logScrollViewer.ScrollChanged += OnLogScrollChanged;
        }

        DataContextChanged += OnDataContextChanged;
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
}
