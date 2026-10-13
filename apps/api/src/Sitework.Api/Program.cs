using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Scalar.AspNetCore;
using Sitework.Api;
using Sitework.Api.Data;
using Sitework.Api.Features.Jobs;
using Sitework.Api.Features.Status;
using Sitework.Api.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

if (!builder.Environment.IsDevelopment())
{
    builder.Logging.ClearProviders().AddJsonConsole();
}

builder.WebHost.ConfigureKestrel(kestrel => kestrel.Limits.MaxRequestBodySize = 64 * 1024);

// Resolved lazily so build-time OpenAPI generation works without a database configured.
builder.Services.AddDbContext<SiteworkDbContext>((services, options) =>
    SiteworkDbContext.Configure(options, DatabaseConnection.Resolve(services.GetRequiredService<IConfiguration>())));

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

await app.RunAsync();
return 0;
