using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite.Geometries;
using Sitework.Api.Data;
using Sitework.Api.Domain;
using Sitework.Api.Infrastructure;

namespace Sitework.Api.Features.Jobs;

public static class JobEndpoints
{
    public static IEndpointRouteBuilder MapJobEndpoints(this IEndpointRouteBuilder routes)
    {
        var jobs = routes.MapGroup("/jobs").WithTags("Jobs");

        jobs.MapGet("", ListJobs)
            .WithName("ListJobs")
            .WithSummary("List jobs with filters, text search, radius or area search, and paging.");

        jobs.MapGet("/map", ListMapPoints)
            .WithName("ListJobMapPoints")
            .WithSummary("Lightweight points for every matching job, optionally inside a map viewport.");

        jobs.MapGet("/stats", GetStats)
            .WithName("GetJobStats")
            .WithSummary("Job counts by status.");

        jobs.MapGet("/{id:guid}", GetJob)
            .WithName("GetJob")
            .WithSummary("Get a job, including the status changes allowed from its current status.")
            .ProducesProblem(StatusCodes.Status404NotFound);

        jobs.MapGet("/{id:guid}/history", GetHistory)
            .WithName("GetJobHistory")
            .WithSummary("The job's status changes, oldest first.")
            .ProducesProblem(StatusCodes.Status404NotFound);

        var writes = jobs.MapGroup("")
            .RequireRateLimiting(RateLimitPolicies.Writes)
            .ProducesProblem(StatusCodes.Status429TooManyRequests);

        writes.MapPost("", CreateJob)
            .WithName("CreateJob")
            .WithSummary("Create a job. New jobs always start as Draft.")
            .ProducesValidationProblem();

        writes.MapPut("/{id:guid}", UpdateJob)
            .WithName("UpdateJob")
            .WithSummary("Update a job's details. Status changes go through /transitions.")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        writes.MapDelete("/{id:guid}", DeleteJob)
            .WithName("DeleteJob")
            .WithSummary("Delete a Draft or Cancelled job.")
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        writes.MapPost("/{id:guid}/transitions", TransitionJob)
            .WithName("TransitionJob")
            .WithSummary("Move a job to another status, if the lifecycle allows it.")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        return routes;
    }

    private static async Task<Results<Ok<JobPage>, ValidationProblem>> ListJobs(
        [AsParameters] JobListQuery query, SiteworkDbContext db, CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>();
        var page = query.Page ?? 1;
        var pageSize = query.PageSize ?? JobQueries.DefaultPageSize;
        if (page < 1)
        {
            errors["page"] = ["Page must be 1 or greater."];
        }

        if (pageSize is < 1 or > JobQueries.MaxPageSize)
        {
            errors["pageSize"] = [$"Page size must be between 1 and {JobQueries.MaxPageSize}."];
        }

        Point? center = null;
        var radiusMeters = 0d;
        if (query.NearLat is not null || query.NearLng is not null || query.RadiusKm is not null)
        {
            if (query.NearLat is not { } lat || query.NearLng is not { } lng || query.RadiusKm is not { } radiusKm)
            {
                errors["near"] = ["nearLat, nearLng and radiusKm must be supplied together."];
            }
            else if (lat is < -90 or > 90 || lng is < -180 or > 180)
            {
                errors["near"] = ["nearLat must be within ±90 and nearLng within ±180."];
            }
            else if (radiusKm is <= 0 or > JobQueries.MaxRadiusKm)
            {
                errors["radiusKm"] = [$"Radius must be more than 0 and at most {JobQueries.MaxRadiusKm} km."];
            }
            else
            {
                center = Geo.Point(lat, lng);
                radiusMeters = radiusKm * 1000;
            }
        }

        Geometry? area = null;
        if (query.Bbox is not null)
        {
            if (JobQueries.TryParseBbox(query.Bbox, out var box, out var bboxError))
            {
                area = box;
            }
            else
            {
                errors["bbox"] = [bboxError];
            }
        }

        var sort = query.Sort ?? (center is null ? JobSort.Updated : JobSort.Distance);
        if (sort == JobSort.Distance && center is null && !errors.ContainsKey("near"))
        {
            errors["sort"] = ["Sorting by distance needs nearLat, nearLng and radiusKm."];
        }

        if (errors.Count > 0)
        {
            return JobProblems.Invalid(errors);
        }

        var jobs = db.Jobs.AsNoTracking().Filter(query.Status, query.Priority, query.Q);
        if (center is not null)
        {
            jobs = jobs.Where(job => EF.Functions.IsWithinDistance(job.Location, center, radiusMeters, true));
        }

        if (area is not null)
        {
            jobs = jobs.Where(job => job.Location.Intersects(area));
        }

        var total = await jobs.CountAsync(cancellationToken);
        var ordered = sort switch
        {
            JobSort.Scheduled => jobs.OrderBy(job => job.ScheduledFor == null).ThenBy(job => job.ScheduledFor),
            JobSort.Priority => jobs.OrderByDescending(job => job.Priority),
            JobSort.Distance => jobs.OrderBy(job => EF.Functions.Distance(job.Location, center!, true)),
            _ => jobs.OrderByDescending(job => job.UpdatedAt),
        };
        var items = await ordered
            .ThenByDescending(job => job.UpdatedAt)
            .ThenBy(job => job.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return TypedResults.Ok(new JobPage([.. items.Select(job => job.ToResponse())], page, pageSize, total));
    }

    private static async Task<Results<Ok<JobMapResponse>, ValidationProblem>> ListMapPoints(
        [AsParameters] JobMapQuery query, SiteworkDbContext db, CancellationToken cancellationToken)
    {
        var jobs = db.Jobs.AsNoTracking().Filter(query.Status, query.Priority, query.Q);
        if (query.Bbox is not null)
        {
            if (!JobQueries.TryParseBbox(query.Bbox, out var box, out var error))
            {
                return JobProblems.Invalid(new Dictionary<string, string[]> { ["bbox"] = [error] });
            }

            jobs = jobs.Where(job => job.Location.Intersects(box));
        }

        var points = await jobs
            .OrderByDescending(job => job.Priority)
            .ThenByDescending(job => job.UpdatedAt)
            .Take(JobQueries.MapLimit + 1)
            .Select(job => new JobMapPoint(
                job.Id,
                Job.FormatReference(job.Number),
                job.Title,
                job.Status,
                job.Priority,
                job.Location.Y,
                job.Location.X))
            .ToListAsync(cancellationToken);

        return TypedResults.Ok(new JobMapResponse(
            [.. points.Take(JobQueries.MapLimit)], Truncated: points.Count > JobQueries.MapLimit));
    }

    private static async Task<Ok<JobStatsResponse>> GetStats(SiteworkDbContext db, CancellationToken cancellationToken)
    {
        var counts = await db.Jobs
            .GroupBy(job => job.Status)
            .Select(group => new { Status = group.Key, Count = group.Count() })
            .ToDictionaryAsync(row => row.Status, row => row.Count, cancellationToken);

        var byStatus = Enum.GetValues<JobStatus>()
            .Select(status => new StatusCount(status, counts.GetValueOrDefault(status)))
            .ToList();

        return TypedResults.Ok(new JobStatsResponse(counts.Values.Sum(), byStatus));
    }

    private static async Task<Results<Ok<JobResponse>, ProblemHttpResult>> GetJob(
        Guid id, SiteworkDbContext db, CancellationToken cancellationToken)
    {
        var job = await db.Jobs.AsNoTracking().FirstOrDefaultAsync(job => job.Id == id, cancellationToken);
        return job is null ? JobProblems.NotFound(id) : TypedResults.Ok(job.ToResponse());
    }

    private static async Task<Results<Ok<StatusChangeResponse[]>, ProblemHttpResult>> GetHistory(
        Guid id, SiteworkDbContext db, CancellationToken cancellationToken)
    {
        if (!await db.Jobs.AnyAsync(job => job.Id == id, cancellationToken))
        {
            return JobProblems.NotFound(id);
        }

        var history = await db.JobStatusChanges
            .AsNoTracking()
            .Where(change => change.JobId == id)
            .OrderBy(change => change.ChangedAt)
            .ThenBy(change => change.Id)
            .Select(change => new StatusChangeResponse(change.Id, change.From, change.To, change.Note, change.ChangedAt))
            .ToArrayAsync(cancellationToken);

        return TypedResults.Ok(history);
    }

    private static async Task<Created<JobResponse>> CreateJob(
        CreateJobRequest request, SiteworkDbContext db, TimeProvider clock, CancellationToken cancellationToken)
    {
        var job = Job.Create(request.ToDetails(), clock.GetUtcNow());
        db.Jobs.Add(job);
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.Created($"/api/jobs/{job.Id}", job.ToResponse());
    }

    private static async Task<Results<Ok<JobResponse>, ProblemHttpResult, ValidationProblem>> UpdateJob(
        Guid id,
        UpdateJobRequest request,
        SiteworkDbContext db,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        var job = await db.Jobs.FirstOrDefaultAsync(job => job.Id == id, cancellationToken);
        if (job is null)
        {
            return JobProblems.NotFound(id);
        }

        if (job.Version != request.Version)
        {
            return JobProblems.StaleVersion(job);
        }

        if (job.Update(request.ToDetails(), clock.GetUtcNow()) is { } error)
        {
            return error.Kind == DomainErrorKind.Validation ? JobProblems.Invalid(error) : JobProblems.Conflict(error);
        }

        return await SaveAsync(db, job, cancellationToken);
    }

    private static async Task<Results<NoContent, ProblemHttpResult>> DeleteJob(
        Guid id, SiteworkDbContext db, CancellationToken cancellationToken)
    {
        var job = await db.Jobs.FirstOrDefaultAsync(job => job.Id == id, cancellationToken);
        if (job is null)
        {
            return JobProblems.NotFound(id);
        }

        if (!JobLifecycle.CanDelete(job.Status))
        {
            return JobProblems.DeleteNotAllowed(job);
        }

        db.Jobs.Remove(job);
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.NoContent();
    }

    private static async Task<Results<Ok<JobResponse>, ProblemHttpResult, ValidationProblem>> TransitionJob(
        Guid id,
        TransitionRequest request,
        SiteworkDbContext db,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        var job = await db.Jobs.FirstOrDefaultAsync(job => job.Id == id, cancellationToken);
        if (job is null)
        {
            return JobProblems.NotFound(id);
        }

        if (job.Version != request.Version)
        {
            return JobProblems.StaleVersion(job);
        }

        if (job.TransitionTo(request.To, request.Note, request.ScheduledFor, clock.GetUtcNow()) is { } error)
        {
            return error.Kind == DomainErrorKind.Validation ? JobProblems.Invalid(error) : JobProblems.Conflict(error);
        }

        return await SaveAsync(db, job, cancellationToken);
    }

    /// <summary>Saves, turning a lost race on <c>xmin</c> into the same 409 as a stale version.</summary>
    private static async Task<Results<Ok<JobResponse>, ProblemHttpResult, ValidationProblem>> SaveAsync(
        SiteworkDbContext db, Job job, CancellationToken cancellationToken)
    {
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            return JobProblems.StaleVersion(job);
        }

        return TypedResults.Ok(job.ToResponse());
    }
}
