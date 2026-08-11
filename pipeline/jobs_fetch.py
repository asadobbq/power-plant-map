# -*- coding: utf-8 -*-
"""채용공고 자동 수집 — 공공데이터포털 '공공기관 채용정보 조회서비스' → web/public/data/jobs.json.

- 대상: 발전소 운영 관련 공공기관(한전·한수원·발전5사·지역난방·수자원 + 한전 그룹사)
- 진행 중(ongoingYn=Y) 공고 전체를 페이지 순회 수집 후 대상 기관만 필터, 마감 임박순 정렬
- 인증키는 환경변수 DATA_GO_KR_KEY 로만 전달(코드·저장소 저장 금지)
- 매일 GitHub Actions에서 실행(.github/workflows/daily-news.yml), 수동 실행도 가능
- 라이선스: 공공데이터포털 이용허락범위 '제한 없음' — 출처 표시 게시

사용법: DATA_GO_KR_KEY=... python jobs_fetch.py
"""
import io
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).parent
OUT = HERE.parent / "web" / "public" / "data" / "jobs.json"
API = "https://apis.data.go.kr/1051000/recruitment/list"

# 표시명 매핑 — instNm에 키 문자열이 포함되면 대상
TARGETS = {
    "한국남동발전": "남동발전",
    "한국중부발전": "중부발전",
    "한국서부발전": "서부발전",
    "한국남부발전": "남부발전",
    "한국동서발전": "동서발전",
    "한국수력원자력": "한수원",
    "한국전력공사": "한전",
    "한국전력거래소": "전력거래소",
    "한국전력기술": "한국전력기술",
    "한전KPS": "한전KPS",
    "한전KDN": "한전KDN",
    "한국지역난방공사": "지역난방공사",
    "한국수자원공사": "수자원공사",
}
MAX_ITEMS = 80


def fetch_all(key: str):
    items, page = [], 1
    while page <= 10:
        url = API + "?" + urllib.parse.urlencode({
            "serviceKey": key, "resultType": "json",
            "numOfRows": 100, "pageNo": page, "ongoingYn": "Y",
        })
        with urllib.request.urlopen(url, timeout=30) as r:
            d = json.load(r)
        if d.get("resultCode") != 200:
            raise RuntimeError(f"API 오류: {d.get('resultMsg')}")
        items.extend(d.get("result", []))
        if page * 100 >= d.get("totalCount", 0):
            break
        page += 1
    return items


def ymd(s):
    s = str(s or "")
    return f"{s[:4]}-{s[4:6]}-{s[6:8]}" if len(s) == 8 else s


def main():
    key = os.environ.get("DATA_GO_KR_KEY", "").strip()
    if not key:
        print("DATA_GO_KR_KEY 미설정 — 기존 jobs.json 유지(안전장치)")
        return

    rows = fetch_all(key)
    out_items = []
    for r in rows:
        inst = r.get("instNm") or ""
        short = next((v for k, v in TARGETS.items() if k in inst), None)
        if not short:
            continue
        out_items.append({
            "company": short,
            "inst": inst,
            "title": (r.get("recrutPbancTtl") or "").strip(),
            "kind": r.get("recrutSeNm") or "",          # 신입/경력 등
            "hire": r.get("hireTypeNmLst") or "",        # 정규직/비정규직 등
            "region": r.get("workRgnNmLst") or "",
            "count": r.get("recrutNope"),
            "start": ymd(r.get("pbancBgngYmd")),
            "end": ymd(r.get("pbancEndYmd")),
            "dday": r.get("decimalDay"),
            "url": r.get("srcUrl") or "",
            "sn": r.get("recrutPblntSn"),
        })

    if len(out_items) < 1:
        print("대상 기관 공고 0건 — 기존 jobs.json 유지(안전장치)")
        return

    out_items.sort(key=lambda x: (x["end"] or "9999", x["company"]))
    out_items = out_items[:MAX_ITEMS]

    out = {
        "updatedAt": datetime.now(timezone(timedelta(hours=9))).strftime("%Y-%m-%d %H:%M"),
        "note": "공공데이터포털 '공공기관 채용정보 조회서비스'(재정경제부) 기반 자동 수집 — 진행 중 공고만 표시. "
                "지원 자격·일정 등 확정 정보는 반드시 원문 공고에서 확인하세요.",
        "source": "https://www.data.go.kr/data/15125273/openapi.do",
        "items": out_items,
    }
    json.dump(out, io.open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    by_co = {}
    for i in out_items:
        by_co[i["company"]] = by_co.get(i["company"], 0) + 1
    print(f"jobs.json 갱신: {len(out_items)}건 — " + ", ".join(f"{k} {v}" for k, v in sorted(by_co.items())))


if __name__ == "__main__":
    main()
