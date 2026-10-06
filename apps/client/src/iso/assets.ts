// Baked sprites: where they are, how big, and where each one's origin sits. Loaded when first needed.

export interface SpriteMeta {
  w: number;
  h: number;
  ax: number;
  ay: number;
}
export interface PropMeta {
  size: [number, number, number];
  [rot: number]: SpriteMeta;
}
const BASE = `${import.meta.env.BASE_URL}sprites/`;

let propsIndex: Promise<Record<string, PropMeta>> | null = null;
const images = new Map<string, Promise<HTMLImageElement>>();

export function propsMeta(): Promise<Record<string, PropMeta>> {
  return (propsIndex ??= fetch(`${BASE}props.json`).then((r) => r.json()));
}

export function loadImage(path: string): Promise<HTMLImageElement> {
  let p = images.get(path);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`missing sprite ${path}`));
      img.src = `${BASE}${path}`;
    });
    images.set(path, p);
  }
  return p;
}

export const propImage = (id: string, rot: number) => loadImage(`props/${id}_${rot}.webp`);
