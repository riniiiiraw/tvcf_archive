// Netlify Function (ESM) — wowza HLS CORS 프록시
// hls.js가 브라우저에서 TVCF 영상을 재생/디코딩할 수 있도록 m3u8·세그먼트를 대신 받아 CORS 헤더로 전달.
// m3u8/청크리스트는 내부 URL을 프록시 경유로 재작성한다.
// 사용: /.netlify/functions/proxy?url=<wowza url>
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const ACAO = "*";
const PROXY = "/.netlify/functions/proxy?url=";

export default async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: { "access-control-allow-origin": ACAO, "access-control-allow-headers": "*" } });
  const target = new URL(req.url).searchParams.get("url") || "";
  if (!/^https:\/\/wowza\.tvcf\.co\.kr/.test(target))
    return new Response(JSON.stringify({ error: "허용되지 않은 대상" }), { status: 400, headers: { "content-type": "application/json", "access-control-allow-origin": ACAO } });
  try {
    const r = await fetch(target, { headers: { "user-agent": UA } });
    const isM3u8 = /\.m3u8(\?|$)/.test(target);
    if (isM3u8) {
      let text = await r.text();
      const baseDir = target.slice(0, target.lastIndexOf("/") + 1);
      text = text.split("\n").map((line) => {
        const l = line.trim();
        if (!l || l.startsWith("#")) return line;
        const abs = /^https?:\/\//.test(l) ? l : baseDir + l;
        return PROXY + encodeURIComponent(abs);
      }).join("\n");
      return new Response(text, { status: r.status, headers: { "content-type": "application/vnd.apple.mpegurl", "access-control-allow-origin": ACAO, "cache-control": "no-store" } });
    }
    const buf = await r.arrayBuffer();
    return new Response(Buffer.from(buf), { status: r.status, headers: { "content-type": r.headers.get("content-type") || "video/mp2t", "access-control-allow-origin": ACAO, "cache-control": "no-store" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: "proxy 실패", detail: String(e) }), { status: 502, headers: { "content-type": "application/json", "access-control-allow-origin": ACAO } });
  }
};
