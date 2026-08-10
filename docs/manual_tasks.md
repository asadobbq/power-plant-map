# 사람이 직접 해야 하는 작업 체크리스트 (코드 밖 콘솔 설정)

> 코드·배포로는 자동화할 수 없는 콘솔 작업 목록. 완료 시 날짜를 기입하세요.

## GA4 콘솔 (analytics.google.com — 속성: kopower.net)

- [ ] **주요 이벤트 지정**: 관리 → 이벤트 → 다음 이벤트를 '주요 이벤트(전환)'로 표시
      — `benefit_report_view`, `plant_detail_view`, `share_click`, (B 배포 후) `ai_chat_ask`
      ※ 이벤트는 사이트에서 1회 이상 수집된 뒤 목록에 나타남 (최대 24시간 지연).
- [ ] **데이터 보존 기간 14개월**: 관리 → 데이터 설정 → 데이터 보존 → '이벤트 데이터 보존'을
      2개월 → **14개월**로 변경 (기본 2개월이면 분기·연간 비교 리포트 불가).
- [ ] **내부 트래픽 제외**: 관리 → 데이터 스트림 → 태그 설정 구성 → 내부 트래픽 정의에
      개발자 IP 추가 → 데이터 필터에서 '내부 트래픽' 필터를 **사용(활성)** 상태로 전환.
- [ ] **맞춤 측정기준 등록**(선택, 이벤트 파라미터를 보고서에서 보려면): 관리 → 맞춤 정의 →
      이벤트 범위로 `sido`, `sigungu`, `plant_id`, `status`, `target`, `domain`, `answered` 등록
      (한도 50개 중 7개 사용).

## 검색엔진 콘솔

- [ ] **구글 서치콘솔**: sitemap.xml 재제출 — 정적 페이지·lastmod 변경 시마다
      (search.google.com/search-console → Sitemaps → `https://kopower.net/sitemap.xml`).
- [ ] **네이버 서치어드바이저**: 사이트맵 재제출 + '웹 페이지 수집' 요청
      (searchadvisor.naver.com → 요청 → 사이트맵 제출).

## 게시판 알림 (FormSubmit)

- [ ] Gmail(kangdongho1984@gmail.com)에서 FormSubmit **Activate** 메일의 활성화 링크 클릭
      → 활성화 후 게시판에 테스트 글 작성해 알림 수신 확인 → 테스트 글 삭제(관리자 모드).

## 챗봇 (과제 B 배포 시)

- [ ] Vercel 환경변수에 `ANTHROPIC_API_KEY` 등록 (Production 스코프, 서버리스 전용 —
      클라이언트 번들·저장소에 노출 금지).
- [ ] 지출 상한 확인: Anthropic Console → Billing에서 월 지출 한도(예: $10) 설정 후 공개.

## 데이터 라이선스 후속 (선택 — 확실성 보강)

- [ ] KPX 고객센터(061-330-8100)에 EPSIS 데이터의 공공누리 유형 서면 문의 (현재는
      data.go.kr 동일 데이터셋 '이용허락범위 제한 없음'을 근거로 활용 중 — docs/data_licenses.md).
- [ ] (원본 월보 파일이 꼭 필요해질 경우에만) 한전 전력시장처(061-345-3487~8) 서면 이용허락.
