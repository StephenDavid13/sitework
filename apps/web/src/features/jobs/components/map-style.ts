/** Free OpenStreetMap vector tiles, no API key. Override per build with NEXT_PUBLIC_MAP_STYLE_URL. */
export const MAP_STYLE_URL =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL ??
  "https://tiles.openfreemap.org/styles/positron";
