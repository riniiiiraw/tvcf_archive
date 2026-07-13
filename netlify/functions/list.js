// Netlify Function: Supabase에 저장된 업로드 분석 목록을 반환 (사이트가 읽기용으로 호출)
// 환경변수: SUPABASE_URL, SUPABASE_SECRET_KEY

const CORS = { "content-type": "application/json", "access-control-allow-origin": "*", "cache-control": "no-store" };

export default async () => {
  const SUPA = process.env.SUPABASE_URL, SKEY = process.env.SUPABASE_SECRET_KEY;
  if (!SUPA || !SKEY) return new Response(JSON.stringify({ error: "env 누락" }), { status: 500, headers: CORS });
  try {
    const r = await fetch(`${SUPA}/rest/v1/analyses?select=data&order=created_at.desc`, {
      headers: { authorization: `Bearer ${SKEY}`, apikey: SKEY }
    });
    if (!r.ok) return new Response(JSON.stringify({ error: "조회 실패", detail: await r.text() }), { status: 502, headers: CORS });
    const rows = await r.json();
    const ads = rows.map((row) => row.data).filter(Boolean);
    return new Response(JSON.stringify({ ok: true, ads }), { status: 200, headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: "예외", detail: String(e) }), { status: 502, headers: CORS });
  }
};
