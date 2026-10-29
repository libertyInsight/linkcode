import { saveLink, TTL_SECONDS } from "../lib/store.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST만 가능합니다." });

  let { url } = req.body || {};
  url = String(url || "").trim();
  if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;

  try {
    const u = new URL(url);
    if (!["http:", "https:"].includes(u.protocol)) throw 0;
  } catch {
    return res.status(400).json({ error: "올바른 링크 주소가 아닙니다." });
  }
  if (url.length > 4000) return res.status(400).json({ error: "주소가 너무 깁니다." });

  try {
    const code = await saveLink(url);
    res.status(200).json({ code, expiresIn: TTL_SECONDS });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
