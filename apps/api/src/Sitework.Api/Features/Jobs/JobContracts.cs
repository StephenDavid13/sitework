using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
using Sitework.Api.Domain;

namespace Sitework.Api.Features.Jobs;

public sealed record GeoPoint(
    [property: Range(-90, 90)] double Latitude,
    [property: Range(-180, 180)] double Longitude);

public sealed record AllowedTransition(JobStatus To, bool RequiresNote, bool RequiresSchedule);

/// <param name="CanEdit">False once the job is Completed or Cancelled.</param>
/// <param name="CanDelete">Only Draft and Cancelled jobs can be deleted.</param>
public sealed record JobResponse(
    Guid Id,
    string Reference,
    string Title,
    string? Description,
    JobStatus Status,
    JobPriority Priority,
    GeoPoint Location,
    string? SiteName,
    string? Address,
    string? Assignee,
    DateTimeOffset? ScheduledFor,
    DateTimeOffset? CompletedAt,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    uint Version,
    bool CanEdit,
    bool CanDelete,
    IReadOnlyList<AllowedTransition> AllowedTransitions);

public sealed record JobPage(IReadOnlyList<JobResponse> Items, int Page, int PageSize, int Total);

public sealed record JobMapPoint(
    Guid Id,
    string Reference,
    string Title,
    JobStatus Status,
    JobPriority Priority,
    double Latitude,
    double Longitude);

/// <param name="Truncated">True when more jobs matched than the response limit.</param>
public sealed record JobMapResponse(IReadOnlyList<JobMapPoint> Items, bool Truncated);

public sealed record StatusCount(JobStatus Status, int Count);

public sealed record JobStatsResponse(int Total, IReadOnlyList<StatusCount> ByStatus);

public sealed record StatusChangeResponse(
    Guid Id,
    JobStatus? From,
    JobStatus To,
    string? Note,
    DateTimeOffset ChangedAt);

public sealed record CreateJobRequest(
    [property: Required, StringLength(200)] string Title,
    [property: StringLength(4000)] string? Description,
    JobPriority Priority,
    [property: Required] GeoPoint Location,
    [property: StringLength(200)] string? SiteName,
    [property: StringLength(300)] string? Address,
    [property: StringLength(100)] string? Assignee,
    DateTimeOffset? ScheduledFor);

/// <param name="Version">The <c>version</c> the client last read; a mismatch means someone else changed the job.</param>
public sealed record UpdateJobRequest(
    [property: Required, StringLength(200)] string Title,
    [property: StringLength(4000)] string? Description,
    JobPriority Priority,
    [property: Required] GeoPoint Location,
    [property: StringLength(200)] string? SiteName,
    [property: StringLength(300)] string? Address,
    [property: StringLength(100)] string? Assignee,
    DateTimeOffset? ScheduledFor,
    uint Version);

public sealed record TransitionRequest(
    JobStatus To,
    [property: StringLength(1000)] string? Note,
    DateTimeOffset? ScheduledFor,
    uint Version);

public enum JobSort
{
    Updated,
    Scheduled,
    Priority,
    Distance,
}

/// <param name="Bbox">Optional area as <c>minLng,minLat,maxLng,maxLat</c> ("search this area").</param>
public sealed record JobListQuery(
    [property: FromQuery(Name = "status")] JobStatus[]? Status,
    [property: FromQuery(Name = "priority")] JobPriority[]? Priority,
    [property: FromQuery(Name = "q")] string? Q,
    [property: FromQuery(Name = "nearLat")] double? NearLat,
    [property: FromQuery(Name = "nearLng")] double? NearLng,
    [property: FromQuery(Name = "radiusKm")] double? RadiusKm,
    [property: FromQuery(Name = "bbox")] string? Bbox,
    [property: FromQuery(Name = "sort")] JobSort? Sort,
    [property: FromQuery(Name = "page")] int? Page,
    [property: FromQuery(Name = "pageSize")] int? PageSize);

/// <param name="Bbox">Viewport as <c>minLng,minLat,maxLng,maxLat</c>.</param>
public sealed record JobMapQuery(
    [property: FromQuery(Name = "bbox")] string? Bbox,
    [property: FromQuery(Name = "status")] JobStatus[]? Status,
    [property: FromQuery(Name = "priority")] JobPriority[]? Priority,
    [property: FromQuery(Name = "q")] string? Q);

internal static class JobMapping
{
    public static JobResponse ToResponse(this Job job) => new(
        job.Id,
        job.Reference,
        job.Title,
        job.Description,
        job.Status,
        job.Priority,
        new GeoPoint(job.Location.Y, job.Location.X),
        job.SiteName,
        job.Address,
        job.Assignee,
        job.ScheduledFor,
        job.CompletedAt,
        job.CreatedAt,
        job.UpdatedAt,
        job.Version,
        !JobLifecycle.IsTerminal(job.Status),
        JobLifecycle.CanDelete(job.Status),
        [.. JobLifecycle.AllowedFrom(job.Status).Select(rule =>
            new AllowedTransition(rule.To, rule.RequiresNote, rule.RequiresSchedule))]);

    public static JobDetails ToDetails(this CreateJobRequest request) => new(
        request.Title,
        request.Description,
        request.Priority,
        request.Location.Latitude,
        request.Location.Longitude,
        request.SiteName,
        request.Address,
        request.Assignee,
        request.ScheduledFor);

    public static JobDetails ToDetails(this UpdateJobRequest request) => new(
        request.Title,
        request.Description,
        request.Priority,
        request.Location.Latitude,
        request.Location.Longitude,
        request.SiteName,
        request.Address,
        request.Assignee,
        request.ScheduledFor);
}
