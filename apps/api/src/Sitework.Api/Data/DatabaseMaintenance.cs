using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Sitework.Api.Data;

public enum MaintenanceCommand
{
    Migrate,
    ResetDemoData,
}

/// <summary>
/// One-shot commands run instead of the web server (<c>--migrate</c>, <c>--reset-demo-data</c>).
/// In Kubernetes, <c>--migrate</c> runs as a Helm pre-upgrade hook Job, never at app startup.
/// </summary>
public static class DatabaseMaintenance
{
    public static MaintenanceCommand? ParseCommand(string[] args) =>
        args.Contains("--migrate") ? MaintenanceCommand.Migrate
        : args.Contains("--reset-demo-data") ? MaintenanceCommand.ResetDemoData
        : null;

    /// <summary>Runs the command and returns a process exit code, so a failed Job fails fast.</summary>
    public static async Task<int> RunAsync(WebApplication app, MaintenanceCommand command)
    {
        try
        {
            await using var scope = app.Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<SiteworkDbContext>();
            var clock = scope.ServiceProvider.GetRequiredService<TimeProvider>();

            var pending = (await db.Database.GetPendingMigrationsAsync()).ToList();
            app.Logger.LogInformation("Applying {Count} pending migration(s): {Migrations}", pending.Count, pending);
            await ApplyMigrationsAsync(db);

            if (command == MaintenanceCommand.ResetDemoData)
            {
                var deleted = await db.Jobs.ExecuteDeleteAsync();
                app.Logger.LogInformation("Deleted {Count} job(s)", deleted);
            }

            if (command == MaintenanceCommand.ResetDemoData || app.Configuration.GetValue<bool>("SeedDemoData"))
            {
                var added = await DemoDataSeeder.SeedIfEmptyAsync(db, clock);
                app.Logger.LogInformation("Seeded {Count} demo job(s)", added);
            }

            return 0;
        }
        catch (Exception exception)
        {
            app.Logger.LogCritical(exception, "Database command {Command} failed", command);
            return 1;
        }
    }

    /// <summary>Applies migrations, then refreshes Npgsql's type cache in case PostGIS was just installed.</summary>
    public static async Task ApplyMigrationsAsync(SiteworkDbContext db, CancellationToken cancellationToken = default)
    {
        await db.Database.MigrateAsync(cancellationToken);

        var connection = (NpgsqlConnection)db.Database.GetDbConnection();
        await connection.OpenAsync(cancellationToken);
        await connection.ReloadTypesAsync(cancellationToken);
        await connection.CloseAsync();
    }
}
