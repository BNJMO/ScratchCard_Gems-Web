using System.Collections.ObjectModel;
using System.ComponentModel;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;

namespace ScratchEngineManager.ViewModels;

public class MainWindowViewModel : INotifyPropertyChanged
{
    public ObservableCollection<string> VariationOptions { get; } = new();

    private string? _selectedVariation;

    public string? SelectedVariation
    {
        get => _selectedVariation;
        set
        {
            if (_selectedVariation == value)
            {
                return;
            }

            _selectedVariation = value;
            OnPropertyChanged();
        }
    }

    private string _logText = "Log output will appear here.";
    private string _gameConfigText = "Game configuration will appear here.";
    private string _buildConfigText = "Build configuration will appear here.";

    public string LogText
    {
        get => _logText;
        set
        {
            if (_logText == value)
            {
                return;
            }

            _logText = value;
            OnPropertyChanged();
        }
    }

    public string GameConfigText
    {
        get => _gameConfigText;
        set
        {
            if (_gameConfigText == value)
            {
                return;
            }

            _gameConfigText = value;
            OnPropertyChanged();
        }
    }

    public string BuildConfigText
    {
        get => _buildConfigText;
        set
        {
            if (_buildConfigText == value)
            {
                return;
            }

            _buildConfigText = value;
            OnPropertyChanged();
        }
    }

    public MainWindowViewModel()
    {
        LoadVariations();
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    private void LoadVariations()
    {
        var variationsPath = FindVariationsDirectory();
        if (variationsPath is null)
        {
            return;
        }

        var variations = Directory.GetDirectories(variationsPath)
            .Select(Path.GetFileName)
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .OrderBy(name => name)
            .ToList();

        foreach (var variation in variations)
        {
            VariationOptions.Add(variation!);
        }

        SelectedVariation = VariationOptions.FirstOrDefault();
    }

    private static string? FindVariationsDirectory()
    {
        var current = new DirectoryInfo(AppContext.BaseDirectory);

        while (current is not null)
        {
            var candidate = Path.Combine(current.FullName, "Variations");
            if (Directory.Exists(candidate))
            {
                return candidate;
            }

            current = current.Parent;
        }

        return null;
    }

    private void OnPropertyChanged([CallerMemberName] string? propertyName = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }
}
