import { handleUpload } from "@vercel/blob/client";
import { rateLimit, clientIp } from "../lib/store.js";

export const MAX_BYTES = 100 * 1024 * 1024; // 파일 하나 최대 100MB

// 브라우저가 Vercel Blob에 직접 올릴 수 있도록 짧은 업로드 허가증(토큰)을 발급
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST만 가능합니다." });

  try {
    const result = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith("files/")) throw new Error("잘못된 경로입니다.");
        if (!(await rateLimit(`up:${clientIp(req)}`, 40))) {
          throw new Error("업로드가 너무 많습니다. 잠시 뒤 다시 시도해 주세요.");
        }
        return {
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true, // 주소를 추측할 수 없게
          validUntil: Date.now() + 10 * 60 * 1000,
        };
      },
      onUploadCompleted: async () => {},
    });
    res.status(200).json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}
