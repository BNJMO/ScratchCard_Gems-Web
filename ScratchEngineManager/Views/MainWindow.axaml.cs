using System.ComponentModel;
using Avalonia.Controls;
using ScratchEngineManager.ViewModels;

namespace ScratchEngineManager.Views;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
    }

    protected override void OnClosing(CancelEventArgs e)
    {
        if (DataContext is MainWindowViewModel viewModel)
        {
            viewModel.StopLocalServer();
        }

        base.OnClosing(e);
    }
}
