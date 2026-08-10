# 확산 가이드 — 다른 기관·지역이 이 서비스를 복제하는 방법 (보고서 Ⅳ-2 확산성)

우리동네 발전소는 **공공데이터 + AI 파이프라인 + 정적 SEO + 그라운딩 챗봇**의 조합으로,
같은 구조를 다른 공공 주제에 그대로 이식할 수 있다. 전 구성요소가 무료·저비용 티어로 운영된다.

## 1. 아키텍처 한 장 요약

```
공공데이터(원천) ──▶ 파이프라인(수동 curated + AI 구조화) ──▶ 정적 JSON
                                                        ├─▶ 지도 SPA (React+Vite, 네이버지도)
                                                        ├─▶ 정적 SEO 페이지 556개 (빌드 스크립트)
                                                        ├─▶ 그라운딩 챗봇 (/api/ask 서버리스)
                                                        └─▶ 소통 게시판 (/api/board + Upstash Redis)
운영: Vercel(무료) + GitHub(공개) + GA4(무료) + Upstash Redis(무료) + Claude API(종량)
```

## 2. 복제 절차 (요약)

1. **저장소 포크**: https://github.com/asadobbq/power-plant-map (문서·코드 전체 공개)
2. **데이터 교체**: `pipeline/` 의 원천을 대상 주제 데이터로 교체 →
   `web/public/data/*.json` 재생성. 스키마는 [data_schema.md](data_schema.md) 참조.
   ※ 원천별 라이선스 확인 필수 — 판정 방법론은 [data_licenses.md](data_licenses.md) 참조.
3. **지도 키**: 네이버클라우드 Maps API 키 발급 → `VITE_NCP_KEY_ID` (미설정 시 OSM 폴백으로도 동작)
4. **배포**: Vercel에 `web/` 연결(빌드 명령 그대로) + 도메인 연결
5. **계측**: GA4 속성 생성 → `VITE_GA4_ID` — 이벤트 명세는 [kpi.md](kpi.md)
6. **게시판**: Upstash Redis(Marketplace, 무료) 연결 — 환경변수 `KV_REST_API_URL/TOKEN`
7. **AI 파이프라인**: `tools/ai_pipeline/pipeline_config.yaml` 의 시드 URL·프롬프트를
   주제에 맞게 수정 — 5단계 구조(수집→추출→구조화→검증→반영)와 HITL 게이트는 그대로 재사용
8. **챗봇**: `ANTHROPIC_API_KEY` 등록 — 컨텍스트 조립부(`assembleContext`)만 데이터에 맞게 수정

## 3. 이식 가능한 다른 주제 예시

| 주제 | 원천 데이터 | 동일 재사용 요소 |
|---|---|---|
| 산업단지 주변지역 지원 | 산단공 데이터, 지자체 공고 | 지도+반경 판정+시책 파이프라인 전부 |
| 폐기물·소각시설 주변 지원 | 환경공단, 폐촉법 조례 | 반경 기반 혜택 안내 구조 그대로 |
| 접경·소멸지역 정착 지원 | 행안부 인구감소지역, 지자체 시책 | 시책 크롤링 파이프라인·챗봇 |
| 군 소음지역 보상 안내 | 국방부 고시, 지자체 공고 | 구역 판정 + 안내 챗봇 |

핵심 재사용 단위는 **"비정형 공고 → AI 구조화 → 사람 승인 → 서비스 반영" 파이프라인**이며,
주제 교체 시 바뀌는 것은 시드 URL과 프롬프트의 도메인 규칙뿐이다.

## 4. 운영 비용 (실측 기준)

| 항목 | 비용 |
|---|---|
| Vercel(호스팅+서버리스), GitHub, GA4, Upstash Redis | 무료 티어 |
| 네이버 지도 API | 월 1,000만 건 무료 한도 내 |
| Claude API — 파이프라인 | 문서당 수 원 수준(비용 효율 모델), 주 1회 배치 |
| Claude API — 챗봇 | 요청 제한(일 50/IP)으로 상한 통제 + 콘솔 지출 한도 |

## 5. 확산 시 주의

- 데이터 라이선스 전수 확인(재배포 불허 원천은 수치 인용만) — [data_licenses.md](data_licenses.md)
- 크롤링은 시드 등록제 + robots.txt 준수 + 요청 간격 유지
- AI 반영은 반드시 HITL 게이트 유지 — [ai_governance.md](ai_governance.md)
- 전력망 등 보안 민감 정보는 취급하지 않음(§6-6)
