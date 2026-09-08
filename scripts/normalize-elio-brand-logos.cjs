/**
 * Normalize ELIO Portal / Pay / Plans / Flow wordmarks to one display size.
 * Trim empty canvas, then scale to a shared height so sidebar object-contain
 * renders the same visual size everywhere.
 */
const path = require("node:path");
const fs = require("node:fs");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const SHELL_BRAND = path.join(ROOT, "apps", "shell", "public", "brand");
const TARGET_H = 360;
const PAD = 24;

const FILES = [
  "elio-portal.png",
  "elio-portal-dark.png",
  "elio-pay.png",
  "elio-pay-dark.png",
  "elio-plans.png",
  "elio-plans-dark.png",
  "elio-flow.png",
  "elio-flow-dark.png",
];

const APP_COPIES = {
  "elio-pay.png": "pay",
  "elio-pay-dark.png": "pay",
  "elio-plans.png": "plans",
  "elio-plans-dark.png": "plans",
  "elio-flow.png": "flow",
  "elio-flow-dark.png": "flow",
};

async function normalizeOne(fileName) {
  const src = path.join(SHELL_BRAND, fileName);
  if (!fs.existsSync(src)) {
    console.warn("skip missing", src);
    return;
  }
  const trimmed = await sharp(src)
    .ensureAlpha()
    .trim({ threshold: 0 })
    .extend({
      top: PAD,
      bottom: PAD,
      left: PAD,
      right: PAD,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .resize({ height: TARGET_H, fit: "inside" })
    .png()
    .toBuffer();

  await sharp(trimmed).toFile(src);
  const meta = await sharp(src).metadata();
  console.log("normalized", fileName, `${meta.width}x${meta.height}`);

  const appId = APP_COPIES[fileName];
  if (appId) {
    const destDir = path.join(ROOT, "apps", appId, "public", "brand");
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(src, path.join(destDir, fileName));
  }
}

async function main() {
  for (const f of FILES) await normalizeOne(f);
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
