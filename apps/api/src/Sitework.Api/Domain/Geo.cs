using NetTopologySuite;
using NetTopologySuite.Geometries;

namespace Sitework.Api.Domain;

public static class Geo
{
    /// <summary>WGS 84, the coordinate system GPS and web maps use.</summary>
    public const int Wgs84 = 4326;

    private static readonly GeometryFactory Factory =
        NtsGeometryServices.Instance.CreateGeometryFactory(srid: Wgs84);

    public static Point Point(double latitude, double longitude) =>
        Factory.CreatePoint(new Coordinate(longitude, latitude));

    public static Geometry Box(double minLongitude, double minLatitude, double maxLongitude, double maxLatitude) =>
        Factory.ToGeometry(new Envelope(minLongitude, maxLongitude, minLatitude, maxLatitude));
}
