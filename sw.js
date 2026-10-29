// 앱 설치(홈 화면 추가)를 위한 최소 서비스워커. 캐시는 하지 않습니다.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
