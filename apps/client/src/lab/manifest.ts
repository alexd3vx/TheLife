export interface Credit {
  name: string;
  author: string;
  licence: string;
  url: string;
}

export interface Budget {
  maxTriangles?: number;
  maxBytes?: number;
}

export interface AssetRecord {
  id: string;
  category: string;
  file: string;
  bytes: number;
  triangles?: number;
  materials?: number;
  textures?: number;
  joints?: number;
  animations?: number;
  clipNames?: string[];
  label?: string;
  group?: string;
  slot?: string;
  outfit?: string;
  sex?: string;
  credit?: string;
  budgetProblems?: string[];
}

export interface AssetManifest {
  generatedAt: string;
  credits: Record<string, Credit>;
  budgets: Record<string, Budget>;
  outfits: Record<string, { label: string; variants: { id: string; label: string }[] }>;
  assets: AssetRecord[];
}

export const ASSET_BASE = `${import.meta.env.BASE_URL}assets/`;

export async function loadManifest(): Promise<AssetManifest> {
  const response = await fetch(`${ASSET_BASE}manifest.json`);
  if (!response.ok) throw new Error(`Could not load the asset manifest (${response.status}). Run the asset build.`);
  return (await response.json()) as AssetManifest;
}

export function assetUrl(file: string): string {
  return `${ASSET_BASE}${file}`;
}
