// Upstash Redis REST 호출 (Vercel 마켓플레이스에서 연결하면 환경변수가 자동으로 들어옵니다)
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export async function redis(command) {
  if (!URL_ || !TOKEN) throw new Error("저장소(Redis)가 연결되지 않았습니다.");
  const res = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

export const TTL_SECONDS = 30 * 60; // 코드 유효시간: 30분

// entry: { type: "link", url } 또는 { type: "file", url, downloadUrl, name, size, contentType }
export async function saveEntry(entry) {
  const value = JSON.stringify(entry);
  // 겹치지 않는 6자리 코드를 찾을 때까지 시도 (NX = 이미 있으면 실패)
  for (let i = 0; i < 10; i++) {
    const code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
    const ok = await redis(["SET", `code:${code}`, value, "NX", "EX", String(TTL_SECONDS)]);
    if (ok === "OK") return code;
  }
  throw new Error("코드 생성에 실패했습니다. 다시 시도해 주세요.");
}

export async function getEntry(code) {
  if (!/^\d{6}$/.test(code)) return null;
  const raw = await redis(["GET", `code:${code}`]);
  if (!raw) return null;
  if (raw.startsWith("{")) return JSON.parse(raw);
  return { type: "link", url: raw }; // 예전 형식 호환
}

// 같은 곳(IP)에서 한 시간에 너무 많이 올리지 못하게
export async function rateLimit(key, maxPerHour) {
  const k = `rl:${key}:${Math.floor(Date.now() / 3_600_000)}`;
  const n = await redis(["INCR", k]);
  if (n === 1) await redis(["EXPIRE", k, "3600"]);
  return n <= maxPerHour;
}

export function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
}
