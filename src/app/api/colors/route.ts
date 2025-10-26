import { GRID_SIZE } from "@/lib/constants";

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function colorForIndex(index: number): string {
  // Deterministic but pleasant color for demo
  const rng = mulberry32(index + 12345);
  const h = Math.floor(rng() * 360);
  const s = 60 + Math.floor(rng() * 30);
  const l = 50 + Math.floor(rng() * 10);
  // Convert HSL to RGB hex
  const rgb = hslToRgb(h / 360, s / 100, l / 100);
  return rgbToHex(rgb[0], rgb[1], rgb[2]);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function rgbToHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const iParam = searchParams.get("i");
  const index = Number(iParam);
  if (!Number.isInteger(index) || index < 0 || index >= GRID_SIZE * GRID_SIZE) {
    return new Response(JSON.stringify({ error: "invalid index" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const color = colorForIndex(index);
  return new Response(JSON.stringify({ color, index }), {
    headers: { "Content-Type": "application/json" },
  });
}

export type { };
