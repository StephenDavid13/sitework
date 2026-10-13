using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Sitework.Api.Features.Status;
using Sitework.Api.IntegrationTests.Infrastructure;

namespace Sitework.Api.IntegrationTests;

public sealed class HealthAndStatusTests(PostgisFixture postgis)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
    };

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Liveness_probe_does_not_depend_on_the_database()
    {
        await using var factory = new SiteworkApiFactory("Host=127.0.0.1;Port=1;Database=none;Username=x;Password=x");
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/health/live", Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Readiness_probe_passes_when_the_database_is_reachable()
    {
        await using var factory = new SiteworkApiFactory(postgis.ConnectionString);
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/health/ready", Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Readiness_probe_fails_when_the_database_is_unreachable()
    {
        await using var factory = new SiteworkApiFactory("Host=127.0.0.1;Port=1;Database=none;Username=x;Password=x");
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/health/ready", Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.ServiceUnavailable);
    }

    [Fact]
    public async Task Status_reports_service_details_and_database_health()
    {
        await using var factory = new SiteworkApiFactory(postgis.ConnectionString);
        using var client = factory.CreateClient();

        var status = await client.GetFromJsonAsync<StatusResponse>("/api/status", Json, Ct);

        status.ShouldNotBeNull();
        status.Service.ShouldBe("sitework-api");
        status.Environment.ShouldBe("Testing");
        status.Database.ShouldBe(HealthStatus.Healthy);
    }

    [Fact]
    public async Task Connects_with_a_password_read_from_a_file()
    {
        // How pods connect in Kubernetes: piecewise settings plus the password from a mounted secret,
        // so a rotated password is picked up without a restart.
        var connection = new Npgsql.NpgsqlConnectionStringBuilder(postgis.ConnectionString);
        var passwordFile = Path.GetTempFileName();
        await File.WriteAllTextAsync(passwordFile, connection.Password + "\n", Ct);
        try
        {
            await using var factory = new PasswordFileApiFactory(connection, passwordFile);
            using var client = factory.CreateClient();

            var status = await client.GetFromJsonAsync<StatusResponse>("/api/status", Json, Ct);

            status!.Database.ShouldBe(HealthStatus.Healthy);
        }
        finally
        {
            File.Delete(passwordFile);
        }
    }

    [Fact]
    public async Task Responses_carry_security_headers()
    {
        await using var factory = new SiteworkApiFactory(postgis.ConnectionString);
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/status", Ct);

        response.Headers.GetValues("X-Content-Type-Options").ShouldBe(["nosniff"]);
        response.Headers.GetValues("X-Frame-Options").ShouldBe(["DENY"]);
        response.Headers.GetValues("Referrer-Policy").ShouldBe(["no-referrer"]);
    }

    [Fact]
    public async Task Unknown_api_routes_return_problem_details()
    {
        await using var factory = new SiteworkApiFactory(postgis.ConnectionString);
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/does-not-exist", Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.NotFound);
        response.Content.Headers.ContentType?.MediaType.ShouldBe("application/problem+json");
    }
}

internal sealed class PasswordFileApiFactory(Npgsql.NpgsqlConnectionStringBuilder connection, string passwordFile)
    : Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("Logging:LogLevel:Default", "Warning");
        builder.UseSetting("Database:Host", connection.Host);
        builder.UseSetting("Database:Port", connection.Port.ToString(System.Globalization.CultureInfo.InvariantCulture));
        builder.UseSetting("Database:Name", connection.Database);
        builder.UseSetting("Database:Username", connection.Username);
        builder.UseSetting("Database:PasswordFile", passwordFile);
        builder.UseSetting("Database:SslMode", "Disable");
    }
}
