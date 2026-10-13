using Npgsql;

namespace Sitework.Api.Data;

/// <summary>
/// Database settings supplied piecewise (e.g. Kubernetes env vars and a mounted secret), used when
/// no full <c>ConnectionStrings:Sitework</c> is configured. Building the string with
/// <see cref="NpgsqlConnectionStringBuilder"/> keeps generated passwords with special characters safe.
/// </summary>
public sealed class DatabaseOptions
{
    public string? Host { get; init; }
    public int Port { get; init; } = 5432;
    public string Name { get; init; } = "sitework";
    public string? Username { get; init; }
    public string? Password { get; init; }

    /// <summary>
    /// A file holding the password, re-read periodically. RDS rotates its managed password, and a
    /// mounted Kubernetes Secret updates in place, so new connections pick up the new password
    /// without restarting pods. Takes precedence over <see cref="Password"/>.
    /// </summary>
    public string? PasswordFile { get; init; }

    public SslMode SslMode { get; init; } = SslMode.Prefer;
}

public sealed record DatabaseConnectionSettings(string? ConnectionString, string? PasswordFile = null);

public static class DatabaseConnection
{
    public static DatabaseConnectionSettings Resolve(IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Sitework");
        if (!string.IsNullOrWhiteSpace(connectionString))
        {
            return new DatabaseConnectionSettings(connectionString);
        }

        var options = configuration.GetSection("Database").Get<DatabaseOptions>();
        if (string.IsNullOrWhiteSpace(options?.Host))
        {
            return new DatabaseConnectionSettings(null);
        }

        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = options.Host,
            Port = options.Port,
            Database = options.Name,
            Username = options.Username,
            SslMode = options.SslMode,
            // Skips probing for Kerberos libraries, which the chiseled image doesn't ship.
            GssEncryptionMode = GssEncryptionMode.Disable,
        };

        var passwordFile = string.IsNullOrWhiteSpace(options.PasswordFile) ? null : options.PasswordFile;
        if (passwordFile is null)
        {
            builder.Password = options.Password;
        }

        return new DatabaseConnectionSettings(builder.ConnectionString, passwordFile);
    }

    /// <summary>
    /// The one data source the app uses (EF Core and the job-change listener), so they share the
    /// connection pool, PostGIS type mapping and the rotating password.
    /// </summary>
    public static NpgsqlDataSource CreateDataSource(DatabaseConnectionSettings settings)
    {
        var builder = new NpgsqlDataSourceBuilder(settings.ConnectionString);
        builder.UseNetTopologySuite();
        if (settings.PasswordFile is { } passwordFile)
        {
            builder.UsePeriodicPasswordProvider(
                async (_, cancellationToken) => (await File.ReadAllTextAsync(passwordFile, cancellationToken)).Trim(),
                successRefreshInterval: TimeSpan.FromMinutes(5),
                failureRefreshInterval: TimeSpan.FromSeconds(10));
        }

        return builder.Build();
    }
}
