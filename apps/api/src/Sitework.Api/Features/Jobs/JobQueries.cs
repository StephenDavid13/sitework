using System.Globalization;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite.Geometries;
using Sitework.Api.Domain;

namespace Sitework.Api.Features.Jobs;

internal static partial class JobQueries
{
    public const int DefaultPageSize = 20;
    public const int MaxPageSize = 100;
    public const int MapLimit = 2000;
    public const double MaxRadiusKm = 500;

    public static IQueryable<Job> Filter(
        this IQueryable<Job> jobs, JobStatus[]? statuses, JobPriority[]? priorities, string? search)
    {
        if (statuses is { Length: > 0 })
        {
            jobs = jobs.Where(job => statuses.Contains(job.Status));
        }

        if (priorities is { Length: > 0 })
        {
            jobs = jobs.Where(job => priorities.Contains(job.Priority));
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            var pattern = $"%{EscapeLike(term)}%";
            var number = ParseReferenceNumber(term);
            jobs = jobs.Where(job =>
                EF.Functions.ILike(job.Title, pattern) ||
                EF.Functions.ILike(job.SiteName!, pattern) ||
                EF.Functions.ILike(job.Address!, pattern) ||
                EF.Functions.ILike(job.Assignee!, pattern) ||
                (number != null && job.Number == number));
        }

        return jobs;
    }

    /// <summary>Parses a <c>minLng,minLat,maxLng,maxLat</c> viewport.</summary>
    public static bool TryParseBbox(string value, out Geometry box, out string error)
    {
        box = null!;
        var parts = value.Split(',');
        var numbers = new double[4];
        if (parts.Length != 4 || !parts.Select((part, i) =>
                double.TryParse(part, NumberStyles.Float, CultureInfo.InvariantCulture, out numbers[i])).All(ok => ok))
        {
            error = "Use four comma-separated numbers: minLng,minLat,maxLng,maxLat.";
            return false;
        }

        var (minLng, minLat, maxLng, maxLat) = (numbers[0], numbers[1], numbers[2], numbers[3]);
        if (minLng < -180 || maxLng > 180 || minLat < -90 || maxLat > 90 || minLng >= maxLng || minLat >= maxLat)
        {
            error = "Longitudes must be within ±180, latitudes within ±90, and each minimum below its maximum.";
            return false;
        }

        box = Geo.Box(minLng, minLat, maxLng, maxLat);
        error = string.Empty;
        return true;
    }

    private static string EscapeLike(string value) =>
        value.Replace(@"\", @"\\", StringComparison.Ordinal)
            .Replace("%", @"\%", StringComparison.Ordinal)
            .Replace("_", @"\_", StringComparison.Ordinal);

    /// <summary>Lets people search by "JOB-1042" or just "1042".</summary>
    private static long? ParseReferenceNumber(string term)
    {
        var match = ReferencePattern().Match(term);
        return match.Success && long.TryParse(match.Groups[1].Value, CultureInfo.InvariantCulture, out var number)
            ? number
            : null;
    }

    [GeneratedRegex(@"^(?:JOB-)?(\d{1,18})$", RegexOptions.IgnoreCase)]
    private static partial Regex ReferencePattern();
}
