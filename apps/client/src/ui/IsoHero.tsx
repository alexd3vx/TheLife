// Original isometric skyline drawn in SVG. Each block is a 2:1 isometric box
// (top, left face, right face). Windows glow with a gentle staggered pulse.

interface Block {
  x: number; // screen position of the box's bottom-centre point
  y: number;
  w: number; // half-width of the footprint on screen
  h: number; // height in px
  tone: "sand" | "clay" | "teal" | "plum";
}

const BLOCKS: Block[] = [
  { x: 120, y: 330, w: 64, h: 90, tone: "clay" },
  { x: 250, y: 380, w: 70, h: 150, tone: "sand" },
  { x: 390, y: 330, w: 60, h: 70, tone: "teal" },
  { x: 520, y: 390, w: 74, h: 190, tone: "plum" },
  { x: 650, y: 340, w: 62, h: 110, tone: "clay" },
  { x: 320, y: 470, w: 66, h: 80, tone: "teal" },
  { x: 470, y: 500, w: 60, h: 60, tone: "sand" },
  { x: 610, y: 470, w: 68, h: 120, tone: "plum" },
  { x: 180, y: 450, w: 56, h: 50, tone: "plum" },
];

const TONES = {
  sand: { top: "#ffd27a", left: "#e0a24a", right: "#b97a2c" },
  clay: { top: "#f08a5d", left: "#c9623a", right: "#9a4528" },
  teal: { top: "#5fd1b8", left: "#2f9c8a", right: "#1f6f66" },
  plum: { top: "#b78bd9", left: "#7d55a3", right: "#58397a" },
} as const;

function IsoBox({ block, index }: { block: Block; index: number }) {
  const { x, y, w, h, tone } = block;
  const d = w / 2; // half-depth on screen (2:1 projection)
  const colors = TONES[tone];
  const topY = y - h;

  const top = `${x},${topY - d} ${x + w},${topY} ${x},${topY + d} ${x - w},${topY}`;
  const left = `${x - w},${topY} ${x},${topY + d} ${x},${y + d} ${x - w},${y}`;
  const right = `${x},${topY + d} ${x + w},${topY} ${x + w},${y} ${x},${y + d}`;

  const windows: { wx: number; wy: number; key: string }[] = [];
  for (let row = 0; row < Math.floor((h - 18) / 26); row++) {
    for (let col = 0; col < 2; col++) {
      const wx = x + 10 + col * (w / 2 - 6);
      windows.push({ wx, wy: topY + d + 16 + row * 26 + col * -((w / 2 - 6) / 2) + (w / 2 - 6) / 2, key: `${row}-${col}` });
    }
  }

  return (
    <g className="iso-block" style={{ animationDelay: `${index * 0.12}s` }}>
      <ellipse cx={x} cy={y + d + 6} rx={w * 1.1} ry={d * 1.1} fill="rgba(0,0,0,.28)" />
      <polygon points={left} fill={colors.left} />
      <polygon points={right} fill={colors.right} />
      <polygon points={top} fill={colors.top} />
      {windows.map((win, i) => (
        <rect
          key={win.key}
          className="iso-window"
          x={win.wx}
          y={win.wy}
          width={9}
          height={12}
          rx={1.5}
          style={{ animationDelay: `${((index + i) % 7) * 0.45}s` }}
        />
      ))}
    </g>
  );
}

export function IsoHero() {
  const ordered = [...BLOCKS].sort((a, b) => a.y - b.y);

  return (
    <svg className="iso-hero" viewBox="0 0 780 640" preserveAspectRatio="xMidYMid slice" role="presentation">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b1a3a" />
          <stop offset=".55" stopColor="#8a3d4f" />
          <stop offset="1" stopColor="#f2a43a" />
        </linearGradient>
        <radialGradient id="sun" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#ffe3a3" stopOpacity=".95" />
          <stop offset="1" stopColor="#ffe3a3" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="780" height="640" fill="url(#sky)" />
      <circle className="iso-sun" cx="560" cy="250" r="190" fill="url(#sun)" />
      <polygon points="390,360 790,560 390,760 -10,560" fill="#1b1411" opacity=".55" />
      {ordered.map((block, i) => (
        <IsoBox key={`${block.x}-${block.y}`} block={block} index={i} />
      ))}
    </svg>
  );
}
