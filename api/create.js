import { saveEntry, TTL_SECONDS } from "../lib/store.js";

const BLOB_HOST = ".blob.vercel-storage.com";

function cleanLink(raw) {
  let url = String(raw || "").trim();
  if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
  const u = new URL(url); // 잘못된 주소면 여기서 오류
  if (!["http:", "https:"].includes(u.protocol)) throw new Error();
  if (url.length > 4000) throw new Error();
  return url;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST만 가능합니다." });
  const body = req.body || {};
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

  try {
    const code = await saveEntry(entry);
    res.status(200).json({ code, expiresIn: TTL_SECONDS });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
