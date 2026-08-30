import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const assetsDir = path.join(root, "assets");

const APPS = [
  { publicDir: path.join(root, "../../apps/shell/public"), cacheName: "elio-portal", offlineUrl: "/offline.html", appName: "ELIO Portal" },
  { publicDir: path.join(root, "../../apps/pay/public"), cacheName: "elio-pay", offlineUrl: "/pay/offline.html", appName: "ElioPay" },
  { publicDir: path.join(root, "../../apps/plans/public"), cacheName: "elio-plans", offlineUrl: "/plans/offline.html", appName: "ElioPlans" },
  { publicDir: path.join(root, "../../apps/flow/public"), cacheName: "elio-flow", offlineUrl: "/flow/offline.html", appName: "ElioFlow" },
  { publicDir: path.join(root, "../../apps/admin/public"), cacheName: "elio-admin", offlineUrl: "/offline.html", appName: "ELIO Admin" },
];

const PRIMARY = { r: 109, g: 62, b: 245 };

function writePng(size, filePath, maskable = false) {
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

function writeServiceWorker(publicDir, cacheName, offlineUrl = "/offline") {
  const sw = `/* ELIO PWA service worker — desktop-first, auth-safe caching */
const CACHE = "${cacheName}-v1";
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

function copyIcons(publicDir) {
  const iconsDir = path.join(publicDir, "icons");
  fs.mkdirSync(iconsDir, { recursive: true });
  fs.copyFileSync(path.join(assetsDir, "icon.svg"), path.join(iconsDir, "icon.svg"));
  writePng(192, path.join(iconsDir, "icon-192.png"));
  writePng(512, path.join(iconsDir, "icon-512.png"));
  writePng(512, path.join(iconsDir, "icon-maskable-512.png"), true);
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

for (const app of APPS) {
  copyIcons(app.publicDir);
  writeOfflineHtml(app.publicDir, app.appName);
  writeServiceWorker(app.publicDir, app.cacheName, app.offlineUrl);
  console.log("PWA assets →", path.relative(root, app.publicDir));
}
