using Sitework.Api.Domain;
using static Sitework.Api.Domain.JobStatus;

namespace Sitework.Api.UnitTests;

public sealed class JobLifecycleTests
{
    /// <summary>The lifecycle from PLAN.md, written out independently of the implementation.</summary>
    private static readonly HashSet<(JobStatus From, JobStatus To)> Allowed =
    [
        (Draft, Scheduled), (Draft, Cancelled),
        (Scheduled, InProgress), (Scheduled, OnHold), (Scheduled, Cancelled),
        (InProgress, OnHold), (InProgress, Completed), (InProgress, Cancelled),
        (OnHold, Scheduled), (OnHold, InProgress), (OnHold, Cancelled),
    ];

    public static TheoryData<JobStatus, JobStatus> EveryPair()
    {
        var data = new TheoryData<JobStatus, JobStatus>();
        foreach (var from in Enum.GetValues<JobStatus>())
        {
            foreach (var to in Enum.GetValues<JobStatus>())
            {
                data.Add(from, to);
            }
        }

        return data;
    }

    [Theory]
    [MemberData(nameof(EveryPair))]
    public void Only_the_documented_transitions_are_allowed(JobStatus from, JobStatus to)
    {
        (JobLifecycle.Find(from, to) is not null).ShouldBe(Allowed.Contains((from, to)));
    }

    [Theory]
    [InlineData(Draft, Cancelled)]
    [InlineData(Scheduled, OnHold)]
    [InlineData(Scheduled, Cancelled)]
    [InlineData(InProgress, OnHold)]
    [InlineData(InProgress, Cancelled)]
    [InlineData(OnHold, Cancelled)]
    public void Holds_and_cancellations_need_a_note(JobStatus from, JobStatus to)
    {
        JobLifecycle.Find(from, to)!.RequiresNote.ShouldBeTrue();
    }

    [Fact]
    public void Only_moves_into_scheduled_need_a_schedule()
    {
        foreach (var from in Enum.GetValues<JobStatus>())
        {
            foreach (var rule in JobLifecycle.AllowedFrom(from))
            {
                rule.RequiresSchedule.ShouldBe(rule.To == Scheduled, $"{rule.From} -> {rule.To}");
            }
        }
    }

    [Theory]
    [InlineData(Completed)]
    [InlineData(Cancelled)]
    public void Terminal_statuses_have_no_way_out(JobStatus status)
    {
        JobLifecycle.IsTerminal(status).ShouldBeTrue();
        JobLifecycle.AllowedFrom(status).ShouldBeEmpty();
    }

    [Theory]
    [InlineData(Draft, true)]
    [InlineData(Scheduled, false)]
    [InlineData(InProgress, false)]
    [InlineData(OnHold, false)]
    [InlineData(Completed, false)]
    [InlineData(Cancelled, true)]
    public void Started_work_cannot_be_deleted(JobStatus status, bool canDelete)
    {
        JobLifecycle.CanDelete(status).ShouldBe(canDelete);
    }
}
