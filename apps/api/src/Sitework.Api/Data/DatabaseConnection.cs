using Npgsql;

namespace Sitework.Api.Data;

/// <summary>
/// Database settings supplied piecewise (e.g. Kubernetes env vars fed from a secret), used when no
/// full <c>ConnectionStrings:Sitework</c> is configured. Building the string with
/// <see cref="NpgsqlConnectionStringBuilder"/> keeps generated passwords with special characters safe.
/// </summary>
public sealed class DatabaseOptions
{
    public string? Host { get; init; }
    public int Port { get; init; } = 5432;
    public string Name { get; init; } = "sitework";
    public string? Username { get; init; }
    public string? Password { get; init; }
    public SslMode SslMode { get; init; } = SslMode.Prefer;
}

public static class DatabaseConnection
{
    public static string? Resolve(IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Sitework");
        if (!string.IsNullOrWhiteSpace(connectionString))
        {
            return connectionString;
        }

        var options = configuration.GetSection("Database").Get<DatabaseOptions>();
        if (string.IsNullOrWhiteSpace(options?.Host))
        {
            return null;
        }

        return new NpgsqlConnectionStringBuilder
        {
            Host = options.Host,
            Port = options.Port,
            Database = options.Name,
            Username = options.Username,
            Password = options.Password,
            SslMode = options.SslMode,
        }.ConnectionString;
    }
}
