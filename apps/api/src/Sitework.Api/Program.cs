using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.EntityFrameworkCore;
using Scalar.AspNetCore;
using Sitework.Api;
using Sitework.Api.Data;
using Sitework.Api.Features.Status;

var builder = WebApplication.CreateBuilder(args);

if (!builder.Environment.IsDevelopment())
{
    builder.Logging.ClearProviders().AddJsonConsole();
}

// Connection string is resolved lazily so build-time OpenAPI generation works without one.
builder.Services.AddDbContext<SiteworkDbContext>((services, options) =>
    options.UseNpgsql(
        services.GetRequiredService<IConfiguration>().GetConnectionString("Sitework"),
        npgsql => npgsql.UseNetTopologySuite()));

builder.Services.AddHealthChecks()
    .AddDbContextCheck<SiteworkDbContext>("database", tags: [HealthTags.Ready]);

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddProblemDetails();
builder.Services.AddOpenApi();
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();

app.MapOpenApi();
app.MapScalarApiReference();

app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false });
app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains(HealthTags.Ready),
});

var api = app.MapGroup("/api");
api.MapStatusEndpoints();

app.Run();
