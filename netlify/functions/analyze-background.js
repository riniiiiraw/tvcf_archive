// Netlify Background Function — 저장된 프레임(URL)을 Claude로 "전략 기획자" 관점에서 심층 분석 → Supabase 기록.
// 페이로드 {id, count, imgBase?, meta...}. 프레임은 store-frames가 미리 저장(또는 imgBase로 기존 이미지 참조=재분석).
// 환경변수: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SECRET_KEY / (선택) ANALYZE_MODEL

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const CORS = { "content-type": "application/json", "access-control-allow-origin": "*" };

const T = {
  prodCat: ["F&B","테크&가전","뷰티","패션","서비스&플랫폼","파이낸스&기업PR","리빙&헬스케어","엔터테인먼트&컬처","에듀&커리어","모빌리티","공익&공공"],
  format: ["드라마타이즈","브랜드필름","무드필름","스케치 코미디","제품데모","인터뷰&도큐멘터리","타이포&그래픽 쇼케이스","메이킹&비하인드","뮤직비디오","버라이어티&예능형"],
  lookStyle: ["시네마틱","느와르","미니멀리즘","사이버펑크","비비드네온","판타지","빈티지레트로","키치","미스틱","제품데모"],
  lookEmotion: ["코미디","응원","진지","청춘","긴장감","공감","감동","슬픔","분노"],
  lighting: ["낮-실내","낮-실외","밤-실내","밤-실외","스튜디오"],
  camWork: ["픽스","픽스 정물","정면 대칭 픽스","핸드헬드","스테디캠/짐벌","달리/트래킹","크레인/지미집","드론","급줌","슬로모션","고속촬영","매크로","초접사 매크로","롱렌즈 얕은 심도","롱렌즈 클로즈업","와이드","와이드 앙상블","리버스 샷","POV","CG 카메라 무빙","CG 트랜지션","합성 스튜디오"],
  rt: ["~5초","5초~10초","10초~15초","15초~30초","30초~60초","60초 이상"]
};

const J = (status, obj) => new Response(JSON.stringify(obj), { status, headers: CORS });
const stripJson = (t) => { const a = t.indexOf("{"), b = t.lastIndexOf("}"); return (a >= 0 && b > a) ? t.slice(a, b + 1) : t; };

export default async (req) => {
  if (req.method !== "POST") return J(405, { error: "POST only" });
  const SUPA = process.env.SUPABASE_URL, SKEY = process.env.SUPABASE_SECRET_KEY, AKEY = process.env.ANTHROPIC_API_KEY;
  if (!SUPA || !SKEY || !AKEY) return J(500, { error: "환경변수 누락" });

  let body;
  try { body = await req.json(); } catch { return J(400, { error: "invalid JSON body" }); }
  const id = body.id, count = body.count || 0;
  if (!id || !count) return J(400, { error: "id·count 필요" });
  const meta = { brand: body.brand || "", title: body.title || "", link: body.link || "", uploader: body.uploader || "" };
  const MODEL = process.env.ANALYZE_MODEL || "claude-sonnet-4-6";
  const imgBase = body.imgBase || `${SUPA}/storage/v1/object/public/frames/${id}`;

  const sys = `너는 대한민국 최상위 광고회사의 시니어 전략 기획자(Strategic Planner) 겸 크리에이티브 디렉터다. 단순 영상 리뷰어가 아니라, 광고를 '샅샅이 분해하고 재구성'해 기획 초기부터 PPM까지 즉시 활용 가능한 전략 인사이트를 뽑는다. 주어진 스토리보드 프레임(시간순)만 근거로 아래 JSON을 출력한다. 코드블록/군더더기 없이 순수 JSON만. 모든 값은 한국어. 평이한 요약·상투어 금지 — 구체적 근거와 실무 함의를 담아 깊게 쓴다.

[분류 사전 — 반드시 이 값들만]
prodCat(1): ${T.prodCat.join(" / ")}
format(1): ${T.format.join(" / ")}
look(2~4, 스타일+감정): 스타일=[${T.lookStyle.join(", ")}] 감정=[${T.lookEmotion.join(", ")}]
lighting(해당 전부): ${T.lighting.join(" / ")}
camWork(2~5): ${T.camWork.join(", ")}
rt(1): ${T.rt.join(" / ")}

[3대 분석 축 — 각 필드를 전략 기획자 수준으로 깊게]
A. 타겟 인사이트(targetInsight)
 - persona: 데모그래픽을 넘어선 사이코그래픽. 타겟의 라이프스타일·가치관·자기인식을 3~4문장으로 구체화.
 - painPoint: 타겟이 말로 안 하는 숨은 페인포인트와, 이 광고가 그 지점을 어떻게 건드리는지.
 - cdj: 소비자 여정(인지 Awareness / 고려 Consideration / 전환 Conversion) 중 이 광고가 '어느 단계의 어떤 허들'을 풀려는지 근거와 함께 특정.
 - shareability: 어떤 세그먼트에서 공감·화제가 터지는지, 바이럴/공유 잠재력과 그 트리거.
B. 내러티브·스토리 구조(narrative)
 - structure: 스토리텔링 구조(도입-갈등-해소-반전), 기승전결과 긴장 설계.
 - brandIntegration: 브랜드 메시지가 스토리에 유기적으로 녹았는지(억지 삽입 vs 자연 결합) 평가.
 - appeal: 이성적 소구와 감성적 소구의 결합 방식, 핵심 카피의 각인 메커니즘.
 - positioning: 경쟁 카테고리 대비 차별화된 브랜드 보이스·페르소나가 스토리로 어떻게 강화됐는지.
C. 크리에이티브 전략(creative)
 - brief: 이 광고가 나온 근본 마케팅 문제를 역추적한 '크리에이티브 브리프'(무엇을 풀려고 이 크리에이티브가 나왔는가).
 - coreConcept: 한 문장으로 압축한 핵심 컨셉 + 부연.
 - scalability: 이 아이디어의 확장 가능성(시즌·시리즈·버전·매체 변형).
 - diversification: 제안서·PPM에서 즉시 벤치마킹할 캠페인 다각화 방안(구체적 실행안).

[그 외 필드]
 - core: 아이디어가 작동하는 코어 메커니즘 1~2문장.
 - copy: 화면 카피 근거. types=카피 유형, tone=톤.
 - board: 프레임 수와 정확히 동일. 각 샷을 '무엇을 어떤 구도·연출로' 한 줄.
 - toneMood/colorPipe: 색·질감·리듬·그레이딩 전략 2~3문장.
 - features: 결정적 연출 장치 2~3개(프레임 인덱스 포함).
 - critique.good/weak: 각 2개+. [기획]/[촬영]/[조명]/[미술]/[편집]/[전략] 태그를 붙여 근거와 함께 신랄하게.
 - critique.target: 타겟 도달·설득 관점의 냉정한 판정.
 - apply: 3개+. point=우리 작업(기획·제안·PPM)에 재사용할 전략 원리, ex=그 원리를 실제 카피·연출·이미지 프롬프트·캠페인 설계로 옮긴 구체 예시.
 - palette: 프레임에서 실제 관찰된 hex 5개.

[규칙] board 항목 수 = 프레임 수. 프레임에서 관찰된 것만(사운드·미확인 사실 단정 금지). 오직 JSON.

[출력 스키마]
{"brand","title","prodCat","format","rt","durSec":number,"look":[],"lighting":[],"camWork":[],"palette":[],"core","target","model","copy":{"main","sub":[],"types":[],"tone"},"board":[[n,"..."]],"conceptText","toneMood","colorPipe","features":[{"img":n,"text"}],"targetInsight":{"persona","painPoint","cdj","shareability"},"narrative":{"structure","brandIntegration","appeal","positioning"},"creative":{"brief","coreConcept","scalability","diversification"},"critique":{"good":[],"weak":[],"target"},"apply":[{"point","ex"}]}`;

  const content = [];
  for (let i = 0; i < count; i++) content.push({ type: "image", source: { type: "url", url: `${imgBase}/shot_${String(i).padStart(2, "0")}.jpg` } });
  content.push({ type: "text", text: `위 ${count}개 프레임은 한 광고의 시간순 스토리보드다.${meta.brand ? " 브랜드: " + meta.brand + "." : ""}${meta.title ? " 제목: " + meta.title + "." : ""} 전략 기획자 관점에서 A·B·C 3축을 깊게 채운 분석 JSON만 출력. board 항목 수 = ${count}.` });

  let analysis;
  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": AKEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 6000, system: sys, messages: [{ role: "user", content }] })
    });
    const j = await r.json();
    if (j.error) { console.error("Claude", JSON.stringify(j.error)); return J(502, { error: "Claude API 오류" }); }
    const text = (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
    analysis = JSON.parse(stripJson(text));
  } catch (e) { console.error("분석 실패", String(e)); return J(502, { error: "분석 실패", detail: String(e) }); }

  const ad = Object.assign({
    id, _week: body.week || "uploads", rank: (body.rank != null ? body.rank : 0),
    agency: body.agency || "업로드", onair: body.onair || "", link: meta.link || "", video: body.video || "", imgBase, conceptImgs: []
  }, analysis);
  ad.brand = ad.brand || meta.brand; ad.title = ad.title || meta.title; ad.analyzedAt = Date.now();

  const record = { id, brand: ad.brand, title: ad.title, source_link: meta.link, created_by: meta.uploader, data: ad };
  try {
    const ins = await fetch(`${SUPA}/rest/v1/analyses`, {
      method: "POST",
      headers: { authorization: `Bearer ${SKEY}`, apikey: SKEY, "content-type": "application/json", prefer: "return=minimal,resolution=merge-duplicates" },
      body: JSON.stringify(record)
    });
    if (!ins.ok) { console.error("DB", await ins.text()); return J(502, { error: "DB 저장 실패" }); }
  } catch (e) { console.error("DB 예외", String(e)); return J(502, { error: "DB 저장 예외", detail: String(e) }); }

  return J(200, { ok: true, id });
};
