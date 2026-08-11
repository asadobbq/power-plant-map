# -*- coding: utf-8 -*-
"""출처 링크 전수 검사 — benefit_local·overseas·news의 source URL 상태 분류.

사용법: python check_links.py
출력: link_report.json (+ 콘솔 요약) — 상태별(OK/리다이렉트/깨짐/타임아웃) 목록.
서버 부담 최소화: 도메인당 순차 + 0.5초 간격, 전체 동시 8 도메인.
"""
import io
import json
import sys
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlparse

import requests

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).parent
WEB = HERE.parent / "web" / "public" / "data"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) kopower-linkcheck/1.0"}


def collect_urls():
    items = []  # (구분, 라벨, url)
    local = json.load(io.open(WEB / "benefit_local.json", encoding="utf-8"))
    for r in local["regions"]:
        for p in r["programs"]:
            u = p.get("source", "")
            if u.startswith("http"):
                items.append(("시책", f"{r['sigungu']} {p['name']}", u))
    try:
        overseas = json.load(io.open(WEB / "overseas.json", encoding="utf-8"))
        for it in overseas.get("items", []):
            u = it.get("source", "")
            if u and u.startswith("http"):
                items.append(("해외", f"{it.get('companyGroup','')} {it['name']}", u))
    except FileNotFoundError:
        pass
    try:
        news = json.load(io.open(WEB / "news.json", encoding="utf-8"))
        for n in news.get("items", []):
            u = n.get("url", "")
            if u.startswith("http"):
                items.append(("뉴스", n["title"][:30], u))
    except FileNotFoundError:
        pass
    return items


def check_one(url):
    try:
        r = requests.get(url, headers=UA, timeout=12, allow_redirects=True, stream=True)
        body_head = next(r.iter_content(2048), b"") if r.status_code == 200 else b""
        r.close()
        final = r.url
        # 200이어도 '페이지 없음' 안내로 뒤바뀐 경우 감지(소프트 404)
        soft = False
        if r.status_code == 200:
            t = body_head.decode("utf-8", errors="replace")
            if any(k in t for k in ("페이지를 찾을 수", "존재하지 않는 페이지", "잘못된 접근", "error-page")):
                soft = True
        if r.status_code >= 400:
            return ("깨짐", r.status_code, final)
        if soft:
            return ("소프트404의심", 200, final)
        # 최종 URL이 메인/로그인으로 튕긴 경우
        fp = urlparse(final)
        op = urlparse(url)
        if fp.netloc == op.netloc and fp.path in ("/", "/index.do", "/main.do") and op.path not in ("/", "/index.do", "/main.do"):
            return ("메인리다이렉트", r.status_code, final)
        return ("OK", r.status_code, final)
    except requests.exceptions.Timeout:
        return ("타임아웃", 0, "")
    except Exception as e:
        return ("접속실패", 0, str(e)[:80])


def main():
    items = collect_urls()
    # URL 중복 제거(같은 URL 여러 사업)
    by_url = {}
    for kind, label, url in items:
        by_url.setdefault(url, []).append((kind, label))
    print(f"검사 대상: 항목 {len(items)}건, 고유 URL {len(by_url)}개")

    by_domain = defaultdict(list)
    for url in by_url:
        by_domain[urlparse(url).netloc].append(url)

    results = {}

    def run_domain(domain):
        for url in by_domain[domain]:
            results[url] = check_one(url)
            time.sleep(0.5)

    with ThreadPoolExecutor(max_workers=8) as ex:
        list(ex.map(run_domain, by_domain))

    summary = defaultdict(int)
    broken = []
    for url, (status, code, final) in results.items():
        summary[status] += 1
        if status != "OK":
            broken.append({
                "url": url, "status": status, "code": code, "final": final,
                "used_by": [f"[{k}] {l}" for k, l in by_url[url]],
            })
    broken.sort(key=lambda x: (x["status"], x["url"]))

    out = {"checkedAt": time.strftime("%Y-%m-%d %H:%M"), "summary": dict(summary), "problems": broken}
    json.dump(out, io.open(HERE / "link_report.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("상태 요약:", dict(summary))
    print(f"문제 URL {len(broken)}개 → link_report.json")
    for b in broken[:15]:
        print(f"  [{b['status']}] {b['url'][:80]}")


if __name__ == "__main__":
    main()
