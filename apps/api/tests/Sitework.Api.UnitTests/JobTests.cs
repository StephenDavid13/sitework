using Sitework.Api.Data;
using Sitework.Api.Domain;

namespace Sitework.Api.UnitTests;

public sealed class JobTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 13, 9, 0, 0, TimeSpan.Zero);

    private static JobDetails Details(DateTimeOffset? scheduledFor = null) => new(
        "  Fix fence  ", "   ", JobPriority.High, -36.85, 174.76, " Ponsonby site ", null, "Ben Carter", scheduledFor);

    [Fact]
    public void New_jobs_start_as_draft_with_trimmed_details_and_a_creation_record()
    {
        var job = Job.Create(Details(), Now);

        job.Status.ShouldBe(JobStatus.Draft);
        job.Title.ShouldBe("Fix fence");
        job.Description.ShouldBeNull();
        job.SiteName.ShouldBe("Ponsonby site");
        job.Location.Y.ShouldBe(-36.85);
        job.Location.X.ShouldBe(174.76);
        job.Location.SRID.ShouldBe(Geo.Wgs84);
        job.CreatedAt.ShouldBe(Now);
        var created = job.History.ShouldHaveSingleItem();
        created.From.ShouldBeNull();
        created.To.ShouldBe(JobStatus.Draft);
    }

    [Fact]
    public void Scheduled_times_are_stored_in_utc()
    {
        var local = new DateTimeOffset(2026, 10, 14, 9, 0, 0, TimeSpan.FromHours(13));

        var job = Job.Create(Details(local), Now);

        job.ScheduledFor.ShouldBe(local);
        job.ScheduledFor!.Value.Offset.ShouldBe(TimeSpan.Zero);
    }

    [Fact]
    public void Scheduling_needs_a_time_which_the_transition_can_supply()
    {
        var job = Job.Create(Details(), Now);

        var error = job.TransitionTo(JobStatus.Scheduled, null, null, Now);
        error.ShouldNotBeNull();
        error.Kind.ShouldBe(DomainErrorKind.Validation);
        error.Field.ShouldBe("scheduledFor");
        job.Status.ShouldBe(JobStatus.Draft);

        job.TransitionTo(JobStatus.Scheduled, null, Now.AddDays(1), Now).ShouldBeNull();
        job.Status.ShouldBe(JobStatus.Scheduled);
        job.ScheduledFor.ShouldBe(Now.AddDays(1));
    }

    [Fact]
    public void Holding_needs_a_note_and_records_it()
    {
        var job = Job.Create(Details(Now.AddDays(1)), Now);
        job.TransitionTo(JobStatus.Scheduled, null, null, Now).ShouldBeNull();

        job.TransitionTo(JobStatus.OnHold, " ", null, Now)!.Field.ShouldBe("note");
        job.TransitionTo(JobStatus.OnHold, " Waiting on parts ", null, Now.AddHours(1)).ShouldBeNull();

        job.Status.ShouldBe(JobStatus.OnHold);
        job.UpdatedAt.ShouldBe(Now.AddHours(1));
        var hold = job.History[^1];
        hold.From.ShouldBe(JobStatus.Scheduled);
        hold.Note.ShouldBe("Waiting on parts");
    }

    [Fact]
    public void Completing_stamps_the_completion_time_and_closes_the_job()
    {
        var job = Job.Create(Details(Now), Now);
        job.TransitionTo(JobStatus.Scheduled, null, null, Now);
        job.TransitionTo(JobStatus.InProgress, null, null, Now);

        job.TransitionTo(JobStatus.Completed, null, null, Now.AddHours(2)).ShouldBeNull();

        job.CompletedAt.ShouldBe(Now.AddHours(2));
        var error = job.Update(Details(), Now)!;
        error.Kind.ShouldBe(DomainErrorKind.Conflict);
        error.Code.ShouldBe("job_closed");
    }

    [Fact]
    public void Illegal_transitions_are_conflicts_that_change_nothing()
    {
        var job = Job.Create(Details(), Now);

        var error = job.TransitionTo(JobStatus.Completed, null, null, Now)!;

        error.Kind.ShouldBe(DomainErrorKind.Conflict);
        error.Code.ShouldBe("transition_not_allowed");
        job.Status.ShouldBe(JobStatus.Draft);
        job.History.Count.ShouldBe(1);
    }

    [Fact]
    public void A_scheduled_job_cannot_lose_its_schedule()
    {
        var job = Job.Create(Details(Now.AddDays(1)), Now);
        job.TransitionTo(JobStatus.Scheduled, null, null, Now);

        job.Update(Details(scheduledFor: null), Now)!.Field.ShouldBe("scheduledFor");
    }

    [Fact]
    public void Demo_data_is_deterministic_and_covers_every_status()
    {
        var first = DemoDataSeeder.Generate(Now);
        var second = DemoDataSeeder.Generate(Now);

        first.Count.ShouldBe(60);
        first.Select(job => (job.Title, job.Status, job.Location.X, job.Location.Y))
            .ShouldBe(second.Select(job => (job.Title, job.Status, job.Location.X, job.Location.Y)));
        first.Select(job => job.Status).Distinct().Count().ShouldBe(Enum.GetValues<JobStatus>().Length);
        first.ShouldAllBe(job => job.History.Last().To == job.Status);
    }
}
