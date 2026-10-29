import { getEntry } from "../lib/store.js";

// GET /api/open?code=123456          → { type, url, ... } (페이지에서 사용)
// GET /123456  (vercel.json 재작성)   → 링크는 바로 이동, 파일은 열기 화면으로
export default async function handler(req, res) {
  const code = String(req.query.code || "").replace(/\D/g, "");
  const redirect = req.query.go === "1";

  try {
    const entry = await getEntry(code);
    if (!entry) {
      if (redirect) return res.redirect(302, `/?notfound=${code}`);
      return res.status(404).json({ error: "없거나 만료된 코드입니다." });
    }
    if (redirect) {
      return res.redirect(302, entry.type === "file" ? `/?c=${code}` : entry.url);
    }
    res.status(200).json(entry);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
