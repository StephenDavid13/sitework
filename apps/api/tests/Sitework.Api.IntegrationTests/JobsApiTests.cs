using System.Net;
using System.Net.Http.Json;
using Sitework.Api.Domain;
using Sitework.Api.Features.Jobs;
using Sitework.Api.IntegrationTests.Infrastructure;

namespace Sitework.Api.IntegrationTests;

public sealed class JobsApiTests(PostgisFixture postgis)
{
    private static readonly DateTimeOffset Tomorrow = DateTimeOffset.UtcNow.AddDays(1);

    private readonly JobsClient _jobs = new(postgis.Api.CreateClient());

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Create_returns_a_draft_job_with_a_reference_and_its_next_steps()
    {
        var job = await _jobs.CreateAsync(JobsClient.NewJob(title: "  Replace smoke alarm  "));

        job.Status.ShouldBe(JobStatus.Draft);
        job.Title.ShouldBe("Replace smoke alarm");
        job.Reference.ShouldStartWith("JOB-");
        job.Location.ShouldBe(new GeoPoint(-36.8485, 174.7633));
        job.Version.ShouldBeGreaterThan(0u);
        job.AllowedTransitions.Select(t => t.To).ShouldBe([JobStatus.Scheduled, JobStatus.Cancelled], ignoreOrder: true);
        job.AllowedTransitions.Single(t => t.To == JobStatus.Cancelled).RequiresNote.ShouldBeTrue();
        job.AllowedTransitions.Single(t => t.To == JobStatus.Scheduled).RequiresSchedule.ShouldBeTrue();

        var history = await _jobs.ReadAsync<StatusChangeResponse[]>($"/api/jobs/{job.Id}/history");
        history.ShouldHaveSingleItem().To.ShouldBe(JobStatus.Draft);
    }

    [Fact]
    public async Task Create_rejects_missing_title_and_out_of_range_coordinates()
    {
        var response = await _jobs.Http.PostAsJsonAsync(
            "/api/jobs",
            JobsClient.NewJob(title: "", latitude: 95, longitude: 200),
            SiteworkApiFactory.Json,
            Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        var problem = await JobsClient.ReadProblemAsync(response);
        var fields = problem.Errors.Keys.Select(key => key.ToLowerInvariant()).ToList();
        fields.ShouldContain(field => field.EndsWith("title", StringComparison.Ordinal));
        fields.ShouldContain(field => field.EndsWith("latitude", StringComparison.Ordinal));
        fields.ShouldContain(field => field.EndsWith("longitude", StringComparison.Ordinal));
    }

    [Theory]
    [InlineData("""{"title":"x","priority":"Bogus","location":{"latitude":1,"longitude":1}}""")]
    [InlineData("""{"title":""")]
    public async Task Unreadable_request_bodies_are_bad_requests(string body)
    {
        using var content = new StringContent(body, System.Text.Encoding.UTF8, "application/json");

        var response = await _jobs.Http.PostAsync("/api/jobs", content, Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await JobsClient.ReadProblemAsync(response)).Status.ShouldBe(400);
    }

    [Fact]
    public async Task Unknown_job_returns_a_not_found_problem()
    {
        var response = await _jobs.Http.GetAsync($"/api/jobs/{Guid.NewGuid()}", Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await JobsClient.ReadProblemAsync(response)).Code.ShouldBe("job_not_found");
    }

    [Fact]
    public async Task Update_changes_details_and_issues_a_new_version()
    {
        var job = await _jobs.CreateAsync(JobsClient.NewJob());
        var request = new UpdateJobRequest("Replace mixer tap", null, JobPriority.High, new GeoPoint(-36.85, 174.77),
            "Unit 4", null, "Mei Lin", Tomorrow, job.Version);

        var response = await _jobs.Http.PutAsJsonAsync($"/api/jobs/{job.Id}", request, SiteworkApiFactory.Json, Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var updated = (await response.Content.ReadFromJsonAsync<JobResponse>(SiteworkApiFactory.Json, Ct))!;
        updated.Title.ShouldBe("Replace mixer tap");
        updated.Description.ShouldBeNull();
        updated.Priority.ShouldBe(JobPriority.High);
        updated.Assignee.ShouldBe("Mei Lin");
        updated.ScheduledFor.ShouldNotBeNull();
        updated.Version.ShouldNotBe(job.Version);
    }

    [Fact]
    public async Task Writing_with_a_stale_version_is_a_conflict()
    {
        var job = await _jobs.CreateAsync(JobsClient.NewJob());
        await _jobs.MoveAsync(job, JobStatus.Scheduled, scheduledFor: Tomorrow);

        // `job` still carries the version from before the transition.
        var response = await _jobs.TransitionAsync(job, JobStatus.Cancelled, note: "Client cancelled");

        response.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await JobsClient.ReadProblemAsync(response)).Code.ShouldBe("stale_version");
    }

    [Fact]
    public async Task A_job_can_be_taken_through_its_whole_lifecycle()
    {
        var job = await _jobs.CreateAsync(JobsClient.NewJob());

        job = await _jobs.MoveAsync(job, JobStatus.Scheduled, scheduledFor: Tomorrow);
        job = await _jobs.MoveAsync(job, JobStatus.InProgress);
        job = await _jobs.MoveAsync(job, JobStatus.OnHold, note: "Waiting on parts");
        job = await _jobs.MoveAsync(job, JobStatus.InProgress);
        job = await _jobs.MoveAsync(job, JobStatus.Completed);

        job.Status.ShouldBe(JobStatus.Completed);
        job.CompletedAt.ShouldNotBeNull();
        job.AllowedTransitions.ShouldBeEmpty();

        var history = await _jobs.ReadAsync<StatusChangeResponse[]>($"/api/jobs/{job.Id}/history");
        history.Select(change => change.To).ShouldBe(
        [
            JobStatus.Draft, JobStatus.Scheduled, JobStatus.InProgress,
            JobStatus.OnHold, JobStatus.InProgress, JobStatus.Completed,
        ]);
        history.Single(change => change.To == JobStatus.OnHold).Note.ShouldBe("Waiting on parts");

        var edit = new UpdateJobRequest("Too late", null, JobPriority.Low, new GeoPoint(0, 0), null, null, null, null, job.Version);
        var response = await _jobs.Http.PutAsJsonAsync($"/api/jobs/{job.Id}", edit, SiteworkApiFactory.Json, Ct);
        response.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await JobsClient.ReadProblemAsync(response)).Code.ShouldBe("job_closed");
    }

    [Fact]
    public async Task Transitions_outside_the_lifecycle_are_conflicts()
    {
        var job = await _jobs.CreateAsync(JobsClient.NewJob());

        var response = await _jobs.TransitionAsync(job, JobStatus.Completed);

        response.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        var problem = await JobsClient.ReadProblemAsync(response);
        problem.Code.ShouldBe("transition_not_allowed");
        problem.Detail.ShouldBe($"{job.Reference} can't move from Draft to Completed.");
    }

    [Fact]
    public async Task Transitions_report_missing_schedule_and_notes_as_field_errors()
    {
        var job = await _jobs.CreateAsync(JobsClient.NewJob());

        var unscheduled = await _jobs.TransitionAsync(job, JobStatus.Scheduled);
        unscheduled.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await JobsClient.ReadProblemAsync(unscheduled)).Errors.Keys.ShouldBe(["scheduledFor"]);

        var silentCancel = await _jobs.TransitionAsync(job, JobStatus.Cancelled, note: "   ");
        silentCancel.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await JobsClient.ReadProblemAsync(silentCancel)).Errors.Keys.ShouldBe(["note"]);
    }

    [Fact]
    public async Task Only_draft_and_cancelled_jobs_can_be_deleted()
    {
        var draft = await _jobs.CreateAsync(JobsClient.NewJob());
        (await _jobs.Http.DeleteAsync($"/api/jobs/{draft.Id}", Ct)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await _jobs.Http.GetAsync($"/api/jobs/{draft.Id}", Ct)).StatusCode.ShouldBe(HttpStatusCode.NotFound);

        var active = await _jobs.CreateAsync(JobsClient.NewJob());
        active = await _jobs.MoveAsync(active, JobStatus.Scheduled, scheduledFor: Tomorrow);
        var refused = await _jobs.Http.DeleteAsync($"/api/jobs/{active.Id}", Ct);
        refused.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await JobsClient.ReadProblemAsync(refused)).Code.ShouldBe("delete_not_allowed");

        await _jobs.MoveAsync(active, JobStatus.Cancelled, note: "No longer needed");
        (await _jobs.Http.DeleteAsync($"/api/jobs/{active.Id}", Ct)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task List_filters_by_status_and_searches_text_and_references()
    {
        var token = Guid.NewGuid().ToString("N")[..10];
        var draft = await _jobs.CreateAsync(JobsClient.NewJob(title: $"Inspect roof {token}"));
        var scheduled = await _jobs.MoveAsync(
            await _jobs.CreateAsync(JobsClient.NewJob(title: $"Clear gutters {token}")), JobStatus.Scheduled, scheduledFor: Tomorrow);

        var all = await _jobs.ReadAsync<JobPage>($"/api/jobs?q={token}");
        all.Total.ShouldBe(2);

        var onlyScheduled = await _jobs.ReadAsync<JobPage>($"/api/jobs?q={token}&status=Scheduled");
        onlyScheduled.Items.ShouldHaveSingleItem().Id.ShouldBe(scheduled.Id);

        var byReference = await _jobs.ReadAsync<JobPage>($"/api/jobs?q={draft.Reference}");
        byReference.Items.ShouldContain(job => job.Id == draft.Id);

        var wildcardIsLiteral = await _jobs.ReadAsync<JobPage>($"/api/jobs?q={token}%25");
        wildcardIsLiteral.Total.ShouldBe(0);
    }

    [Fact]
    public async Task List_validates_paging()
    {
        var response = await _jobs.Http.GetAsync("/api/jobs?pageSize=500&page=0", Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await JobsClient.ReadProblemAsync(response)).Errors.Keys.ShouldBe(["page", "pageSize"], ignoreOrder: true);
    }

    [Fact]
    public async Task Radius_search_returns_nearby_jobs_nearest_first()
    {
        // A remote, test-only area keeps other tests' jobs out of the results.
        var (lat, lng) = RemoteArea();
        var near = await _jobs.CreateAsync(JobsClient.NewJob(title: "Near", latitude: lat + 0.001, longitude: lng));
        var nearer = await _jobs.CreateAsync(JobsClient.NewJob(title: "Nearer", latitude: lat, longitude: lng + 0.0005));
        await _jobs.CreateAsync(JobsClient.NewJob(title: "Too far", latitude: lat + 0.2, longitude: lng));

        var page = await _jobs.ReadAsync<JobPage>(FormattableString.Invariant($"/api/jobs?nearLat={lat}&nearLng={lng}&radiusKm=1"));

        page.Items.Select(job => job.Id).ShouldBe([nearer.Id, near.Id]);
    }

    [Fact]
    public async Task Map_points_are_limited_to_the_viewport()
    {
        var (lat, lng) = RemoteArea();
        var inside = await _jobs.CreateAsync(JobsClient.NewJob(latitude: lat, longitude: lng));
        await _jobs.CreateAsync(JobsClient.NewJob(latitude: lat + 1, longitude: lng));

        var bbox = FormattableString.Invariant($"{lng - 0.01},{lat - 0.01},{lng + 0.01},{lat + 0.01}");
        var map = await _jobs.ReadAsync<JobMapResponse>($"/api/jobs/map?bbox={bbox}");

        map.Truncated.ShouldBeFalse();
        var point = map.Items.ShouldHaveSingleItem();
        point.Id.ShouldBe(inside.Id);
        point.Reference.ShouldBe(inside.Reference);
        point.Latitude.ShouldBe(lat, tolerance: 1e-9);
        point.Longitude.ShouldBe(lng, tolerance: 1e-9);
    }

    [Theory]
    [InlineData("1,2,3")]
    [InlineData("a,b,c,d")]
    [InlineData("10,10,5,20")]
    [InlineData("-200,0,10,10")]
    public async Task Map_rejects_malformed_viewports(string bbox)
    {
        var response = await _jobs.Http.GetAsync($"/api/jobs/map?bbox={bbox}", Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await JobsClient.ReadProblemAsync(response)).Errors.Keys.ShouldBe(["bbox"]);
    }

    [Fact]
    public async Task Stats_count_jobs_by_status()
    {
        var before = await _jobs.ReadAsync<JobStatsResponse>("/api/jobs/stats");
        await _jobs.CreateAsync(JobsClient.NewJob());

        var after = await _jobs.ReadAsync<JobStatsResponse>("/api/jobs/stats");

        after.ByStatus.Select(count => count.Status).ShouldBe(Enum.GetValues<JobStatus>());
        after.Total.ShouldBeGreaterThanOrEqualTo(before.Total + 1);
        after.ByStatus.Sum(count => count.Count).ShouldBe(after.Total);
    }

    [Fact]
    public async Task Writes_are_rate_limited_per_client()
    {
        await using var strict = new SiteworkApiFactory(postgis.ConnectionString, writesPerMinute: 2);
        var jobs = new JobsClient(strict.CreateClient());
        await jobs.CreateAsync(JobsClient.NewJob());
        await jobs.CreateAsync(JobsClient.NewJob());

        var response = await jobs.Http.PostAsJsonAsync("/api/jobs", JobsClient.NewJob(), SiteworkApiFactory.Json, Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.TooManyRequests);
        response.Headers.RetryAfter.ShouldNotBeNull();
        (await JobsClient.ReadProblemAsync(response)).Code.ShouldBe("rate_limited");
    }

    /// <summary>A random spot in the Southern Ocean that no other test or seed data uses.</summary>
    private static (double Lat, double Lng) RemoteArea() =>
        (Math.Round(-55 - Random.Shared.NextDouble() * 5, 4), Math.Round(-150 + Random.Shared.NextDouble() * 100, 4));
}
