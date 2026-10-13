namespace Sitework.Api.Infrastructure;

/// <summary>
/// Conservative headers for a JSON API. HSTS is left to the web front end / load balancer, which
/// own the public origin; the API docs UI (/scalar) is exempt from the frame/CSP-style restrictions.
/// </summary>
public static class SecurityHeaders
{
    public static IApplicationBuilder UseSecurityHeaders(this IApplicationBuilder app) =>
        app.Use(async (context, next) =>
        {
            context.Response.OnStarting(() =>
            {
                var headers = context.Response.Headers;
                headers.XContentTypeOptions = "nosniff";
                headers["Referrer-Policy"] = "no-referrer";
                if (!context.Request.Path.StartsWithSegments("/scalar"))
                {
                    headers.XFrameOptions = "DENY";
                    headers["Cross-Origin-Resource-Policy"] = "same-origin";
                }

                return Task.CompletedTask;
            });
            await next(context);
        });
}
