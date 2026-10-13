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
PER_QUERY_MAX = 7      # 한 검색어가 목록을 점령하지 못하게(2026-10: '발전공기업' 1건으로 25건 중 13건 점령)
PER_EVENT_MAX = 2      # 같은 사건의 중복 보도 상한(제목 유사도 기준)
EVENT_SIM = 0.35       # 제목 문자 2-gram 포함률 — 이상이면 같은 사건으로 간주

# 1차 거름: 명백한 잡음(증권 시황·도박·광고). 구글뉴스 RSS에 SEO 스팸이 섞여 들어온다
# (실제 사례 2026-10: "하이난 카지노 기초 읽기", "토토라크 감옥 지도" — 가짜 언론사명으로 유입)
NOISE = re.compile(
    r"(주가|특징주|증시|코스피|코스닥|급등|급락|테마주|상한가|하한가|공매도|"
    r"카지노|토토|바카라|슬롯|베팅|배당률|먹튀|도박|복권|경마|"
    r"성인|출장|대출|보험료|코인|비트코인|암호화폐|환전)"
)

# 2차 거름(주제 적합성): 전력·에너지 분야 용어가 최소 1개 있어야 통과.
# 발전소명이 제목에 있으면 이 게이트는 건너뛴다.
TOPIC = re.compile(
    r"(발전소|발전기|발전설비|발전공기업|발전사|발전 ?5사|통합본사|화력|원전|원자력|"
    r"석탄|LNG|액화천연가스|열병합|집단에너지|양수|태양광|풍력|수력|조력|신재생|재생에너지|"
    r"전력|전기요금|전기본|송전|변전|계통|전력망|에너지|탈석탄|탄소중립|발전량|"
    r"한전|한국전력|한수원|수력원자력|남동발전|중부발전|서부발전|남부발전|동서발전|"
    r"지역난방|전력거래소|주변지역)"
)

# 3차 거름(해외 기사): 구글뉴스 RSS에 해외 매체의 한국어 번역본이 섞여 들어온다.
# (실제 사례 2026-10: Vietnam.vn — 베트남 'LNG 발전 프로젝트' 기사가 국내 뉴스로 노출)
# 제목만으로는 국내/해외 구분이 어려워(번역본도 '산업통상부' 등으로 표기) 출처명으로 거른다.
FOREIGN_TLD = re.compile(
    r"\.(vn|cn|jp|tw|hk|in|id|ph|th|my|sg|ru|de|fr|es|it|br|mx|tr|ar|pl|nl|se)$",
    re.I,
)
# 가짜 언론사명으로 유입되는 스팸 매체 — 확인되는 대로 추가
BLOCK_SOURCES = {
    "Calgary Roughnecks",   # 2026-10: 카지노·토토 스팸을 발전 키워드로 노출
    "Vietnam.vn",
}


def bad_source(src: str) -> bool:
    src = (src or "").strip()
    return src in BLOCK_SOURCES or bool(FOREIGN_TLD.search(src))


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


_NONWORD = re.compile(r"[^가-힣A-Za-z0-9]")


def tokens(t: str) -> set:
    """제목을 문자 2-gram 집합으로. 같은 사건의 중복 보도 판정에 쓴다.

    한국어 기사 제목은 같은 사건이라도 표현이 크게 달라(예: '충남도, 발전공기업 통합본사
    유치 전략 최종 점검' vs ''발전통합본사 충남 유치' 최적지 논리 구체화') 단어 단위
    비교로는 묶이지 않는다. 복합명사가 많아 문자 2-gram이 훨씬 잘 맞는다.
    """
    t = _NONWORD.sub("", t)
    return {t[i:i + 2] for i in range(len(t) - 1)}


def same_event(a: set, b: set) -> bool:
    """포함률(작은 쪽 기준)로 동일 사건 판정 — 제목 길이 차이에 덜 민감하다.

    임계값 0.35는 2026-10-12 수집분(25건)으로 실측 튜닝 — 통합본사 사건 13건 중 11건을
    묶으면서 서로 다른 사건의 오병합 0건.
    """
    if not a or not b:
        return False
    return len(a & b) / min(len(a), len(b)) >= EVENT_SIM


def main():
    plants = json.load(io.open(WEB / "plants.json", encoding="utf-8"))
    plant_names = sorted(
        {p["name"] for p in plants["plants"] if len(p["name"]) >= 2},
        key=len, reverse=True,
    )

    cutoff = datetime.now(timezone.utc) - timedelta(days=DAYS)
    seen, items = set(), []
    dropped = {"오래됨": 0, "잡음": 0, "주제무관": 0, "해외·스팸출처": 0, "제목중복": 0, "쿼리상한": 0}
    for q in QUERIES:
        try:
            rows = fetch_rss(q)
        except Exception as e:
            print(f"! RSS 실패({q}): {e}")
            continue
        taken = 0
        for r in rows:
            title = r["title"]
            # 발전소명이 제목에 있으면 주제·국내 게이트를 이미 통과한 것으로 본다
            tags = [n for n in plant_names if n in title][:4]
            if r["dt"] < cutoff:
                dropped["오래됨"] += 1
                continue
            if NOISE.search(title):
                dropped["잡음"] += 1
                continue
            if not tags and not TOPIC.search(title):
                dropped["주제무관"] += 1
                continue
            if bad_source(r["source"]):
                dropped["해외·스팸출처"] += 1
                continue
            key = norm_title(title)
            if key in seen:
                dropped["제목중복"] += 1
                continue
            if taken >= PER_QUERY_MAX:
                dropped["쿼리상한"] += 1
                continue
            seen.add(key)
            taken += 1
            items.append({
                "title": title,
                "url": r["url"],
                "source": r["source"],
                "date": r["dt"].astimezone(timezone(timedelta(hours=9))).strftime("%Y-%m-%d"),
                "tags": tags,
                "_dt": r["dt"].isoformat(),
                "_tok": tokens(title),
            })
        time.sleep(1)

    items.sort(key=lambda x: x["_dt"], reverse=True)

    # 같은 사건의 중복 보도 억제 — 지방의회·유치전 등 동일 사안이 목록을 메우는 현상 방지
    clustered, dup = [], 0
    for it in items:
        hit = next((c for c in clustered if same_event(it["_tok"], c[0]["_tok"])), None)
        if hit is None:
            clustered.append([it])
        elif len(hit) < PER_EVENT_MAX:
            hit.append(it)
        else:
            dup += 1
    dropped["동일사건"] = dup
    items = sorted((x for c in clustered for x in c), key=lambda x: x["_dt"], reverse=True)
    items = items[:MAX_ITEMS]
    print("  제외: " + ", ".join(f"{k} {v}" for k, v in dropped.items() if v))
    for it in items:
        it.pop("_dt", None)
        it.pop("_tok", None)

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
