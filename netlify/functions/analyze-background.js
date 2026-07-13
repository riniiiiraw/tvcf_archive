// Netlify Function (ESM) — 업로드된 프레임 → Claude 분석 → Supabase 저장
// 환경변수: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SECRET_KEY
// (선택) ANALYZE_MODEL. 기본 Haiku + 전문가 프롬프트로 고품질 유도.

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

const FEWSHOT = `{
 "brand":"티스테이션","title":"싹 다 되는 타이어서비스","prodCat":"모빌리티","format":"버라이어티&예능형","rt":"30초~60초","durSec":57,
 "look":["키치","코미디","빈티지레트로"],"lighting":["낮-실외","스튜디오"],"camWork":["픽스 정물","와이드 앙상블","합성 스튜디오","리버스 샷"],
 "palette":["#0D1013","#3E2E28","#9E7960","#E9E6DE","#F97316"],
 "core":"'싹 다 된다'는 추상 카피를 '장르가 몇 번 바뀌는가'로 물량 증명한다 — 서비스 항목 수 = 장르 수라는 등식이 코어다.",
 "target":"3050 자차 운전자","model":"중년 개그 콤비",
 "copy":{"main":"싹 다 되는 타이어서비스, T스테이션","sub":["티스테이션은 말이야","부담 제로"],"types":["선언형","반복후크"],"tone":"유머"},
 "board":[[1,"차 안 2인 콩트 오프닝"],[2,"조수석 클로즈업 — 타이어 고민 토로"],[3,"영화 포스터 패러디 군상"]],
 "conceptText":"타이어 '판매'가 아니라 '서비스 전체'를 파는 리브랜딩. 장착·배송·보관 등 항목마다 완전히 다른 장르(포스터·호텔·SF)를 배정해 옴니버스 개그로 엮었다.",
 "toneMood":"예능 자막체와 원색 타이포가 쉴 새 없이 튀는 B급 버라이어티 무드. 진지한 재현일수록 웃긴다는 패러디 원칙. 브랜드 오렌지가 전 장르를 관통하는 유일한 고정 색.",
 "colorPipe":"구간별 멀티 그레이딩 — 콩트는 뉴트럴 리얼, 포스터는 하이콘트라스트 시네마, SF는 청회색. 장르마다 톤을 갈아끼우되 브랜드 오렌지 채도만 전 구간 고정해 연속성을 색 하나로 지탱한다.",
 "features":[{"img":0,"text":"장르 패러디의 진지한 재현 — 포스터 레이아웃·의상·조명까지 원본 문법 준수"}],
 "critique":{
   "good":["[연출기획] 추상 카피를 장르 개수로 물량 증명한 구조가 명쾌하다. 각 스케치가 6초 내외라 숏폼 컷다운 재활용까지 계산된 설계.","[미술] 장르별 세트·의상의 재현 밀도가 패러디의 설득력을 만든다."],
   "weak":["[편집 리듬] 스케치 사이 콩트 브릿지가 후반으로 갈수록 반복 소모된다.","[정보 위계] 항목 나열형이라 '핵심 차별점 하나'가 안 남는다."],
   "target":"'타이어=티스테이션' 카테고리 연상엔 유효하나, 실제 방문 트리거는 별도 퍼포먼스 광고에 의존하는 구조."},
 "apply":[
   {"point":"'항목 수 = 장르 수' 옴니버스 공식","ex":"다품목 서비스 클라이언트 제안 시 항목별 6초 장르 스케치 × 액자 콩트. 숏폼 컷다운까지 패키지로."},
   {"point":"브랜드 컬러 관통 장치","ex":"이미지 프롬프트에 'consistent brand orange accent across all scenes' 규칙으로 멀티 톤 통일."}]
}`;

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

  const sys = `너는 대한민국 최상위 광고 프로덕션의 시니어 트렌드 리서처이자 촬영감독이다. 크리에이티브 디렉터에게 바로 제출할 수준의, 날카롭고 전문적인 광고 분석을 쓴다. 주어진 스토리보드 프레임(시간순)만 근거로 아래 JSON을 출력한다. 코드블록·군더더기 없이 순수 JSON만.

[분류 사전 — 반드시 이 값들만 사용]
prodCat(1): ${T.prodCat.join(" / ")}
format(1): ${T.format.join(" / ")}
look(2~4개, 스타일+감정 혼합): 스타일=[${T.lookStyle.join(", ")}] 감정=[${T.lookEmotion.join(", ")}]
lighting(해당 전부): ${T.lighting.join(" / ")}
camWork(2~5): ${T.camWork.join(", ")}
rt(1): ${T.rt.join(" / ")}

[전문가 품질 기준]
- core: 표면 줄거리가 아니라 '아이디어가 작동하는 구조(코어 메커니즘)'를 1~2문장으로.
- copy: 화면의 카피 근거. types=카피 유형(선언형/반복후크/워드플레이/문답형 등), tone=유머/진지/응원 등.
- board: 프레임 수와 정확히 동일. 각 샷을 '무엇을 어떤 구도·연출로' 보여주는지 한 줄.
- toneMood: 조명·그레이딩·미술 무드를 색·질감·리듬으로 2~3문장.
- colorPipe: 그레이딩 전략·구간별 톤 변화·브랜드 컬러 처리 2~3문장.
- critique.good/weak: 각 2개+. 반드시 [기획]/[촬영]/[조명]/[미술]/[편집]/[정보위계] 분야 태그를 앞에 붙이고 구체 근거와 함께 신랄하게. 두루뭉술 금지.
- critique.target: 타깃 도달·설득 관점의 냉정한 판정.
- apply: 3개. point=재사용할 원리, ex=그 원리를 실제 카피·연출·이미지 프롬프트로 옮긴 구체 예시(추상론 금지).
- palette: 프레임에서 실제 관찰된 대표 hex 5개.

[따라야 할 예시 — 이 깊이·문체]
${FEWSHOT}

[규칙]
- board 항목 수 = 프레임 수(정확히).
- 프레임에서 실제 관찰된 것만. 사운드·편집 리듬 등 프레임으로 확인 불가한 건 단정 금지.
- 모든 값 한국어. 오직 JSON만.

[출력 스키마]
{"brand","title","prodCat","format","rt","durSec":number,"look":[],"lighting":[],"camWork":[],"palette":[],"core","target","model","copy":{"main","sub":[],"types":[],"tone"},"board":[[n,"..."]],"conceptText","toneMood","colorPipe","features":[{"img":n,"text"}],"critique":{"good":[],"weak":[],"target"},"apply":[{"point","ex"}]}`;

  const content = frames.map((b64) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } }));
  content.push({ type: "text", text: `위 ${frames.length}개 프레임은 한 광고의 시간순 스토리보드다.${meta.brand ? " 브랜드: " + meta.brand + "." : ""}${meta.title ? " 제목: " + meta.title + "." : ""} 예시와 같은 전문가 깊이로 분석 JSON만 출력. board 항목 수 = ${frames.length}.` });

  let analysis;
  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": AKEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 4096, system: sys, messages: [{ role: "user", content }] })
    });
    const j = await r.json();
    if (j.error) return J(502, { error: "Claude API 오류", detail: j.error });
    const text = (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
    analysis = JSON.parse(stripJson(text));
  } catch (e) { return J(502, { error: "분석 실패", detail: String(e) }); }

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
