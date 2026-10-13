using Microsoft.AspNetCore.Http.HttpResults;
using Sitework.Api.Domain;

namespace Sitework.Api.Features.Jobs;

/// <summary>
/// ProblemDetails responses for the Jobs API. Each carries a stable <c>code</c> extension the UI
/// branches on (e.g. <c>stale_version</c> opens the "changed elsewhere" dialog).
/// </summary>
internal static class JobProblems
{
    public static ProblemHttpResult NotFound(Guid id) => TypedResults.Problem(
        title: "Job not found",
        detail: $"No job exists with id {id}. It may have been deleted.",
        statusCode: StatusCodes.Status404NotFound,
        extensions: Code("job_not_found"));

    public static ProblemHttpResult StaleVersion(Job job) => TypedResults.Problem(
        title: "Job was changed by someone else",
        detail: $"{job.Reference} has been updated since you loaded it. Reload to see the latest version.",
        statusCode: StatusCodes.Status409Conflict,
        extensions: Code("stale_version"));

    public static ProblemHttpResult DeleteNotAllowed(Job job) => TypedResults.Problem(
        title: "Job can't be deleted",
        detail: $"{job.Reference} is {Job.Describe(job.Status)}. Cancel it instead so its history is kept.",
        statusCode: StatusCodes.Status409Conflict,
        extensions: Code("delete_not_allowed"));

    public static ProblemHttpResult Conflict(DomainError error) => TypedResults.Problem(
        title: error.Title,
        detail: error.Detail,
        statusCode: StatusCodes.Status409Conflict,
        extensions: Code(error.Code));

    public static ValidationProblem Invalid(DomainError error) => TypedResults.ValidationProblem(
        new Dictionary<string, string[]> { [error.Field ?? "request"] = [error.Detail] },
        extensions: Code(error.Code));

    public static ValidationProblem Invalid(Dictionary<string, string[]> errors) =>
        TypedResults.ValidationProblem(errors, extensions: Code("validation_failed"));

    private static Dictionary<string, object?> Code(string code) => new() { ["code"] = code };
}
