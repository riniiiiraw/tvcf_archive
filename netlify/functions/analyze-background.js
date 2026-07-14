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

// 골드 예시 — Haiku가 이 깊이·구조를 재현하도록 학습시키는 few-shot (전략 기획자 수준)
const FEWSHOT_GOLD = `{
 "brand":"티스테이션","title":"싹 다 되는 타이어서비스","prodCat":"모빌리티","format":"버라이어티&예능형","rt":"30초~60초","durSec":57,
 "look":["키치","코미디","빈티지레트로"],"lighting":["낮-실외","스튜디오"],"camWork":["픽스 정물","와이드 앙상블","합성 스튜디오","리버스 샷"],
 "palette":["#0D1013","#3E2E28","#9E7960","#E9E6DE","#F97316"],
 "core":"'싹 다 된다'는 검증 불가 카피를 '장르가 몇 번 바뀌는가'로 물량 증명 — 서비스 항목 수 = 장르 수라는 등식이 코어.",
 "target":"3050 자차 운전자","model":"중년 개그 콤비",
 "copy":{"main":"싹 다 되는 타이어서비스, T스테이션","sub":["티스테이션은 말이야","부담 제로","all my T"],"types":["선언형","반복후크"],"tone":"유머"},
 "board":[[1,"차 안 2인 콩트 오프닝 — 픽스 투샷"],[2,"타이어 고민 토로 클로즈업"],[3,"영화 포스터 패러디 군상 와이드"]],
 "conceptText":"타이어 '판매'가 아니라 '서비스 전체'를 파는 리브랜딩. 장착·배송·보관·공기압·펑크체크 항목마다 완전히 다른 장르(영화 포스터·호텔 콘시어지·SF·벌룬 판타지)를 배정해 57초 옴니버스 개그로 엮었다.",
 "toneMood":"예능 자막체와 원색 타이포가 쉴 새 없이 튀는 B급 버라이어티. 진지한 재현일수록 웃긴다는 패러디 원칙. 브랜드 오렌지가 전 장르를 관통하는 유일한 고정 색.",
 "colorPipe":"구간별 멀티 그레이딩 — 콩트는 뉴트럴 리얼, 포스터는 하이콘트라스트 시네마, SF는 청회색. 장르마다 톤을 갈아끼우되 브랜드 오렌지 채도만 전 구간 고정해 연속성을 색 하나로 지탱.",
 "features":[{"img":0,"text":"장르 패러디의 진지한 재현 — 포스터 레이아웃·의상·조명까지 원본 문법 준수"},{"img":1,"text":"예능 자막 타이포가 내레이션을 대체 — 음성 없이 구조가 읽힘"}],
 "targetInsight":{
   "persona":"차를 '생활 도구'로 쓰는 3050 남성. 정비 지식은 얕지만 '호구 잡히기'를 극도로 경계하고, 가족 안전과 합리적 소비를 동시에 신경 쓴다. 정비소를 '불투명하고 무서운 공간'으로 학습해온 방어기제가 있다.",
   "painPoint":"'타이어 하나 갈러 갔다 이것저것 바가지 쓸까 봐' 두려운 정보 비대칭. 무엇을 어디서 얼마에 받는지 모른다는 불안이 진짜 페인이며, 광고는 이를 '싹 다, 한 곳에서, 부담 제로' 원스톱 안심으로 정면 반박한다.",
   "cdj":"고려(Consideration) 단계 허들 공략. '타이어=어디선가 갈아야 함'이 이미 인지된 상태에서 '왜 하필 티스테이션'이라는 선택 이유를 '서비스 폭'으로 각인해 대안군 최상단으로 끌어올린다.",
   "shareability":"장르 패러디 각 컷이 독립 밈으로 잘려 3050 남초 커뮤니티·쇼츠에서 '이거 무슨 장르냐' 놀이로 확산될 잠재력. 단 공유 트리거가 '정보'가 아닌 'B급 웃음'이라 콘텐츠 회상이 브랜드 회상을 앞지를 위험도 공존."
 },
 "narrative":{
   "structure":"액자식 옴니버스 — 차 안 콩트가 각 장르 스케치를 여닫는 프레임. 갈등(타이어 고민)→해소(항목별 서비스)를 6초 단위로 반복해 지루함을 리듬으로 상쇄. 반전은 '진지한 장르 재현 × 타이어'라는 이질 조합 자체.",
   "brandIntegration":"브랜드가 스토리에 '얹힌' 게 아니라 스토리의 '뼈대'다 — 서비스 항목이 곧 장르 전환 엔진이라 브랜드를 빼면 내러티브가 성립하지 않는다. 결합도 최상위.",
   "appeal":"표면은 감성(웃음·유희) 소구지만 그 아래 '이 모든 걸 한 곳에서'라는 이성 편익을 심는 이중구조. 핵심 카피 'all my T'가 브랜드 이니셜을 후크로 각인.",
   "positioning":"타이어를 '제품'이 아니라 '서비스 플랫폼'으로 재정의해 카센터·대리점과 다른 층위에 선다. B급 유머라는 브랜드 보이스로 '무섭지 않은 정비' 페르소나를 강화."
 },
 "creative":{
   "brief":"'티스테이션이 타이어만 파는 곳이 아니라 통합 카케어 브랜드임을 어떻게 알릴 것인가.' 인지도는 있으나 저평가된 '서비스 범위'를, 나열이 아닌 '장르 물량'으로 체감시키자는 방향.",
   "coreConcept":"'서비스 항목 = 장르' — 할 수 있는 게 많다는 걸 말하지 않고 '장르가 계속 바뀌는' 형식으로 증명한다.",
   "scalability":"신규 서비스가 생길 때마다 새 장르 스케치 1편만 추가하면 되는 무한 확장 포맷. 계절(겨울 타이어=재난영화)·지역·모델별 버전화가 쉽고 6초 컷은 쇼츠·옥외로 그대로 컷다운.",
   "diversification":"① 6초 장르 스케치를 개별 쇼츠 시리즈로 상시 운영 ② '당신의 타이어는 무슨 장르?' UGC 챌린지 ③ 매장 방문 트리거용 '장르별 서비스' 랜딩·쿠폰 연계. PPM에선 장르별 세트·의상을 모듈화해 촬영 효율 확보."
 },
 "critique":{
   "good":["[전략] 검증 불가 카피를 '장르 개수'라는 눈에 보이는 물량으로 번역한 발상이 명쾌하고, 브랜드를 빼면 스토리가 무너지는 결합도가 특히 강하다.","[미술] 장르별 세트·의상·조명의 재현 밀도가 패러디 설득력을 만들고, 브랜드 오렌지 단일 고정색이 파편적 구성을 하나로 묶는다."],
   "weak":["[정보 위계] 항목 나열형이라 웃음 총량은 크지만 '핵심 차별점 하나'가 안 남는다 — 콘텐츠 회상이 브랜드 회상을 앞지를 위험.","[편집 리듬] 후반 콩트 브릿지가 반복 소모돼 57초 긴장이 느슨해진다. 리액션 컷 2~3개를 덜면 50초 안에서 더 팽팽했을 것."],
   "target":"3050에게 '타이어=티스테이션' 연상엔 유효하나 실제 방문 전환은 가격·예약 편의를 다루는 퍼포먼스 광고에 의존 — 이 필름은 고려 단계 각인까지가 역할."
 },
 "apply":[
   {"point":"'주장'을 '형식'으로 증명하는 구조","ex":"다기능·다항목 클라이언트 제안 시 기능을 나열하지 말고 '형식이 계속 바뀌는' 구성으로 물량을 체감시키기. 콘티에 '항목 수 = 톤/장르 수' 원칙 명시."},
   {"point":"브랜드 컬러 1색 고정으로 파편 통합","ex":"멀티 톤·장르 캠페인에서 브랜드 컬러 1색만 전 구간 채도 고정. 이미지 프롬프트에 'consistent brand color accent across all scenes' 규칙화."},
   {"point":"6초 모듈 = 확장·컷다운 자산","ex":"본편을 6초 독립 모듈로 설계해 쇼츠·옥외·UGC로 재활용. PPM에서 모듈별 세트·의상을 리스트업해 촬영 효율과 시리즈화를 동시 확보."}
 ]
}`;

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
  // 기본 Haiku(저렴, 골드 예시로 학습) / 재분석 등 body.model==="sonnet" 이면 Sonnet(고품질)
  const MODEL = body.model === "sonnet" ? "claude-sonnet-4-6" : (process.env.ANALYZE_MODEL || "claude-haiku-4-5-20251001");
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

[반드시 이 골드 예시의 깊이·구조·문체를 재현하라 — 각 전략 필드를 이만큼 구체적이고 통찰력 있게]
${FEWSHOT_GOLD}

[규칙] board 항목 수 = 프레임 수. 프레임에서 관찰된 것만(사운드·미확인 사실 단정 금지). 절대 깨진 한국어·의미 불명 문장을 쓰지 말 것. 오직 JSON.

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
