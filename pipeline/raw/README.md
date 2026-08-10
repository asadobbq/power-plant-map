# 원천 데이터(raw) 출처·라이선스 고지

각 파일의 출처와 재배포 근거. 전체 판정은 [docs/data_licenses.md](../../docs/data_licenses.md) 참조.

| 파일 | 출처 | 재배포 근거 |
|---|---|---|
| `epsis_detail_2024.txt`, `epsis_gen_2024.txt` | 전력거래소 전력통계정보시스템(EPSIS, epsis.kpx.or.kr) | 동일 데이터가 공공데이터포털에 '이용허락범위 제한 없음'으로 개방됨 (예: data.go.kr/data/15046119) |
| `wri_gppd.zip`, `wri_kor.json` | WRI Global Power Plant Database v1.3.0 | CC BY 4.0 — Global Energy Observatory, Google, KTH, Enipedia, WRI. 2021. (datasets.wri.org) |
| `wind.csv` | 한국에너지공단 풍력기 위치정보, 공공데이터포털 파일데이터 15085304 | 이용허락범위 제한 없음 |
| `municipalities.json`, `emd.json` | 통계청(KOSTAT) 센서스용 행정구역경계 2013, southkorea/southkorea-maps 가공본 | KOGL 1유형 상당("free to share or remix") — GADM 계열 파일은 사용·포함하지 않음 |

## 저장소에 포함하지 않는 파일

- **한국전력공사 전력통계월보 엑셀** (`kepco_monthly_*.xlsx`) — 한전 법적고지상 홈페이지
  자료의 상업적·공공 목적 재배포가 금지되어 원본 파일은 저장소에 포함하지 않습니다
  (.gitignore 등록). 필요 시 한전 홈페이지 지식센터 > 전기자료 게시판에서 직접 내려받으세요:
  https://home.kepco.co.kr/kepco/KO/ntcob/list.do?boardCd=BRD_000097&menuCd=FN0503
  파이프라인은 여기서 선별 추출·검증한 수치(curated JSON)만 사용합니다
  ("자료: 한국전력공사 전력통계월보 제571호, 잠정치").
- **제11차 전력수급기본계획 공고문 PDF** — 원문은 산업통상자원부 공고 게시판 참조
  (공고 제2025-169호, 수정 제2025-238호). 폐지·대체 일정은 공고에서 추출한 사실 데이터
  (`pipeline/curated/plan11.json`)만 사용합니다.
