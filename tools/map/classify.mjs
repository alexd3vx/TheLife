// Classifies every pixel of the source map picture into water, roads/open ground, built-up blocks, parks and marked places.
export const CLS = { WATER: 0, LIGHT: 1, BLOCK: 2, PARK: 3, RED: 4 };

export function classify(im) {
  const { width: w, height: h, data } = im;
  const cls = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const dWater = Math.abs(r - 120) + Math.abs(g - 192) + Math.abs(b - 224);
    if (dWater < 70 && b > r + 50) cls[i] = CLS.WATER;
    else if (r > 185 && g < 150 && b < 135 && r - g > 55) cls[i] = CLS.RED;
    else if (g > r + 6 && g > b + 35 && r < 215) cls[i] = CLS.PARK;
    else if (r > 232 && g > 198 && g < 232 && b > 140 && b < 200 && r - b > 40) cls[i] = CLS.BLOCK;
    else if (r > 205 && g > 205 && b > 195) cls[i] = CLS.LIGHT;
    else cls[i] = 255; // labels, outlines, anti-aliasing: decided below from the neighbours
  }
  // Fill the unknown pixels (text, outlines) from the most common known neighbour, a few rounds.
  for (let round = 0; round < 4; round++) {
    const next = cls.slice();
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (cls[i] !== 255) continue;
        const count = [0, 0, 0, 0, 0];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const c = cls[i + dy * w + dx]; if (c !== 255) count[c]++; }
        let best = -1, n = 0;
        for (let c = 0; c < 5; c++) if (count[c] > n) { n = count[c]; best = c; }
        if (best >= 0) next[i] = best;
      }
    }
    cls.set(next);
  }
  for (let i = 0; i < w * h; i++) if (cls[i] === 255) cls[i] = CLS.LIGHT;
  return cls;
}
