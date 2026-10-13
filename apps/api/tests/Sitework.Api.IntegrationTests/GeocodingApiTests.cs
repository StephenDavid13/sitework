using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Sitework.Api.Features.Geocoding;
using Sitework.Api.IntegrationTests.Infrastructure;

namespace Sitework.Api.IntegrationTests;

/// <summary>The real API pipeline with Photon replaced by a canned handler (no network in tests).</summary>
public sealed class GeocodingApiTests(PostgisFixture postgis)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private const string OneResult = """
        {"type":"FeatureCollection","features":[{"type":"Feature",
          "geometry":{"type":"Point","coordinates":[174.7440,-36.8530]},
          "properties":{"housenumber":"12","street":"Kauri Street","district":"Ponsonby","city":"Auckland"}}]}
        """;

    private (HttpClient Client, FakePhoton Photon) Create(Func<HttpRequestMessage, HttpResponseMessage> respond)
    {
        var photon = new FakePhoton(respond);
        var factory = postgis.Api.WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
            services.AddHttpClient<PhotonGeocoder>().ConfigurePrimaryHttpMessageHandler(() => photon)));
        return (factory.CreateClient(), photon);
    }

    [Fact]
    public async Task Search_returns_labelled_places_biased_towards_the_map_and_cached()
    {
        var (client, photon) = Create(_ => Json(OneResult));

        var url = "/api/geocode/search?q=12%20Kauri%20St&nearLat=-36.8512&nearLng=174.7633";
        var results = await client.GetFromJsonAsync<GeocodeResult[]>(url, SiteworkApiFactory.Json, Ct);
        await client.GetFromJsonAsync<GeocodeResult[]>(url, SiteworkApiFactory.Json, Ct);

        results.ShouldBe([new GeocodeResult("12 Kauri Street, Ponsonby, Auckland", -36.8530, 174.7440)]);
        photon.Requests.ShouldHaveSingleItem().ShouldBe("/api/?q=12%20Kauri%20St&limit=5&lat=-36.85&lon=174.76");
    }

    [Fact]
    public async Task Reverse_geocoding_returns_the_nearest_address_or_404()
    {
        var (client, _) = Create(request => Json(request.RequestUri!.Query.Contains("lat=0") ? """{"features":[]}""" : OneResult));

        var found = await client.GetFromJsonAsync<GeocodeResult>("/api/geocode/reverse?lat=-36.853&lng=174.744", SiteworkApiFactory.Json, Ct);
        found!.Label.ShouldBe("12 Kauri Street, Ponsonby, Auckland");

        var missing = await client.GetAsync("/api/geocode/reverse?lat=0&lng=0", Ct);
        missing.StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await JobsClient.ReadProblemAsync(missing)).Code.ShouldBe("address_not_found");
    }

    [Fact]
    public async Task An_upstream_failure_is_a_503_with_a_way_forward()
    {
        var (client, _) = Create(_ => new HttpResponseMessage(HttpStatusCode.BadGateway));

        var response = await client.GetAsync("/api/geocode/search?q=anything%20at%20all", Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.ServiceUnavailable);
        var problem = await JobsClient.ReadProblemAsync(response);
        problem.Code.ShouldBe("geocoding_unavailable");
        problem.Detail!.ShouldContain("Drop a pin on the map");
    }

    [Fact]
    public async Task An_upstream_timeout_is_a_503_not_a_500()
    {
        var (client, _) = Create(_ => throw new Polly.Timeout.TimeoutRejectedException("Timed out after 3s"));

        var response = await client.GetAsync("/api/geocode/reverse?lat=-36.85&lng=174.76", Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.ServiceUnavailable);
        (await JobsClient.ReadProblemAsync(response)).Code.ShouldBe("geocoding_unavailable");
    }

    [Theory]
    [InlineData("/api/geocode/search?q=ab", "q")]
    [InlineData("/api/geocode/search?q=valid%20query&nearLat=99&nearLng=0", "near")]
    [InlineData("/api/geocode/reverse?lat=95&lng=0", "location")]
    public async Task Bad_queries_are_rejected_without_calling_upstream(string url, string field)
    {
        var (client, photon) = Create(_ => Json(OneResult));

        var response = await client.GetAsync(url, Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await JobsClient.ReadProblemAsync(response)).Errors.Keys.ShouldBe([field]);
        photon.Requests.ShouldBeEmpty();
    }

    private static HttpResponseMessage Json(string body) =>
        new(HttpStatusCode.OK) { Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json") };

    private sealed class FakePhoton(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        public List<string> Requests { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add(request.RequestUri!.PathAndQuery);
            return Task.FromResult(respond(request));
        }
    }
}
