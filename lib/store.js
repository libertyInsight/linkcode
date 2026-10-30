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

/* ---------- 칠판(교실) 대기 모드 ---------- */
const ROOM_TTL = 180 * 24 * 3600;   // 칠판 등록 정보: 마지막 사용 후 180일 유지
const LAST_TTL = 12 * 3600;         // 칠판에 보낸 최신 항목: 12시간 유지
export const PAIR_TTL = 10 * 60;    // 연결번호: 10분

export function randomId(len = 20) {
  const abc = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, b => abc[b % abc.length]).join("");
}
export const isRoomId = id => /^[A-Za-z0-9]{20}$/.test(String(id || ""));

export async function getRoom(id) {
  if (!isRoomId(id)) return null;
  const raw = await redis(["GET", `room:${id}`]);
  return raw ? JSON.parse(raw) : null;
}
export async function saveRoom(id, room) {
  await redis(["SET", `room:${id}`, JSON.stringify(room), "EX", String(ROOM_TTL)]);
}
export const SESSION_TTL = 60 * 60; // 폰-칠판 연결: 수업 한 시간 동안만

// 폰이 연결번호로 연결하면 그 수업 동안만 쓰는 열쇠(session)를 받음.
// 칠판에서 '수업 끝'을 누르면 room.epoch가 바뀌어 그 전 열쇠는 모두 무효.
export async function createSession(roomId, epoch) {
  const token = randomId(24);
  await redis(["SET", `sess:${token}`, JSON.stringify({ roomId, epoch }), "EX", String(SESSION_TTL)]);
  const ck = `room:${roomId}:conn:${epoch}`;
  await redis(["INCR", ck]);
  await redis(["EXPIRE", ck, String(SESSION_TTL)]);
  return token;
}
export async function getSession(token) {
  if (!/^[A-Za-z0-9]{24}$/.test(String(token || ""))) return null;
  const raw = await redis(["GET", `sess:${token}`]);
  if (!raw) return null;
  const s = JSON.parse(raw);
  const room = await getRoom(s.roomId);
  if (!room || (room.epoch || 0) !== s.epoch) return null;
  return { roomId: s.roomId, room };
}
export async function connCount(roomId, epoch) {
  return Number(await redis(["GET", `room:${roomId}:conn:${epoch}`])) || 0;
}

export async function pushToRoom(id, code, entry, epoch = 0) {
  const item = { seq: Date.now(), code, entry, epoch };
  await redis(["SET", `room:${id}:last`, JSON.stringify(item), "EX", String(LAST_TTL)]);
  await redis(["EXPIRE", `room:${id}`, String(ROOM_TTL)]); // 쓰는 동안은 계속 연장
  return item.seq;
}
export async function getRoomLast(id) {
  if (!isRoomId(id)) return null;
  const raw = await redis(["GET", `room:${id}:last`]);
  return raw ? JSON.parse(raw) : null;
}

export function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
}
