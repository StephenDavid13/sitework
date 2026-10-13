using Microsoft.EntityFrameworkCore;
using Npgsql;
using Sitework.Api.Domain;

namespace Sitework.Api.Data;

public sealed class SiteworkDbContext(DbContextOptions<SiteworkDbContext> options) : DbContext(options)
{
    public const string JobNumberSequence = "job_number_seq";

    public DbSet<Job> Jobs => Set<Job>();
    public DbSet<JobStatusChange> JobStatusChanges => Set<JobStatusChange>();

    /// <summary>Shared by the app and the test fixture so both talk to Postgres the same way.</summary>
    public static void Configure(DbContextOptionsBuilder options, NpgsqlDataSource dataSource) =>
        options
            .UseNpgsql(dataSource, npgsql =>
            {
                npgsql.UseNetTopologySuite();
                // Ride out brief blips (failover, connection resets) without failing the request.
                npgsql.EnableRetryOnFailure(maxRetryCount: 3, maxRetryDelay: TimeSpan.FromSeconds(2), errorCodesToAdd: null);
            })
            .UseSnakeCaseNamingConvention();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasPostgresExtension("postgis");
        modelBuilder.HasSequence<long>(JobNumberSequence).StartsAt(1001);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(SiteworkDbContext).Assembly);
    }
}
