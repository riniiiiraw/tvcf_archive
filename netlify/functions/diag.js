// 임시 진단용(동기) — 모델 문자열 유효성 + 이미지 URL 참조가 되는지 즉시 확인.
// 사용: /.netlify/functions/diag?m=haiku  또는  ?m=sonnet
export default async (req) => {
  const AKEY = process.env.ANTHROPIC_API_KEY;
  const which = new URL(req.url).searchParams.get("m") || "haiku";
  const model = which === "sonnet" ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001";
  const base = "https://tvcf-archive-new.netlify.app/images/requests/bacchus";
  const content = [
    { type: "image", source: { type: "url", url: base + "/shot_00.jpg" } },
    { type: "image", source: { type: "url", url: base + "/shot_02.jpg" } },
    { type: "text", text: "이 두 프레임의 브랜드를 한 단어로만 답해." }
  ];
  const out = { model };
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": AKEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 120, messages: [{ role: "user", content }] })
    });
    const j = await r.json();
    out.httpStatus = r.status;
    out.apiError = j.error || null;
    out.stop = j.stop_reason || null;
    out.text = (j.content || []).map((c) => c.text || "").join("").slice(0, 200);
  } catch (e) { out.err = String(e); }
  return new Response(JSON.stringify(out, null, 1), { status: 200, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
};
