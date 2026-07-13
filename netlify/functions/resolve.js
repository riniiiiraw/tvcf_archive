// Netlify Function (ESM) — TVCF play 링크 → wowza m3u8 주소 해석
// 사용: /.netlify/functions/resolve?url=<tvcf play 링크>
const CORS = { "content-type": "application/json", "access-control-allow-origin": "*" };
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const J = (s, o) => new Response(JSON.stringify(o), { status: s, headers: CORS });

export default async (req) => {
  const url = new URL(req.url).searchParams.get("url") || "";
  if (!/tvcf\.co\.kr\/play\//.test(url)) return J(400, { error: "TVCF play 링크만 지원해요 (tvcf.co.kr/play/...)" });
  try {
    const html = await fetch(url, { headers: { "user-agent": UA } }).then((r) => r.text());
    let m3u8 = (html.match(/https:[^"'\\\s]+playlist\.m3u8/) || [])[0];
    if (!m3u8) {
      const code = (html.match(/mp4:[0-9]{7}\/[A-Za-z0-9]+/) || [])[0];
      if (code) m3u8 = `https://wowza.tvcf.co.kr:1443/vod/_definst_/${code}_720p.mp4/playlist.m3u8`;
    }
    if (!m3u8) return J(502, { error: "영상 스트림 주소를 찾지 못했어요" });
    const title = ((html.match(/<title>([^<]*)<\/title>/) || [])[1] || "").replace(/\s*\|\s*TVCF\s*$/, "").trim();
    return J(200, { ok: true, m3u8, title });
  } catch (e) { return J(502, { error: "resolve 실패", detail: String(e) }); }
};
