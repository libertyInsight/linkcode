import {
  redis, randomId, isRoomId, getRoom, saveRoom, getRoomLast, PAIR_TTL, rateLimit, clientIp,
} from "../lib/store.js";

// 칠판 대기 모드
//  GET  /api/room?id=칠판ID              → 칠판이 최신 항목을 확인 { seq, entry } (없으면 { seq: null })
//  POST { action: "create", name }       → 새 칠판 등록 { roomId, name }
//  POST { action: "rename", roomId, name }
//  POST { action: "pair-start", roomId } → 폰 연결용 6자리 연결번호 { code, expiresIn }
//  POST { action: "pair", code }         → 폰이 연결번호로 칠판 찾기 { roomId, name }
const cleanName = n => String(n || "").trim().slice(0, 30) || "내 칠판";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const id = String(req.query.id || "");
      if (!isRoomId(id)) return res.status(400).json({ error: "잘못된 칠판입니다." });
      const last = await getRoomLast(id);
      return res.status(200).json(last ? { seq: last.seq, code: last.code, entry: last.entry } : { seq: null });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "허용되지 않는 요청입니다." });

    const body = req.body || {};
    switch (body.action) {
      case "create": {
        if (!(await rateLimit(`room:${clientIp(req)}`, 20))) throw new Error("잠시 뒤 다시 시도해 주세요.");
        const roomId = randomId();
        const room = { name: cleanName(body.name), created: Date.now() };
        await saveRoom(roomId, room);
        return res.status(200).json({ roomId, name: room.name });
      }
      case "rename": {
        const room = await getRoom(body.roomId);
        if (!room) return res.status(404).json({ error: "칠판을 찾을 수 없습니다." });
        room.name = cleanName(body.name);
        await saveRoom(body.roomId, room);
        return res.status(200).json({ name: room.name });
      }
      case "pair-start": {
        const room = await getRoom(body.roomId);
        if (!room) return res.status(404).json({ error: "칠판을 찾을 수 없습니다. 대기 모드를 다시 시작해 주세요." });
        for (let i = 0; i < 10; i++) {
          const code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
          const ok = await redis(["SET", `pair:${code}`, body.roomId, "NX", "EX", String(PAIR_TTL)]);
          if (ok === "OK") return res.status(200).json({ code, expiresIn: PAIR_TTL });
        }
        throw new Error("연결번호 생성에 실패했습니다.");
      }
      case "pair": {
        // 연결번호를 무작위로 맞혀 보는 시도 방지
        if (!(await rateLimit(`pair:${clientIp(req)}`, 15))) throw new Error("시도가 너무 많습니다. 잠시 뒤 다시 해 주세요.");
        const code = String(body.code || "").replace(/\D/g, "");
        const roomId = /^\d{6}$/.test(code) ? await redis(["GET", `pair:${code}`]) : null;
        const room = roomId && (await getRoom(roomId));
        if (!room) return res.status(404).json({ error: "연결번호가 맞지 않거나 만료되었습니다." });
        return res.status(200).json({ roomId, name: room.name });
      }
      default:
        return res.status(400).json({ error: "알 수 없는 요청입니다." });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
