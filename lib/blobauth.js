// Vercel Blob 인증 정보: 예전 방식(BLOB_READ_WRITE_TOKEN)이 있으면 그걸,
// 없으면 새 방식(요청 헤더의 OIDC 토큰 + BLOB_STORE_ID)을 명시적으로 넘깁니다.
export function blobAuth(req) {
  if (process.env.BLOB_READ_WRITE_TOKEN) return { token: process.env.BLOB_READ_WRITE_TOKEN };
  const oidcToken = req?.headers?.["x-vercel-oidc-token"] || process.env.VERCEL_OIDC_TOKEN;
  const storeId = process.env.BLOB_STORE_ID;
  const auth = {};
  if (oidcToken) auth.oidcToken = oidcToken;
  if (storeId) auth.storeId = storeId;
  return auth;
}

export function blobDiag(req) {
  return {
    hasReadWriteToken: !!process.env.BLOB_READ_WRITE_TOKEN,
    hasStoreId: !!process.env.BLOB_STORE_ID,
    hasOidcHeader: !!req?.headers?.["x-vercel-oidc-token"],
    hasOidcEnv: !!process.env.VERCEL_OIDC_TOKEN,
    hasWebhookKey: !!process.env.BLOB_WEBHOOK_PUBLIC_KEY,
  };
}
