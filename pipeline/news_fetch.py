# -*- coding: utf-8 -*-
"""뉴스 자동 수집 — Google News RSS(키 불필요) → web/public/data/news.json 갱신.

- 발전소·전력 정책 키워드 검색 결과를 병합, 최근 21일·중복 제거·상위 25건
- 발전소명 자동 태깅(plants.json 이름 매칭) → 상세 패널 '관련 뉴스'와 연동
- 제목·언론사·날짜·원문 링크만 게시(본문 미복제 — 저작권 안전)
- 매일 GitHub Actions에서 실행(.github/workflows/daily-news.yml), 수동 실행도 가능

사용법: python news_fetch.py
"""
import io
import json
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).parent
WEB = HERE.parent / "web" / "public" / "data"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) kopower-news/1.0"}

QUERIES = [
    "발전소 폐지",
    "석탄화력 폐지",
    "전력수급기본계획",
    "발전공기업",
    "LNG 발전소 건설",
    "발전소 주변지역 지원",
]
DAYS = 21
MAX_ITEMS = 25
# 명백한 잡음(증권 시황류) 제외
NOISE = re.compile(r"(주가|특징주|증시|코스피|코스닥|급등|급락|테마주)")


def fetch_rss(query: str):
    url = "https://news.google.com/rss/search?" + urllib.parse.urlencode(
        {"q": query, "hl": "ko", "gl": "KR", "ceid": "KR:ko"}
    )
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        root = ET.fromstring(r.read())
    out = []
    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        pub = item.findtext("pubDate") or ""
        src = item.findtext("source") or ""
        # 구글 뉴스 제목은 "제목 - 언론사" 형태 — source 태그가 있으면 그걸 사용
        if src and title.endswith(" - " + src):
            title = title[: -(len(src) + 3)].strip()
        try:
            dt = parsedate_to_datetime(pub)
        except Exception:
            continue
        out.append({"title": title, "url": link, "source": src or "구글뉴스", "dt": dt})
    return out


def norm_title(t: str) -> str:
    return re.sub(r"[\s\[\]()'\"“”‘’·…,.-]", "", t)[:40]


def main():
    plants = json.load(io.open(WEB / "plants.json", encoding="utf-8"))
    plant_names = sorted(
        {p["name"] for p in plants["plants"] if len(p["name"]) >= 2},
        key=len, reverse=True,
    )

    cutoff = datetime.now(timezone.utc) - timedelta(days=DAYS)
    seen, items = set(), []
    for q in QUERIES:
        try:
            rows = fetch_rss(q)
        except Exception as e:
            print(f"! RSS 실패({q}): {e}")
            continue
        for r in rows:
            if r["dt"] < cutoff or NOISE.search(r["title"]):
                continue
            key = norm_title(r["title"])
            if key in seen:
                continue
            seen.add(key)
            tags = [n for n in plant_names if n in r["title"]][:4]
            items.append({
                "title": r["title"],
                "url": r["url"],
                "source": r["source"],
                "date": r["dt"].astimezone(timezone(timedelta(hours=9))).strftime("%Y-%m-%d"),
                "tags": tags,
                "_dt": r["dt"].isoformat(),
            })
        time.sleep(1)

    items.sort(key=lambda x: x["_dt"], reverse=True)
    items = items[:MAX_ITEMS]
    for it in items:
        it.pop("_dt", None)

    if len(items) < 3:
        print(f"수집 {len(items)}건 — 너무 적어 기존 news.json 유지(안전장치)")
        return

    out = {
        "updatedAt": datetime.now(timezone(timedelta(hours=9))).strftime("%Y-%m-%d %H:%M"),
        "note": "구글 뉴스 검색 기반 자동 수집(제목·링크만 게시, 본문 미복제). 기사 내용·저작권은 각 언론사에 있음.",
        "items": items,
    }
    json.dump(out, io.open(WEB / "news.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"news.json 갱신: {len(items)}건 (태그 부착 {sum(1 for i in items if i['tags'])}건)")
    for it in items[:8]:
        print(f"  - [{it['date']}] {it['title'][:52]} {('#' + ','.join(it['tags'])) if it['tags'] else ''}")


if __name__ == "__main__":
    main()
