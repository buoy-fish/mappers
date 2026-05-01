// Buoy.Fish Coverage Mapper — esbuild config
// Replaces webpack 4 for faster, zero-vulnerability builds.
//
// Usage:
//   node build.mjs          # Development build
//   node build.mjs --watch  # Watch mode (used by Phoenix watcher)
//   node build.mjs --deploy # Minified production build

import * as esbuild from "esbuild"
import { copyFileSync, mkdirSync, readdirSync, statSync } from "fs"
import { join, resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))

const args = process.argv.slice(2)
const watch = args.includes("--watch")
const deploy = args.includes("--deploy")

// Recursively copy static assets to priv/static
function copyStatic(src, dest) {
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry)
    const destPath = join(dest, entry)
    if (statSync(srcPath).isDirectory()) {
      copyStatic(srcPath, destPath)
    } else {
      copyFileSync(srcPath, destPath)
    }
  }
}

copyStatic(
  resolve(__dirname, "static"),
  resolve(__dirname, "../priv/static")
)

const buildOptions = {
  entryPoints: [
    resolve(__dirname, "js/app.js"),
    resolve(__dirname, "css/app.css"),
  ],
  bundle: true,
  outdir: resolve(__dirname, "../priv/static"),
  // JS goes to /js/app.js, CSS goes to /css/app.css
  entryNames: "[dir]/[name]",
  assetNames: "[dir]/[name]",
  // Preserve the js/ and css/ subdirectories
  outbase: resolve(__dirname),
  minify: deploy,
  sourcemap: !deploy,
  target: "es2017",
  loader: {
    ".js": "jsx",
    ".png": "file",
    ".svg": "file",
    ".woff": "file",
    ".woff2": "file",
    ".ttf": "file",
    ".eot": "file",
  },
  // Inline `process.env.X` references at build time. The MAPBOX_ACCESS_TOKEN
  // is a public Mapbox token (pk.eyJ...) — designed to be exposed in the
  // browser and protected via URL restrictions in the Mapbox dashboard.
  // When unset, JSON.stringify(undefined) yields the literal string "undefined"
  // which Map.js treats as "no token" and falls back to the CartoCDN style.
  //
  // BUOY_API_BASE_URL points at the app.buoy.fish backend that serves the
  // admin-editable default view (`/api/v1/public/map-config`) consumed by
  // assets/js/utils/mapConfig.js. Defaults to the production hostname so
  // `node build.mjs --deploy` produces a bundle that "just works" without
  // extra env wiring; override in dev (e.g. `BUOY_API_BASE_URL=http://localhost:4000 node build.mjs`)
  // or set to "" to disable the fetch entirely (offline previews).
  define: {
    "process.env.NODE_ENV": deploy ? '"production"' : '"development"',
    "process.env.MAPBOX_ACCESS_TOKEN": JSON.stringify(process.env.MAPBOX_ACCESS_TOKEN || ""),
    "process.env.BUOY_API_BASE_URL": JSON.stringify(
      process.env.BUOY_API_BASE_URL ?? "https://app.buoy.fish"
    ),
  },
  logLevel: "info",
}

if (watch) {
  const ctx = await esbuild.context(buildOptions)

  // Watch for file changes
  await ctx.watch()

  // Listen on stdin — when Phoenix closes stdin, the watcher exits
  process.stdin.on("close", () => {
    ctx.dispose()
    process.exit(0)
  })
  process.stdin.resume()
} else {
  await esbuild.build(buildOptions)
}
