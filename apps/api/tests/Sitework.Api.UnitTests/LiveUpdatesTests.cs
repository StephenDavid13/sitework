using Sitework.Api.Features.Live;

namespace Sitework.Api.UnitTests;

public sealed class LiveUpdatesTests
{
    private static readonly Guid Id = Guid.Parse("0199a000-0000-7000-8000-000000000001");

    [Theory]
    [InlineData("INSERT", "created")]
    [InlineData("UPDATE", "updated")]
    [InlineData("DELETE", "deleted")]
    public void Trigger_payloads_become_change_events(string operation, string kind)
    {
        var status = operation == "DELETE" ? "null" : "\"OnHold\"";
        var change = JobChangeListener.TryParse($$"""{"id":"{{Id}}","op":"{{operation}}","status":{{status}}}""");

        change.ShouldBe(new JobChangeEvent(kind, Id, operation == "DELETE" ? null : "OnHold"));
    }

    [Theory]
    [InlineData("not json")]
    [InlineData("""{"op":"INSERT"}""")]
    [InlineData("""{"id":"nope","op":"INSERT"}""")]
    public void Malformed_payloads_are_ignored(string payload)
    {
        JobChangeListener.TryParse(payload).ShouldBeNull();
    }

    [Fact]
    public void Changes_reach_every_subscriber_until_they_unsubscribe()
    {
        var broadcaster = new JobChangeBroadcaster();
        using var first = broadcaster.Subscribe();
        var second = broadcaster.Subscribe();

        broadcaster.Publish(new JobChangeEvent("created", Id));
        second.Dispose();
        broadcaster.Publish(new JobChangeEvent("deleted", Id));

        first.Reader.TryRead(out var a).ShouldBeTrue();
        a!.Kind.ShouldBe("created");
        first.Reader.TryRead(out var b).ShouldBeTrue();
        b!.Kind.ShouldBe("deleted");
        second.Reader.TryRead(out var c).ShouldBeTrue();
        c!.Kind.ShouldBe("created");
        second.Reader.TryRead(out _).ShouldBeFalse();
        broadcaster.SubscriberCount.ShouldBe(1);
    }

    [Fact]
    public void A_slow_subscriber_drops_its_oldest_events_instead_of_blocking()
    {
        var broadcaster = new JobChangeBroadcaster();
        using var slow = broadcaster.Subscribe();

        for (var i = 0; i < 300; i++)
        {
            broadcaster.Publish(new JobChangeEvent("updated", Id));
        }

        slow.Reader.Count.ShouldBe(256);
    }
}
