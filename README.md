# TVCF 트렌드 아카이브

TVCF HOT차트 신규 광고의 스토리보드·톤앤무드·컬러 파이프라인·크리에이티브 평가를 축적하는 정적 아카이브.

## 구조
- `index.html` — 뷰(필터·카드·상세 모달·영상 플레이어) 전체가 담긴 단일 파일
- `data/manifest.js` — 그룹 목록(`window.TVCF_WEEKS`)
- `data/<날짜>.js`, `data/requests.js` — 그룹별 광고 분석 데이터
- `images/<그룹>/<id>/shot_NN.jpg` — 샷 스토리보드 이미지
- `videos/<그룹>/<id>.mp4` — (선택) 호스팅 영상. 없으면 모달에서 TVCF 플레이어를 iframe으로 임베드
- `incoming/`, `backups/`, `*.zip` — 로컬 작업용. `.gitignore`로 배포에서 제외

## 배포 (Git 기반 — 이 리포)
`main` 브랜치에 push하면 연결된 Netlify 사이트가 자동 배포한다.

```bash
git add -A
git commit -m "설명"
git push origin main
```

## 새 분석 추가 (Cowork · tvcf-trend-archive 스킬)
TVCF play 링크로 온디맨드 분석 → `data/requests.js`의 `requests` 그룹에 append,
이미지는 `images/requests/<id>/`, 영상은 `videos/requests/<id>.mp4`. push하면 배포.

## 팀 협업
팀원은 이 리포를 clone → 각자 분석분을 commit → push(또는 PR). git이 병합을 관리하므로
드래그드롭 방식과 달리 서로의 작업을 덮어쓰지 않는다.
