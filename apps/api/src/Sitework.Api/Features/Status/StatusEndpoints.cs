using System.Reflection;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Sitework.Api.Features.Status;

public sealed record StatusResponse(
    string Service,
    string Version,
    string Environment,
    HealthStatus Database,
    DateTimeOffset ServerTime);

public static class StatusEndpoints
{
    private static readonly string Version =
        typeof(StatusEndpoints).Assembly
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
        ?? "unknown";

    public static IEndpointRouteBuilder MapStatusEndpoints(this IEndpointRouteBuilder routes)
    {
        routes.MapGet("/status", GetStatus)
            .WithName("GetStatus")
            .WithTags("System")
            .WithSummary("Service version and database connectivity.");

        return routes;
    }

    private static async Task<Ok<StatusResponse>> GetStatus(
        HealthCheckService health,
        IHostEnvironment environment,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        var report = await health.CheckHealthAsync(
            check => check.Tags.Contains(HealthTags.Ready), cancellationToken);

        return TypedResults.Ok(new StatusResponse(
            Service: "sitework-api",
            Version: Version,
            Environment: environment.EnvironmentName,
            Database: report.Status,
            ServerTime: clock.GetUtcNow()));
    }
}
