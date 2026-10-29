import { list, del } from "@vercel/blob";

const KEEP_MS = 2 * 60 * 60 * 1000; // 올린 지 2시간 지난 파일은 삭제 (코드는 30분이면 이미 만료)

// Vercel Cron이 하루 한 번 호출 (vercel.json의 crons)
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const cutoff = Date.now() - KEEP_MS;
  let cursor, deleted = 0;
  try {
    do {
      const page = await list({ prefix: "files/", cursor, limit: 1000 });
      const old = page.blobs.filter(b => new Date(b.uploadedAt).getTime() < cutoff).map(b => b.url);
      if (old.length) { await del(old); deleted += old.length; }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    res.status(200).json({ deleted });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
