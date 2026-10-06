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

/** How much larger than the screen size the baked pictures are (written by the baker's last step, so code and pictures always agree). */
export const sharpNow = { props: 1.5, char: 1.5 };
let sharpLoad: Promise<void> | null = null;
export function spriteSharp(): Promise<void> {
  return (sharpLoad ??= fetch(`${BASE}sharp.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (j && typeof j.props === "number" && typeof j.char === "number") {
        sharpNow.props = j.props;
        sharpNow.char = j.char;
      }
    })
    .catch(() => undefined));
}
