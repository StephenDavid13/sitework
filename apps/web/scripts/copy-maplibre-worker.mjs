// MapLibre 6 resolves its web worker from a runtime-computed URL that bundlers can't follow.
// Serve the worker from /public instead (copied from the installed package, so versions always match)
// and point MapLibre at it with setWorkerUrl().
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const packageDir = dirname(require.resolve("maplibre-gl/package.json"));
const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

mkdirSync(publicDir, { recursive: true });
copyFileSync(
  join(packageDir, "dist", "maplibre-gl-worker.mjs"),
  join(publicDir, "maplibre-gl-worker.mjs"),
);
