import { memo } from "react";

// A cinematic Lagos at golden hour for the sign-in screen: drawn once as vector shapes and moved only with transforms and
// opacity (all on the graphics card), so it stays smooth on weak phones. No 3D, no downloads.

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Tower {
  x: number;
  w: number;
  h: number;
  top: "flat" | "spire" | "dome" | "step";
}

function skyline(seed: number, from: number, to: number, minH: number, maxH: number, gap: number): Tower[] {
  const r = rng(seed);
  const out: Tower[] = [];
  let x = from;
  while (x < to) {
    const w = 26 + r() * 50;
    const kind = r();
    out.push({ x, w, h: minH + r() * (maxH - minH), top: kind > 0.9 ? "spire" : kind > 0.8 ? "step" : kind > 0.74 ? "dome" : "flat" });
    x += w + r() * gap;
  }
  return out;
}

function towerPath(t: Tower, base: number): string {
  const y = base - t.h;
  const x2 = t.x + t.w;
  switch (t.top) {
    case "spire":
      return `M${t.x} ${base}V${y}H${t.x + t.w * 0.42}L${t.x + t.w / 2} ${y - 46}L${t.x + t.w * 0.58} ${y}H${x2}V${base}Z`;
    case "step":
      return `M${t.x} ${base}V${y + 18}H${t.x + t.w * 0.2}V${y}H${t.x + t.w * 0.8}V${y + 18}H${x2}V${base}Z`;
    case "dome":
      return `M${t.x} ${base}V${y}Q${t.x + t.w / 2} ${y - t.w * 0.7} ${x2} ${y}V${base}Z`;
    default:
      return `M${t.x} ${base}V${y}H${x2}V${base}Z`;
  }
}

const FAR = skyline(11, -40, 1700, 90, 230, 10);
const MID = skyline(23, -60, 1700, 130, 340, 6);
const NEAR = skyline(5, -30, 1700, 60, 150, 14);

function windows(towers: Tower[], base: number, seed: number, density: number) {
  const r = rng(seed);
  const out: { x: number; y: number; d: number; s: number }[] = [];
  for (const t of towers) {
    const cols = Math.floor(t.w / 10), rows = Math.floor(t.h / 15);
    for (let c = 0; c < cols; c++) for (let rw = 0; rw < rows; rw++) if (r() < density) out.push({ x: t.x + 5 + c * 10, y: base - t.h + 8 + rw * 15, d: r() * 6, s: r() < 0.25 ? 1 : 0 });
  }
  return out;
}

const MID_WIN = windows(MID, 600, 77, 0.2);
const NEAR_WIN = windows(NEAR, 640, 99, 0.12);

const STARS = (() => {
  const r = rng(3);
  return Array.from({ length: 36 }, () => ({ x: r() * 1600, y: r() * 260, r: 0.6 + r() * 1.2, d: r() * 5 }));
})();

function LagosSceneInner() {
  return (
    <div className="scene" aria-hidden="true">
      <svg className="scene-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" focusable="false">
        <defs>
          <linearGradient id="sc-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#16113a" />
            <stop offset="0.35" stopColor="#5b2a6e" />
            <stop offset="0.6" stopColor="#d9594b" />
            <stop offset="0.78" stopColor="#f6a24a" />
            <stop offset="1" stopColor="#ffd98a" />
          </linearGradient>
          <radialGradient id="sc-sun" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#fff6d6" stopOpacity="1" />
            <stop offset="0.25" stopColor="#ffd58a" stopOpacity="0.9" />
            <stop offset="1" stopColor="#ff9d4a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="sc-water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e98a4c" />
            <stop offset="0.25" stopColor="#8a4a5e" />
            <stop offset="1" stopColor="#1a1436" />
          </linearGradient>
          <linearGradient id="sc-glint" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff0c4" stopOpacity="0.85" />
            <stop offset="1" stopColor="#ffc46a" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="sc-vig" cx="0.5" cy="0.5" r="0.75">
            <stop offset="0.55" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#0a0610" stopOpacity="0.7" />
          </radialGradient>
        </defs>

        <rect width="1600" height="900" fill="url(#sc-sky)" />
        <g className="scene-stars">
          {STARS.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" style={{ animationDelay: `${s.d}s` }} />
          ))}
        </g>
        <circle className="scene-sun" cx="860" cy="560" r="220" fill="url(#sc-sun)" />
        <circle cx="860" cy="565" r="46" fill="#fff4cf" />

        <g className="scene-clouds">
          <g className="scene-cloud c1">
            <ellipse cx="260" cy="190" rx="170" ry="22" fill="#ff9a6b" opacity="0.55" />
            <ellipse cx="340" cy="176" rx="110" ry="14" fill="#ffd7a1" opacity="0.5" />
          </g>
          <g className="scene-cloud c2">
            <ellipse cx="1050" cy="130" rx="230" ry="26" fill="#c75a7a" opacity="0.5" />
            <ellipse cx="1130" cy="118" rx="140" ry="14" fill="#ffc48a" opacity="0.45" />
          </g>
          <g className="scene-cloud c3">
            <ellipse cx="640" cy="300" rx="190" ry="16" fill="#ffb679" opacity="0.5" />
          </g>
        </g>

        <g className="scene-layer far">
          <g fill="#6a3a62" opacity="0.8">{FAR.map((t, i) => <path key={i} d={towerPath(t, 600)} />)}</g>
        </g>

        <g className="scene-layer mid">
          <g fill="#3c2250">
            {MID.map((t, i) => <path key={i} d={towerPath(t, 610)} />)}
            {/* A mosque with two minarets, and a cathedral spire, among the towers */}
            <path d="M980 610V520Q1020 450 1060 520V610Z" />
            <rect x="964" y="470" width="8" height="140" />
            <rect x="1068" y="470" width="8" height="140" />
            <path d="M960 470L968 440L976 470Z M1064 470L1072 440L1080 470Z" />
          </g>
          <g fill="#ffd98a">
            {MID_WIN.map((w, i) => <rect key={i} x={w.x} y={w.y} width="3" height="5" className={w.s ? "scene-win blink" : "scene-win"} style={{ animationDelay: `${w.d}s` }} />)}
          </g>
        </g>

        {/* The bridge over the lagoon, with cars crossing */}
        <g className="scene-bridge">
          <path d="M-20 640 Q400 614 800 622 T1620 604" fill="none" stroke="#150c24" strokeWidth="8" />
          <path d="M-20 650 Q400 624 800 632 T1620 614" fill="none" stroke="#150c24" strokeWidth="3" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <g key={i} className={`scene-car${i % 2 ? " back" : ""}`} style={{ animationDelay: `${-i * 3.1}s`, animationDuration: `${16 + (i % 3) * 4}s` }}>
              <circle cx="0" cy="626" r="2.4" fill={i % 2 ? "#ff5a4a" : "#fff3c4"} />
              <circle cx="7" cy="626" r="2.4" fill={i % 2 ? "#ff5a4a" : "#fff3c4"} />
            </g>
          ))}
        </g>

        <g className="scene-layer near">
          <g fill="#1e1236">{NEAR.map((t, i) => <path key={i} d={towerPath(t, 660)} />)}</g>
          <g fill="#ffbf5a">
            {NEAR_WIN.map((w, i) => <rect key={i} x={w.x} y={w.y + 0} width="3" height="5" className="scene-win" style={{ animationDelay: `${w.d}s` }} />)}
          </g>
        </g>

        <rect y="660" width="1600" height="240" fill="url(#sc-water)" />
        <path className="scene-glint" d="M832 662 L888 662 L990 900 L730 900Z" fill="url(#sc-glint)" />
        <g className="scene-waves" stroke="#ffd7a1" strokeLinecap="round">
          {Array.from({ length: 22 }, (_, i) => {
            const y = 676 + i * 10 + (i * i) / 6;
            const x = (i * 211) % 1500;
            return <line key={i} x1={x} x2={x + 40 + i * 4} y1={y} y2={y} strokeWidth={1 + i / 14} opacity={0.18 + (i % 4) * 0.06} style={{ animationDelay: `${-(i % 7) * 0.9}s` }} />;
          })}
        </g>

        {/* A fishing canoe drifting by */}
        <g className="scene-boat">
          <path d="M0 790 Q40 810 130 790 L118 784 Q60 796 8 784Z" fill="#120a1e" />
          <path d="M60 788 V736 L98 780Z" fill="#2a1a3a" />
          <rect x="60" y="734" width="2" height="54" fill="#120a1e" />
        </g>

        {/* Palms in the foreground */}
        <g className="scene-palm left">
          <path d="M70 900 Q92 740 60 600" stroke="#0c0716" strokeWidth="10" fill="none" strokeLinecap="round" />
          <g fill="#0c0716">
            <path d="M60 600 Q10 560 -50 590 Q20 570 60 600Z" />
            <path d="M60 600 Q40 540 -10 520 Q50 540 60 600Z" />
            <path d="M60 600 Q90 540 150 540 Q90 560 60 600Z" />
            <path d="M60 600 Q130 590 170 640 Q110 600 60 600Z" />
            <path d="M60 600 Q70 550 100 500 Q70 540 60 600Z" />
          </g>
        </g>
        <g className="scene-palm right">
          <path d="M1540 900 Q1510 760 1560 620" stroke="#0c0716" strokeWidth="9" fill="none" strokeLinecap="round" />
          <g fill="#0c0716">
            <path d="M1560 620 Q1620 580 1680 610 Q1610 590 1560 620Z" />
            <path d="M1560 620 Q1590 560 1650 550 Q1590 570 1560 620Z" />
            <path d="M1560 620 Q1510 570 1450 580 Q1510 590 1560 620Z" />
            <path d="M1560 620 Q1470 620 1440 670 Q1500 630 1560 620Z" />
          </g>
        </g>

        <g className="scene-birds" fill="none" stroke="#1a0f2a" strokeWidth="1.6" strokeLinecap="round">
          {[0, 1, 2, 3].map((i) => (
            <path key={i} d="M0 0 Q6 -6 12 0 Q18 -6 24 0" style={{ animationDelay: `${-i * 4.5}s`, transform: `translateY(${i * 22}px)` }} className="scene-bird" />
          ))}
        </g>

        <rect width="1600" height="900" fill="url(#sc-vig)" />
      </svg>
      <div className="scene-bars top" />
      <div className="scene-bars bottom" />
      <div className="scene-grain" />
    </div>
  );
}

export const LagosScene = memo(LagosSceneInner);
