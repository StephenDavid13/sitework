using System.Text.Json;
using Sitework.Api.Features.Geocoding;

namespace Sitework.Api.UnitTests;

public sealed class GeocodingTests
{
    private static JsonElement Json(string json) => JsonDocument.Parse(json).RootElement;

    [Fact]
    public void Photon_features_become_labelled_points()
    {
        var results = PhotonGeocoder.Parse(Json("""
            {"type":"FeatureCollection","features":[
              {"type":"Feature","geometry":{"type":"Point","coordinates":[174.7440,-36.8530]},
               "properties":{"housenumber":"12","street":"Kauri Street","district":"Ponsonby","city":"Auckland","postcode":"1011","country":"New Zealand"}},
              {"type":"Feature","geometry":{"type":"Point","coordinates":[174.76,-36.84]},
               "properties":{"name":"Auckland War Memorial Museum","street":"Domain Drive","city":"Auckland"}}
            ]}
            """));

        results.ShouldBe(
        [
            new GeocodeResult("12 Kauri Street, Ponsonby, Auckland 1011", -36.8530, 174.7440),
            new GeocodeResult("Auckland War Memorial Museum, Domain Drive, Auckland", -36.84, 174.76),
        ]);
    }

    [Fact]
    public void Places_without_street_or_city_fall_back_to_the_country()
    {
        PhotonGeocoder.Label(Json("""{"name":"Raoul Island","country":"New Zealand"}"""))
            .ShouldBe("Raoul Island, New Zealand");
    }

    [Fact]
    public void Features_missing_coordinates_or_any_label_are_skipped()
    {
        PhotonGeocoder.Parse(Json("""
            {"features":[
              {"geometry":{"coordinates":[1]},"properties":{"name":"Broken"}},
              {"geometry":{"coordinates":[1,2]},"properties":{}}
            ]}
            """)).ShouldBeEmpty();
    }
}
