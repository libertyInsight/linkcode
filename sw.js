// 앱 설치 + 안드로이드 '공유' 메뉴로 들어온 링크/파일 받기
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && url.pathname === "/share-target") {
    event.respondWith(handleShare(event.request));
  }
});

async function handleShare(request) {
  const form = await request.formData();
  const file = form.get("file");
  if (file && typeof file === "object" && file.size) {
    const cache = await caches.open("linkcode-share");
    await cache.put("/shared-file", new Response(file, {
      headers: {
        "content-type": file.type || "application/octet-stream",
        "x-name": encodeURIComponent(file.name || "파일"),
      },
    }));
    return Response.redirect("/?share=file", 303);
  }
  const p = new URLSearchParams();
  for (const k of ["url", "text", "title"]) if (form.get(k)) p.set(k, form.get(k));
  return Response.redirect("/?" + p.toString(), 303);
}
