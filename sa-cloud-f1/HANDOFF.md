# SA CLOUD F1 홍보영상 — 작업 인수인계

작업 브랜치: `claude/video-production-pumils` (moopl 저장소). **여기 외에는 아무것도 건드리지 않는다.**
`stockerboy/sacloud` 는 읽기 전용으로만 참조했다. 수정·푸시 없음.

## 확정된 사양

- **컨셉**: F1 레이스. 톤은 SA CLOUD 사이트 디자인 토큰(D-204 `적진`)을 따른다 —
  바닥 `#060505` · 강조 진홍 `#d92b2b` · Black Han Sans + JetBrains Mono
- **음악**: `Lose My Mind` (사용자 지정). 상업 음원이라 이 환경에서 받아올 수 없다.
  **무음 렌더 + 효과음(엔진·타이어·충돌·굉음)만 합성**하기로 확정. 음악은 업로드 단계에서 사용자가 입힌다
- **포맷**: 유튜브 쇼츠용 9:16 세로가 주력. 사이트 메인 자동재생용 16:9 도 같이 뽑는다
- **길이**: 약 2분
- **SA 등장**: 연기 속 헤드라이트 궤적이 'SA' 를 그린다 (사용자 확정)
- **약자 연출**: L·O·U·D 를 하나씩 → 흩어진 4개 → CONNECT 단독 등장 →
  CONNECT 에서 연결선이 뻗어 4개를 이으며 **CLOUD** 완성 → SA 붙어서 `SA CLOUD`
  (사이트 소개문에 이미 "Connected League Operations & User Data" 가 있다)

## 장면 구성 (약 125초)

| 구간 | 내용 |
|---|---|
| 0:00–0:12 | 스타팅 그리드 22대 부감. 11열 2대씩 |
| 0:12–0:32 | 클랜 소개 — 마크 + 클랜명 + IPL/DPL 뱃지가 보이게 한 대씩 (사용자 명시 요구) |
| 0:32–0:40 | 5개 레드라이트 → 라이트 아웃 → 타이어 연기와 함께 출발 |
| 0:40–1:20 | 레이스. 접전·충돌·추월. 좌측에 클랜마크 순위 타워가 실시간 갱신 |
| 1:20–1:35 | FINAL LAP → 선두 통과 → **마지막 22번째 차까지** 통과 |
| 1:35–1:45 | 굉음 + 화면을 채우는 연기 |
| 1:45–2:05 | 연기 속 헤드라이트가 SA 각인 → 약자 전개 → CLOUD 완성 → 락업 |

## 지금까지 끝난 것

- `data/clans22.json` — 실서비스 API에서 뽑은 22개 클랜 (DPL 1부 상위 11 + IPL 2부 11).
  순위·레이팅·승패·승률·클랜마크 URL·도색 색상 포함
- `assets/marks/` — 클랜마크 44장 (22클랜 × bg/front 2레이어). 전부 다운로드 성공
- 도색 팔레트 — 마크의 색상(hue)을 살리고 채도·명도만 레이싱 도색 범위로 올린 값.
  DPL 은 진하게, IPL 은 밝게 갈라 두 리그가 화면에서 구분된다

## 다음 세션이 이어서 할 것

1. **`data/clans22.json` 색 중복 하나 수정** — `evermore` 와 `deluxe` 가 둘 다 `#d232fc` 다.
   최소 간격 강제 루프가 40회 한도에 걸려 마지막 한 대를 못 밀어냈다
2. 캔버스 애니메이션 엔진 (`f1.html`) — `seek(t)` 가 t 의 순수 함수여야 프레임 캡처가 결정적이다
3. 프레임 캡처 (`tools/render.js`) — Playwright + `canvas.toDataURL`.
   **Chromium 은 반드시 `proxy: { server: process.env.HTTPS_PROXY }` 로 띄운다.**
   단, vercel 배포 도메인은 Chromium 터널이 끊긴다 (curl 은 됨) — 라이브 사이트 스크린샷은 포기했다
4. 효과음 합성 (`tools/sfx.py`, numpy) → 렌더 → ffmpeg 인코딩
5. 사이트 첫 방문 1회 자동재생 스니펫 (`site-embed/`).
   **sacloud 저장소를 직접 고치지 않는다.** 끼워넣기용 코드와 적용법만 넘긴다

## 환경 메모

- ffmpeg: `/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux` (PATH 에 없다)
- playwright: `NODE_PATH=/opt/node22/lib/node_modules`
- 폰트는 `~/.fonts` 에 설치돼 있다 — Black Han Sans · JetBrains Mono · Pretendard · Archivo Black · Chakra Petch.
  **새 컨테이너에서는 다시 받아야 한다** (Pretendard 는 jsdelivr, 나머지는 google fonts)
- SA CLOUD 라이브: `https://sacloud-web-softgw01-8957s-projects.vercel.app`
  리그 ID — DPL `cmt3zz1560001vlv8n5ipf643` · IPL `cmtcd7vpk0000vl1werr0rmmf`
  클랜랭킹 API: `/api/leagues/{id}/ranks/clans?division=N` (DPL 1부 / IPL 2부를 썼다)
