using System;
using System.Collections.ObjectModel;
using System.IO;
using System.Linq;
using CommunityToolkit.Mvvm.ComponentModel;

namespace ScratchEngineManager.ViewModels;

public partial class MainWindowViewModel : ViewModelBase
{
    public MainWindowViewModel()
    {
        VariationOptions = new ObservableCollection<string>(LoadVariations());
        SelectedVariation = VariationOptions.FirstOrDefault();
    }

    public ObservableCollection<string> VariationOptions { get; }

    [ObservableProperty]
    private string? selectedVariation;

    private static string[] LoadVariations()
    {
        var current = new DirectoryInfo(AppContext.BaseDirectory);

        while (current != null)
        {
            var variationsPath = Path.Combine(current.FullName, "Variations");
            if (Directory.Exists(variationsPath))
            {
                return Directory.GetDirectories(variationsPath)
                    .Select(Path.GetFileName)
                    .Where(name => !string.IsNullOrWhiteSpace(name))
                    .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
                    .ToArray()!;
            }

            current = current.Parent;
        }

        return Array.Empty<string>();
    }
}
