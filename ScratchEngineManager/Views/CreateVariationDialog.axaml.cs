using System.IO;
using System.Linq;
using Avalonia.Controls;
using Avalonia.Interactivity;

namespace ScratchEngineManager.Views;

public partial class CreateVariationDialog : Window
{
    public CreateVariationDialog()
    {
        InitializeComponent();
    }

    private void OnCancelClick(object? sender, RoutedEventArgs e)
    {
        Close(null);
    }

    private void OnConfirmClick(object? sender, RoutedEventArgs e)
    {
        var variationName = VariationNameTextBox.Text?.Trim() ?? string.Empty;
        if (!IsValidVariationName(variationName))
        {
            ValidationText.IsVisible = true;
            return;
        }

        ValidationText.IsVisible = false;
        Close(variationName);
    }

    private static bool IsValidVariationName(string variationName)
    {
        if (string.IsNullOrWhiteSpace(variationName))
        {
            return false;
        }

        var invalidChars = Path.GetInvalidFileNameChars();
        return !variationName.Any(character => invalidChars.Contains(character));
    }
}
