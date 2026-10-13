using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Sitework.Api.IntegrationTests.Infrastructure;

public sealed class SiteworkApiFactory(string connectionString, int writesPerMinute = 100_000)
    : WebApplicationFactory<Program>
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
    };

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:Sitework", connectionString);
        builder.UseSetting("Logging:LogLevel:Default", "Warning");
        builder.UseSetting("RateLimiting:RequestsPerMinute", "100000");
        builder.UseSetting("RateLimiting:WritesPerMinute", writesPerMinute.ToString(System.Globalization.CultureInfo.InvariantCulture));
    }
}
