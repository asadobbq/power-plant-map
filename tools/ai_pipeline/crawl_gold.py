"""[수집-정답셋] 정확도 평가용 — 수동 구축 정답셋의 출처 URL을 그대로 재수집.

benefit_local.json 중 정답셋 시군구(eval_accuracy.GOLD_REGIONS)의 program.source URL을
문서 단위로 저장한다. 이후 extract → structure → eval_accuracy 로 이어지면
"같은 원문을 사람이 구조화한 결과 vs 파이프라인이 구조화한 결과"의 필드 대조가 된다.

robots.txt 준수·요청 간격은 crawl.py와 동일. 사용법: python crawl_gold.py
"""
import hashlib
import time
from urllib.parse import urlparse

import requests

from common import load_config, path_of, read_json, utf8_stdout, write_json
from crawl import robots_ok
from eval_accuracy import GOLD_REGIONS


def main() -> None:
    utf8_stdout()
    cfg = load_config()
    raw_dir = path_of(cfg, "raw_dir")
    raw_dir.mkdir(parents=True, exist_ok=True)
    index_path = raw_dir / "_index.json"
    index = read_json(index_path, {})

    benefit = read_json(path_of(cfg, "benefit_local"), {"regions": []})
    targets = []  # (sido, sigungu, url)
    seen_urls = set()
    for r in benefit["regions"]:
        if r["sigungu"] not in GOLD_REGIONS:
            continue
        for p in r["programs"]:
            u = p.get("source", "")
            if u.startswith("http") and u not in seen_urls:
                seen_urls.add(u)
                targets.append((r["sido"], r["sigungu"], u))

    print(f"정답셋 {len(GOLD_REGIONS)}개 시군구 — 고유 출처 URL {len(targets)}건 수집 시작")
    ua = cfg["crawl"]["user_agent"]
    session = requests.Session()
    robots_cache: dict = {}
    ok = skip = fail = 0

    for sido, sigungu, url in targets:
        key = "g" + hashlib.sha256(url.encode()).hexdigest()[:15]
        if key in index:
            skip += 1
            continue
        if not robots_ok(url, ua, robots_cache):
            print(f"  [robots 불허] {url}")
            fail += 1
            continue
        time.sleep(cfg["crawl"]["interval_seconds"])
        try:
            r = session.get(url, timeout=cfg["crawl"]["timeout_seconds"], headers={"User-Agent": ua})
            r.raise_for_status()
        except Exception as e:
            print(f"  [실패] {sigungu} {url}: {e}")
            fail += 1
            continue

        ctype = r.headers.get("Content-Type", "")
        meta = {
            "url": url, "title": f"{sigungu} 시책 원문({urlparse(url).path.rsplit('/', 1)[-1]})",
            "sido": sido, "sigungu": sigungu,
            "fetched_at": time.strftime("%Y-%m-%d %H:%M:%S"), "posted": "", "files": [],
            "gold": True,
        }
        if "pdf" in ctype.lower():
            fname = f"{key}_0.pdf"
            (raw_dir / fname).write_bytes(r.content)
            meta["files"].append(fname)
        else:
            r.encoding = r.apparent_encoding or "utf-8"
            (raw_dir / f"{key}.html").write_text(r.text, encoding="utf-8")
        index[key] = meta
        ok += 1
        print(f"  + {sigungu} {url[:70]}")

    write_json(index_path, index)
    print(f"\n수집: 성공 {ok} · 기존 {skip} · 실패 {fail} → {raw_dir}")
    if fail:
        print("실패 URL은 지자체 사이트 접속 차단·리뉴얼 등이 원인일 수 있음 — 리포트에 표본 수로 반영")


if __name__ == "__main__":
    main()
