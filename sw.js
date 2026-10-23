const V = "Letter-v40"; /* เปลี่ยนเลขเวอร์ชันเมื่อแก้ไฟล์ เพื่อให้เครื่องที่ติดตั้งไว้อัปเดต */
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-180.png", "./icon-512.png", "./icon-maskable-512.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
/* เปิดจากเครื่องก่อน แล้วอัปเดตเบื้องหลัง (รวมฟอนต์และตัวสร้าง PDF ที่โหลดจากออนไลน์ครั้งแรก) */
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET") return;
  e.respondWith((async () => {
    const hit = await caches.match(r, { ignoreSearch: true });
    const net = fetch(r).then(res => {
      if (res && (res.ok || res.type === "opaque")) { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); }
      return res;
    }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const res = await net;
    if (res) return res;
    if (r.mode === "navigate") { const idx = await caches.match("./index.html"); if (idx) return idx; }
    return Response.error();
  })());
});
