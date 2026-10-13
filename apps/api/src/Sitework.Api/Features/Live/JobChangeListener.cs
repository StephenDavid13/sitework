using System.Text.Json;
using Npgsql;
using Sitework.Api.Data;
using Sitework.Api.Domain;

namespace Sitework.Api.Features.Live;

/// <summary>
/// Listens on the Postgres <c>job_changes</c> channel (fed by a trigger on <c>jobs</c>) and hands
/// each change to the <see cref="JobChangeBroadcaster"/>. Because every API replica listens to the
/// same database, a change made through any pod reaches browsers connected to all of them.
/// </summary>
public sealed partial class JobChangeListener(
    IServiceProvider services,
    IConfiguration configuration,
    JobChangeBroadcaster broadcaster,
    ILogger<JobChangeListener> logger) : BackgroundService
{
    public const string Channel = "job_changes";

    private static readonly TimeSpan MaxBackoff = TimeSpan.FromSeconds(30);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // No database configured (e.g. build-time OpenAPI generation): nothing to listen to.
        if (DatabaseConnection.Resolve(configuration).ConnectionString is null)
        {
            return;
        }

        var dataSource = services.GetRequiredService<NpgsqlDataSource>();
        var backoff = TimeSpan.FromSeconds(1);
        var connectedBefore = false;

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var connection = await dataSource.OpenConnectionAsync(stoppingToken);
                connection.Notification += OnNotification;
                await using (var listen = new NpgsqlCommand($"LISTEN {Channel}", connection))
                {
                    await listen.ExecuteNonQueryAsync(stoppingToken);
                }

                LogListening(logger, Channel);
                backoff = TimeSpan.FromSeconds(1);
                if (connectedBefore)
                {
                    // Changes made while we were disconnected were never delivered.
                    broadcaster.Publish(JobChangeEvent.Resync);
                }

                connectedBefore = true;
                while (!stoppingToken.IsCancellationRequested)
                {
                    await connection.WaitAsync(stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception exception)
            {
                LogConnectionLost(logger, exception, backoff.TotalSeconds);
                await Task.Delay(backoff, stoppingToken).ConfigureAwait(ConfigureAwaitOptions.SuppressThrowing);
                backoff = TimeSpan.FromTicks(Math.Min(backoff.Ticks * 2, MaxBackoff.Ticks));
            }
        }
    }

    private void OnNotification(object sender, NpgsqlNotificationEventArgs args)
    {
        if (TryParse(args.Payload) is { } change)
        {
            broadcaster.Publish(change);
        }
    }

    /// <summary>Payload written by the <c>notify_job_change</c> trigger: <c>{"id","op","status"}</c>.</summary>
    internal static JobChangeEvent? TryParse(string payload)
    {
        try
        {
            using var document = JsonDocument.Parse(payload);
            var root = document.RootElement;
            var id = root.GetProperty("id").GetGuid();
            var kind = root.GetProperty("op").GetString() switch
            {
                "INSERT" => "created",
                "DELETE" => "deleted",
                _ => "updated",
            };
            string? status = root.TryGetProperty("status", out var value)
                && value.ValueKind == JsonValueKind.String
                && Enum.TryParse<JobStatus>(value.GetString(), out var parsed)
                    ? parsed.ToString()
                    : null;
            return new JobChangeEvent(kind, id, status);
        }
        catch (Exception exception) when (exception is JsonException or KeyNotFoundException or FormatException or InvalidOperationException)
        {
            return null;
        }
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Listening for job changes on '{Channel}'")]
    private static partial void LogListening(ILogger logger, string channel);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Lost the job-change listener connection; retrying in {Seconds}s")]
    private static partial void LogConnectionLost(ILogger logger, Exception exception, double seconds);
}
