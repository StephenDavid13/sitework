using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Scalar.AspNetCore;
using Sitework.Api;
using Sitework.Api.Data;
using Npgsql;
using Microsoft.Extensions.Options;
using Sitework.Api.Features.Geocoding;
using Sitework.Api.Features.Jobs;
using Sitework.Api.Features.Live;
using Sitework.Api.Features.Status;
using Sitework.Api.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

if (!builder.Environment.IsDevelopment())
{
    builder.Logging.ClearProviders().AddJsonConsole();
}

builder.WebHost.ConfigureKestrel(kestrel => kestrel.Limits.MaxRequestBodySize = 64 * 1024);

// Resolved lazily so build-time OpenAPI generation works without a database configured.
builder.Services.AddSingleton(services =>
    DatabaseConnection.CreateDataSource(DatabaseConnection.Resolve(services.GetRequiredService<IConfiguration>())));
builder.Services.AddDbContext<SiteworkDbContext>((services, options) =>
    SiteworkDbContext.Configure(options, services.GetRequiredService<NpgsqlDataSource>()));

// Address search: Photon (OpenStreetMap) behind a cached, rate-limited, resilient client.
builder.Services.Configure<GeocodingOptions>(builder.Configuration.GetSection("Geocoding"));
builder.Services.AddMemoryCache(cache => cache.SizeLimit = 10_000);
builder.Services.AddHttpClient<PhotonGeocoder>((services, http) =>
    {
        http.BaseAddress = new Uri(services.GetRequiredService<IOptions<GeocodingOptions>>().Value.BaseUrl.TrimEnd('/') + "/");
        http.DefaultRequestHeaders.UserAgent.ParseAdd($"Sitework/{Observability.Version.Split('+')[0]} (+https://github.com/StephenDavid13/sitework)");
    })
    .AddStandardResilienceHandler(resilience =>
    {
        // The public Photon instance can take ~5 s under load; give it room, retry once, then give up.
        resilience.AttemptTimeout.Timeout = TimeSpan.FromSeconds(6);
        resilience.TotalRequestTimeout.Timeout = TimeSpan.FromSeconds(13);
        resilience.CircuitBreaker.SamplingDuration = TimeSpan.FromSeconds(30);
        resilience.Retry.MaxRetryAttempts = 1;
        resilience.Retry.Delay = TimeSpan.FromMilliseconds(200);
    });

// Live updates: Postgres NOTIFY → every API pod → connected browsers (server-sent events).
builder.Services.AddSingleton<JobChangeBroadcaster>();
builder.Services.AddHostedService<JobChangeListener>();

builder.Services.AddHealthChecks()
    .AddDbContextCheck<SiteworkDbContext>("database", tags: [HealthTags.Ready]);

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddProblemDetails();
builder.Services.AddValidation();
builder.Services.AddOpenApi();
builder.Services.AddClientProtection(builder.Configuration);
builder.Services.AddObservability(builder.Configuration);
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
    // Numbers are numbers: keeps the OpenAPI contract (and generated TS types) from allowing strings.
    options.SerializerOptions.NumberHandling = JsonNumberHandling.Strict;
});

await using var app = builder.Build();

if (DatabaseMaintenance.ParseCommand(args) is { } command)
{
    return await DatabaseMaintenance.RunAsync(app, command);
}

app.UseForwardedHeaders();
app.UseSecurityHeaders();
app.UseExceptionHandler(new ExceptionHandlerOptions
{
    // Malformed JSON or an unknown enum value is the client's fault: 400, not 500.
    StatusCodeSelector = exception => exception is BadHttpRequestException badRequest
        ? badRequest.StatusCode
        : StatusCodes.Status500InternalServerError,
});
app.UseStatusCodePages();
app.UseRateLimiter();

app.MapOpenApi();
app.MapScalarApiReference();

app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false })
    .DisableRateLimiting();
app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains(HealthTags.Ready),
}).DisableRateLimiting();

var api = app.MapGroup("/api");
api.MapStatusEndpoints();
api.MapJobEndpoints();
api.MapLiveEndpoints();
api.MapGeocodingEndpoints();

await app.RunAsync();
return 0;
