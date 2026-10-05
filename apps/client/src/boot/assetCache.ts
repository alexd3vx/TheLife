import { ASSET_BASE, assetUrl, type AssetManifest, type AssetRecord } from "../lab/manifest";
import { filesToDownload, selectBootAssets, staleFiles, totalBytes, type CacheIndex } from "./plan";

// Keeps the game's models and textures on the device so the next launch only has to find them. Uses the browser's Cache
// API (works offline, survives reloads) with a small index recording what is stored. If the browser blocks it (private
// windows, some embedded views), the game still runs and just loads files from the network as it needs them.

const CACHE_NAME = "thelife-assets-v1";
const INDEX_URL = `${ASSET_BASE}__index.json`;
const CACHEABLE = /\.(glb|webp|mp3)$/;
const PARALLEL = 4;

async function openCache(): Promise<Cache | null> {
  try {
    if (typeof caches === "undefined") return null;
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

export async function readIndex(cache: Cache): Promise<CacheIndex> {
  try {
    const hit = await cache.match(INDEX_URL);
    return hit ? ((await hit.json()) as CacheIndex) : {};
  } catch {
    return {};
  }
}

async function writeIndex(cache: Cache, index: CacheIndex) {
  await cache.put(INDEX_URL, new Response(JSON.stringify(index), { headers: { "content-type": "application/json" } }));
}

export interface SyncProgress {
  /** Bytes still to download when the sync started (0 = everything was already on the device). */
  toDownload: number;
  loaded: number;
  /** True when this device had none of the game's files yet. */
  firstRun: boolean;
  /** How many files were already stored. */
  alreadyStored: number;
  /** False when the browser would not let us store files. */
  cacheAvailable: boolean;
}

/**
 * Makes the device's cache match the game's asset list: downloads what is missing or changed (with progress), removes
 * what is no longer used. Resolves with the final state; failed files are left for the game to load on demand.
 */
export async function syncAssets(manifest: AssetManifest, onProgress: (p: SyncProgress) => void): Promise<{ failed: string[]; progress: SyncProgress }> {
  try {
    return await syncAssetsUnsafe(manifest, onProgress);
  } catch (error) {
    // Some hosted pages allow opening the cache but refuse writes. The game must still start: it loads files as it needs them.
    console.warn("boot: could not keep assets on this device", error);
    const progress: SyncProgress = { toDownload: 0, loaded: 0, firstRun: false, alreadyStored: 0, cacheAvailable: false };
    onProgress(progress);
    return { failed: [], progress };
  }
}

async function syncAssetsUnsafe(manifest: AssetManifest, onProgress: (p: SyncProgress) => void): Promise<{ failed: string[]; progress: SyncProgress }> {
  const assets = selectBootAssets(manifest);
  const cache = await openCache();
  if (!cache) {
    const progress: SyncProgress = { toDownload: 0, loaded: 0, firstRun: false, alreadyStored: 0, cacheAvailable: false };
    onProgress(progress);
    return { failed: [], progress };
  }

  const index = await readIndex(cache);
  const missing = filesToDownload(assets, index);
  const progress: SyncProgress = {
    toDownload: totalBytes(missing),
    loaded: 0,
    firstRun: Object.keys(index).length === 0,
    alreadyStored: assets.length - missing.length,
    cacheAvailable: true,
  };
  onProgress({ ...progress });

  const failed: string[] = [];
  const queue = [...missing];
  async function worker() {
    for (let record = queue.shift(); record; record = queue.shift()) {
      let ok = false;
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        let counted = 0;
        try {
          const blob = await download(record, (n) => {
            counted += n;
            progress.loaded += n;
            onProgress({ ...progress });
          });
          await cache!.put(assetUrl(record.file), new Response(blob, { headers: { "content-type": blob.type || "application/octet-stream" } }));
          index[record.file] = record.bytes;
          ok = true;
        } catch {
          progress.loaded -= counted; // retry from zero
          onProgress({ ...progress });
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        }
      }
      if (!ok) failed.push(record.file);
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, worker));

  for (const file of staleFiles(assets, index)) {
    await cache.delete(assetUrl(file));
    delete index[file];
  }
  await writeIndex(cache, index);
  return { failed, progress };
}

async function download(record: AssetRecord, onBytes: (n: number) => void): Promise<Blob> {
  const response = await rawFetch(assetUrl(record.file));
  if (!response.ok) throw new Error(`${response.status} ${record.file}`);
  if (!response.body) {
    const blob = await response.blob();
    onBytes(blob.size);
    return blob;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    onBytes(value.length);
  }
  return new Blob(chunks as BlobPart[], { type: response.headers.get("content-type") ?? "" });
}

// ---- fetch that looks on the device first

let rawFetch: typeof fetch = (...args) => fetch(...args);

/**
 * Makes every model and texture request look in the device's cache first, and keeps a copy of the asset list so the game
 * can start offline. Call once, before anything loads.
 */
export function installCachedFetch(): void {
  if (typeof window === "undefined" || typeof caches === "undefined") return;
  const original = window.fetch.bind(window);
  rawFetch = original;
  const manifestUrl = new URL(assetUrl("manifest.json"), location.href).href;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const href = new URL(input instanceof Request ? input.url : input.toString(), location.href).href;
      if (method === "GET") {
        const cache = await openCache();
        if (cache && href === manifestUrl) {
          // Always prefer the newest list; fall back to the stored copy when offline.
          try {
            const fresh = await original(input, init);
            if (fresh.ok) await cache.put(href, fresh.clone());
            return fresh;
          } catch (error) {
            const stored = await cache.match(href);
            if (stored) return stored;
            throw error;
          }
        }
        if (cache && href.includes("/assets/") && CACHEABLE.test(new URL(href).pathname)) {
          const stored = await cache.match(href);
          if (stored) return stored;
        }
      }
    } catch {
      // fall through to the network
    }
    return original(input, init);
  };
}
