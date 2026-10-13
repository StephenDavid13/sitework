using System.Collections.Concurrent;
using System.Threading.Channels;

namespace Sitework.Api.Features.Live;

/// <param name="Kind"><c>created</c>, <c>updated</c>, <c>deleted</c>, or <c>resync</c> (refetch everything).</param>
/// <param name="Status">The job's new status name. A plain string: a nullable enum here would mark the
/// shared <c>JobStatus</c> schema itself as nullable in the OpenAPI contract.</param>
public sealed record JobChangeEvent(string Kind, Guid? Id = null, string? Status = null)
{
    public static readonly JobChangeEvent Resync = new("resync");
}

/// <summary>
/// Fans job changes out to every server-sent-events subscriber on this pod. Each subscriber gets
/// its own bounded queue, so one slow client can't hold up the others.
/// </summary>
public sealed class JobChangeBroadcaster
{
    private const int QueueCapacity = 256;

    private readonly ConcurrentDictionary<Guid, Channel<JobChangeEvent>> _subscribers = new();

    public int SubscriberCount => _subscribers.Count;

    public Subscription Subscribe()
    {
        var channel = Channel.CreateBounded<JobChangeEvent>(new BoundedChannelOptions(QueueCapacity)
        {
            // Events are "something changed, refetch" hints, so dropping the oldest is harmless.
            FullMode = BoundedChannelFullMode.DropOldest,
            SingleReader = true,
        });
        var id = Guid.NewGuid();
        _subscribers[id] = channel;
        return new Subscription(channel.Reader, () =>
        {
            if (_subscribers.TryRemove(id, out var removed))
            {
                removed.Writer.TryComplete();
            }
        });
    }

    public void Publish(JobChangeEvent change)
    {
        foreach (var channel in _subscribers.Values)
        {
            channel.Writer.TryWrite(change);
        }
    }

    public sealed class Subscription(ChannelReader<JobChangeEvent> reader, Action unsubscribe) : IDisposable
    {
        public ChannelReader<JobChangeEvent> Reader { get; } = reader;

        public void Dispose() => unsubscribe();
    }
}
