import * as THREE from "three";
import { mulberry32, ValueNoise, lerp, clamp } from "./utils";

let glowTex: THREE.Texture | null = null;

/** Soft radial sprite used by all point-clouds (stars, galaxies, dust). */
export function getGlowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const s = 64;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.85)");
  g.addColorStop(0.55, "rgba(255,255,255,0.22)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

let nebulaTex: THREE.Texture | null = null;
/** Blobby irregular nebula sprite (multi-lobed, denser core). */
export function getNebulaTexture(): THREE.Texture {
  if (nebulaTex) return nebulaTex;
  const s = 128;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const rng = mulberry32(777);
  for (let i = 0; i < 9; i++) {
    const x = s / 2 + (rng() - 0.5) * s * 0.4;
    const y = s / 2 + (rng() - 0.5) * s * 0.4;
    const r = s * (0.12 + rng() * 0.28);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${0.32 + rng() * 0.2})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }
  // fade edges to zero
  const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.28, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,1)");
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  nebulaTex = new THREE.CanvasTexture(c);
  return nebulaTex;
}

/** Comet tail / flare streak texture. */
export function getFlareTexture(): THREE.Texture {
  const s = 128;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.2, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, s / 2); ctx.lineTo(s, s / 2); ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  return t;
}

// ------------------------------------------------------------------
// Planet surface textures (procedural, canvas based)
// ------------------------------------------------------------------

export type PlanetKind =
  | "earth" | "gasgiant" | "ice" | "rocky" | "mars" | "venus"
  | "lava" | "ocean" | "moon" | "desert";

export function makePlanetTexture(kind: PlanetKind, seed: number, hueShift = 0): THREE.Texture {
  const w = 512, h = 256;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  const noise = new ValueNoise(seed);
  const rng = mulberry32(seed * 7 + 13);

  const img = ctx.createImageData(w, h);
  const px = img.data;
  const hi = (v: number) => (v + hueShift) % 1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      // tileable horizontal coordinates
      const u = x / w, v = y / h;
      const nx = Math.cos(u * Math.PI * 2), ny = Math.sin(u * Math.PI * 2);
      const lat = Math.abs(v - 0.5) * 2; // 0 equator, 1 pole

      let r = 0, g = 0, b = 0;
      const f1 = noise.fbm(nx * 2 + 8, ny * 2 + v * 5, 5);
      const f2 = noise.fbm(nx * 4 + 30, ny * 4 + v * 10 + 9, 5);

      switch (kind) {
        case "earth": {
          const land = f1 > 0.56;
          if (land) {
            const e = (f1 - 0.56) / 0.44;
            r = lerp(74, 196, e) + f2 * 34 - 17;
            g = lerp(110, 168, e) + f2 * 34 - 17;
            b = lerp(58, 112, e) + f2 * 20 - 10;
            if (e > 0.62) { r = 166 + f2 * 40; g = 168 + f2 * 40; b = 172 + f2 * 40; } // mountains
          } else {
            const d = (0.56 - f1) / 0.56;
            r = lerp(22, 44, d);
            g = lerp(72, 104, d);
            b = lerp(136, 196, d);
          }
          if (lat > 0.86 - f2 * 0.05) { const p = (lat - 0.86 + f2 * 0.05) / 0.14; r = lerp(r, 235, p); g = lerp(g, 240, p); b = lerp(b, 246, p); }
          break;
        }
        case "moon": {
          const base = 118 + f1 * 60;
          r = g = b = base;
          break;
        }
        case "gasgiant": {
          const band = Math.sin(v * Math.PI * 10 + f1 * 5) * 0.5 + 0.5;
          const t = band * (0.4 + f2 * 0.6);
          const warm = hi(0);
          const cr: [number,number,number] = warm > 0.5 ? [236, 226, 204] : [212, 178, 138];
          r = lerp(cr[0] * 0.72, cr[0], t);
          g = lerp(cr[1] * 0.72, cr[1], t);
          b = lerp(cr[2] * 0.72, cr[2] + 14, t);
          // storm spot
          const dx = (u - 0.68), dy = (v - 0.62);
          const spot = Math.exp(-(dx * dx * 90 + dy * dy * 320));
          r += spot * 70; g += spot * 8; b -= spot * 22;
          break;
        }
        case "ice": {
          const base = 196 + f1 * 42;
          r = base - 26; g = base - 6; b = base + 10;
          const crack = Math.abs(f2 - 0.5) < 0.006 ? -90 : 0;
          r += crack * 0.4; g += crack * 0.5; b += crack * 0.3;
          if (lat > 0.8) { r += 18; g += 18; b += 16; }
          break;
        }
        case "rocky": {
          const base = 96 + f1 * 74;
          r = base + 12; g = base; b = base - 14;
          break;
        }
        case "mars": {
          const m = f1 * 0.6 + f2 * 0.4;
          r = lerp(128, 208, m);
          g = lerp(56, 112, m);
          b = lerp(34, 66, m);
          if (f2 > 0.62) { r *= 0.72; g *= 0.72; b *= 0.72; } // maria
          if (lat > 0.9 - f1 * 0.04) { const p = (lat - 0.9 + f1 * 0.04) / 0.1; r = lerp(r, 244, p); g = lerp(g, 244, p); b = lerp(b, 248, p); }
          break;
        }
        case "venus": {
          const sw = noise.fbm(nx * 3 + f2 * 3, ny * 3 + v * 8, 5);
          r = 226 + sw * 26 - 12;
          g = 198 + sw * 26 - 12;
          b = 142 + sw * 22 - 10;
          break;
        }
        case "lava": {
          const base = 26 + f1 * 40;
          r = base + 8; g = base; b = base - 4;
          const crackV = Math.abs(f2 - 0.5);
          if (crackV < 0.012) { r = 255; g = 132 + f1 * 80; b = 18; }
          else if (crackV < 0.03) { r = 150; g = 44; b = 8; }
          break;
        }
        case "ocean": {
          const d = f1;
          r = lerp(8, 32, d);
          g = lerp(42, 96, d);
          b = lerp(110, 190, d);
          if (f2 > 0.62 && f1 > 0.5) { r = 66; g = 92; b = 60; } // atoll
          if (lat > 0.88) { r = 214; g = 230; b = 238; }
          break;
        }
        case "desert": {
          const d = f1 * 0.7 + f2 * 0.3;
          r = lerp(176, 226, d);
          g = lerp(128, 178, d);
          b = lerp(78, 116, d);
          if (lat > 0.9) { r += 20; g += 20; b += 20; }
          break;
        }
      }

      px[i] = clamp(r, 0, 255);
      px[i + 1] = clamp(g, 0, 255);
      px[i + 2] = clamp(b, 0, 255);
      px[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Craters for rocky/moon-like worlds
  if (kind === "moon" || kind === "rocky") {
    const n = kind === "moon" ? 120 : 70;
    for (let i2 = 0; i2 < n; i2++) {
      const cx = rng() * w, cy = (0.06 + rng() * 0.88) * h;
      const cr = 1 + rng() * rng() * 9;
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.beginPath(); ctx.arc(cx - cr * 0.2, cy - cr * 0.2, cr * 0.7, 0, Math.PI * 2); ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** Cloud alpha layer for earth-like planets. */
export function makeCloudTexture(seed: number): THREE.Texture {
  const w = 512, h = 256;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  const noise = new ValueNoise(seed + 999);
  const img = ctx.createImageData(w, h);
  const px = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const u = x / w, v = y / h;
      const nx = Math.cos(u * Math.PI * 2), ny = Math.sin(u * Math.PI * 2);
      const f = noise.fbm(nx * 2.4 + 4, ny * 2.4 + v * 9, 5);
      const a = clamp((f - 0.52) * 4, 0, 1);
      px[i] = 255; px[i + 1] = 255; px[i + 2] = 255;
      px[i + 3] = a * 210;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/** Saturn/Uranus style ring texture (RGBA banding). */
export function makeRingTexture(seed: number): THREE.Texture {
  const w = 512, h = 8;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  const noise = new ValueNoise(seed);
  const rng = mulberry32(seed);
  const img = ctx.createImageData(w, h);
  for (let x = 0; x < w; x++) {
    const t = x / w;
    const n = noise.fbm(t * 40, 0.3, 4);
    // Cassini-like gaps
    const gap = (t > 0.44 && t < 0.5) || (t > 0.72 && t < 0.735);
    const a = gap ? 0.05 : clamp(0.25 + n * 0.85, 0, 1) * Math.min(1, t * 6) * (1 - Math.pow(t, 2.4) * 0.5);
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      const colR = lerp(170, 226, rng() * 0.03 + n);
      img.data[i] = clamp(colR, 0, 255);
      img.data[i + 1] = clamp(colR * 0.96, 0, 255);
      img.data[i + 2] = clamp(colR * 0.86, 0, 255);
      img.data[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}
