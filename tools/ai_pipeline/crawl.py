"""[수집] 시군구 고시공고 크롤러 — 시드 URL 등록제.

- robots.txt 준수(불허 경로는 건너뜀), 요청 간격 >= config.crawl.interval_seconds
- 목록 페이지에서 키워드가 제목에 포함된 게시글만 수집
- 게시글 본문 HTML + HWP/HWPX/PDF 첨부를 data/raw/에 저장, 메타(원문URL·게시일) 필수 기록

사용법: python crawl.py [--limit N]
"""
import argparse
import hashlib
import re
import time
from urllib import robotparser
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

from common import load_config, path_of, read_json, utf8_stdout, write_json

DOC_EXT = re.compile(r"\.(hwpx?|pdf)($|\?)", re.I)


def robots_ok(url: str, ua: str, cache: dict) -> bool:
    origin = "{0.scheme}://{0.netloc}".format(urlparse(url))
    if origin not in cache:
        rp = robotparser.RobotFileParser()
        rp.set_url(origin + "/robots.txt")
        try:
            rp.read()
        except Exception:
            rp = None  # robots.txt 없음/읽기 실패 → 허용으로 간주하되 간격은 유지
        cache[origin] = rp
    rp = cache[origin]
    return True if rp is None else rp.can_fetch(ua, url)


def fetch(session: requests.Session, url: str, cfg: dict, robots_cache: dict):
    ua = cfg["crawl"]["user_agent"]
    if not robots_ok(url, ua, robots_cache):
        print(f"  [robots 불허] {url}")
        return None
    time.sleep(cfg["crawl"]["interval_seconds"])
    r = session.get(url, timeout=cfg["crawl"]["timeout_seconds"], headers={"User-Agent": ua})
    r.raise_for_status()
    return r


def main() -> None:
    utf8_stdout()
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=10, help="시드당 최대 수집 게시글 수")
    args = ap.parse_args()

    cfg = load_config()
    raw_dir = path_of(cfg, "raw_dir")
    raw_dir.mkdir(parents=True, exist_ok=True)
    index_path = raw_dir / "_index.json"
    index = read_json(index_path, {})  # url 해시 → 메타 (재수집 방지)

    keywords = cfg["crawl"]["keywords"]
    session = requests.Session()
    robots_cache: dict = {}
    collected = 0

    for seed in cfg.get("seeds", []):
        print(f"\n== {seed['sido']} {seed['sigungu']} — {seed['list_url']}")
        try:
            r = fetch(session, seed["list_url"], cfg, robots_cache)
        except Exception as e:
            print(f"  [목록 실패] {e}")
            continue
        if r is None:
            continue

        soup = BeautifulSoup(r.text, "html.parser")
        links = soup.select(seed.get("selector", "a"))
        picked = []
        for a in links:
            title = a.get_text(" ", strip=True)
            href = a.get("href")
            if not href or not title:
                continue
            if any(k in title for k in keywords):
                picked.append((title, urljoin(seed["list_url"], href)))
        print(f"  키워드 일치 {len(picked)}건 (목록 링크 {len(links)}건 중)")

        for title, url in picked[: args.limit]:
            key = hashlib.sha256(url.encode()).hexdigest()[:16]
            if key in index:
                continue
            try:
                page = fetch(session, url, cfg, robots_cache)
            except Exception as e:
                print(f"  [본문 실패] {title}: {e}")
                continue
            if page is None:
                continue

            meta = {
                "url": url,
                "title": title,
                "sido": seed["sido"],
                "sigungu": seed["sigungu"],
                "fetched_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                "posted": "",  # 게시일: 상세 페이지에서 추출 시도(아래), 실패 시 공란
                "files": [],
            }
            psoup = BeautifulSoup(page.text, "html.parser")
            m = re.search(r"(20\d{2}[.\-/]\s?\d{1,2}[.\-/]\s?\d{1,2})", psoup.get_text(" ")[:3000])
            if m:
                meta["posted"] = re.sub(r"[./\s]+", "-", m.group(1)).strip("-")

            (raw_dir / f"{key}.html").write_text(page.text, encoding="utf-8")

            # 첨부(HWP/HWPX/PDF) 다운로드
            for a in psoup.find_all("a", href=True):
                if DOC_EXT.search(a["href"]) or DOC_EXT.search(a.get_text()):
                    file_url = urljoin(url, a["href"])
                    try:
                        fr = fetch(session, file_url, cfg, robots_cache)
                        if fr is None:
                            continue
                        ext = (DOC_EXT.search(file_url) or DOC_EXT.search(a.get_text())).group(1).lower()
                        fname = f"{key}_{len(meta['files'])}.{ext}"
                        (raw_dir / fname).write_bytes(fr.content)
                        meta["files"].append(fname)
                    except Exception as e:
                        print(f"    [첨부 실패] {file_url}: {e}")

            index[key] = meta
            collected += 1
            print(f"  + {title} (첨부 {len(meta['files'])}건)")

    write_json(index_path, index)
    print(f"\n수집 완료: 신규 {collected}건 → {raw_dir}")


if __name__ == "__main__":
    main()
