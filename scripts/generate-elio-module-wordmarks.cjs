/**
 * Build ELIO Pay / Plans / Flow wordmarks from the official portal mark + text.
 * Canvas is trimmed to content (+ padding) so sidebar object-contain stays large.
 */
const path = require("node:path");
const fs = require("node:fs");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const BRAND = path.join(ROOT, "apps", "shell", "public", "brand");
const MARK = path.join(BRAND, "elio-mark.png");

const W = 2400;
const H = 640;
const MARK_SIZE = 480;
const MARK_X = 40;
const MARK_Y = Math.round((H - MARK_SIZE) / 2);
const TEXT_X = MARK_X + MARK_SIZE + 36;
const FONT_SIZE = 248;
const PAD = 28;

const PRODUCTS = [
  { id: "pay", label: "eliopay" },
  { id: "plans", label: "elioplans" },
  { id: "flow", label: "elioflow" },
];

async function extractMarkOnTransparent() {
  const { data, info } = await sharp(MARK).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r < 28 && g < 28 && b < 28) data[i + 3] = 0;
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .resize(MARK_SIZE, MARK_SIZE, { fit: "contain" })
    .png()
    .toBuffer();
}

function wordmarkSvg(label, textColor) {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <text x="${TEXT_X}" y="${H / 2}"
    fill="${textColor}"
    font-family="Arial, Helvetica, sans-serif"
    font-size="${FONT_SIZE}"
    font-weight="600"
    letter-spacing="-4"
    dominant-baseline="middle">${label}</text>
</svg>`);
}

async function build(label, textColor, outPath) {
  const markBuf = await extractMarkOnTransparent();
  const textBuf = await sharp(wordmarkSvg(label, textColor)).png().toBuffer();
  const composed = await sharp({
    create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: markBuf, left: MARK_X, top: MARK_Y },
      { input: textBuf, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();

  // Crop empty canvas so the sidebar box is filled by the real mark + word.
  await sharp(composed)
    .trim({ threshold: 0 })
    .extend({
      top: PAD,
      bottom: PAD,
      left: PAD,
      right: PAD,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(outPath);
  const meta = await sharp(outPath).metadata();
  console.log("wrote", outPath, `${meta.width}x${meta.height}`);
}

async function main() {
  for (const p of PRODUCTS) {
    const appBrand = path.join(ROOT, "apps", p.id, "public", "brand");
    fs.mkdirSync(appBrand, { recursive: true });
    const lightName = `elio-${p.id}.png`;
    const darkName = `elio-${p.id}-dark.png`;
    const lightShell = path.join(BRAND, lightName);
    const darkShell = path.join(BRAND, darkName);
    await build(p.label, "#0B1B3A", lightShell);
    await build(p.label, "#FFFFFF", darkShell);
    fs.copyFileSync(lightShell, path.join(appBrand, lightName));
    fs.copyFileSync(darkShell, path.join(appBrand, darkName));
  }
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
