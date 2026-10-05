// Builds the playtest bundle for hosting where .glb files can't be served: builds with relative paths, renames every
// .glb to .glb.mp3 (served as audio/mpeg; the loader doesn't care about the type), rewrites the manifest to match and
// writes page.html (the fragment the host wraps in a document). Output: apps/client/dist-artifact.
// Run from the repo root: node tools/assets/stage-artifact.mjs
import { execSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const client = join(process.cwd(), "apps/client");
const dist = join(client, "dist");
const out = join(client, "dist-artifact");

execSync("npx vite build", { cwd: client, stdio: "inherit", env: { ...process.env, VITE_BASE: "./" } });
rmSync(out, { recursive: true, force: true });
cpSync(dist, out, { recursive: true });

let renamed = 0;
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith(".glb")) {
      renameSync(path, path + ".mp3");
      renamed++;
    }
  }
})(join(out, "assets"));

// Read the whole manifest first, then write it (opening for write first would empty it).
const manifestPath = join(out, "assets/manifest.json");
const manifestText = readFileSync(manifestPath, "utf8");
const rewritten = manifestText.replace(/\.glb"/g, '.glb.mp3"');
const parsed = JSON.parse(rewritten);
if (!Array.isArray(parsed.assets) || parsed.assets.length === 0) throw new Error("manifest has no assets, refusing to stage");
writeFileSync(manifestPath, rewritten);

const html = readFileSync(join(out, "index.html"), "utf8");
const pick = (re) => (html.match(re) ?? [])[0];
const fragment = [
  "<title>TheLife Playtest</title>",
  '<meta name="theme-color" content="#14110f" />',
  '<link rel="icon" href="./favicon.svg" type="image/svg+xml" />',
  pick(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>/),
  pick(/<script type="module"[^>]*><\/script>/),
  pick(/<link rel="stylesheet"[^>]*>/),
  '<div id="root"></div>',
  "",
].filter((x) => x !== undefined).join("\n");
writeFileSync(join(out, "page.html"), fragment);

const missing = parsed.assets.filter((a) => !existsSync(join(out, "assets", a.file)));
console.log(`staged: ${renamed} models renamed, ${parsed.assets.length} manifest entries, ${missing.length} missing files`);
if (missing.length) {
  console.log(missing.slice(0, 5).map((a) => a.file));
  process.exit(1);
}
