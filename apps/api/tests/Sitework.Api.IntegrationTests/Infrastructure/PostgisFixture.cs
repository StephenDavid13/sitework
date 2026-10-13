using Microsoft.EntityFrameworkCore;
using Sitework.Api.Data;
using Testcontainers.PostgreSql;

[assembly: AssemblyFixture(typeof(Sitework.Api.IntegrationTests.Infrastructure.PostgisFixture))]

namespace Sitework.Api.IntegrationTests.Infrastructure;

/// <summary>
/// One migrated PostGIS container and one API host shared by every test in the assembly.
/// Tests isolate themselves with unique data (search tokens, remote coordinates) rather than resets.
/// </summary>
public sealed class PostgisFixture : IAsyncLifetime
{
    // Multi-arch build of the official PostGIS image (postgis/postgis is amd64-only).
    public const string Image = "imresamu/postgis:17-3.5";

    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder(Image).Build();
    private SiteworkApiFactory? _api;

    public string ConnectionString => _container.GetConnectionString();

    public SiteworkApiFactory Api => _api ?? throw new InvalidOperationException("Fixture not initialised.");

    public async ValueTask InitializeAsync()
    {
        await _container.StartAsync();

        var options = new DbContextOptionsBuilder<SiteworkDbContext>();
        SiteworkDbContext.Configure(options, ConnectionString);
        await using var db = new SiteworkDbContext(options.Options);
        await DatabaseMaintenance.ApplyMigrationsAsync(db);

        _api = new SiteworkApiFactory(ConnectionString);
    }

    public async ValueTask DisposeAsync()
    {
        if (_api is not null)
        {
            await _api.DisposeAsync();
        }

        await _container.DisposeAsync();
    }
}
