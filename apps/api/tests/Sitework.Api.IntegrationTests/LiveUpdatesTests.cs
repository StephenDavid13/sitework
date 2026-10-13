using System.Net;
using System.Text.Json;
using Sitework.Api.IntegrationTests.Infrastructure;

namespace Sitework.Api.IntegrationTests;

public sealed class LiveUpdatesTests(PostgisFixture postgis)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Job_changes_stream_to_subscribers_as_server_sent_events()
    {
        using var client = postgis.Api.CreateClient();
        var jobs = new JobsClient(postgis.Api.CreateClient());

        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/events");
        using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, Ct);
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        response.Content.Headers.ContentType?.MediaType.ShouldBe("text/event-stream");

        await using var body = await response.Content.ReadAsStreamAsync(Ct);
        using var reader = new StreamReader(body);

        // The listener connects in the background when the host starts, so retry until it's LISTENing.
        for (var attempt = 1; attempt <= 10; attempt++)
        {
            var job = await jobs.CreateAsync(JobsClient.NewJob(title: $"Live {attempt}"));
            var received = await ReadUntilAsync(reader, job.Id, TimeSpan.FromSeconds(2));
            if (received is not null)
            {
                received.Value.GetProperty("kind").GetString().ShouldBe("created");
                received.Value.GetProperty("status").GetString().ShouldBe("Draft");
                return;
            }
        }

        Assert.Fail("No job event arrived on /api/events.");
    }

    /// <summary>Reads SSE frames until a <c>job</c> event for <paramref name="id"/> arrives, or times out.</summary>
    private static async Task<JsonElement?> ReadUntilAsync(StreamReader reader, Guid id, TimeSpan timeout)
    {
        using var timeoutSource = CancellationTokenSource.CreateLinkedTokenSource(Ct);
        timeoutSource.CancelAfter(timeout);
        var eventType = "message";
        try
        {
            while (await reader.ReadLineAsync(timeoutSource.Token) is { } line)
            {
                if (line.StartsWith("event:", StringComparison.Ordinal))
                {
                    eventType = line["event:".Length..].Trim();
                }
                else if (line.StartsWith("data:", StringComparison.Ordinal) && eventType == "job")
                {
                    var data = JsonDocument.Parse(line["data:".Length..]).RootElement;
                    if (data.GetProperty("id").GetGuid() == id)
                    {
                        return data;
                    }
                }
                else if (line.Length == 0)
                {
                    eventType = "message";
                }
            }
        }
        catch (OperationCanceledException) when (!Ct.IsCancellationRequested)
        {
        }

        return null;
    }
}
