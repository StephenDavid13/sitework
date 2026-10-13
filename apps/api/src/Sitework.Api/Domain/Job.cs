using NetTopologySuite.Geometries;

namespace Sitework.Api.Domain;

/// <summary>The editable details of a job: everything except its status and history.</summary>
public sealed record JobDetails(
    string Title,
    string? Description,
    JobPriority Priority,
    double Latitude,
    double Longitude,
    string? SiteName,
    string? Address,
    string? Assignee,
    DateTimeOffset? ScheduledFor);

public sealed class Job
{
    private readonly List<JobStatusChange> _history = [];

    private Job()
    {
    }

    public Guid Id { get; private set; }

    /// <summary>Database-assigned sequence number behind the human-friendly <see cref="Reference"/>.</summary>
    public long Number { get; private set; }

    public string Title { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    public JobStatus Status { get; private set; }
    public JobPriority Priority { get; private set; }

    /// <summary>WGS 84 point: X is longitude, Y is latitude.</summary>
    public Point Location { get; private set; } = null!;

    public string? SiteName { get; private set; }
    public string? Address { get; private set; }
    public string? Assignee { get; private set; }
    public DateTimeOffset? ScheduledFor { get; private set; }
    public DateTimeOffset? CompletedAt { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }

    /// <summary>Optimistic concurrency token, mapped to Postgres <c>xmin</c>.</summary>
    public uint Version { get; private set; }

    public IReadOnlyList<JobStatusChange> History => _history;

    public string Reference => FormatReference(Number);

    public static Job Create(JobDetails details, DateTimeOffset now)
    {
        var job = new Job
        {
            Id = Guid.CreateVersion7(now),
            Status = JobStatus.Draft,
            CreatedAt = now,
        };
        job.Apply(details, now);
        job._history.Add(JobStatusChange.Record(job.Id, from: null, to: JobStatus.Draft, note: null, now));
        return job;
    }

    public DomainError? Update(JobDetails details, DateTimeOffset now)
    {
        if (JobLifecycle.IsTerminal(Status))
        {
            return DomainError.Conflict(
                "job_closed", "Job is closed", $"{Reference} is {Describe(Status)} and can no longer be edited.");
        }

        if (Status == JobStatus.Scheduled && details.ScheduledFor is null)
        {
            return DomainError.Invalid("scheduledFor", "A scheduled job needs a scheduled time.");
        }

        Apply(details, now);
        return null;
    }

    public DomainError? TransitionTo(JobStatus to, string? note, DateTimeOffset? scheduledFor, DateTimeOffset now)
    {
        var rule = JobLifecycle.Find(Status, to);
        if (rule is null)
        {
            return DomainError.Conflict(
                "transition_not_allowed",
                "Transition not allowed",
                $"{Reference} can't move from {Describe(Status)} to {Describe(to)}.");
        }

        note = Normalize(note);
        if (rule.RequiresNote && note is null)
        {
            return DomainError.Invalid("note", $"Add a note to move a job to {Describe(to)}.");
        }

        var schedule = scheduledFor?.ToUniversalTime() ?? ScheduledFor;
        if (rule.RequiresSchedule && schedule is null)
        {
            return DomainError.Invalid("scheduledFor", $"Set a scheduled time to move a job to {Describe(to)}.");
        }

        _history.Add(JobStatusChange.Record(Id, Status, to, note, now));
        Status = to;
        ScheduledFor = schedule;
        CompletedAt = to == JobStatus.Completed ? now : CompletedAt;
        UpdatedAt = now;
        return null;
    }

    public static string FormatReference(long number) => $"JOB-{number}";

    public static string Describe(JobStatus status) => status switch
    {
        JobStatus.InProgress => "In progress",
        JobStatus.OnHold => "On hold",
        _ => status.ToString(),
    };

    private void Apply(JobDetails details, DateTimeOffset now)
    {
        Title = details.Title.Trim();
        Description = Normalize(details.Description);
        Priority = details.Priority;
        Location = Geo.Point(details.Latitude, details.Longitude);
        SiteName = Normalize(details.SiteName);
        Address = Normalize(details.Address);
        Assignee = Normalize(details.Assignee);
        // Npgsql only writes UTC offsets to timestamptz.
        ScheduledFor = details.ScheduledFor?.ToUniversalTime();
        UpdatedAt = now;
    }

    private static string? Normalize(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

public sealed class JobStatusChange
{
    private JobStatusChange()
    {
    }

    public Guid Id { get; private set; }
    public Guid JobId { get; private set; }

    /// <summary>Null for the change that created the job.</summary>
    public JobStatus? From { get; private set; }

    public JobStatus To { get; private set; }
    public string? Note { get; private set; }
    public DateTimeOffset ChangedAt { get; private set; }

    internal static JobStatusChange Record(Guid jobId, JobStatus? from, JobStatus to, string? note, DateTimeOffset now) =>
        new()
        {
            Id = Guid.CreateVersion7(now),
            JobId = jobId,
            From = from,
            To = to,
            Note = note,
            ChangedAt = now,
        };
}
