using Microsoft.Extensions.Configuration;
using Npgsql;
using Sitework.Api.Data;

namespace Sitework.Api.UnitTests;

public sealed class DatabaseConnectionTests
{
    private static IConfiguration Config(params (string Key, string Value)[] values) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(values.ToDictionary(v => v.Key, v => (string?)v.Value))
            .Build();

    [Fact]
    public void A_full_connection_string_wins()
    {
        var settings = DatabaseConnection.Resolve(Config(
            ("ConnectionStrings:Sitework", "Host=explicit;Database=x"),
            ("Database:Host", "ignored")));

        settings.ShouldBe(new DatabaseConnectionSettings("Host=explicit;Database=x"));
    }

    [Fact]
    public void Piecewise_settings_build_a_safe_connection_string()
    {
        var settings = DatabaseConnection.Resolve(Config(
            ("Database:Host", "db.internal"),
            ("Database:Username", "sitework"),
            ("Database:Password", "p;a'ss=word"),
            ("Database:SslMode", "Require")));

        var builder = new NpgsqlConnectionStringBuilder(settings.ConnectionString);
        builder.Host.ShouldBe("db.internal");
        builder.Port.ShouldBe(5432);
        builder.Database.ShouldBe("sitework");
        builder.Password.ShouldBe("p;a'ss=word");
        builder.SslMode.ShouldBe(SslMode.Require);
        builder.GssEncryptionMode.ShouldBe(GssEncryptionMode.Disable);
        settings.PasswordFile.ShouldBeNull();
    }

    [Fact]
    public void A_password_file_replaces_the_inline_password()
    {
        var settings = DatabaseConnection.Resolve(Config(
            ("Database:Host", "db.internal"),
            ("Database:Password", "stale"),
            ("Database:PasswordFile", "/var/run/secrets/db/password")));

        new NpgsqlConnectionStringBuilder(settings.ConnectionString).Password.ShouldBeNull();
        settings.PasswordFile.ShouldBe("/var/run/secrets/db/password");
    }

    [Fact]
    public void Without_any_settings_there_is_no_connection_string()
    {
        DatabaseConnection.Resolve(Config()).ConnectionString.ShouldBeNull();
    }
}
