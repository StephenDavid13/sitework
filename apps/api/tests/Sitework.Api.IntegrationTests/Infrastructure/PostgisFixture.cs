using Testcontainers.PostgreSql;

[assembly: AssemblyFixture(typeof(Sitework.Api.IntegrationTests.Infrastructure.PostgisFixture))]

namespace Sitework.Api.IntegrationTests.Infrastructure;

/// <summary>One PostGIS container shared by every test in the assembly.</summary>
public sealed class PostgisFixture : IAsyncLifetime
{
    // Multi-arch build of the official PostGIS image (postgis/postgis is amd64-only).
    public const string Image = "imresamu/postgis:17-3.5";

    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder(Image).Build();

    public string ConnectionString => _container.GetConnectionString();

    public async ValueTask InitializeAsync() => await _container.StartAsync();

    public ValueTask DisposeAsync() => _container.DisposeAsync();
}
