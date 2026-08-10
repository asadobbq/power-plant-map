"""정확도 평가 — 수동 구축 정답셋 vs 파이프라인 재파싱 결과 필드 단위 대조.

정답셋: web/public/data/benefit_local.json 중 남부발전 관할 시군구
        (하동·삼척·안동·밀양·영월·기장·사하·제주·서귀포) — 사람이 지자체 홈페이지에서
        직접 확인·검증한 데이터 (41개 프로그램).
평가 대상: data/structured/*.json (동일 지역 공고를 파이프라인으로 재파싱한 결과)

매칭: name 정규화 유사도로 레코드 정렬(부분 포함 허용) 후,
      category(완전 일치)·amount(숫자 시퀀스 일치)·source(도메인 일치) 필드별 채점.
리포트: reports/accuracy_YYYYMMDD.md — 표본 수, 필드별 일치율, 오류 유형별 목록.
        ★ 수행보고서 Ⅴ-2 "신뢰성 검증 방법론과 결과"의 원천 자료.

사용법: python eval_accuracy.py [--regions 하동군,삼척시,...]
"""
import argparse
import re
from collections import Counter
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

from common import BASE, load_config, path_of, read_json, utf8_stdout

GOLD_REGIONS = ["하동군", "삼척시", "안동시", "밀양시", "영월군", "기장군", "사하구", "제주시", "서귀포시"]


def norm(s: str) -> str:
    return re.sub(r"[\s()\[\]·\-]", "", s or "").lower()


def nums(s: str) -> list[str]:
    return re.findall(r"\d[\d,]*", s or "")


def domain(u: str) -> str:
    try:
        return urlparse(u).hostname or ""
    except Exception:
        return ""


def match_name(gold_name: str, candidates: list[dict]) -> dict | None:
    g = norm(gold_name)
    for c in candidates:
        n = norm(c["name"])
        if g == n or g in n or n in g:
            return c
    return None


def main() -> None:
    utf8_stdout()
    ap = argparse.ArgumentParser()
    ap.add_argument("--regions", help="쉼표 구분 시군구 목록 (기본: 남부발전 관할 9곳)")
    args = ap.parse_args()
    regions = args.regions.split(",") if args.regions else GOLD_REGIONS

    cfg = load_config()
    benefit = read_json(path_of(cfg, "benefit_local"), {"regions": []})
    gold = {
        r["sigungu"]: r["programs"]
        for r in benefit["regions"]
        if r["sigungu"] in regions
    }
    gold_count = sum(len(v) for v in gold.values())

    # 파이프라인 결과를 시군구별로 모음
    parsed: dict[str, list[dict]] = {}
    for f in sorted(path_of(cfg, "structured_dir").glob("*.json")):
        rec = read_json(f, None)
        if rec and rec.get("doc_relevant"):
            parsed.setdefault(rec["sigungu"], []).extend(rec["programs"])

    rows, errors = [], Counter()
    matched = cat_ok = amt_ok = src_ok = 0
    misses = []
    for sigungu, gold_programs in gold.items():
        cands = parsed.get(sigungu, [])
        for gp in gold_programs:
            cand = match_name(gp["name"], cands)
            if cand is None:
                errors["미탐(레코드 미매칭)"] += 1
                misses.append(f"{sigungu} · {gp['name']}")
                continue
            matched += 1
            c_ok = cand["category"] == gp["category"]
            a_ok = nums(cand["amount"]) == nums(gp["amount"])
            s_ok = domain(cand["source"]) == domain(gp["source"])
            cat_ok += c_ok
            amt_ok += a_ok
            src_ok += s_ok
            if not c_ok:
                errors["category 불일치"] += 1
            if not a_ok:
                errors["amount 숫자 불일치"] += 1
            if not s_ok:
                errors["source 도메인 불일치"] += 1
            rows.append((sigungu, gp["name"], c_ok, a_ok, s_ok))

    def pct(n: int, d: int) -> str:
        return f"{100 * n / d:.1f}%" if d else "—"

    report = [
        f"# 파이프라인 정확도 리포트 — {date.today().isoformat()}",
        "",
        f"- 정답셋: 남부발전 관할 등 {len(gold)}개 시군구, 수동 검증 프로그램 **{gold_count}건**",
        f"- 평가 대상: 파이프라인 재파싱 결과 {sum(len(v) for v in parsed.values())}건"
        f" (모델: {cfg['model']['name']})",
        "",
        "## 결과 요약",
        "",
        "| 지표 | 값 |",
        "|---|---|",
        f"| 레코드 매칭률(재현율) | {matched}/{gold_count} = {pct(matched, gold_count)} |",
        f"| category 일치율 | {pct(cat_ok, matched)} |",
        f"| amount(숫자) 일치율 | {pct(amt_ok, matched)} |",
        f"| source(도메인) 일치율 | {pct(src_ok, matched)} |",
        "",
        "## 오류 유형",
        "",
    ]
    if errors:
        report += [f"- {k}: {v}건" for k, v in errors.most_common()]
    else:
        report.append("- 없음")
    if misses:
        report += ["", "### 미탐 목록", ""] + [f"- {m}" for m in misses]
    report += [
        "",
        "## 필드별 상세",
        "",
        "| 시군구 | 사업명 | category | amount | source |",
        "|---|---|---|---|---|",
    ]
    report += [
        f"| {s} | {n} | {'✓' if c else '✗'} | {'✓' if a else '✗'} | {'✓' if u else '✗'} |"
        for s, n, c, a, u in rows
    ]

    out_dir = BASE / "reports"
    out_dir.mkdir(exist_ok=True)
    out = out_dir / f"accuracy_{date.today().strftime('%Y%m%d')}.md"
    out.write_text("\n".join(report), encoding="utf-8")
    print("\n".join(report[:20]))
    print(f"\n리포트 저장: {out}")
    if not parsed:
        print("※ 평가 대상이 비어 있습니다 — 정답셋 지역 공고를 crawl→extract→structure 로 먼저 재파싱하세요.")


if __name__ == "__main__":
    main()
