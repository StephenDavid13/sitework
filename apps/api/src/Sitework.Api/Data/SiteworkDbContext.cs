using Microsoft.EntityFrameworkCore;
using Sitework.Api.Domain;

namespace Sitework.Api.Data;

public sealed class SiteworkDbContext(DbContextOptions<SiteworkDbContext> options) : DbContext(options)
{
    public const string JobNumberSequence = "job_number_seq";

    public DbSet<Job> Jobs => Set<Job>();
    public DbSet<JobStatusChange> JobStatusChanges => Set<JobStatusChange>();

    /// <summary>Shared by the app and the test fixture so both talk to Postgres the same way.</summary>
    public static void Configure(DbContextOptionsBuilder options, DatabaseConnectionSettings settings) =>
        options
            .UseNpgsql(settings.ConnectionString, npgsql =>
            {
                npgsql.UseNetTopologySuite();
                // Ride out brief blips (failover, connection resets) without failing the request.
                npgsql.EnableRetryOnFailure(maxRetryCount: 3, maxRetryDelay: TimeSpan.FromSeconds(2), errorCodesToAdd: null);
                if (settings.PasswordFile is { } passwordFile)
                {
                    npgsql.ConfigureDataSource(dataSource => dataSource.UsePeriodicPasswordProvider(
                        async (_, cancellationToken) =>
                            (await File.ReadAllTextAsync(passwordFile, cancellationToken)).Trim(),
                        successRefreshInterval: TimeSpan.FromMinutes(5),
                        failureRefreshInterval: TimeSpan.FromSeconds(10)));
                }
            })
            .UseSnakeCaseNamingConvention();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasPostgresExtension("postgis");
        modelBuilder.HasSequence<long>(JobNumberSequence).StartsAt(1001);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(SiteworkDbContext).Assembly);
    }
}
