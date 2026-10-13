using Microsoft.EntityFrameworkCore;

namespace Sitework.Api.Data;

public sealed class SiteworkDbContext(DbContextOptions<SiteworkDbContext> options) : DbContext(options)
{
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasPostgresExtension("postgis");
    }
}
