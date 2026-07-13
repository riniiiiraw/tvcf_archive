// Netlify Function (동기, 6MB 페이로드) — 브라우저가 뽑은 프레임을 Supabase Storage에 저장.
// 이후 analyze-background 는 저장된 URL만 참조하므로 백그라운드 256KB 한도를 피한다.
// 환경변수: SUPABASE_URL, SUPABASE_SECRET_KEY
const CORS = { "content-type": "application/json", "access-control-allow-origin": "*" };
const J = (s, o) => new Response(JSON.stringify(o), { status: s, headers: CORS });

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...CORS, "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST,OPTIONS" } });
  if (req.method !== "POST") return J(405, { error: "POST only" });
  const SUPA = process.env.SUPABASE_URL, SKEY = process.env.SUPABASE_SECRET_KEY;
  if (!SUPA || !SKEY) return J(500, { error: "환경변수 누락" });
  let body; try { body = await req.json(); } catch { return J(400, { error: "invalid JSON" }); }
  const id = body.id, frames = body.frames || [];
  if (!id || !frames.length) return J(400, { error: "id·frames 필요" });
  try {
    for (let i = 0; i < frames.length; i++) {
      const buf = Buffer.from(frames[i], "base64");
      const up = await fetch(`${SUPA}/storage/v1/object/frames/${id}/shot_${String(i).padStart(2, "0")}.jpg`, {
        method: "POST",
        headers: { authorization: `Bearer ${SKEY}`, apikey: SKEY, "content-type": "image/jpeg", "x-upsert": "true" },
        body: buf
      });
      if (!up.ok) return J(502, { error: "이미지 업로드 실패", detail: await up.text() });
    }
  } catch (e) { return J(502, { error: "업로드 예외", detail: String(e) }); }
  return J(200, { ok: true, id, count: frames.length });
};
