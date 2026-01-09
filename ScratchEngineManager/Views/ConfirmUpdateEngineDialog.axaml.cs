using Avalonia.Controls;
using Avalonia.Interactivity;

namespace ScratchEngineManager.Views;

public partial class ConfirmUpdateEngineDialog : Window
{
    public ConfirmUpdateEngineDialog()
    {
        InitializeComponent();
    }

    private void OnCancelClick(object? sender, RoutedEventArgs e)
    {
        Close(false);
    }

    private void OnConfirmClick(object? sender, RoutedEventArgs e)
    {
        Close(true);
    }
}
