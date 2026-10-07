import * as THREE from "three";

// Procedural ground textures (no downloads): asphalt, paving slabs, concrete. Each tile repeats seamlessly.
function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function rng(seed: number) {
  let a = seed;
  return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Dark asphalt with grit, patches and a few hairline cracks. One tile covers 8 m. */
export function asphaltTexture(): THREE.CanvasTexture {
  return canvasTexture(512, (ctx, n) => {
    const r = rng(11);
    ctx.fillStyle = "#3c3f44";
    ctx.fillRect(0, 0, n, n);
    for (let i = 0; i < 9000; i++) {
      const v = 50 + r() * 50;
      ctx.fillStyle = `rgba(${v},${v},${v + 4},${0.18 + r() * 0.35})`;
      ctx.fillRect(r() * n, r() * n, 1 + r() * 2, 1 + r() * 2);
    }
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(30,32,36,${0.12 + r() * 0.12})`;
      const w = 40 + r() * 90;
      ctx.fillRect(r() * n, r() * n, w, 20 + r() * 50);
    }
    ctx.strokeStyle = "rgba(20,20,22,.45)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      let x = r() * n, y = r() * n;
      ctx.moveTo(x, y);
      for (let k = 0; k < 10; k++) ctx.lineTo((x += (r() - 0.5) * 40), (y += (r() - 0.2) * 30));
      ctx.stroke();
    }
  });
}

/** Light paving slabs with grout lines; one tile is 2 m x 2 m (a 4 x 4 grid of half-metre slabs). */
export function pavingTexture(): THREE.CanvasTexture {
  return canvasTexture(256, (ctx, n) => {
    const r = rng(23);
    const cell = n / 4;
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const v = 168 + r() * 26;
        ctx.fillStyle = `rgb(${v},${v - 3},${v - 10})`;
        ctx.fillRect(x * cell, y * cell, cell, cell);
        for (let i = 0; i < 60; i++) {
          ctx.fillStyle = `rgba(90,86,78,${r() * 0.12})`;
          ctx.fillRect(x * cell + r() * cell, y * cell + r() * cell, 2, 2);
        }
      }
    }
    ctx.strokeStyle = "rgba(70,66,60,.75)";
    ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, n); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(n, i * cell); ctx.stroke();
    }
  });
}

/** Concrete slabs with seams and stains for the market and the apron. One tile is 6 m. */
export function concreteTexture(): THREE.CanvasTexture {
  return canvasTexture(512, (ctx, n) => {
    const r = rng(37);
    ctx.fillStyle = "#a3a097";
    ctx.fillRect(0, 0, n, n);
    for (let i = 0; i < 7000; i++) {
      const v = 120 + r() * 70;
      ctx.fillStyle = `rgba(${v},${v - 2},${v - 8},${0.1 + r() * 0.25})`;
      ctx.fillRect(r() * n, r() * n, 1 + r() * 3, 1 + r() * 3);
    }
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = `rgba(80,74,66,${0.05 + r() * 0.08})`;
      ctx.beginPath();
      ctx.ellipse(r() * n, r() * n, 20 + r() * 50, 10 + r() * 30, r() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(60,58,54,.7)";
    ctx.lineWidth = 2;
    for (const p of [0, n / 2]) {
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, n); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(n, p); ctx.stroke();
    }
  });
}

/** A soft round glow used for the pools of light under street lamps. */
export function glowTexture(): THREE.CanvasTexture {
  const t = canvasTexture(128, (ctx, n) => {
    const g = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    g.addColorStop(0, "rgba(255,220,150,.95)");
    g.addColorStop(0.45, "rgba(168, 200, 255,.35)");
    g.addColorStop(1, "rgba(255,190,100,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, n, n);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
