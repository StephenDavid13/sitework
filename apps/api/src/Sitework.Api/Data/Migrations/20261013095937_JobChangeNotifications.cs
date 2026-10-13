using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sitework.Api.Data.Migrations
{
    /// <summary>
    /// Announces every change to <c>jobs</c> on the <c>job_changes</c> channel (NOTIFY is delivered on
    /// commit). Each API pod LISTENs and pushes the change to its server-sent-events clients, so live
    /// updates work across replicas, and for writes made outside the API (e.g. --reset-demo-data).
    /// </summary>
    public partial class JobChangeNotifications : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                CREATE OR REPLACE FUNCTION notify_job_change() RETURNS trigger
                LANGUAGE plpgsql AS $$
                BEGIN
                    PERFORM pg_notify('job_changes', json_build_object(
                        'id', COALESCE(NEW.id, OLD.id),
                        'op', TG_OP,
                        'status', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.status END
                    )::text);
                    RETURN NULL;
                END;
                $$;

                CREATE TRIGGER jobs_notify_change
                    AFTER INSERT OR UPDATE OR DELETE ON jobs
                    FOR EACH ROW EXECUTE FUNCTION notify_job_change();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DROP TRIGGER IF EXISTS jobs_notify_change ON jobs;
                DROP FUNCTION IF EXISTS notify_job_change();
                """);
        }
    }
}
