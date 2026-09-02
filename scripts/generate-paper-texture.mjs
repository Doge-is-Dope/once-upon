/**
 * Bakes the manuscript's paper textures into static tiles.
 *
 * The stylesheet previously carried these as inline feTurbulence SVG
 * data-URIs, which browsers re-rasterize whenever the surface repaints.
 * This one-off script reproduces the same layers (fine grain + broad
 * mottle, plus the graphite sheet noise) as seamless tiles, adds a
 * stamp-ink mask, and bakes the desk materials (wool felt nap, satin
 * ribbing for the bookmark, bookcloth weave), all written to
 * public/textures/.
 *
 * Deterministic: re-running always produces identical pixels.
 *
 *   node scripts/generate-paper-texture.mjs
 */

import sharp from 'sharp';
import { statSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';

const OUT_DIR = new URL('../public/textures/', import.meta.url).pathname;

/** Deterministic 2D lattice hash in [0, 1), periodic in `period`. */
function latticeHash(x, y, period, seed) {
  const ix = ((x % period) + period) % period;
  const iy = ((y % period) + period) % period;
  let h = (ix * 374761393 + iy * 668265263 + seed * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smoothstep-interpolated periodic value noise at one point. */
function valueNoise(x, y, period, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = latticeHash(x0, y0, period, seed);
  const b = latticeHash(x0 + 1, y0, period, seed);
  const c = latticeHash(x0, y0 + 1, period, seed);
  const d = latticeHash(x0 + 1, y0 + 1, period, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** Fractal (octaved) periodic value noise in [0, 1]. */
function fbm(x, y, basePeriod, octaves, seed) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;
  for (let i = 0; i < octaves; i += 1) {
    value +=
      amplitude *
      valueNoise(
        x * basePeriod * frequency,
        y * basePeriod * frequency,
        basePeriod * frequency,
        seed + i * 101,
      );
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / total;
}

function makeTile(size, paint) {
  const data = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const [r, g, b, a] = paint(x / size, y / size, x, y);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
    }
  }
  return data;
}

async function writeTile(name, size, data) {
  const file = `${OUT_DIR}${name}`;
  await sharp(data, { raw: { width: size, height: size, channels: 4 } })
    .webp({ quality: 60, alphaQuality: 55, effort: 6 })
    .toFile(file);
  console.log(`${name}: ${(statSync(file).size / 1024).toFixed(1)} KB`);
}

await mkdir(OUT_DIR, { recursive: true });

// 1. Paper grain: the sheet's fine tooth plus broad handling mottle,
//    matching the tints of the previous feTurbulence layers, with a
//    sparse scatter of darker fibre flecks for aged office stock.
{
  const size = 512;
  const data = makeTile(size, (u, v, x, y) => {
    // Fine tooth: near per-pixel fractal noise (was baseFrequency 0.85).
    const grain = fbm(u, v, 256, 2, 7);
    // Broad mottle: soft blotches (was baseFrequency 0.015, 3 octaves).
    const mottle = fbm(u, v, 8, 3, 41);
    // Sparse flecks: rare darker fibres pressed into the stock.
    const fleck = latticeHash(x, y, size, 977) > 0.9985 ? 0.35 : 0;
    const alpha = grain * 0.062 + mottle * 0.062 + fleck;
    // Blend the two layer tints by their contribution.
    const t = (mottle * 0.062) / Math.max(alpha, 0.0001);
    const r = Math.round(74 + (84 - 74) * t);
    const g = Math.round(51 + (64 - 51) * t);
    const b = Math.round(26 + (31 - 26) * t);
    return [r, g, b, alpha];
  });
  await writeTile('paper-grain.webp', size, data);
}

// 2. Graphite sheen: the pale noise that sits over the pencil rubbing
//    (was the third feTurbulence data-URI at 9% alpha).
{
  const size = 256;
  const data = makeTile(size, (u, v) => {
    const noise = fbm(u, v, 128, 2, 19);
    return [230, 222, 204, noise * 0.14];
  });
  await writeTile('graphite-grain.webp', size, data);
}

// 3. Stamp ink mask: mostly solid with starved patches, used as a
//    mask-image so a rubber stamp's ink breaks up on the paper tooth.
{
  const size = 256;
  const data = makeTile(size, (u, v) => {
    const tooth = fbm(u, v, 128, 2, 63);
    const starve = fbm(u, v, 6, 3, 87);
    // Base coverage ~0.9; the tooth nibbles it and the broad starvation
    // patches open it up to ~0.35 in the driest spots.
    const alpha = 0.92 - tooth * 0.25 - Math.max(0, starve - 0.55) * 1.1;
    return [0, 0, 0, alpha];
  });
  await writeTile('stamp-grain.webp', size, data);
}

// 4. Felt nap: anisotropic wool fibres for the blotter. Stored as a pale
//    luminance overlay so the felt colour tokens stay authoritative.
{
  const size = 512;
  const data = makeTile(size, (u, v, x, y) => {
    // Fibres run mostly along the weave: stretch the field 3:1.
    const along = fbm(u, v * 3.2, 96, 3, 131);
    // A second, gently rotated field so the nap never reads as stripes.
    const rot = 0.6;
    const ru = u * Math.cos(rot) - v * Math.sin(rot);
    const rv = u * Math.sin(rot) + v * Math.cos(rot);
    const cross = fbm(ru * 1.6, rv * 4, 64, 2, 149);
    // Sparse bright specks where a fibre end catches the light.
    const speck = latticeHash(x, y, size, 401) > 0.9975 ? 0.18 : 0;
    const alpha = along * 0.12 + cross * 0.08 + speck;
    return [232, 240, 226, alpha];
  });
  await writeTile('felt-grain.webp', size, data);
}

// 5. Satin ribbing for the bookmark: fine horizontal ribs with a soft
//    sheen that the strip's own gradient shapes.
{
  const size = 128;
  const data = makeTile(size, (u, v) => {
    const rib = 0.5 + 0.5 * Math.sin(v * size * Math.PI); // one rib per 2px
    const slub = fbm(u * 6, v, 64, 2, 211) * 0.5;
    const alpha = rib * 0.16 + slub * 0.08;
    return [255, 255, 255, alpha];
  });
  await writeTile('satin-rib.webp', size, data);
}

// 6. Bookcloth weave for the notebook cover: two orthogonal threads.
{
  const size = 256;
  const data = makeTile(size, (u, v) => {
    const warp = 0.5 + 0.5 * Math.sin(u * size * Math.PI * 0.5);
    const weft = 0.5 + 0.5 * Math.sin(v * size * Math.PI * 0.5);
    const wear = fbm(u, v, 32, 2, 307);
    const alpha = (warp * weft * 0.5 + wear * 0.35) * 0.32;
    return [246, 240, 226, alpha];
  });
  await writeTile('cloth-weave.webp', size, data);
}
