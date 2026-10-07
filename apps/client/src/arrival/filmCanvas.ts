// The opening film, drawn on one 2D canvas: the flight, a proper landing (glide, flare, touchdown, tyre smoke, roll-out), the taxi to the
// terminal, the ride through Lagos in a vehicle that matches the person's background, and the arrival at their door. Skylines, glows and
// clouds are painted once into small off-screen images and then only moved, so it stays smooth on weak phones.

export type Tier = "lapo" | "middle" | "nepo";
export type FilmBeat = "flight" | "landing" | "taxi" | "ride" | "home" | "welcome";

const H = 900;

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

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => t * t * (3 - 2 * t);

const TINT: Record<Tier, string> = { nepo: "rgba(255,200,110,.10)", middle: "rgba(255,255,255,0)", lapo: "rgba(60,80,140,.16)" };

interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  age: number;
}

export class FilmRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly glow: HTMLCanvasElement;
  private readonly clouds: HTMLCanvasElement[] = [];
  private readonly sky: HTMLCanvasElement;
  private readonly skies: Record<"day" | "night" | "dawn", HTMLCanvasElement>;
  private readonly farDay: HTMLCanvasElement;
  private readonly midDay: HTMLCanvasElement;
  private hour = 12;
  private readonly farTile: HTMLCanvasElement;
  private readonly midTile: HTMLCanvasElement;
  private readonly nearTile: HTMLCanvasElement;
  private readonly stars: { x: number; y: number; r: number }[];
  private readonly grain: HTMLCanvasElement;
  private beat: FilmBeat = "flight";
  private t = 0;
  private world = 0;
  private puffs: Puff[] = [];
  private lastPuff = 0;
  private w = 1600;
  private cw = 1;
  private ch = 1;
  private scale = 1;
  /** A lighter picture for a scene that only has to look nice for a few seconds (the welcome back): fewer pixels, no paper grain. */
  lite = false;
  private frame = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly tier: Tier,
  ) {
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    // A soft white glow, tinted when drawn with "lighter".
    const [g, gc] = makeCanvas(128, 128);
    const grad = gc.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.25, "rgba(255,255,255,.55)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    gc.fillStyle = grad;
    gc.fillRect(0, 0, 128, 128);
    this.glow = g;

    // The dusk sky (stretched when drawn).
    const [s, sc] = makeCanvas(4, 256);
    const sg = sc.createLinearGradient(0, 0, 0, 256);
    sg.addColorStop(0, "#120e34");
    sg.addColorStop(0.3, "#4a2870");
    sg.addColorStop(0.55, "#c9534f");
    sg.addColorStop(0.78, "#f59a48");
    sg.addColorStop(1, "#ffd98a");
    sc.fillStyle = sg;
    sc.fillRect(0, 0, 4, 256);
    this.sky = s;
    const gradient = (stops: [number, string][]) => {
      const [c, cc] = makeCanvas(4, 256);
      const g = cc.createLinearGradient(0, 0, 0, 256);
      for (const [o, col] of stops) g.addColorStop(o, col);
      cc.fillStyle = g;
      cc.fillRect(0, 0, 4, 256);
      return c;
    };
    this.skies = {
      day: gradient([[0, "#2f74c8"], [0.55, "#6fa8e0"], [1, "#cfe4f4"]]),
      night: gradient([[0, "#050818"], [0.6, "#101a3a"], [1, "#27345e"]]),
      dawn: gradient([[0, "#243a78"], [0.45, "#8a6aa8"], [0.75, "#f0a077"], [1, "#ffd9a0"]]),
    };
    const r = rng(7);
    this.stars = Array.from({ length: 60 }, () => ({ x: r(), y: r() * 0.4, r: 0.6 + r() * 1.2 }));

    for (let i = 0; i < 3; i++) {
      const [c, cc] = makeCanvas(512, 128);
      const rr = rng(40 + i);
      for (let k = 0; k < 9; k++) {
        const x = 90 + rr() * 330, y = 54 + rr() * 26, rad = 40 + rr() * 60;
        const cg = cc.createRadialGradient(x, y, 0, x, y, rad);
        cg.addColorStop(0, "rgba(255,190,150,.55)");
        cg.addColorStop(1, "rgba(255,150,120,0)");
        cc.fillStyle = cg;
        cc.save();
        cc.translate(x, y);
        cc.scale(1.8, 0.45);
        cc.translate(-x, -y);
        cc.fillRect(x - rad, y - rad, rad * 2, rad * 2);
        cc.restore();
      }
      this.clouds.push(c);
    }
    // paper grain, laid over everything so the film has the same hand-painted surface as the rooms
    const [grainCanvas, grainCtx] = makeCanvas(256, 256);
    const gd = grainCtx.createImageData(256, 256);
    const gr_ = rng(99);
    for (let i = 0; i < gd.data.length; i += 4) {
      const v = 120 + gr_() * 135;
      gd.data[i] = gd.data[i + 1] = gd.data[i + 2] = v;
      gd.data[i + 3] = 255;
    }
    grainCtx.putImageData(gd, 0, 0);
    this.grain = grainCanvas;
    this.farTile = this.skylineTile(11, 100, 250, "#4b2a62", "#ffcf80", 0.05);
    this.midTile = this.skylineTile(23, 140, 360, "#2c1a40", "#ffd27a", 0.12);
    this.nearTile = this.skylineTile(5, 60, 170, "#170d27", "#ffbf5a", 0.16);
    this.farDay = this.skylineTile(11, 100, 250, "#8d9cbc", "#ffffff", 0.03);
    this.midDay = this.skylineTile(23, 140, 360, "#566a92", "#e8f0ff", 0.05);
  }

  /** A strip of towers, a mosque and a church spire, that repeats seamlessly every 1600 px. */
  private skylineTile(seed: number, minH: number, maxH: number, fill: string, win: string, density: number): HTMLCanvasElement {
    const [c, cc] = makeCanvas(1600, 420);
    const r = rng(seed);
    let x = 4;
    while (x < 1580) {
      const w = 28 + r() * 54;
      const h = minH + r() * (maxH - minH);
      cc.fillStyle = fill;
      const top = r();
      if (top > 0.9) {
        cc.fillRect(x, 420 - h, w, h);
        cc.beginPath();
        cc.moveTo(x + w * 0.4, 420 - h);
        cc.lineTo(x + w / 2, 420 - h - 40);
        cc.lineTo(x + w * 0.6, 420 - h);
        cc.fill();
      } else if (top > 0.82) {
        cc.fillRect(x, 420 - h + 16, w, h - 16);
        cc.fillRect(x + w * 0.2, 420 - h, w * 0.6, 16);
      } else if (top > 0.76) {
        cc.beginPath();
        cc.moveTo(x, 420);
        cc.lineTo(x, 420 - h);
        cc.quadraticCurveTo(x + w / 2, 420 - h - w * 0.6, x + w, 420 - h);
        cc.lineTo(x + w, 420);
        cc.fill();
      } else cc.fillRect(x, 420 - h, w, h);
      cc.fillStyle = win;
      for (let wy = 420 - h + 8; wy < 410; wy += 15) for (let wx = x + 5; wx < x + w - 5; wx += 10) if (r() < density) cc.fillRect(wx, wy, 3, 5);
      x += w + r() * 8;
    }
    return c;
  }

  /** The Lagos hour of day, for the welcome-back scene's sky. */
  setHour(hour: number): void {
    this.hour = hour;
  }

  setBeat(beat: FilmBeat): void {
    this.beat = beat;
    this.t = 0;
    this.world = 0;
    this.puffs = [];
  }

  private resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const cw = Math.max(1, Math.round(this.canvas.clientWidth * dpr)), ch = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    // Never more than about 1.2 million pixels: a big phone screen is drawn a little smaller and stretched by the browser.
    const k = Math.min(1, Math.sqrt((this.lite ? 480_000 : 1_200_000) / (cw * ch)));
    const w = Math.round(cw * k), h = Math.round(ch * k);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.cw = w;
    this.ch = h;
    this.scale = h / H;
    this.w = w / this.scale;
  }

  draw(dt: number): void {
    if (!this.lite || this.frame++ % 30 === 0) this.resize();
    this.t += dt;
    const c = this.ctx;
    c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = 1;
    if (this.beat === "flight") this.flight(c, dt);
    else if (this.beat === "landing" || this.beat === "taxi") this.landing(c, dt);
    else if (this.beat === "ride") this.ride(c, dt);
    else if (this.beat === "welcome") this.welcome(c, dt);
    else this.home(c, dt);
    c.fillStyle = TINT[this.tier];
    c.fillRect(0, 0, this.w, H);
    if (this.lite) return;
    // hand-painted paper grain
    c.save();
    c.globalCompositeOperation = "overlay";
    c.globalAlpha = 0.16;
    const jitter = Math.floor(this.t * 6) % 3;
    for (let x = -jitter * 17; x < this.w; x += 256) for (let y = -jitter * 11; y < H; y += 256) c.drawImage(this.grain, x, y);
    c.restore();
  }

  // ---------------------------------------------------------------- shared pieces

  private drawSky(c: CanvasRenderingContext2D, sunX: number, sunY: number, starsOn = true) {
    c.drawImage(this.sky, 0, 0, 4, 256, 0, 0, this.w, H);
    if (starsOn) {
      c.fillStyle = "rgba(255,255,255,.8)";
      for (const s of this.stars) c.fillRect(s.x * this.w, s.y * H, s.r, s.r);
    }
    this.light(c, sunX, sunY, 700, "rgba(255,210,140,.55)");
    c.fillStyle = "#fff4cf";
    c.beginPath();
    c.arc(sunX, sunY, 42, 0, Math.PI * 2);
    c.fill();
  }

  private light(c: CanvasRenderingContext2D, x: number, y: number, size: number, colour: string) {
    const prev = c.globalCompositeOperation;
    c.globalCompositeOperation = "lighter";
    c.globalAlpha = 1;
    // Tint the white glow by drawing it, then it adds in the colour of the fillStyle through a second small canvas would be costly; so
    // the colour is a multiply-free approximation: scale the glow and set the alpha from the colour.
    const m = /rgba\((\d+),(\d+),(\d+),([\d.]+)\)/.exec(colour);
    c.globalAlpha = m ? parseFloat(m[4]!) : 0.5;
    c.drawImage(this.glow, x - size / 2, y - size / 2, size, size);
    c.globalAlpha = 1;
    c.globalCompositeOperation = prev;
  }

  private tile(c: CanvasRenderingContext2D, img: HTMLCanvasElement, offset: number, baseY: number) {
    const o = ((offset % 1600) + 1600) % 1600;
    for (let x = -o; x < this.w; x += 1600) c.drawImage(img, x, baseY - 420);
  }

  private cloudLayer(c: CanvasRenderingContext2D, speed: number, y: number, which: number, alpha: number) {
    const img = this.clouds[which]!;
    c.globalAlpha = alpha;
    const o = (this.t * speed) % 700;
    for (let x = -o - 200; x < this.w + 300; x += 700) c.drawImage(img, x, y, 512 * 1.4, 128 * 1.4);
    c.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- the aeroplane

  private plane(c: CanvasRenderingContext2D, x: number, y: number, size: number, pitch: number, gear: number, wheelsDown: boolean, jet: boolean, nose = 0) {
    c.save();
    c.translate(x, y);
    c.rotate(pitch);
    const k = size / 560;
    c.scale(k, k);
    // tail fin and stabiliser
    c.fillStyle = "#1f7a4a";
    c.beginPath();
    c.moveTo(-250, -18);
    c.lineTo(-312, -128);
    c.lineTo(-240, -128);
    c.lineTo(-150, -24);
    c.fill();
    c.strokeStyle = "#3a2418";
    c.lineWidth = 3;
    c.lineJoin = "round";
    c.stroke();
    c.fillStyle = "#cfcac2";
    c.beginPath();
    c.moveTo(-250, -4);
    c.lineTo(-312, -48);
    c.lineTo(-262, -48);
    c.lineTo(-170, -4);
    c.fill();
    c.strokeStyle = "#3a2418";
    c.lineWidth = 3;
    c.lineJoin = "round";
    c.stroke();
    // far wing, then the body
    c.fillStyle = "#9c93a2";
    c.beginPath();
    c.moveTo(20, 8);
    c.lineTo(-40, -34);
    c.lineTo(-10, -34);
    c.lineTo(80, 8);
    c.fill();
    c.strokeStyle = "#3a2418";
    c.lineWidth = 3;
    c.lineJoin = "round";
    c.stroke();
    const fg = c.createLinearGradient(0, -30, 0, 32);
    fg.addColorStop(0, "#f6efe6");
    fg.addColorStop(0.55, "#d9d0cf");
    fg.addColorStop(1, "#8f7a96");
    c.fillStyle = fg;
    c.beginPath();
    c.moveTo(-262, -16);
    c.lineTo(150, -30);
    c.quadraticCurveTo(262, -26, 282, 6);
    c.quadraticCurveTo(262, 28, 200, 30);
    c.lineTo(-200, 24);
    c.quadraticCurveTo(-250, 18, -262, -16);
    c.fill();
    c.strokeStyle = "#3a2418";
    c.lineWidth = 3;
    c.lineJoin = "round";
    c.stroke();
    // stripe and windows
    c.fillStyle = "#1f7a4a";
    c.fillRect(-230, 2, 470, 5);
    c.fillStyle = "#ffd98a";
    for (let i = 0; i < 26; i++) c.fillRect(-190 + i * 12.5, -10, 5, 6);
    c.fillStyle = "#221a30";
    c.beginPath();
    c.moveTo(214, -12);
    c.lineTo(250, -10);
    c.lineTo(262, -2);
    c.lineTo(222, -2);
    c.fill();
    c.strokeStyle = "#3a2418";
    c.lineWidth = 3;
    c.lineJoin = "round";
    c.stroke();
    // near wing and engine
    c.fillStyle = "#b8b0ba";
    c.beginPath();
    c.moveTo(60, 14);
    c.lineTo(-120, 84);
    c.lineTo(-84, 84);
    c.lineTo(110, 14);
    c.fill();
    c.strokeStyle = "#3a2418";
    c.lineWidth = 3;
    c.lineJoin = "round";
    c.stroke();
    c.fillStyle = "#5c5368";
    c.beginPath();
    c.ellipse(jet ? -40 : -10, 54, 54, 17, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#3a2418";
    c.lineWidth = 3;
    c.lineJoin = "round";
    c.stroke();
    c.fillStyle = "#d9d0cf";
    c.beginPath();
    c.ellipse(jet ? 6 : 36, 54, 10, 15, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#3a2418";
    c.lineWidth = 3;
    c.lineJoin = "round";
    c.stroke();
    // landing gear
    if (gear > 0) {
      c.strokeStyle = "#2a2433";
      c.lineWidth = 6;
      c.lineCap = "round";
      for (const gx of [190, -30]) {
        const len = 44 * gear;
        c.beginPath();
        c.moveTo(gx, 26);
        c.lineTo(gx, 26 + len);
        c.stroke();
        if (gear > 0.85) {
          c.fillStyle = "#15111c";
          c.beginPath();
          c.arc(gx, 26 + len + 8, 15, 0, Math.PI * 2);
          c.fill();
          c.strokeStyle = "#3a2418";
          c.lineWidth = 3;
          c.lineJoin = "round";
          c.stroke();
        }
      }
    }
    void wheelsDown;
    void nose;
    // lights
    const blink = Math.floor(this.t * 2) % 2 === 0;
    this.lightPoint(c, -308, -126, blink ? "#ff4a3a" : "#552018", 18);
    this.lightPoint(c, -118, 84, "#ff3d3d", 14);
    this.lightPoint(c, 282, 6, "#fff5d8", 16);
    c.restore();
  }

  private lightPoint(c: CanvasRenderingContext2D, x: number, y: number, colour: string, r: number) {
    c.fillStyle = colour;
    c.beginPath();
    c.arc(x, y, r * 0.22, 0, Math.PI * 2);
    c.fill();
    const prev = c.globalCompositeOperation;
    c.globalCompositeOperation = "lighter";
    c.globalAlpha = 0.5;
    c.drawImage(this.glow, x - r * 2, y - r * 2, r * 4, r * 4);
    c.globalAlpha = 1;
    c.globalCompositeOperation = prev;
  }

  // ---------------------------------------------------------------- welcome back

  /** Lagos at the real time of day, slowly drifting past: the skyline, the sun or moon, a few lights coming on. */
  private welcome(c: CanvasRenderingContext2D, dt: number) {
    void dt;
    const h = this.hour;
    const night = h < 5 || h >= 19.5;
    const dawn = (h >= 5 && h < 7.2) || (h >= 17.3 && h < 19.5);
    const day = !night && !dawn;
    const sky = night ? this.skies.night : dawn ? (h < 12 ? this.skies.dawn : this.sky) : this.skies.day;
    c.drawImage(sky, 0, 0, 4, 256, 0, 0, this.w, H);
    if (night) {
      c.fillStyle = "rgba(255,255,255,.85)";
      for (const s of this.stars) c.fillRect(s.x * this.w, s.y * H * 1.4, s.r, s.r);
    }
    // sun or moon on its way across the sky
    const t = night ? (((h + 24 - 19.5) % 24) / 9.5) : clamp01((h - 6) / 12);
    const sx = lerp(this.w * 0.12, this.w * 0.88, t), sy = 520 - Math.sin(t * Math.PI) * 330;
    if (night) {
      c.fillStyle = "#f2f0e2";
      c.beginPath();
      c.arc(sx, sy, 30, 0, Math.PI * 2);
      c.fill();
      this.light(c, sx, sy, 400, "rgba(180,200,255,.35)");
    } else {
      this.light(c, sx, sy, 800, dawn ? "rgba(255,200,140,.55)" : "rgba(255,246,214,.6)");
      c.fillStyle = "#fffbe8";
      c.beginPath();
      c.arc(sx, sy, 40, 0, Math.PI * 2);
      c.fill();
    }
    this.cloudLayer(c, 14, 150, 0, day ? 0.35 : 0.5);
    const drift = this.t * 18;
    this.tile(c, day ? this.farDay : this.farTile, drift * 0.3, 700);
    this.tile(c, day ? this.midDay : this.midTile, drift * 0.7, 720);
    this.tile(c, this.nearTile, drift * 1.4, 760);
    // street level
    const ground = c.createLinearGradient(0, 700, 0, H);
    ground.addColorStop(0, night ? "#10101a" : "#2a2733");
    ground.addColorStop(1, "#08070c");
    c.fillStyle = ground;
    c.fillRect(0, 740, this.w, H - 740);
    if (night || dawn) {
      for (let x = -((drift * 2.2) % 320) + 60; x < this.w; x += 320) {
        c.fillStyle = "#120b20";
        c.fillRect(x, 520, 8, 230);
        this.lightPoint(c, x + 4, 520, "#ffd58a", 150);
      }
    }
  }

  // ---------------------------------------------------------------- the flight

  private flight(c: CanvasRenderingContext2D, dt: number) {
    void dt;
    this.drawSky(c, this.w * 0.72, 620);
    this.cloudLayer(c, 30, 140, 0, 0.7);
    this.cloudLayer(c, 55, 380, 1, 0.8);
    // a sea of cloud tops far below
    const low = c.createLinearGradient(0, 640, 0, H);
    low.addColorStop(0, "rgba(120,60,110,0)");
    low.addColorStop(1, "rgba(30,16,50,.95)");
    c.fillStyle = low;
    c.fillRect(0, 640, this.w, H - 640);
    this.cloudLayer(c, 160, 600, 2, 0.9);
    const bob = Math.sin(this.t * 1.3) * 6;
    const approach = ease(clamp01(this.t / 5));
    this.plane(c, lerp(this.w * 0.28, this.w * 0.52, approach), 330 + bob, Math.min(this.w * 0.62, 640), -0.02 + Math.sin(this.t * 0.9) * 0.01, 0, false, this.tier === "nepo");
    // engine trail
    this.light(c, lerp(this.w * 0.28, this.w * 0.52, approach) - 330, 335 + bob, 120, "rgba(255,200,160,.18)");
  }

  // ---------------------------------------------------------------- the landing and the taxi

  private landing(c: CanvasRenderingContext2D, dt: number) {
    const taxi = this.beat === "taxi";
    const t = this.t;
    const GROUND = 700;
    // Forward speed (px per second): fast on the glide, braking hard after touchdown, then a slow taxi.
    const TOUCH = 5.4;
    let speed: number;
    if (taxi) speed = lerp(110, 70, clamp01(t / 4));
    else if (t < TOUCH) speed = 420 + 80 * ease(t / TOUCH);
    else speed = lerp(500, 110, ease(clamp01((t - TOUCH) / 2.6)));
    this.world += speed * dt;

    this.drawSky(c, this.w * 0.78, 560);
    this.cloudLayer(c, 12, 120, 0, 0.55);
    this.tile(c, this.farTile, this.world * 0.04, GROUND - 20);
    this.tile(c, this.midTile, this.world * 0.1, GROUND - 6);
    this.terminal(c, GROUND, taxi ? lerp(this.w * 1.05, this.w * 0.56, ease(clamp01(t / 4))) : this.w * 1.6 - this.world * 0.18);

    // The ground: grass, then the runway with its lights.
    c.fillStyle = "#141a12";
    c.fillRect(0, GROUND - 4, this.w, H - GROUND + 4);
    const rw = c.createLinearGradient(0, GROUND + 10, 0, H);
    rw.addColorStop(0, "#2a2a33");
    rw.addColorStop(1, "#0d0c12");
    c.fillStyle = rw;
    c.fillRect(0, GROUND + 14, this.w, H - GROUND - 14);
    // centre dashes and edge lights race past
    c.fillStyle = "#d8d2bc";
    const o = this.world % 220;
    for (let x = -o; x < this.w; x += 220) c.fillRect(x, GROUND + 120, 110, 7);
    for (let x = -(this.world % 150); x < this.w; x += 150) {
      this.lightPoint(c, x, GROUND + 22, "#ffe9a8", 26);
      this.lightPoint(c, x, GROUND + 196, "#ffe9a8", 34);
    }
    if (!taxi) {
      // threshold lights, flashing in a sequence towards the runway (the "rabbit")
      for (let i = 0; i < 12; i++) {
        const lx = this.w * 0.9 + i * 80 - this.world * 0.9 + (this.world > 9999 ? 0 : 0);
        const on = Math.floor(this.t * 12) % 12 === i;
        this.lightPoint(c, lx, GROUND - 8, on ? "#ffffff" : "#ffb347", on ? 40 : 22);
      }
    }

    // The aeroplane: glide in on a shallow slope, flare, touch down, nose down, roll.
    const size = Math.min(this.w * 0.62, 620);
    const px = this.w * 0.36;
    let py: number, pitch: number, gear: number;
    if (taxi) {
      py = GROUND + 62 - 44;
      pitch = 0;
      gear = 1;
    } else {
      const glide = clamp01(t / TOUCH);
      const alt = 330 * Math.pow(1 - glide, 1.6);
      py = GROUND - 44 + 62 - alt;
      gear = clamp01((t - 0.4) / 1.4);
      const flare = clamp01((t - 3.4) / 1.6);
      pitch = lerp(0.05, -0.065, ease(flare));
      if (t > TOUCH) pitch = lerp(-0.065, 0.015, ease(clamp01((t - TOUCH) / 0.9))) + (t < TOUCH + 0.3 ? Math.sin((t - TOUCH) * 30) * 0.004 : 0);
    }
    const bump = !taxi && t > TOUCH && t < TOUCH + 0.4 ? Math.sin(((t - TOUCH) / 0.4) * Math.PI) * 5 : 0;
    this.plane(c, px, py + bump, size, pitch, gear, true, this.tier === "nepo");

    // Tyre smoke and a flash of sparks at touchdown.
    if (!taxi && t > TOUCH && t < TOUCH + 1.8) {
      this.lastPuff -= dt;
      if (this.lastPuff <= 0) {
        this.lastPuff = 0.03;
        const k = size / 560;
        for (const gx of [190, -30]) this.puffs.push({ x: px + gx * k, y: GROUND + 60, vx: -speed * 0.9 + (Math.random() - 0.5) * 80, vy: -20 - Math.random() * 30, r: 10 + Math.random() * 16, life: 1.4 + Math.random() * 0.8, age: 0 });
      }
    }
    for (const p of this.puffs) {
      p.age += dt;
      p.x += (p.vx - speed * 0.0) * dt;
      p.y += p.vy * dt;
      p.vx *= 0.985;
      p.r += 22 * dt;
    }
    this.puffs = this.puffs.filter((p) => p.age < p.life);
    for (const p of this.puffs) {
      c.globalAlpha = (1 - p.age / p.life) * 0.45;
      c.fillStyle = "#cfc8d6";
      c.beginPath();
      c.arc(p.x - this.world * 0 , p.y, p.r, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    // a shudder at touchdown
    if (!taxi && t > TOUCH && t < TOUCH + 0.5) {
      c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    }
  }

  private terminal(c: CanvasRenderingContext2D, ground: number, x: number) {
    // Terminal building with a glass front, a jet bridge, and the control tower.
    c.fillStyle = "#1b1230";
    c.fillRect(x, ground - 130, 760, 130);
    c.fillStyle = "#2c1d46";
    c.fillRect(x - 20, ground - 150, 800, 24);
    const r = rng(3);
    for (let i = 0; i < 38; i++) {
      c.fillStyle = r() < 0.8 ? "#ffd98a" : "#7a5a9a";
      c.fillRect(x + 14 + i * 19.5, ground - 108, 13, 58);
    }
    // the tower
    c.fillStyle = "#231640";
    c.fillRect(x + 820, ground - 320, 26, 320);
    c.fillStyle = "#33205a";
    c.beginPath();
    c.moveTo(x + 790, ground - 320);
    c.lineTo(x + 876, ground - 320);
    c.lineTo(x + 860, ground - 372);
    c.lineTo(x + 806, ground - 372);
    c.fill();
    c.fillStyle = "#9fe8ff";
    c.fillRect(x + 808, ground - 366, 50, 22);
    this.lightPoint(c, x + 833, ground - 380, Math.floor(this.t * 1.5) % 2 ? "#ff4a3a" : "#601810", 22);
    // sign
    c.fillStyle = "#f6efe6";
    c.font = "700 30px sans-serif";
    c.fillText("MURTALA MUHAMMED", x + 40, ground - 160);
    // jet bridge
    c.fillStyle = "#3a2a58";
    c.fillRect(x - 150, ground - 78, 150, 20);
    c.fillStyle = "#2a1d44";
    c.fillRect(x - 160, ground - 98, 24, 98);
  }

  // ---------------------------------------------------------------- the ride

  private ride(c: CanvasRenderingContext2D, dt: number) {
    const t = this.t;
    const speed = lerp(280, 760, ease(clamp01(t / 1.4)));
    this.world += speed * dt;
    const ROAD = 650;
    this.drawSky(c, this.w * 0.2, 470, false);
    this.cloudLayer(c, 8, 90, 1, 0.5);
    this.tile(c, this.farTile, this.world * 0.05, ROAD - 30);
    this.tile(c, this.midTile, this.world * 0.12, ROAD - 10);
    this.shopfronts(c, ROAD);
    // the road
    const rg = c.createLinearGradient(0, ROAD, 0, H);
    rg.addColorStop(0, "#2b2833");
    rg.addColorStop(1, "#0b0a10");
    c.fillStyle = "#4a4150";
    c.fillRect(0, ROAD - 6, this.w, 22);
    c.fillStyle = rg;
    c.fillRect(0, ROAD + 12, this.w, H - ROAD - 12);
    c.fillStyle = "#d8d2bc";
    const od = this.world % 260;
    for (let x = -od; x < this.w; x += 260) c.fillRect(x, 732, 120, 6);
    // street lamps pass in front of everything on the pavement
    const lampGap = 520;
    for (let x = -(this.world % lampGap) + 120; x < this.w + 40; x += lampGap) {
      c.fillStyle = "#120b20";
      c.fillRect(x, ROAD - 250, 9, 262);
      c.fillRect(x, ROAD - 250, 60, 8);
      this.lightPoint(c, x + 56, ROAD - 240, "#ffd58a", 150);
    }
    // traffic coming the other way (smaller, higher up the road) and an okada passing
    this.oncoming(c, ROAD + 70, 0.78);
    const vehicleX = this.w * 0.4;
    const bob = Math.sin(this.world * 0.04) * 2;
    if (this.tier === "nepo") {
      this.suv(c, vehicleX, 776 + bob, 1.05, "#07070b");
      this.suv(c, vehicleX - 420, 768 + Math.sin(this.world * 0.05) * 2, 0.95, "#0c0c12");
    } else if (this.tier === "middle") {
      this.taxi(c, vehicleX, 776 + bob, 1.05);
    } else {
      this.keke(c, vehicleX, 776 + bob, 1.1);
      // a danfo overtaking, loud and yellow
      const dx = lerp(-700, this.w + 500, clamp01((t - 1.2) / 5));
      this.danfo(c, dx, 756, 1.05);
    }
    // foreground people and dust at the kerb are left out to keep the frame cheap; a slight vignette comes from the page
  }

  private shopfronts(c: CanvasRenderingContext2D, road: number) {
    const gap = 330;
    const o = (this.world * 0.5) % gap;
    const r = rng(9);
    const cols = ["#6a2f3a", "#2f5a63", "#6a5a2a", "#3a2f6a", "#2f6a3f"];
    for (let i = -1; i < this.w / gap + 2; i++) {
      const x = i * gap - o;
      const k = Math.floor((this.world * 0.5) / gap) + i;
      const rr = rng(k * 7 + 3);
      void r;
      c.fillStyle = cols[((k % cols.length) + cols.length) % cols.length]!;
      c.fillRect(x, road - 120, gap - 14, 126);
      c.fillStyle = "#1a1224";
      c.fillRect(x + 12, road - 76, gap - 40, 70);
      c.fillStyle = rr() < 0.5 ? "#ffe3a0" : "#ffb86a";
      c.globalAlpha = 0.85;
      c.fillRect(x + 20, road - 70, gap - 56, 56);
      c.globalAlpha = 1;
      c.fillStyle = "#f6efe6";
      c.fillRect(x + 12, road - 112, gap - 40, 24);
      this.light(c, x + gap / 2 - 6, road - 40, 240, "rgba(168, 200, 255,.25)");
    }
  }

  private oncoming(c: CanvasRenderingContext2D, y: number, s: number) {
    const gap = 900;
    for (let i = 0; i < 2; i++) {
      const base = (i * 460 + this.world * 1.25) % (gap + this.w + 400);
      const x = this.w + 200 - base;
      c.save();
      c.translate(x, y);
      c.scale(-s, s);
      if (i === 0) this.body(c, 0, 0, 1, "#8d1f2a", true);
      else this.bikeRider(c, 0, 0, 1);
      c.restore();
    }
  }

  // ---------------------------------------------------------------- vehicles (all face right)

  private wheel(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
    c.fillStyle = "#0b0912";
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#6f6a7a";
    c.beginPath();
    c.arc(x, y, r * 0.5, 0, Math.PI * 2);
    c.fill();
    const a = this.world * 0.03 / (r / 30);
    c.strokeStyle = "#2a2733";
    c.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(a + (i * Math.PI) / 2) * r * 0.5, y + Math.sin(a + (i * Math.PI) / 2) * r * 0.5);
      c.stroke();
    }
  }

  private beams(c: CanvasRenderingContext2D, x: number, y: number, len: number) {
    const prev = c.globalCompositeOperation;
    c.globalCompositeOperation = "lighter";
    const g = c.createLinearGradient(x, 0, x + len, 0);
    g.addColorStop(0, "rgba(255,240,190,.55)");
    g.addColorStop(1, "rgba(255,240,190,0)");
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(x, y - 6);
    c.lineTo(x + len, y - 70);
    c.lineTo(x + len, y + 46);
    c.lineTo(x, y + 8);
    c.fill();
    c.globalCompositeOperation = prev;
    this.lightPoint(c, x, y, "#fff6d0", 70);
  }

  /** A saloon body: x,y is the middle of the ground contact. */
  private body(c: CanvasRenderingContext2D, x: number, y: number, k: number, colour: string, headlights: boolean) {
    c.save();
    c.translate(x, y);
    c.scale(k, k);
    c.fillStyle = "rgba(0,0,0,.35)";
    c.beginPath();
    c.ellipse(0, 4, 150, 12, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = colour;
    c.beginPath();
    c.moveTo(-150, -22);
    c.lineTo(-146, -62);
    c.quadraticCurveTo(-120, -72, -70, -74);
    c.lineTo(-30, -112);
    c.quadraticCurveTo(0, -120, 50, -112);
    c.lineTo(100, -76);
    c.quadraticCurveTo(144, -70, 152, -46);
    c.lineTo(154, -22);
    c.closePath();
    c.fill();
    c.strokeStyle = "#3a2418";
    c.lineWidth = 3;
    c.lineJoin = "round";
    c.stroke();
    c.fillStyle = "#12182a";
    c.beginPath();
    c.moveTo(-60, -76);
    c.lineTo(-28, -106);
    c.lineTo(46, -106);
    c.lineTo(88, -76);
    c.fill();
    c.strokeStyle = "#3a2418";
    c.lineWidth = 3;
    c.lineJoin = "round";
    c.stroke();
    c.fillStyle = "rgba(255,255,255,.14)";
    c.fillRect(-52, -78, 130, 4);
    this.wheel(c, -88, -24, 28);
    this.wheel(c, 94, -24, 28);
    this.lightPoint(c, -150, -54, "#ff3a3a", 40);
    if (headlights) this.beams(c, 152, -50, 360);
    c.restore();
  }

  private suv(c: CanvasRenderingContext2D, x: number, y: number, k: number, colour: string) {
    c.save();
    c.translate(x, y);
    c.scale(k, k);
    c.fillStyle = "rgba(0,0,0,.4)";
    c.beginPath();
    c.ellipse(0, 4, 175, 13, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = colour;
    c.beginPath();
    c.moveTo(-170, -26);
    c.lineTo(-170, -112);
    c.lineTo(-100, -138);
    c.lineTo(70, -140);
    c.lineTo(120, -96);
    c.quadraticCurveTo(168, -90, 174, -60);
    c.lineTo(174, -26);
    c.closePath();
    c.fill();
    c.strokeStyle = "#3a2418";
    c.lineWidth = 3;
    c.lineJoin = "round";
    c.stroke();
    const g = c.createLinearGradient(0, -138, 0, -90);
    g.addColorStop(0, "#26304a");
    g.addColorStop(1, "#0d1220");
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(-150, -102);
    c.lineTo(-96, -128);
    c.lineTo(62, -130);
    c.lineTo(104, -94);
    c.lineTo(-150, -94);
    c.fill();
    c.strokeStyle = "#3a2418";
    c.lineWidth = 3;
    c.lineJoin = "round";
    c.stroke();
    c.fillStyle = "rgba(255,255,255,.22)";
    c.fillRect(-140, -90, 270, 3);
    this.wheel(c, -104, -28, 34);
    this.wheel(c, 108, -28, 34);
    this.lightPoint(c, -170, -78, "#ff3a3a", 46);
    this.beams(c, 172, -62, 420);
    c.restore();
  }

  private taxi(c: CanvasRenderingContext2D, x: number, y: number, k: number) {
    this.body(c, x, y, k, "#f2c230", true);
    c.save();
    c.translate(x, y);
    c.scale(k, k);
    c.fillStyle = "#12121a";
    c.fillRect(-72, -122, 90, 12);
    c.fillStyle = "#f6efe6";
    c.fillRect(-66, -121, 78, 8);
    c.fillStyle = "#0b0912";
    c.fillRect(-150, -48, 304, 6);
    c.restore();
  }

  private keke(c: CanvasRenderingContext2D, x: number, y: number, k: number) {
    c.save();
    c.translate(x, y);
    c.scale(k, k);
    c.fillStyle = "rgba(0,0,0,.35)";
    c.beginPath();
    c.ellipse(0, 4, 100, 10, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#f2c230";
    c.beginPath();
    c.moveTo(-96, -30);
    c.lineTo(-96, -132);
    c.lineTo(20, -138);
    c.lineTo(52, -92);
    c.lineTo(96, -70);
    c.lineTo(100, -30);
    c.fill();
    c.strokeStyle = "#3a2418";
    c.lineWidth = 3;
    c.lineJoin = "round";
    c.stroke();
    c.fillStyle = "#14101c";
    c.fillRect(-100, -144, 128, 12);
    c.fillStyle = "#1a2236";
    c.fillRect(-84, -126, 90, 58);
    c.fillStyle = "rgba(255,255,255,.2)";
    c.fillRect(-80, -122, 20, 50);
    this.wheel(c, -62, -22, 22);
    this.wheel(c, 78, -20, 20);
    this.lightPoint(c, -96, -60, "#ff3a3a", 34);
    this.beams(c, 100, -52, 300);
    c.restore();
  }

  private danfo(c: CanvasRenderingContext2D, x: number, y: number, k: number) {
    c.save();
    c.translate(x, y);
    c.scale(k, k);
    c.fillStyle = "rgba(0,0,0,.4)";
    c.beginPath();
    c.ellipse(0, 4, 230, 14, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#e8b820";
    c.beginPath();
    c.moveTo(-230, -26);
    c.lineTo(-230, -170);
    c.lineTo(160, -170);
    c.quadraticCurveTo(220, -160, 232, -100);
    c.lineTo(232, -26);
    c.fill();
    c.strokeStyle = "#3a2418";
    c.lineWidth = 3;
    c.lineJoin = "round";
    c.stroke();
    c.fillStyle = "#0b0912";
    c.fillRect(-230, -92, 462, 18);
    c.fillStyle = "#1a2236";
    for (let i = 0; i < 6; i++) c.fillRect(-212 + i * 66, -158, 52, 50);
    this.wheel(c, -140, -26, 34);
    this.wheel(c, 150, -26, 34);
    this.lightPoint(c, -230, -80, "#ff3a3a", 44);
    this.beams(c, 230, -70, 380);
    c.restore();
  }

  private bikeRider(c: CanvasRenderingContext2D, x: number, y: number, k: number) {
    c.save();
    c.translate(x, y);
    c.scale(k, k);
    this.wheel(c, -52, -22, 24);
    this.wheel(c, 56, -22, 24);
    c.strokeStyle = "#1a1624";
    c.lineWidth = 8;
    c.beginPath();
    c.moveTo(-52, -22);
    c.lineTo(-10, -60);
    c.lineTo(40, -62);
    c.lineTo(56, -22);
    c.stroke();
    c.fillStyle = "#e7e0d4";
    c.fillRect(-30, -128, 36, 64);
    c.fillStyle = "#1a1624";
    c.beginPath();
    c.arc(-8, -146, 15, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#3a2418";
    c.lineWidth = 3;
    c.lineJoin = "round";
    c.stroke();
    c.strokeStyle = "#e7e0d4";
    c.lineWidth = 9;
    c.beginPath();
    c.moveTo(0, -112);
    c.lineTo(46, -86);
    c.stroke();
    this.lightPoint(c, 70, -62, "#fff6d0", 40);
    c.restore();
  }

  // ---------------------------------------------------------------- home

  private home(c: CanvasRenderingContext2D, dt: number) {
    const t = this.t;
    const ROAD = 690;
    void dt;
    this.drawSky(c, this.w * 0.85, 420, false);
    this.tile(c, this.farTile, 200, ROAD - 40);
    // push in slowly
    const z = 1 + t * 0.018;
    c.save();
    c.translate(this.w * 0.55, ROAD);
    c.scale(z, z);
    c.translate(-this.w * 0.55, -ROAD);
    this.house(c, ROAD, this.w * 0.55, t);
    c.fillStyle = "#17121f";
    c.fillRect(-100, ROAD, this.w + 200, H);
    c.fillStyle = "#2b2530";
    c.fillRect(-100, ROAD, this.w + 200, 18);
    // the vehicle rolls in and stops
    const arrive = ease(clamp01(t / 1.8));
    const vx = lerp(-300, this.w * 0.24, arrive);
    this.world += (1 - arrive) * 12;
    const draw = this.tier === "nepo" ? () => this.suv(c, vx, ROAD + 74, 1, "#07070b") : this.tier === "middle" ? () => this.taxi(c, vx, ROAD + 74, 1) : () => this.keke(c, vx, ROAD + 74, 1.05);
    draw();
    // a figure steps out and walks to the door once stopped
    if (t > 2) {
      const walk = clamp01((t - 2) / 1.2);
      c.fillStyle = "#0e0a16";
      const fx = lerp(vx + 40, this.w * 0.55 - 40, walk), fy = ROAD + 40;
      c.fillRect(fx - 9, fy - 92, 18, 56);
      c.beginPath();
      c.arc(fx, fy - 104, 11, 0, Math.PI * 2);
      c.fill();
      c.fillRect(fx - 8, fy - 36, 7, 36 + Math.sin(this.t * 10) * 3);
      c.fillRect(fx + 1, fy - 36, 7, 36 - Math.sin(this.t * 10) * 3);
    }
    c.restore();
  }

  private house(c: CanvasRenderingContext2D, ground: number, cx: number, t: number) {
    const lit = "#ffd98a";
    if (this.tier === "nepo") {
      // a white duplex behind a gate and palms
      c.fillStyle = "#e6e0d6";
      c.fillRect(cx - 260, ground - 330, 520, 330);
      c.fillStyle = "#cfc8bd";
      c.fillRect(cx - 280, ground - 350, 560, 28);
      c.fillStyle = lit;
      for (let i = 0; i < 4; i++) {
        c.fillRect(cx - 230 + i * 120, ground - 290, 70, 90);
        c.fillRect(cx - 230 + i * 120, ground - 140, 70, 90);
      }
      c.fillStyle = "#2a2230";
      c.fillRect(cx - 280, ground - 90, 560, 90);
      c.fillStyle = "#14101a";
      c.fillRect(cx - 40, ground - 130, 80, 130);
      c.fillStyle = "#0c0912";
      for (let x = cx - 300; x < cx + 300; x += 16) c.fillRect(x, ground - 80, 5, 80);
    } else if (this.tier === "middle") {
      // a painted block of flats with balconies
      c.fillStyle = "#c9a96a";
      c.fillRect(cx - 220, ground - 300, 440, 300);
      c.fillStyle = "#8a6a3a";
      c.fillRect(cx - 230, ground - 316, 460, 20);
      for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) {
        c.fillStyle = (r + i) % 3 ? lit : "#3a3050";
        c.fillRect(cx - 190 + i * 100, ground - 270 + r * 90, 58, 58);
        c.fillStyle = "#3a2a1a";
        c.fillRect(cx - 198 + i * 100, ground - 206 + r * 90, 74, 6);
      }
      c.fillStyle = "#3a2a1a";
      c.fillRect(cx - 34, ground - 110, 68, 110);
    } else {
      // a one-room compound: zinc roof, a wooden door, a bulb
      c.fillStyle = "#8a7a62";
      c.fillRect(cx - 190, ground - 190, 380, 190);
      c.fillStyle = "#4a4a52";
      c.beginPath();
      c.moveTo(cx - 215, ground - 186);
      c.lineTo(cx - 140, ground - 236);
      c.lineTo(cx + 215, ground - 226);
      c.lineTo(cx + 215, ground - 186);
      c.fill();
      c.strokeStyle = "#3a2418";
      c.lineWidth = 3;
      c.lineJoin = "round";
      c.stroke();
      c.fillStyle = "#3a5a7a";
      c.fillRect(cx - 40, ground - 130, 80, 130);
      c.fillStyle = lit;
      c.fillRect(cx + 90, ground - 130, 56, 50);
      c.fillRect(cx - 150, ground - 130, 56, 50);
    }
    // the front door glows when the person arrives
    const glow = clamp01((t - 2.8) / 0.8);
    this.light(c, cx, ground - 60, 360, `rgba(255,214,140,${0.25 + glow * 0.45})`);
  }
}
