import { describe, expect, it } from "vitest";
import type { AssetManifest } from "../lab/manifest";
import { filesToDownload, formatMB, selectBootAssets, staleFiles, totalBytes } from "./plan";
import { isNewer } from "./version";

const asset = (id: string, category: string, bytes: number) => ({ id, category, file: `${category}/${id}.glb`, bytes });
const manifest = {
  assets: [asset("body", "character", 500_000), asset("sofa", "realistic", 200_000), asset("kenney_chair", "furniture", 10_000), asset("taxi", "vehicle", 40_000), asset("clips", "animation", 2_000_000)],
} as unknown as AssetManifest;

describe("boot asset plan", () => {
  it("downloads what the game needs and leaves out Lab-only props and vehicles", () => {
    expect(selectBootAssets(manifest).map((a) => a.id).sort()).toEqual(["body", "clips", "sofa"]);
  });

  it("downloads everything on the first run", () => {
    const assets = selectBootAssets(manifest);
    expect(filesToDownload(assets, {})).toHaveLength(3);
    expect(totalBytes(assets)).toBe(2_700_000);
  });

  it("downloads nothing when everything is already on the device", () => {
    const assets = selectBootAssets(manifest);
    const index = Object.fromEntries(assets.map((a) => [a.file, a.bytes]));
    expect(filesToDownload(assets, index)).toEqual([]);
  });

  it("downloads only files that are new or changed in an update", () => {
    const assets = selectBootAssets(manifest);
    const index = { [assets[0]!.file]: assets[0]!.bytes, [assets[1]!.file]: 1 };
    expect(filesToDownload(assets, index).map((a) => a.id).sort()).toEqual(["clips", "sofa"].sort());
  });

  it("finds stored files the game no longer uses", () => {
    expect(staleFiles(selectBootAssets(manifest), { "realistic/gone.glb": 5, "realistic/sofa.glb": 200_000 })).toEqual(["realistic/gone.glb"]);
  });

  it("formats sizes for the progress bar", () => {
    expect(formatMB(4_200_000)).toBe("4.2 MB");
    expect(formatMB(20_600_000)).toBe("21 MB");
  });
});

describe("update check", () => {
  it("offers a reload only for a different, real build", () => {
    expect(isNewer("abc", "abd")).toBe(true);
    expect(isNewer("abc", "abc")).toBe(false);
    expect(isNewer("abc", null)).toBe(false);
    expect(isNewer("dev", "abc")).toBe(false);
  });
});
