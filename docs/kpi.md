# KPI 정의표 — 우리동네 발전소 (kopower.net)

> 서비스 핵심 성과지표(KPI) 정의와 측정 방법.
> 기준일: 2026-08-10 (계측 개시일). GA4 속성: kopower.net (측정 ID는 배포 환경변수 `VITE_GA4_ID`로만 주입 — 저장소 비노출).

## 1. KPI 정의표

| 지표 | 현재(2026-08-10) | 목표 | 측정 방법 |
|---|---|---|---|
| 정보 커버리지(발전소) | 481개소 100% | 100% 유지 | 데이터 카운트(`plants.json`) |
| 정보 커버리지(지자체 시책) | 시군구 73/226 | 120+ (AI 파이프라인 확장) | 데이터 카운트(`benefit_local.json`) |
| 검색 유입 진입점 | 정적 페이지 556 + 루트 1 | 유지·확대 | sitemap URL 수 |
| 월간 방문자 수(MAU) | 계측 개시 | 추세 관리 | GA4 활성 사용자 |
| 혜택 리포트 조회 건수 | 미계측 → 계측 개시 | 추세 관리 | GA4 `benefit_report_view` |
| 발전소 상세 조회 건수 | 미계측 → 계측 개시 | 추세 관리 | GA4 `plant_detail_view` |
| 공유 건수 | 기능 신설 → 계측 개시 | 추세 관리 | GA4 `share_click` |
| 출처 링크 클릭(신뢰성 지표) | 미계측 → 계측 개시 | 추세 관리 | GA4 `outbound_source_click` |
| 챗봇 응답률 | 과제 B 배포 후 | 추세 관리 | GA4 `ai_chat_ask` (answered 비율) |
| 출처 명시율 | 100% | 100% 유지 | 데이터 검증(모든 항목 source 필드) |

## 2. GA4 커스텀 이벤트 명세

개인정보 무수집 원칙: 모든 파라미터는 공개 데이터의 식별자·행정구역명·도메인만 사용하며,
이용자 입력 원문·IP·개인 식별 정보는 어떤 이벤트에도 포함하지 않는다.

| 이벤트명 | 파라미터 | 발생 시점 | 구현 위치 |
|---|---|---|---|
| `plant_detail_view` | `plant_id`, `status`, `plant_name`, `fuel`, `company`, `sido` | 상세 패널 열림(목록 선택·지도 마커·딥링크·대체설비 점프 통합) | `App.tsx` (selected 변경 effect) |
| `region_select` | `sido`, `sigungu` | 혜택 탭에서 시·군·구 선택 | `BenefitPanel.tsx` |
| `benefit_report_view` | `sido`, `sigungu`, `emd`, `plant_count`, `eligible` | 읍·면·동 선택으로 혜택 리포트 표시 | `BenefitPanel.tsx` |
| `local_benefit_view` | `sido`, `sigungu`, `program_count` | 지자체 전입·정착 시책 카드 표시 | `BenefitPanel.tsx` |
| `share_click` | `target`(webshare/clipboard/prompt), `plant_id` | 상세 패널 공유 버튼 | `DetailPanel.tsx` |
| `outbound_source_click` | `domain`(호스트명만, 경로·쿼리 미수집) | 출처 링크 클릭(지자체 시책·해외사업) | `analytics.ts trackOutbound()` |
| `ai_chat_ask` | `answered`(yes/no_data) — 질문 원문 미수집 | 챗봇 질문(과제 B 배포 시 연동) | 과제 B |
| `tab_view` | `tab` | 하단 패널 탭 전환 | `App.tsx` |
| `deeplink_plant` | `plant_name` | 정적 페이지 → 지도 딥링크 진입 | `App.tsx` |
| `overseas_select` | `name`, `country`, `company` | 해외사업 목록에서 위치 선택 | `App.tsx` |
| `feedback_open` | — | 소통 게시판 진입 | `BottomPanel.tsx` |
| `info_open` | — | 출처·면책 모달 열람 | `BottomPanel.tsx` |

### 변경 이력
- 2026-08-10: `select_plant` → `plant_detail_view`(발생 지점을 상세 패널 열림으로 통합해 마커
  클릭 누락 보완), `benefit_lookup` → `benefit_report_view` 로 개명. `region_select`,
  `share_click`(공유 버튼 신설), `outbound_source_click` 신규 추가.

## 3. KPI 스냅샷 절차

- 월 1회 GA4 보고서 → 이벤트 수를 위 표에 기록(보고서 Ⅳ-1 갱신).
- 커버리지 지표는 빌드 시 데이터 파일 카운트로 산출:
  `node -e "const d=require('./web/public/data/plants.json');console.log(d.plants.length)"` 등.
- GA4 콘솔 측 사전 설정(사람 작업)은 [manual_tasks.md](manual_tasks.md) 체크리스트 참조.
