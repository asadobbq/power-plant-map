# 데이터 스키마 — web/public/data/ (확산 가이드 부속)

모든 파일은 UTF-8 JSON. 좌표는 WGS84. 전력망(송전선로·변전소) 정보는 **취급하지 않음**(§6-6).

## plants.json — 발전소 481개소

```jsonc
{
  "generatedAt": "2026-07-13",       // 데이터 기준일 (전 화면 고지)
  "sources": ["..."],                // 출처 문자열 목록 (푸터 표기)
  "plants": [{
    "id": "p0000",
    "name": "태안",                   // 발전본부·발전소명
    "company": "서부발전㈜",
    "companyGroup": "서부발전",       // 발전5사 + 한수원 + 기타 그룹
    "fuelCat": "석탄",               // 석탄|LNG|원자력|수력|양수|풍력|유류|바이오|기타
    "status": "운영중",              // 운영중|건설중|추진중|계획|준공임박|폐지완료 등
    "totalMw": 6100,
    "mwEstimated": false,            // 용량이 추정치인지
    "lat": 36.9, "lng": 126.2,
    "precision": "exact",            // exact | approx(시군구 중심점 폴백)
    "sido": "충남", "sigungu": "태안군",
    "address": "충남 태안군 원북면 방갈리",
    "addressDetail": "충청남도 태안군 원북면 발전로 457",  // 발전사 홈페이지 도로명주소
    "firstRetireYear": 2025,         // 첫 호기 폐지 연도 (없으면 생략)
    "central": "중앙",               // 급전 구분
    "gen": { "year": 2024, "gwh": 24471.9, "cf": 45.8 },  // 발전량·이용률 (EPSIS)
    "units": [{                      // 호기별
      "label": "#1", "mw": 500, "completed": "1995.6",
      "makers": { "b": "한중/ABBCE", "t": "한중/GE", "g": "한중/GE" },  // 보일러·터빈·발전기
      "gen": { "cf": 60.5 },
      "retire": { "year": 2025, "type": "폐지→LNG 대체" },   // 11차 전기본
      "replacements": [{ "to": "p0123", "toName": "구미천연가스", "planned": "2025.12" }]
    }]
  }],
  "links": [{                        // 폐지 → 대체 건설 연결 (지도 연결선)
    "from": "p0000", "fromUnit": "태안#1",
    "to": "p0123", "toName": "구미천연가스", "planned": "2025.12", "note": "..."
  }]
}
```

## benefit_local.json — 지자체 전입·정착 시책 (73 시군구 298건)

```jsonc
{
  "updatedAt": "2026-08-05",
  "note": "면책 문구",
  "regions": [{
    "sido": "경남", "sigungu": "하동군",
    "depopulation": true,            // 행안부 인구감소지역 여부
    "programs": [{
      "category": "전입정착",        // 전입정착|출산육아|주거|청년일자리|기타
      "name": "하동군 전입지원금",
      "amount": "1인 30만원 ...",
      "condition": "전입 후 6개월 이상 거주 ...",
      "source": "https://www.hadong.go.kr/..."   // 지자체 공식 페이지 (필수)
    }]
  }]
}
```

AI 파이프라인(tools/ai_pipeline)의 구조화 출력은 위 program에
`target`(→condition으로 병합)·`confidence`·`evidence`를 더한 형태이며,
검증·승인 후 이 파일로 병합된다.

## benefit_zones.json — 발주법 주변지역 판정 (읍면동 1,346개)

```jsonc
{
  "generatedAt": "...", "note": "...",
  "tree": { "경남": { "하동군": [["emd코드", "읍면동명"], ...] } },  // 선택 UI용 트리
  "zones": { "emd코드": [{                 // 반경 5km가 걸치는 발전소 목록
    "id": "p0000", "name": "하동", "fuelCat": "석탄", "mw": 4000,
    "status": "운영중", "distKm": 3.2, "approx": false
  }] }
}
```

## news.json / overseas.json

- news: `{ items: [{ title, url, source, date, tags[] }] }` — tags에 발전소명 매칭
- overseas: `{ note, items: [{ name, country, city?, companyGroup, fuel?, mw?, status?, stake?, lat?, lng?, source? }] }`

## 파생 산출물

- 정적 페이지(`/plant/*`, `/region/*` 556개)와 sitemap은 빌드 시
  `web/scripts/gen-static-pages.mjs`가 위 데이터에서 생성.
- 챗봇(`/api/ask`)은 plants + benefit_local만 컨텍스트로 사용(질문 매칭 레코드만 주입).
