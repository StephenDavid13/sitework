using Microsoft.EntityFrameworkCore;
using Sitework.Api.Domain;

namespace Sitework.Api.Data;

public sealed class SiteworkDbContext(DbContextOptions<SiteworkDbContext> options) : DbContext(options)
{
    public const string JobNumberSequence = "job_number_seq";

    public DbSet<Job> Jobs => Set<Job>();
    public DbSet<JobStatusChange> JobStatusChanges => Set<JobStatusChange>();

    /// <summary>Shared by the app and the test fixture so both talk to Postgres the same way.</summary>
    public static void Configure(DbContextOptionsBuilder options, string? connectionString) =>
        options
            .UseNpgsql(connectionString, npgsql => npgsql.UseNetTopologySuite())
            .UseSnakeCaseNamingConvention();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasPostgresExtension("postgis");
        modelBuilder.HasSequence<long>(JobNumberSequence).StartsAt(1001);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(SiteworkDbContext).Assembly);
    }
}
