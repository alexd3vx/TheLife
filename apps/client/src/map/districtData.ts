import { generateLagos, type District } from "@thelife/game-core";

let cached: District | null = null;

/** The world (Lagos Island), generated once and shared by the 3D map, the minimap and the phone. */
export function getDistrict(): District {
  return (cached ??= generateLagos());
}
