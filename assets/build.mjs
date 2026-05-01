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
  define: {
    "process.env.NODE_ENV": deploy ? '"production"' : '"development"',
    "process.env.MAPBOX_ACCESS_TOKEN": JSON.stringify(process.env.MAPBOX_ACCESS_TOKEN || ""),
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
