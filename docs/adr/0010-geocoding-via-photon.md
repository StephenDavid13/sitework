# 0010: Address search through Photon, proxied by the API

**Context.** Typing coordinates is unfriendly. People think in addresses, and a dropped pin should
come back as an address. Commercial geocoders need API keys and billing. Nominatim's public
usage policy forbids autocomplete.

**Decision.** Use [Photon](https://photon.komoot.io), OpenStreetMap data built for
search-as-you-type, but only through our API:

- `GET /api/geocode/search?q=&nearLat=&nearLng=` and `GET /api/geocode/reverse?lat=&lng=`.
- The typed `HttpClient` carries an identifying User-Agent and the standard resilience handler:
  6 s attempt timeout (the public instance can take ~5 s), 1 retry, a 13 s total and a circuit
  breaker.
- Results are cached in memory for 24 hours.
- A dedicated 60/min per-IP rate limit.
- Upstream failure returns `503 geocoding_unavailable`, and the UI falls back to the pin or coordinates.
- Search is biased towards the map's location (rounded to 0.01° so the cache works).
- The UI shows "© OpenStreetMap contributors".

**Consequences.** No keys, and the browser never talks to a third party (so no CSP changes). The
public instance is fair-use only. For real traffic, run your own Photon and set
`Geocoding:BaseUrl`.
