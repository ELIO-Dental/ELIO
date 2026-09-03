import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const assetsDir = path.join(root, "assets");

/** Resolve sharp from this package or the monorepo (Next.js ships it). */
function loadSharp() {
  try {
    return require("sharp");
  } catch {
    return require(path.join(root, "../../node_modules/sharp"));
  }
}

const APPS = [
  {
    id: "portal",
    publicDir: path.join(root, "../../apps/shell/public"),
    appDir: path.join(root, "../../apps/shell/app"),
    cacheName: "elio-portal-v2",
    offlineUrl: "/offline.html",
    appName: "ELIO Portal",
    /** Prefer client favicon mark when present; fall back to solid brand tile. */
    iconSource: path.join(assetsDir, "portal-favicon.png"),
  },
  { id: "pay", publicDir: path.join(root, "../../apps/pay/public"), cacheName: "elio-pay-v1", offlineUrl: "/pay/offline.html", appName: "ElioPay" },
  { id: "plans", publicDir: path.join(root, "../../apps/plans/public"), cacheName: "elio-plans-v1", offlineUrl: "/plans/offline.html", appName: "ElioPlans" },
  { id: "flow", publicDir: path.join(root, "../../apps/flow/public"), cacheName: "elio-flow-v1", offlineUrl: "/flow/offline.html", appName: "ElioFlow" },
  { id: "admin", publicDir: path.join(root, "../../apps/admin/public"), cacheName: "elio-admin-v1", offlineUrl: "/offline.html", appName: "ELIO Admin" },
];

const PRIMARY = { r: 109, g: 62, b: 245 };

function writeSolidPng(size, filePath, maskable = false) {
  const png = new PNG({ width: size, height: size });
  const pad = maskable ? Math.floor(size * 0.1) : 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      const inside = x >= pad && y >= pad && x < size - pad && y < size - pad;
      png.data[idx] = PRIMARY.r;
      png.data[idx + 1] = PRIMARY.g;
      png.data[idx + 2] = PRIMARY.b;
      png.data[idx + 3] = inside || !maskable ? 255 : 0;
    }
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

async function writeResizedPng(sharp, sourcePath, size, filePath, { maskable = false } = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!maskable) {
    await sharp(sourcePath)
      .resize(size, size, { fit: "cover", position: "centre" })
      .png()
      .toFile(filePath);
    return;
  }

  // Maskable: keep ~20% safe zone on black (matches portal favicon background).
  const inner = Math.round(size * 0.8);
  const pad = Math.round((size - inner) / 2);
  const resized = await sharp(sourcePath)
    .resize(inner, inner, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 255 },
    },
  })
    .composite([{ input: resized, top: pad, left: pad }])
    .png()
    .toFile(filePath);
}

function writeServiceWorker(publicDir, cacheName, offlineUrl = "/offline") {
  const sw = `/* ELIO PWA service worker — desktop-first, auth-safe caching */
const CACHE = "${cacheName}";
const OFFLINE_URL = "${offlineUrl}";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.pathname.includes("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(OFFLINE_URL);
        return cached ?? Response.error();
      })
    );
    return;
  }

  if (url.pathname.includes("/_next/static/") || url.pathname.includes("/icons/")) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached ?? network;
      })
    );
  }
});
`;

  fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(path.join(publicDir, "sw.js"), sw);
}

async function copyIcons(app) {
  const iconsDir = path.join(app.publicDir, "icons");
  fs.mkdirSync(iconsDir, { recursive: true });

  // Drop previous generated icons so stale solid tiles cannot linger.
  for (const name of ["icon-192.png", "icon-512.png", "icon-maskable-512.png", "icon.svg", "apple-touch-icon.png"]) {
    const prev = path.join(iconsDir, name);
    if (fs.existsSync(prev)) fs.unlinkSync(prev);
  }

  const source = app.iconSource && fs.existsSync(app.iconSource) ? app.iconSource : null;
  if (source) {
    const sharp = loadSharp();
    await writeResizedPng(sharp, source, 192, path.join(iconsDir, "icon-192.png"));
    await writeResizedPng(sharp, source, 512, path.join(iconsDir, "icon-512.png"));
    await writeResizedPng(sharp, source, 512, path.join(iconsDir, "icon-maskable-512.png"), { maskable: true });
    await writeResizedPng(sharp, source, 180, path.join(iconsDir, "apple-touch-icon.png"));

    // Next.js app-dir metadata icons (Shell / portal only).
    if (app.appDir) {
      fs.mkdirSync(app.appDir, { recursive: true });
      await writeResizedPng(sharp, source, 32, path.join(app.appDir, "icon.png"));
      await writeResizedPng(sharp, source, 180, path.join(app.appDir, "apple-icon.png"));
      // Keep a public favicon.png in sync with the source mark (browsers + metadata).
      await writeResizedPng(sharp, source, 48, path.join(app.publicDir, "favicon.png"));
      // Real multi-size ICO for legacy tabs.
      await sharp(source)
        .resize(32, 32)
        .toFile(path.join(app.publicDir, "favicon.ico"));
    }

    // Lightweight SVG placeholder pointing browsers at the PNG mark (manifest still lists SVG optionally).
    fs.writeFileSync(
      path.join(iconsDir, "icon.svg"),
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><image href="/icons/icon-512.png" width="512" height="512"/></svg>\n`
    );
    console.log("  icons from", path.relative(root, source));
  } else {
    fs.copyFileSync(path.join(assetsDir, "icon.svg"), path.join(iconsDir, "icon.svg"));
    writeSolidPng(192, path.join(iconsDir, "icon-192.png"));
    writeSolidPng(512, path.join(iconsDir, "icon-512.png"));
    writeSolidPng(512, path.join(iconsDir, "icon-maskable-512.png"), true);
    console.log("  icons solid fallback");
  }
}

function writeOfflineHtml(publicDir, appName) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#6d3ef5" />
  <title>Offline — ${appName}</title>
  <style>
    body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; font-family: system-ui, sans-serif; background: #0b0b0f; color: #f5f5f7; }
    main { text-align: center; padding: 2rem; max-width: 28rem; }
    h1 { font-size: 1.5rem; margin: 1rem 0 0.5rem; }
    p { color: #b8b8c3; line-height: 1.5; }
    button { margin-top: 1.5rem; padding: 0.625rem 1rem; border: 0; border-radius: 10px; background: #6d3ef5; color: #fff; font-weight: 600; cursor: pointer; }
  </style>
</head>
<body>
  <main>
    <h1>You're offline</h1>
    <p>${appName} needs an internet connection. Reconnect, then try again.</p>
    <button type="button" onclick="location.reload()">Try again</button>
  </main>
</body>
</html>`;
  fs.writeFileSync(path.join(publicDir, "offline.html"), html);
}

async function main() {
  for (const app of APPS) {
    await copyIcons(app);
    writeOfflineHtml(app.publicDir, app.appName);
    writeServiceWorker(app.publicDir, app.cacheName, app.offlineUrl);
    console.log("PWA assets →", path.relative(root, app.publicDir));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
