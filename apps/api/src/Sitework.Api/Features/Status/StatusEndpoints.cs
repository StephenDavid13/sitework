using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Sitework.Api.Infrastructure;

namespace Sitework.Api.Features.Status;

public sealed record StatusResponse(
    string Service,
    string Version,
    string Environment,
    HealthStatus Database,
    DateTimeOffset ServerTime);

public static class StatusEndpoints
{
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
            Service: Observability.ServiceName,
            Version: Observability.Version,
            Environment: environment.EnvironmentName,
            Database: report.Status,
            ServerTime: clock.GetUtcNow()));
    }
}
