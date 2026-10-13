using System.Globalization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;

namespace Sitework.Api.Infrastructure;

public static class RateLimitPolicies
{
    public const string Writes = "writes";

    /// <summary>Protects the upstream geocoder's fair-use limits as well as our own.</summary>
    public const string Geocoding = "geocoding";
}

public sealed class RateLimitOptions
{
    public int RequestsPerMinute { get; init; } = 600;
    public int WritesPerMinute { get; init; } = 60;
    public int GeocodingPerMinute { get; init; } = 60;
}

/// <summary>
/// The site is public without logins, so every client is rate limited by IP. The client IP comes
/// from <c>X-Forwarded-For</c>, trusted only from <c>TrustedProxyNetworks</c> (the load balancer's
/// VPC range) so callers can't spoof it.
/// </summary>
public static class ClientProtection
{
    public static IServiceCollection AddClientProtection(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            options.KnownIPNetworks.Clear();
            options.KnownProxies.Clear();
            foreach (var network in configuration.GetSection("TrustedProxyNetworks").Get<string[]>() ?? [])
            {
                options.KnownIPNetworks.Add(System.Net.IPNetwork.Parse(network));
            }
        });

        var limits = configuration.GetSection("RateLimiting").Get<RateLimitOptions>() ?? new RateLimitOptions();
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
                RateLimitPartition.GetFixedWindowLimiter(ClientKey(context), _ => PerMinute(limits.RequestsPerMinute)));
            options.AddPolicy(RateLimitPolicies.Writes, context =>
                RateLimitPartition.GetFixedWindowLimiter(ClientKey(context), _ => PerMinute(limits.WritesPerMinute)));
            options.AddPolicy(RateLimitPolicies.Geocoding, context =>
                RateLimitPartition.GetFixedWindowLimiter(ClientKey(context), _ => PerMinute(limits.GeocodingPerMinute)));
            options.OnRejected = WriteProblemAsync;
        });

        return services;
    }

    private static string ClientKey(HttpContext context) =>
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown";

    private static FixedWindowRateLimiterOptions PerMinute(int permits) => new()
    {
        PermitLimit = permits,
        Window = TimeSpan.FromMinutes(1),
        QueueLimit = 0,
    };

    private static async ValueTask WriteProblemAsync(OnRejectedContext context, CancellationToken cancellationToken)
    {
        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
        {
            context.HttpContext.Response.Headers.RetryAfter =
                ((int)Math.Ceiling(retryAfter.TotalSeconds)).ToString(CultureInfo.InvariantCulture);
        }

        var problems = context.HttpContext.RequestServices.GetRequiredService<IProblemDetailsService>();
        await problems.WriteAsync(new ProblemDetailsContext
        {
            HttpContext = context.HttpContext,
            ProblemDetails =
            {
                Status = StatusCodes.Status429TooManyRequests,
                Title = "Too many requests",
                Detail = "You're sending requests too quickly. Wait a moment and try again.",
                Extensions = { ["code"] = "rate_limited" },
            },
        });
    }
}
