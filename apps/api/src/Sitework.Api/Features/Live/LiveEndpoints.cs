using System.Net.ServerSentEvents;
using System.Runtime.CompilerServices;
using System.Threading.Channels;
using Microsoft.AspNetCore.Http.HttpResults;

namespace Sitework.Api.Features.Live;

public static class LiveEndpoints
{
    /// <summary>Keeps idle connections open through load balancers (the ALB idle timeout is 60 s).</summary>
    public static readonly TimeSpan HeartbeatInterval = TimeSpan.FromSeconds(20);

    public static IEndpointRouteBuilder MapLiveEndpoints(this IEndpointRouteBuilder routes)
    {
        routes.MapGet("/events", StreamEvents)
            .WithName("StreamJobEvents")
            .WithTags("Live")
            .WithSummary("Server-sent events announcing job changes, for live updates across users.")
            .WithDescription(
                "`job` events carry `{ kind, id, status }` (kind: created, updated, deleted, resync). "
                + "A `ping` event is sent every 20 s to keep the connection open.");

        return routes;
    }

    private static ServerSentEventsResult<JobChangeEvent> StreamEvents(
        JobChangeBroadcaster broadcaster, IHostApplicationLifetime lifetime, HttpContext context)
    {
        // Proxies (nginx-style) must not buffer the stream.
        context.Response.Headers["X-Accel-Buffering"] = "no";
        return TypedResults.ServerSentEvents(Stream(broadcaster, context.RequestAborted, lifetime.ApplicationStopping));
    }

    private static async IAsyncEnumerable<SseItem<JobChangeEvent>> Stream(
        JobChangeBroadcaster broadcaster,
        CancellationToken requestAborted,
        CancellationToken stopping,
        [EnumeratorCancellation] CancellationToken enumeratorCancelled = default)
    {
        // Ends promptly on client disconnect or pod shutdown, so rollouts aren't held up.
        using var cancellation = CancellationTokenSource.CreateLinkedTokenSource(requestAborted, stopping, enumeratorCancelled);
        var cancellationToken = cancellation.Token;
        using var subscription = broadcaster.Subscribe();

        yield return new SseItem<JobChangeEvent>(new JobChangeEvent("connected"), "ping")
        {
            ReconnectionInterval = TimeSpan.FromSeconds(3),
        };

        while (!cancellationToken.IsCancellationRequested)
        {
            var next = await WaitAsync(subscription.Reader, HeartbeatInterval, cancellationToken);
            if (next == Wait.Ended)
            {
                yield break;
            }

            if (next == Wait.TimedOut)
            {
                yield return new SseItem<JobChangeEvent>(new JobChangeEvent("ping"), "ping");
                continue;
            }

            while (subscription.Reader.TryRead(out var change))
            {
                yield return new SseItem<JobChangeEvent>(change, "job");
            }
        }
    }

    private enum Wait
    {
        DataAvailable,
        TimedOut,
        Ended,
    }

    private static async Task<Wait> WaitAsync(
        ChannelReader<JobChangeEvent> reader, TimeSpan timeout, CancellationToken cancellationToken)
    {
        using var timeoutCancellation = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutCancellation.CancelAfter(timeout);
        try
        {
            return await reader.WaitToReadAsync(timeoutCancellation.Token) ? Wait.DataAvailable : Wait.Ended;
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return Wait.TimedOut;
        }
        catch (OperationCanceledException)
        {
            return Wait.Ended;
        }
    }
}
