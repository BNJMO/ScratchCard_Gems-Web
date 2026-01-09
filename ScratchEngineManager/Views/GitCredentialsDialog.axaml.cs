using Avalonia.Controls;
using Avalonia.Interactivity;
using ScratchEngineManager.ViewModels;

namespace ScratchEngineManager.Views;

public partial class GitCredentialsDialog : Window
{
    public GitCredentialsDialog()
    {
        InitializeComponent();
    }

    private void OnCancelClick(object? sender, RoutedEventArgs e)
    {
        Close(null);
    }

    private void OnConfirmClick(object? sender, RoutedEventArgs e)
    {
        var userName = UserNameTextBox.Text?.Trim() ?? string.Empty;
        var token = TokenTextBox.Text?.Trim() ?? string.Empty;

        if (string.IsNullOrWhiteSpace(userName) || string.IsNullOrWhiteSpace(token))
        {
            ValidationText.IsVisible = true;
            return;
        }

        ValidationText.IsVisible = false;
        Close(new MainWindowViewModel.GitCredentialPromptResult(userName, token));
    }
}
