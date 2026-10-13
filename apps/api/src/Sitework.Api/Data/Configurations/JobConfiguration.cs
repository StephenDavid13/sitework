using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Sitework.Api.Domain;

namespace Sitework.Api.Data.Configurations;

internal sealed class JobConfiguration : IEntityTypeConfiguration<Job>
{
    public void Configure(EntityTypeBuilder<Job> builder)
    {
        builder.HasKey(job => job.Id);
        builder.Property(job => job.Id).ValueGeneratedNever();

        builder.Property(job => job.Number)
            .HasDefaultValueSql($"nextval('{SiteworkDbContext.JobNumberSequence}')")
            .ValueGeneratedOnAdd();
        builder.HasIndex(job => job.Number).IsUnique();
        builder.Ignore(job => job.Reference);

        builder.Property(job => job.Title).HasMaxLength(200);
        builder.Property(job => job.Description).HasMaxLength(4000);
        builder.Property(job => job.SiteName).HasMaxLength(200);
        builder.Property(job => job.Address).HasMaxLength(300);
        builder.Property(job => job.Assignee).HasMaxLength(100);

        // Status is stored as text for readable data; priority stays numeric so it sorts by severity.
        builder.Property(job => job.Status).HasConversion<string>().HasMaxLength(20);
        builder.HasIndex(job => job.Status);
        builder.HasIndex(job => job.UpdatedAt);

        builder.Property(job => job.Location).HasColumnType($"geometry(Point,{Geo.Wgs84})");
        builder.HasIndex(job => job.Location).HasMethod("gist");

        builder.Property(job => job.Version).IsRowVersion();

        builder.HasMany(job => job.History)
            .WithOne()
            .HasForeignKey(change => change.JobId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(job => job.History)
            .HasField("_history")
            .UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}

internal sealed class JobStatusChangeConfiguration : IEntityTypeConfiguration<JobStatusChange>
{
    public void Configure(EntityTypeBuilder<JobStatusChange> builder)
    {
        builder.HasKey(change => change.Id);
        builder.Property(change => change.Id).ValueGeneratedNever();
        builder.Property(change => change.From).HasConversion<string>().HasMaxLength(20);
        builder.Property(change => change.To).HasConversion<string>().HasMaxLength(20);
        builder.Property(change => change.Note).HasMaxLength(1000);
        builder.HasIndex(change => new { change.JobId, change.ChangedAt });
    }
}
