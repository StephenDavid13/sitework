using Microsoft.EntityFrameworkCore;
using Sitework.Api.Domain;

namespace Sitework.Api.Data;

/// <summary>
/// Deterministic demo data: jobs spread across Auckland suburbs in every status. Each job walks the
/// real lifecycle, so its history is as consistent as data created through the API.
/// </summary>
public static class DemoDataSeeder
{
    private const int JobCount = 60;

    private static readonly (string Suburb, double Latitude, double Longitude)[] Suburbs =
    [
        ("Ponsonby", -36.8530, 174.7440), ("Grey Lynn", -36.8600, 174.7360), ("Parnell", -36.8550, 174.7790),
        ("Newmarket", -36.8700, 174.7770), ("Remuera", -36.8790, 174.7990), ("Mount Eden", -36.8780, 174.7600),
        ("Kingsland", -36.8720, 174.7440), ("Mount Albert", -36.8840, 174.7190), ("Onehunga", -36.9230, 174.7840),
        ("Ellerslie", -36.8990, 174.8080), ("Mission Bay", -36.8480, 174.8310), ("Glen Innes", -36.8770, 174.8560),
        ("Devonport", -36.8290, 174.7960), ("Takapuna", -36.7880, 174.7720), ("Henderson", -36.8790, 174.6310),
        ("Avondale", -36.8960, 174.6950), ("Epsom", -36.8900, 174.7720), ("Point Chevalier", -36.8650, 174.7100),
    ];

    private static readonly string[] Streets =
    [
        "Kauri Street", "Rimu Road", "Totara Avenue", "Pohutukawa Drive", "Harbour View Road", "Victoria Street",
        "Albert Road", "Church Street", "Beach Road", "Hillside Crescent", "Valley Road", "Station Road",
    ];

    private static readonly (string Title, string Description)[] Work =
    [
        ("Replace hot water cylinder", "180L electric cylinder leaking from the base. Isolate, drain and replace like-for-like."),
        ("Roof leak inspection", "Water staining on the lounge ceiling after heavy rain. Inspect flashings and penetrations."),
        ("Heat pump service", "Annual service for two wall units: clean filters and coils, check refrigerant."),
        ("Fence repair", "Storm damage: two panels down along the eastern boundary."),
        ("Switchboard upgrade", "Replace ceramic fuses with RCD-protected circuit breakers."),
        ("Gutter clean and repair", "Clear gutters and downpipes; re-seal a joint over the back door."),
        ("Smoke alarm compliance check", "Healthy Homes check before the new tenancy starts."),
        ("Window reglaze", "Cracked pane in the bedroom sash window."),
        ("Drain blockage", "Kitchen sink draining slowly; gully trap overflowing."),
        ("Exterior repaint quote", "Measure up and quote for weatherboards and trim."),
        ("Garage door motor replacement", "Motor hums but the door won't lift. Replace the opener and test the safety beams."),
        ("Insulation top-up", "Ceiling insulation is patchy. Top up to the current standard."),
        ("Retaining wall inspection", "Timber wall leaning after the slip; assess and recommend remedial work."),
        ("Install EV charger", "7 kW wall charger in the garage, with a new dedicated circuit."),
        ("Water damage assessment", "Burst pipe under the bathroom vanity; check subfloor and flooring."),
        ("Deck re-stain", "Sand back and re-stain the 30 m² pine deck."),
    ];

    private static readonly string[] Assignees =
        ["Aroha Ngata", "Ben Carter", "Mei Lin", "Sam Patel", "Tama Wiremu", "Olivia Brown", "Jack Thompson", "Priya Singh"];

    private static readonly string[] HoldNotes =
        ["Waiting on parts from supplier", "Client asked for a later date", "No access: gate locked", "Rain forecast all week"];

    private static readonly string[] CancelNotes =
        ["Client cancelled", "Duplicate of another job", "Work no longer required"];

    // Weighted towards active work so the map has something to coordinate.
    private static readonly JobStatus[] StatusMix =
    [
        JobStatus.Draft, JobStatus.Draft,
        JobStatus.Scheduled, JobStatus.Scheduled, JobStatus.Scheduled, JobStatus.Scheduled,
        JobStatus.InProgress, JobStatus.InProgress, JobStatus.InProgress,
        JobStatus.OnHold,
        JobStatus.Completed, JobStatus.Completed, JobStatus.Completed,
        JobStatus.Cancelled,
    ];

    public static async Task<int> SeedIfEmptyAsync(
        SiteworkDbContext db, TimeProvider clock, CancellationToken cancellationToken = default)
    {
        if (await db.Jobs.AnyAsync(cancellationToken))
        {
            return 0;
        }

        var jobs = Generate(clock.GetUtcNow());
        db.Jobs.AddRange(jobs);
        await db.SaveChangesAsync(cancellationToken);
        return jobs.Count;
    }

    public static List<Job> Generate(DateTimeOffset now)
    {
        var random = new Random(20261013);
        var jobs = new List<Job>(JobCount);

        for (var i = 0; i < JobCount; i++)
        {
            var (suburb, latitude, longitude) = Pick(random, Suburbs);
            var (title, description) = Pick(random, Work);
            var target = Pick(random, StatusMix);

            // Created 1-30 days ago; each lifecycle step happens a few hours after the last.
            var at = now.AddDays(-random.Next(1, 31)).AddMinutes(-random.Next(0, 600));
            var details = new JobDetails(
                Title: title,
                Description: random.Next(4) == 0 ? null : description,
                Priority: (JobPriority)Math.Min(random.Next(0, 5), 3),
                Latitude: Math.Round(latitude + Jitter(random), 6),
                Longitude: Math.Round(longitude + Jitter(random), 6),
                SiteName: $"{suburb} site",
                Address: $"{random.Next(1, 240)} {Pick(random, Streets)}, {suburb}, Auckland",
                Assignee: target == JobStatus.Draft && random.Next(2) == 0 ? null : Pick(random, Assignees),
                ScheduledFor: null);

            var job = Job.Create(details, at);
            Walk(job, target, random, now, ref at);
            jobs.Add(job);
        }

        return jobs;
    }

    private static void Walk(Job job, JobStatus target, Random random, DateTimeOffset now, ref DateTimeOffset at)
    {
        if (target == JobStatus.Draft)
        {
            return;
        }

        if (target == JobStatus.Cancelled && random.Next(2) == 0)
        {
            Step(job, JobStatus.Cancelled, Pick(random, CancelNotes), null, ref at);
            return;
        }

        // Upcoming work is scheduled in the future; work that has started was due just before it started.
        var scheduledFor = target == JobStatus.Scheduled
            ? new DateTimeOffset(now.AddDays(random.Next(1, 15)).Date.AddHours(random.Next(19, 28)), TimeSpan.Zero)
            : at.AddHours(5);
        Step(job, JobStatus.Scheduled, null, scheduledFor, ref at);

        switch (target)
        {
            case JobStatus.Cancelled:
                Step(job, JobStatus.Cancelled, Pick(random, CancelNotes), null, ref at);
                return;
            case JobStatus.Scheduled:
                return;
        }

        Step(job, JobStatus.InProgress, null, null, ref at);
        if (target == JobStatus.OnHold)
        {
            Step(job, JobStatus.OnHold, Pick(random, HoldNotes), null, ref at);
        }
        else if (target == JobStatus.Completed)
        {
            Step(job, JobStatus.Completed, null, null, ref at);
        }
    }

    private static void Step(Job job, JobStatus to, string? note, DateTimeOffset? scheduledFor, ref DateTimeOffset at)
    {
        at = at.AddHours(3);
        if (job.TransitionTo(to, note, scheduledFor, at) is { } error)
        {
            throw new InvalidOperationException($"Demo data broke the lifecycle: {error.Detail}");
        }
    }

    private static double Jitter(Random random) => (random.NextDouble() - 0.5) * 0.016;

    private static T Pick<T>(Random random, T[] items) => items[random.Next(items.Length)];
}
