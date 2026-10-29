import { handleUploadPresigned } from "@vercel/blob/client";
import { issueSignedToken } from "@vercel/blob";
import { rateLimit, clientIp } from "../lib/store.js";
import { blobAuth, blobDiag } from "../lib/blobauth.js";

const MAX_BYTES = 100 * 1024 * 1024; // 파일 하나 최대 100MB
const clean = e => String(e?.message || e).replace(/^Vercel Blob: /, "");

// 브라우저가 Vercel Blob에 직접 올릴 수 있도록 10분짜리 업로드 허가 주소를 발급
export default async function handler(req, res) {
  // 점검용: 브라우저에서 /api/upload 를 열면 연결 상태를 보여줌
  if (req.method === "GET") {
    const diag = blobDiag(req);
    try {
      await issueSignedToken({ ...blobAuth(req), pathname: "files/_check.txt", operations: ["put"] });
      return res.status(200).json({ ok: true, ...diag });
    } catch (e) {
      return res.status(200).json({ ok: false, error: clean(e), ...diag });
    }
  }
  if (req.method !== "POST") return res.status(405).json({ error: "허용되지 않는 요청입니다." });

  try {
    const result = await handleUploadPresigned({
      body: req.body,
      request: req,
      getSignedToken: async (pathname) => {
        if (!pathname.startsWith("files/")) throw new Error("잘못된 경로입니다.");
        if (!(await rateLimit(`up:${clientIp(req)}`, 40))) {
          throw new Error("업로드가 너무 많습니다. 잠시 뒤 다시 시도해 주세요.");
        }
        const validUntil = Date.now() + 10 * 60 * 1000;
        const token = await issueSignedToken({
          ...blobAuth(req),
          pathname,
          operations: ["put"],
          validUntil,
          maximumSizeInBytes: MAX_BYTES,
        });
        return {
          token,
          urlOptions: { validUntil, maximumSizeInBytes: MAX_BYTES, addRandomSuffix: true },
        };
      },
    });
    res.status(200).json(result);
  } catch (e) {
    console.error("upload error:", e);
    res.status(400).json({ error: clean(e) });
  }
}
