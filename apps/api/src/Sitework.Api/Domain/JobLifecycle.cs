using static Sitework.Api.Domain.JobStatus;

namespace Sitework.Api.Domain;

/// <param name="RequiresNote">The caller must explain the change (holds and cancellations).</param>
/// <param name="RequiresSchedule">The job must have, or be given, a <c>scheduledFor</c> time.</param>
public sealed record TransitionRule(JobStatus From, JobStatus To, bool RequiresNote, bool RequiresSchedule);

/// <summary>The single source of truth for which status changes are allowed.</summary>
public static class JobLifecycle
{
    private static readonly TransitionRule[] Rules =
    [
        new(Draft, Scheduled, RequiresNote: false, RequiresSchedule: true),
        new(Draft, Cancelled, RequiresNote: true, RequiresSchedule: false),

        new(Scheduled, InProgress, RequiresNote: false, RequiresSchedule: false),
        new(Scheduled, OnHold, RequiresNote: true, RequiresSchedule: false),
        new(Scheduled, Cancelled, RequiresNote: true, RequiresSchedule: false),

        new(InProgress, OnHold, RequiresNote: true, RequiresSchedule: false),
        new(InProgress, Completed, RequiresNote: false, RequiresSchedule: false),
        new(InProgress, Cancelled, RequiresNote: true, RequiresSchedule: false),

        new(OnHold, Scheduled, RequiresNote: false, RequiresSchedule: true),
        new(OnHold, InProgress, RequiresNote: false, RequiresSchedule: false),
        new(OnHold, Cancelled, RequiresNote: true, RequiresSchedule: false),
    ];

    public static IReadOnlyList<TransitionRule> AllowedFrom(JobStatus from) =>
        Array.FindAll(Rules, rule => rule.From == from);

    public static TransitionRule? Find(JobStatus from, JobStatus to) =>
        Array.Find(Rules, rule => rule.From == from && rule.To == to);

    /// <summary>Terminal jobs are read-only.</summary>
    public static bool IsTerminal(JobStatus status) => status is Completed or Cancelled;

    /// <summary>Work that has started must be cancelled (and so recorded), not deleted.</summary>
    public static bool CanDelete(JobStatus status) => status is Draft or Cancelled;
}
