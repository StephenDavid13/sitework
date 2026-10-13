# 0003: PostGIS `geometry` with spheroid distance functions

**Context.** Two spatial queries matter:

- jobs inside the map viewport (a lon/lat box);
- jobs within N km of the user, ordered by distance.

**Decision.** Store `location` as `geometry(Point, 4326)` with a GiST index.

- **Viewport:** `ST_Intersects(location, envelope)`. Planar maths in degrees is exactly right for
  a lon/lat box and uses the index.
- **Radius:** `EF.Functions.IsWithinDistance(…, useSpheroid: true)` and
  `EF.Functions.Distance(…, true)` measure on the spheroid in metres.
- **API shape:** the API exposes `{ latitude, longitude }`, never NetTopologySuite types.

**Consequences.** Viewport queries are index-backed. Radius queries are accurate but don't use
the index; that's fine at this scale, and an expression index on `location::geography` would fix
it later. Viewports that cross the antimeridian aren't supported (the client clamps to ±180°).
