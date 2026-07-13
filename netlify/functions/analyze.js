// Netlify Function (모던 ESM 형식) — 업로드된 프레임 → Claude 분석 → Supabase 저장
// 환경변수: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SECRET_KEY
// (선택) ANALYZE_MODEL 로 모델 교체. 기본은 속도·비용 우선 Haiku.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const CORS = { "content-type": "application/json", "access-control-allow-origin": "*" };

const TAXO = {
  prodCat: ["F&B","테크&가전","뷰티","패션","서비스&플랫폼","파이낸스&기업PR","리빙&헬스케어","엔터테인먼트&컬처","에듀&커리어","모빌리티","공익&공공"],
  format: ["드라마타이즈","브랜드필름","무드필름","스케치 코미디","제품데모","인터뷰&도큐멘터리","타이포&그래픽 쇼케이스","메이킹&비하인드","뮤직비디오","버라이어티&예능형"],
  rt: ["~5초","5초~10초","10초~15초","15초~30초","30초~60초","60초 이상"],
  lighting: ["낮-실내","낮-실외","밤-실내","밤-실외","스튜디오"]
};

const J = (status, obj) => new Response(JSON.stringify(obj), { status, headers: CORS });
const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "ad";
const stripJson = (t) => { const a = t.indexOf("{"), b = t.lastIndexOf("}"); return (a >= 0 && b > a) ? t.slice(a, b + 1) : t; };

export default async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: { ...CORS, "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST,OPTIONS" } });
  if (req.method !== "POST") return J(405, { error: "POST only" });

  const SUPA = process.env.SUPABASE_URL, SKEY = process.env.SUPABASE_SECRET_KEY, AKEY = process.env.ANTHROPIC_API_KEY;
  if (!SUPA || !SKEY || !AKEY) return J(500, { error: "환경변수 누락", have: { url: !!SUPA, secret: !!SKEY, anthropic: !!AKEY } });

  let body;
  try { body = await req.json(); } catch { return J(400, { error: "invalid JSON body" }); }
  const frames = body.frames || [];
  if (!frames.length) return J(400, { error: "frames 배열이 비어있음" });
  const meta = { brand: body.brand || "", title: body.title || "", link: body.link || "", uploader: body.uploader || "" };
  const id = body.id || (slug(meta.brand || "ad") + "-" + Date.now());
  const MODEL = process.env.ANALYZE_MODEL || "claude-haiku-4-5-20251001";

  // ── 1) Claude 분석 ──
  const sys = `너는 TVCF 광고 분석 전문가다. 주어진 광고 스토리보드 프레임(시간순)을 보고 아래 JSON만 출력한다. 코드블록/설명 금지, 순수 JSON만.
스키마:
{
 "brand": string, "title": string,
 "prodCat": ${TAXO.prodCat.join(" | ")} 중 1,
 "format": ${TAXO.format.join(" | ")} 중 1,
 "rt": ${TAXO.rt.join(" | ")} 중 1,
 "durSec": number(추정),
 "look": string[] (스타일·감정 태그 2~4),
 "lighting": (${TAXO.lighting.join(" | ")}) 중 해당되는 것 배열,
 "camWork": string[] (2~5),
 "palette": string[] (관찰된 대표 hex 5개),
 "core": string, "target": string, "model": string(등장 인물 묘사),
 "copy": {"main": string, "sub": string[], "types": string[], "tone": string},
 "board": [[번호, "샷 설명"], ...] (프레임 개수와 동일, 순서대로),
 "conceptText": string(2~4문장), "toneMood": string, "colorPipe": string,
 "features": [{"img": 프레임인덱스, "text": string}] (2~3),
 "critique": {"good": string[] (2+), "weak": string[] (2+), "target": string},
 "apply": [{"point": string, "ex": string}] (3)
}
규칙: board 항목 수 = 프레임 수. 관찰되지 않은 것은 지어내지 말 것. 값은 한국어.`;

  const content = frames.map((b64) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } }));
  content.push({ type: "text", text: `위 ${frames.length}개 프레임은 한 광고의 시간순 스토리보드다.${meta.brand ? " 브랜드: " + meta.brand + "." : ""}${meta.title ? " 제목: " + meta.title + "." : ""} 분석 JSON만 출력. board 항목 수 = ${frames.length}.` });

  let analysis;
  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": AKEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 3200, system: sys, messages: [{ role: "user", content }] })
    });
    const j = await r.json();
    if (j.error) return J(502, { error: "Claude API 오류", detail: j.error });
    const text = (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
    analysis = JSON.parse(stripJson(text));
  } catch (e) { return J(502, { error: "분석 실패", detail: String(e) }); }

  // ── 2) 프레임 → Supabase Storage ──
  const imgBase = `${SUPA}/storage/v1/object/public/frames/${id}`;
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
  } catch (e) { return J(502, { error: "이미지 업로드 예외", detail: String(e) }); }

  // ── 3) 렌더용 ad 객체 + DB 저장 ──
  const ad = Object.assign({ id, _week: "uploads", rank: 0, agency: "업로드", onair: "", link: meta.link || "", video: "", imgBase, conceptImgs: [] }, analysis);
  ad.brand = ad.brand || meta.brand; ad.title = ad.title || meta.title;

  const record = { id, brand: ad.brand, title: ad.title, source_link: meta.link, created_by: meta.uploader, data: ad };
  try {
    const ins = await fetch(`${SUPA}/rest/v1/analyses`, {
      method: "POST",
      headers: { authorization: `Bearer ${SKEY}`, apikey: SKEY, "content-type": "application/json", prefer: "return=minimal" },
      body: JSON.stringify(record)
    });
    if (!ins.ok) return J(502, { error: "DB 저장 실패", detail: await ins.text() });
  } catch (e) { return J(502, { error: "DB 저장 예외", detail: String(e) }); }

  return J(200, { ok: true, id, ad });
};
