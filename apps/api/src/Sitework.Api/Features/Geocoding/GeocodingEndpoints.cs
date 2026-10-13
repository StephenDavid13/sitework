using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Sitework.Api.Infrastructure;

namespace Sitework.Api.Features.Geocoding;

public static class GeocodingEndpoints
{
    public static IEndpointRouteBuilder MapGeocodingEndpoints(this IEndpointRouteBuilder routes)
    {
        var geocode = routes.MapGroup("/geocode")
            .WithTags("Geocoding")
            .RequireRateLimiting(RateLimitPolicies.Geocoding)
            .ProducesProblem(StatusCodes.Status429TooManyRequests)
            .ProducesProblem(StatusCodes.Status503ServiceUnavailable);

        geocode.MapGet("/search", Search)
            .WithName("SearchAddresses")
            .WithSummary("Find places matching an address or place name (OpenStreetMap data via Photon).");

        geocode.MapGet("/reverse", Reverse)
            .WithName("ReverseGeocode")
            .WithSummary("The nearest address to a point.")
            .ProducesProblem(StatusCodes.Status404NotFound);

        return routes;
    }

    private static async Task<Results<Ok<GeocodeResult[]>, ValidationProblem, ProblemHttpResult>> Search(
        [FromQuery(Name = "q")] string? q,
        [FromQuery(Name = "nearLat")] double? nearLat,
        [FromQuery(Name = "nearLng")] double? nearLng,
        PhotonGeocoder geocoder,
        CancellationToken cancellationToken)
    {
        var query = q?.Trim() ?? string.Empty;
        if (query.Length is < 3 or > 200)
        {
            return Invalid("q", "Enter between 3 and 200 characters.");
        }

        if (nearLat is < -90 or > 90 || nearLng is < -180 or > 180)
        {
            return Invalid("near", "nearLat must be within ±90 and nearLng within ±180.");
        }

        try
        {
            var results = await geocoder.SearchAsync(query, nearLat, nearLng, cancellationToken);
            return TypedResults.Ok(results.ToArray());
        }
        catch (GeocodingUnavailableException exception)
        {
            return Unavailable(exception);
        }
    }

    private static async Task<Results<Ok<GeocodeResult>, ValidationProblem, ProblemHttpResult>> Reverse(
        [FromQuery(Name = "lat")] double lat,
        [FromQuery(Name = "lng")] double lng,
        PhotonGeocoder geocoder,
        CancellationToken cancellationToken)
    {
        if (lat is < -90 or > 90 || lng is < -180 or > 180)
        {
            return Invalid("location", "lat must be within ±90 and lng within ±180.");
        }

        try
        {
            return await geocoder.ReverseAsync(lat, lng, cancellationToken) is { } result
                ? TypedResults.Ok(result)
                : TypedResults.Problem(
                    title: "No address found",
                    detail: "There's no known address near that point.",
                    statusCode: StatusCodes.Status404NotFound,
                    extensions: new Dictionary<string, object?> { ["code"] = "address_not_found" });
        }
        catch (GeocodingUnavailableException exception)
        {
            return Unavailable(exception);
        }
    }

    private static ValidationProblem Invalid(string field, string message) =>
        TypedResults.ValidationProblem(
            new Dictionary<string, string[]> { [field] = [message] },
            extensions: new Dictionary<string, object?> { ["code"] = "validation_failed" });

    private static ProblemHttpResult Unavailable(GeocodingUnavailableException exception) =>
        TypedResults.Problem(
            title: "Address search is unavailable",
            detail: $"{exception.Message} Drop a pin on the map or enter coordinates instead.",
            statusCode: StatusCodes.Status503ServiceUnavailable,
            extensions: new Dictionary<string, object?> { ["code"] = "geocoding_unavailable" });
}
