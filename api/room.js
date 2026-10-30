import {
  redis, randomId, isRoomId, getRoom, saveRoom, getRoomLast, PAIR_TTL, SESSION_TTL,
  createSession, connCount, rateLimit, clientIp,
} from "../lib/store.js";

// 칠판 대기 모드
//  GET  /api/room?id=칠판ID              → 칠판이 확인 { seq, entry, conn }  (conn = 이번 수업에 연결된 폰 수)
//  POST { action: "create", name }       → 새 칠판 등록 { roomId, name }
//  POST { action: "rename", roomId, name }
//  POST { action: "pair-start", roomId } → 연결번호(1회용, 10분) { code, expiresIn }
//  POST { action: "pair", code }         → 폰 연결 { session, name, expiresIn }  (연결번호는 즉시 폐기)
//  POST { action: "end", roomId }        → 수업 끝: 모든 폰 연결 끊기, 띄운 것 지우기
const cleanName = n => String(n || "").trim().slice(0, 30) || "내 칠판";
const notFound = res => res.status(404).json({ error: "칠판을 찾을 수 없습니다. 대기 모드를 다시 시작해 주세요.", roomGone: true });

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const id = String(req.query.id || "");
      const room = isRoomId(id) && (await getRoom(id));
      if (!room) return notFound(res);
      const epoch = room.epoch || 0;
      const last = await getRoomLast(id);
      const conn = await connCount(id, epoch);
      if (!last || (last.epoch || 0) !== epoch) return res.status(200).json({ seq: null, conn });
      return res.status(200).json({ seq: last.seq, code: last.code, entry: last.entry, conn });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "허용되지 않는 요청입니다." });

    const body = req.body || {};
    switch (body.action) {
      case "create": {
        if (!(await rateLimit(`room:${clientIp(req)}`, 20))) throw new Error("잠시 뒤 다시 시도해 주세요.");
        const roomId = randomId();
        const room = { name: cleanName(body.name), created: Date.now(), epoch: 0 };
        await saveRoom(roomId, room);
        return res.status(200).json({ roomId, name: room.name });
      }
      case "rename": {
        const room = await getRoom(body.roomId);
        if (!room) return notFound(res);
        room.name = cleanName(body.name);
        await saveRoom(body.roomId, room);
        return res.status(200).json({ name: room.name });
      }
      case "pair-start": {
        const room = await getRoom(body.roomId);
        if (!room) return notFound(res);
        // 이전 연결번호는 폐기 → 칠판에 보이는 번호 하나만 유효
        const old = await redis(["GET", `room:${body.roomId}:pair`]);
        if (old) await redis(["DEL", `pair:${old}`]);
        for (let i = 0; i < 10; i++) {
          const code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
          const ok = await redis(["SET", `pair:${code}`, body.roomId, "NX", "EX", String(PAIR_TTL)]);
          if (ok === "OK") {
            await redis(["SET", `room:${body.roomId}:pair`, code, "EX", String(PAIR_TTL)]);
            return res.status(200).json({ code, expiresIn: PAIR_TTL });
          }
        }
        throw new Error("연결번호 생성에 실패했습니다.");
      }
      case "pair": {
        // 연결번호를 무작위로 맞혀 보는 시도 방지
        if (!(await rateLimit(`pair:${clientIp(req)}`, 15))) throw new Error("시도가 너무 많습니다. 잠시 뒤 다시 해 주세요.");
        const code = String(body.code || "").replace(/\D/g, "");
        const roomId = /^\d{6}$/.test(code) ? await redis(["GET", `pair:${code}`]) : null;
        const room = roomId && (await getRoom(roomId));
        if (!room) return res.status(404).json({ error: "연결번호가 맞지 않거나 이미 사용되었습니다. 칠판에 보이는 새 번호로 해 주세요." });
        await redis(["DEL", `pair:${code}`]);              // 1회용
        await redis(["DEL", `room:${roomId}:pair`]);
        const session = await createSession(roomId, room.epoch || 0);
        return res.status(200).json({ session, name: room.name, expiresIn: SESSION_TTL });
      }
      case "end": {
        const room = await getRoom(body.roomId);
        if (!room) return notFound(res);
        room.epoch = (room.epoch || 0) + 1;              // 이전 연결 전부 무효
        await saveRoom(body.roomId, room);
        await redis(["DEL", `room:${body.roomId}:last`]);
        const old = await redis(["GET", `room:${body.roomId}:pair`]);
        if (old) await redis(["DEL", `pair:${old}`]);
        return res.status(200).json({ ok: true });
      }
      default:
        return res.status(400).json({ error: "알 수 없는 요청입니다." });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
