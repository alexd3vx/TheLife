import type { AssetManifest, AssetRecord } from "../lab/manifest";

// What the game downloads on first launch, and how to tell what is already on the device. Pure functions, so they are
// unit-tested without a browser.

/** Asset categories the game itself needs. The Lab's cartoon props and vehicles load on demand instead. */
export const BOOT_CATEGORIES = ["character", "hair", "clothing", "texture", "animation", "realistic"] as const;

/** file -> size in bytes, as stored on the device. */
export type CacheIndex = Record<string, number>;

export function selectBootAssets(manifest: AssetManifest): AssetRecord[] {
  const wanted = new Set<string>(BOOT_CATEGORIES);
  return manifest.assets.filter((a) => wanted.has(a.category));
}

/** Files that are missing from the device, or whose size changed since they were stored (a new version). */
export function filesToDownload(assets: AssetRecord[], index: CacheIndex): AssetRecord[] {
  return assets.filter((a) => index[a.file] !== a.bytes);
}

/** Stored files the game no longer lists (removed or renamed in an update). */
export function staleFiles(assets: AssetRecord[], index: CacheIndex): string[] {
  const live = new Set(assets.map((a) => a.file));
  return Object.keys(index).filter((file) => !live.has(file));
}

export function totalBytes(assets: AssetRecord[]): number {
  return assets.reduce((sum, a) => sum + a.bytes, 0);
}

export function formatMB(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`;
}
