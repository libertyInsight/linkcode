import { saveEntry, getEntry, TTL_SECONDS, getRoom, pushToRoom, isRoomId } from "../lib/store.js";

const BLOB_HOST = ".blob.vercel-storage.com";

function cleanLink(raw) {
  let url = String(raw || "").trim();
  if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
  const u = new URL(url); // 잘못된 주소면 여기서 오류
  if (!["http:", "https:"].includes(u.protocol)) throw new Error();
  if (url.length > 4000) throw new Error();
  return url;
}

// POST { url }                → 링크 코드
// POST { file: {...} }        → 파일 코드
// POST { ..., room: 칠판ID }  → 코드를 만들고 그 칠판에도 바로 띄움
// POST { code, room }         → 이미 만든 코드를 칠판에 다시 띄움
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST만 가능합니다." });
  const body = req.body || {};

  try {
    let room = null;
    if (body.room) {
      room = isRoomId(body.room) ? await getRoom(body.room) : null;
      if (!room) return res.status(404).json({ error: "연결된 칠판을 찾을 수 없습니다. 칠판에서 다시 연결해 주세요.", roomGone: true });
    }

    // 이미 있는 코드를 칠판으로 다시 보내기
    if (body.code && room) {
      const entry = await getEntry(String(body.code));
      if (!entry) return res.status(404).json({ error: "없거나 만료된 코드입니다." });
      await pushToRoom(body.room, String(body.code), entry);
      return res.status(200).json({ code: String(body.code), sentTo: room.name });
    }

    let entry;
    try {
      if (body.file) {
        const f = body.file;
        const u = new URL(f.url);
        if (u.protocol !== "https:" || !u.hostname.endsWith(BLOB_HOST)) throw new Error();
        entry = {
          type: "file",
          url: f.url,
          downloadUrl: String(f.downloadUrl || f.url),
          name: String(f.name || "파일").slice(0, 200),
          size: Number(f.size) || 0,
          contentType: String(f.contentType || "").slice(0, 100),
        };
      } else {
        entry = { type: "link", url: cleanLink(body.url) };
      }
    } catch {
      return res.status(400).json({ error: body.file ? "파일 정보가 올바르지 않습니다." : "올바른 링크 주소가 아닙니다." });
    }

    const code = await saveEntry(entry);
    if (room) await pushToRoom(body.room, code, entry);
    res.status(200).json({ code, expiresIn: TTL_SECONDS, sentTo: room ? room.name : undefined });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
