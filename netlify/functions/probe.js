// Netlify Function (ESM) — Phase 4 타당성 프로브
// 서버(AWS)에서 TVCF/유튜브 영상 소스에 실제로 접근 가능한지 진단만 한다. (저장/분석 없음)
// 사용: /.netlify/functions/probe?url=<링크>

const CORS = { "content-type": "application/json", "access-control-allow-origin": "*" };
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

export default async (req) => {
  const url = new URL(req.url).searchParams.get("url") || "";
  const out = { url, steps: {} };
  try {
    if (/tvcf\.co\.kr\/play\//.test(url)) {
      out.type = "tvcf";
      // 1) play 페이지 SSR HTML 서버 fetch
      const r1 = await fetch(url, { headers: { "user-agent": UA } });
      out.steps.playPage = { status: r1.status, ok: r1.ok };
      const html = await r1.text();
      out.steps.playPage.bytes = html.length;
      // 2) HTML에서 wowza m3u8 또는 코드 추출
      const m3u8 = (html.match(/https:[^"'\\\s]+playlist\.m3u8/) || [])[0];
      const code = (html.match(/mp4:[0-9]{7}\/[A-Za-z0-9]+/) || [])[0];
      out.steps.extracted = { m3u8: m3u8 || null, code: code || null };
      const base = m3u8 ? m3u8.replace(/playlist\.m3u8.*$/, "") : (code ? `https://wowza.tvcf.co.kr:1443/vod/_definst_/${code}_720p.mp4/` : null);
      // 3) 서버에서 wowza m3u8 fetch 가능한가? (핵심)
      if (base) {
        try {
          const r2 = await fetch(base + "playlist.m3u8", { headers: { "user-agent": UA } });
          const t2 = await r2.text();
          out.steps.m3u8 = { status: r2.status, ok: r2.ok, bytes: t2.length, head: t2.slice(0, 100) };
          // 4) 청크리스트 + 세그먼트 1개 서버 fetch 가능한가?
          const cl = (t2.match(/chunklist[^\s"']+/) || [])[0];
          if (cl) {
            const r3 = await fetch(base + cl, { headers: { "user-agent": UA } });
            const t3 = await r3.text();
            const seg = (t3.match(/media[^\s"']+\.ts/) || [])[0];
            out.steps.chunklist = { status: r3.status, segs: (t3.match(/\.ts/g) || []).length, firstSeg: seg || null };
            if (seg) {
              const r4 = await fetch(base + seg, { headers: { "user-agent": UA } });
              const buf = await r4.arrayBuffer();
              out.steps.segment = { status: r4.status, ok: r4.ok, bytes: buf.byteLength };
            }
          }
        } catch (e) { out.steps.m3u8 = { error: String(e) }; }
      }
      out.verdict = out.steps.segment && out.steps.segment.ok ? "TVCF 서버수집 가능 ✅" : "TVCF 서버수집 막힘/부분 ⚠️";
    } else if (/youtu\.?be/.test(url)) {
      out.type = "youtube";
      const id = (url.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{6,})/) || [])[1];
      out.videoId = id || null;
      // oembed(제목 확인) + 썸네일 접근성만 확인 (전체 프레임 추출은 별도 필요)
      if (id) {
        const oe = await fetch(`https://www.youtube.com/oembed?url=https://youtu.be/${id}&format=json`).then(r => r.ok ? r.json() : null).catch(() => null);
        out.oembed = oe ? { title: oe.title, author: oe.author_name } : null;
        const th = await fetch(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
        out.steps.thumbnail = { status: th.status, ok: th.ok };
      }
      out.verdict = "유튜브는 썸네일/메타만 서버 접근 가능 — 프레임 다수 확보는 별도 방법 필요 ⚠️";
    } else {
      out.error = "지원하지 않는 링크 (tvcf.co.kr/play/ 또는 youtube)";
    }
  } catch (e) { out.error = String(e); }
  return new Response(JSON.stringify(out, null, 1), { status: 200, headers: CORS });
};
