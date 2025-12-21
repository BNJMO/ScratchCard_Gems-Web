using Avalonia.Controls;
using ScratchEngineManager.ViewModels;

namespace ScratchEngineManager.Views;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        Closing += OnWindowClosing;
    }

    private void OnWindowClosing(object? sender, WindowClosingEventArgs e)
    {
        if (DataContext is MainWindowViewModel viewModel)
        {
            viewModel.StopLocalServer();
        }
    }
}
