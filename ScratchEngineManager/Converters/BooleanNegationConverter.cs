using System;
using System.Globalization;
using Avalonia.Data.Converters;

namespace ScratchEngineManager.Converters;

public sealed class BooleanNegationConverter : IValueConverter
{
    public object? Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        return value is bool booleanValue ? !booleanValue : value;
    }

    public object? ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        return value is bool booleanValue ? !booleanValue : value;
    }
}
