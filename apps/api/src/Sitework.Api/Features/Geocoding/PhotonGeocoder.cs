using System.Globalization;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;

namespace Sitework.Api.Features.Geocoding;

public sealed class GeocodingOptions
{
    /// <summary>Photon instance (OpenStreetMap data). The public one is free for fair use.</summary>
    public string BaseUrl { get; init; } = "https://photon.komoot.io";

    public int CacheMinutes { get; init; } = 24 * 60;
}

public sealed record GeocodeResult(string Label, double Latitude, double Longitude);

/// <summary>The upstream geocoder failed or timed out (mapped to 503).</summary>
public sealed class GeocodingUnavailableException(string message, Exception? inner = null) : Exception(message, inner);

/// <summary>
/// Address search and reverse geocoding via Photon. Only the API talks to Photon: results are
/// cached, the outbound request identifies the app, and clients are rate limited per IP.
/// </summary>
public sealed class PhotonGeocoder(HttpClient http, IMemoryCache cache, IOptions<GeocodingOptions> options)
{
    private const int MaxResults = 5;

    public Task<IReadOnlyList<GeocodeResult>> SearchAsync(
        string query, double? nearLatitude, double? nearLongitude, CancellationToken cancellationToken)
    {
        var url = $"api/?q={Uri.EscapeDataString(query.Trim())}&limit={MaxResults}";
        if (nearLatitude is { } lat && nearLongitude is { } lng)
        {
            // Bias towards where the user is looking, without excluding elsewhere.
            url += FormattableString.Invariant($"&lat={Math.Round(lat, 2)}&lon={Math.Round(lng, 2)}");
        }

        return GetCachedAsync(url, cancellationToken);
    }

    public async Task<GeocodeResult?> ReverseAsync(double latitude, double longitude, CancellationToken cancellationToken)
    {
        var url = FormattableString.Invariant($"reverse?lat={Math.Round(latitude, 5)}&lon={Math.Round(longitude, 5)}&limit=1");
        var results = await GetCachedAsync(url, cancellationToken);
        return results.Count > 0 ? results[0] : null;
    }

    private async Task<IReadOnlyList<GeocodeResult>> GetCachedAsync(string relativeUrl, CancellationToken cancellationToken)
    {
        if (cache.TryGetValue(relativeUrl, out IReadOnlyList<GeocodeResult>? cached) && cached is not null)
        {
            return cached;
        }

        HttpResponseMessage response;
        try
        {
            response = await http.GetAsync(relativeUrl, cancellationToken);
        }
        catch (Exception exception) when (exception is HttpRequestException or TimeoutException
            // Polly's timeout and open-circuit rejections from the resilience handler.
            or Polly.ExecutionRejectedException
            || (exception is OperationCanceledException && !cancellationToken.IsCancellationRequested))
        {
            throw new GeocodingUnavailableException("The address search service didn't respond.", exception);
        }

        using (response)
        {
            if (!response.IsSuccessStatusCode)
            {
                throw new GeocodingUnavailableException($"The address search service returned {(int)response.StatusCode}.");
            }

            await using var body = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var document = await JsonDocument.ParseAsync(body, cancellationToken: cancellationToken);
            var results = Parse(document.RootElement);

            cache.Set(relativeUrl, results, new MemoryCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(options.Value.CacheMinutes),
                Size = 1,
            });
            return results;
        }
    }

    /// <summary>Photon answers with a GeoJSON FeatureCollection of OpenStreetMap places.</summary>
    internal static IReadOnlyList<GeocodeResult> Parse(JsonElement root)
    {
        if (!root.TryGetProperty("features", out var features) || features.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        var results = new List<GeocodeResult>();
        foreach (var feature in features.EnumerateArray())
        {
            if (!feature.TryGetProperty("geometry", out var geometry)
                || !geometry.TryGetProperty("coordinates", out var coordinates)
                || coordinates.GetArrayLength() < 2
                || !feature.TryGetProperty("properties", out var properties))
            {
                continue;
            }

            var label = Label(properties);
            if (label.Length > 0)
            {
                results.Add(new GeocodeResult(label, coordinates[1].GetDouble(), coordinates[0].GetDouble()));
            }
        }

        return results;
    }

    /// <summary>"Name, 12 Kauri Street, Ponsonby, Auckland 1011" from whichever parts exist.</summary>
    internal static string Label(JsonElement properties)
    {
        string? Text(string name) =>
            properties.TryGetProperty(name, out var value) && value.ValueKind is JsonValueKind.String or JsonValueKind.Number
                ? Convert.ToString(value.ValueKind == JsonValueKind.Number ? value.GetRawText() : value.GetString(), CultureInfo.InvariantCulture)
                : null;

        var street = string.Join(' ', new[] { Text("housenumber"), Text("street") }.Where(part => !string.IsNullOrWhiteSpace(part)));
        var name = Text("name");
        var area = Text("district") ?? Text("locality");
        var city = string.Join(' ', new[] { Text("city"), Text("postcode") }.Where(part => !string.IsNullOrWhiteSpace(part)));

        var parts = new List<string>();
        void Add(string? part)
        {
            if (!string.IsNullOrWhiteSpace(part) && !parts.Contains(part, StringComparer.OrdinalIgnoreCase))
            {
                parts.Add(part.Trim());
            }
        }

        Add(name);
        Add(street);
        Add(area);
        Add(city.Length > 0 ? city : Text("state"));
        if (parts.Count <= 1)
        {
            Add(Text("country"));
        }

        return string.Join(", ", parts);
    }
}
