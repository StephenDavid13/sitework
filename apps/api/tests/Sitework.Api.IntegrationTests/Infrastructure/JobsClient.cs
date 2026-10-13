using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Sitework.Api.Domain;
using Sitework.Api.Features.Jobs;

namespace Sitework.Api.IntegrationTests.Infrastructure;

/// <summary>Thin typed wrapper so tests read as API usage, not HTTP plumbing.</summary>
public sealed class JobsClient(HttpClient http)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public HttpClient Http => http;

    public static CreateJobRequest NewJob(
        string title = "Fix leaking tap",
        double latitude = -36.8485,
        double longitude = 174.7633,
        DateTimeOffset? scheduledFor = null,
        JobPriority priority = JobPriority.Normal) =>
        new(title, "Kitchen mixer drips constantly.", priority, new GeoPoint(latitude, longitude),
            "Test site", "1 Queen Street, Auckland", "Sam Patel", scheduledFor);

    public async Task<JobResponse> CreateAsync(CreateJobRequest request)
    {
        var response = await http.PostAsJsonAsync("/api/jobs", request, SiteworkApiFactory.Json, Ct);
        response.StatusCode.ShouldBe(HttpStatusCode.Created, await response.Content.ReadAsStringAsync(Ct));
        return (await response.Content.ReadFromJsonAsync<JobResponse>(SiteworkApiFactory.Json, Ct))!;
    }

    public async Task<JobResponse> GetAsync(Guid id) =>
        (await http.GetFromJsonAsync<JobResponse>($"/api/jobs/{id}", SiteworkApiFactory.Json, Ct))!;

    public Task<HttpResponseMessage> TransitionAsync(JobResponse job, JobStatus to, string? note = null, DateTimeOffset? scheduledFor = null) =>
        http.PostAsJsonAsync($"/api/jobs/{job.Id}/transitions", new TransitionRequest(to, note, scheduledFor, job.Version), SiteworkApiFactory.Json, Ct);

    public async Task<JobResponse> MoveAsync(JobResponse job, JobStatus to, string? note = null, DateTimeOffset? scheduledFor = null)
    {
        var response = await TransitionAsync(job, to, note, scheduledFor);
        response.StatusCode.ShouldBe(HttpStatusCode.OK, await response.Content.ReadAsStringAsync(Ct));
        return (await response.Content.ReadFromJsonAsync<JobResponse>(SiteworkApiFactory.Json, Ct))!;
    }

    public async Task<T> ReadAsync<T>(string url) =>
        (await http.GetFromJsonAsync<T>(url, SiteworkApiFactory.Json, Ct))!;

    public static async Task<ProblemResponse> ReadProblemAsync(HttpResponseMessage response)
    {
        response.Content.Headers.ContentType?.MediaType.ShouldBe("application/problem+json");
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(Ct));
        var root = document.RootElement;
        string? Text(string name) => root.TryGetProperty(name, out var value) ? value.GetString() : null;

        return new ProblemResponse(
            root.GetProperty("status").GetInt32(),
            Text("title"),
            Text("detail"),
            Text("code"),
            root.TryGetProperty("errors", out var errors)
                ? errors.Deserialize<Dictionary<string, string[]>>(SiteworkApiFactory.Json)!
                : []);
    }
}

/// <summary>The parts of a ProblemDetails response tests assert on, including the <c>code</c> extension.</summary>
public sealed record ProblemResponse(
    int Status, string? Title, string? Detail, string? Code, Dictionary<string, string[]> Errors);
