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


def norm_name(s: str, sigungu: str = "") -> str:
    """사업명 정규화 — 괄호 주석·지역명 접두·'지원(사업)' 접미 등 비본질 표기를 제거."""
    s = re.sub(r"[(（\[].*?[)）\]]", "", s or "")  # 괄호 주석: (일반), (2026년 신설) 등
    if sigungu:
        s = s.replace(sigungu, "").replace(sigungu.rstrip("시군구"), "")
    s = re.sub(r"(지원사업|지원|사업)$", "", s.strip())
    return norm(s)


def tokens(s: str) -> set[str]:
    return {t for t in re.split(r"[\s·,+/및()\[\]-]+", s or "") if len(t) >= 2}


def nums(s: str) -> list[str]:
    return re.findall(r"\d[\d,]*", s or "")


def amounts_won(s: str) -> list[int]:
    """문자열에서 '금액'만 원 단위 정수로 추출 — 'N만원'→N*10000, 'N원'→N.
    연도·개월·회차 등 단위 없는 숫자는 금액 비교에서 제외."""
    out = []
    for m in re.finditer(r"(\d[\d,]*)\s*(만\s*원|만원|원)", s or ""):
        v = int(m.group(1).replace(",", ""))
        out.append(v * 10000 if "만" in m.group(2) else v)
    return out


def domain(u: str) -> str:
    try:
        return urlparse(u).hostname or ""
    except Exception:
        return ""


def match_name(gold_name: str, candidates: list[dict], sigungu: str = "") -> dict | None:
    """1:1 매칭 전제(사용된 후보는 호출부에서 제거).
    점수 = 토큰 상호 커버리지 평균(괄호 안 구분어 포함) + 정규화 일치/포함 보너스.
    괄호 구분어('시비'/'구비', '둘째자녀' 등)가 살아 있어 유사 사업 교차 할당을 막는다."""
    g_norm = norm_name(gold_name, sigungu)
    g_full = norm(gold_name)
    gt = tokens(gold_name)
    best, best_score = None, 0.0
    for c in candidates:
        n_norm = norm_name(c["name"], sigungu)
        n_full = norm(c["name"])
        ct = tokens(c["name"])
        if gt and ct:
            g_cov = sum(1 for t in gt if any(t in x or x in t for x in ct)) / len(gt)
            c_cov = sum(1 for t in ct if any(t in x or x in t for x in gt)) / len(ct)
            score = (g_cov + c_cov) / 2
        else:
            score = 0.0
        if g_full and g_full == n_full:
            score = 1.5  # 원표기 완전 일치
        elif g_norm and n_norm and g_norm == n_norm:
            score += 0.5
        elif g_norm and n_norm and (g_norm in n_norm or n_norm in g_norm):
            score += 0.1  # 포함관계는 약한 신호 — 토큰 유사도를 누르지 않게 소폭만
        score += 0.001 * len(n_norm)  # 동점 시 더 구체적인(긴) 후보 선호
        if score > best_score:
            best, best_score = c, score
    return best if best_score >= 0.6 else None


def amount_core_match(gold_amount: str, cand_amount: str) -> bool | None:
    """금액(원 단위 환산) 기준 핵심 일치 판정.
    - None: 평가 제외(정답에 금액이 없거나 '미표기' 명시 — 원문에 금액이 없는 사업)
    - True: 추출 금액이 정답 금액의 부분집합이고 대표(첫) 금액이 일치,
            또는 정답 금액의 절반 이상을 커버
    - False: 대표 금액이 다르거나 추출 실패"""
    if "미표기" in (gold_amount or "") or "미명시" in (gold_amount or ""):
        return None
    g, c = amounts_won(gold_amount), amounts_won(cand_amount)
    if not g:
        return None
    if not c:
        return False
    gs, cs = set(g), set(c)
    subset_ok = cs <= gs and c[0] == g[0]
    coverage_ok = sum(1 for x in g if x in cs) / len(g) >= 0.5 and c[0] in gs
    return subset_ok or coverage_ok


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

    # 원문 수집 성공 URL — 수집 자체가 안 된(robots 불허·접속 실패) 출처의 정답 항목은
    # 파이프라인 성능과 무관하므로 '평가 불가'로 분리 집계한다.
    collected_urls = {
        m["url"] for m in read_json(path_of(cfg, "raw_dir") / "_index.json", {}).values()
    }

    # 파이프라인 결과를 시군구별로 모음
    parsed: dict[str, list[dict]] = {}
    for f in sorted(path_of(cfg, "structured_dir").glob("*.json")):
        rec = read_json(f, None)
        if rec and rec.get("doc_relevant"):
            parsed.setdefault(rec["sigungu"], []).extend(rec["programs"])

    rows, errors = [], Counter()
    matched = cat_ok = amt_core = amt_exact = amt_eval = src_ok = 0
    misses, uncollected, real_amount_diff = [], [], []
    gold_evaluable = 0
    for sigungu, gold_programs in gold.items():
        # 1:1 할당 — 한 추출 레코드가 여러 정답에 중복 매칭되지 않도록 사용분 제거.
        # 이름이 긴(구체적인) 정답부터 짝지어 오할당을 줄인다.
        cands = list(parsed.get(sigungu, []))
        for gp in sorted(gold_programs, key=lambda x: -len(x["name"])):
            if gp.get("source") and gp["source"] not in collected_urls:
                uncollected.append(f"{sigungu} · {gp['name']}")
                continue
            gold_evaluable += 1
            cand = match_name(gp["name"], cands, sigungu)
            if cand is None:
                errors["미탐(레코드 미매칭)"] += 1
                misses.append(f"{sigungu} · {gp['name']}")
                continue
            cands.remove(cand)
            matched += 1
            c_ok = cand["category"] == gp["category"]
            a_core = amount_core_match(gp["amount"], cand["amount"])
            a_exact = amounts_won(cand["amount"]) == amounts_won(gp["amount"]) if a_core is not None else None
            s_ok = domain(cand["source"]) == domain(gp["source"])
            cat_ok += c_ok
            src_ok += s_ok
            if a_core is not None:
                amt_eval += 1
                amt_core += bool(a_core)
                amt_exact += bool(a_exact)
                if not a_core:
                    errors["amount 핵심값 불일치"] += 1
                    real_amount_diff.append(
                        f"{sigungu} · {gp['name']} — 정답 '{gp['amount'][:60]}' vs 추출 "
                        f"'{cand['amount'][:60]}' (confidence {cand.get('confidence')})"
                    )
            if not c_ok:
                errors["category 불일치"] += 1
            if not s_ok:
                errors["source 도메인 불일치"] += 1
            rows.append((sigungu, gp["name"], c_ok, a_core, a_exact, s_ok))

    def pct(n: int, d: int) -> str:
        return f"{100 * n / d:.1f}%" if d else "—"

    report = [
        f"# 파이프라인 정확도 리포트 — {date.today().isoformat()}",
        "",
        f"- 정답셋: 남부발전 관할 등 {len(gold)}개 시군구, 수동 검증 프로그램"
        f" **{gold_evaluable}건 평가** (원문 미수집 {len(uncollected)}건 제외 — robots.txt 불허 등)",
        f"- 평가 대상: 동일 원문 재파싱 결과 {sum(len(v) for v in parsed.values())}건"
        f" (모델: {cfg['model']['name']})",
        "",
        "## 평가 기준",
        "",
        "- **레코드 매칭**: 사업명 정규화(괄호 주석·지역명 접두 제거) 포함관계 또는 토큰 60% 커버",
        "- **amount 핵심 일치**: 정답의 핵심 금액이 추출에 포함(표기 차이·파생 숫자 허용).",
        "  참고용으로 숫자 시퀀스 완전 일치율도 병기",
        "- **category**: enum 완전 일치 · **source**: 도메인 일치",
        "",
        "## 결과 요약",
        "",
        "| 지표 | 값 |",
        "|---|---|",
        f"| 레코드 매칭률(재현율) | {matched}/{gold_evaluable} = {pct(matched, gold_evaluable)} |",
        f"| category 일치율 | {pct(cat_ok, matched)} |",
        f"| amount 핵심값 일치율 | {amt_core}/{amt_eval} = {pct(amt_core, amt_eval)} (금액 평가 대상 {amt_eval}건 — 정답에 금액 명시된 건) |",
        f"| amount 금액 완전 일치 | {pct(amt_exact, amt_eval)} |",
        f"| source(도메인) 일치율 | {pct(src_ok, matched)} |",
        "",
        "## 오류 유형",
        "",
    ]
    if errors:
        report += [f"- {k}: {v}건" for k, v in errors.most_common()]
    else:
        report.append("- 없음")
    if real_amount_diff:
        report += ["", "### amount 실질 불일치 상세", ""] + [f"- {m}" for m in real_amount_diff]
    if misses:
        report += ["", "### 미탐 목록", ""] + [f"- {m}" for m in misses]
    if uncollected:
        report += ["", "### 평가 제외(원문 미수집 — robots.txt 불허·접속 실패)", ""] + [
            f"- {m}" for m in uncollected
        ]
    report += [
        "",
        "## 필드별 상세",
        "",
        "| 시군구 | 사업명 | category | amount(핵심) | amount(완전) | source |",
        "|---|---|---|---|---|---|",
    ]
    def mark(v) -> str:
        return "—" if v is None else ("✓" if v else "✗")

    report += [
        f"| {s} | {n} | {'✓' if c else '✗'} | {mark(a)} | {mark(ax)} | {'✓' if u else '✗'} |"
        for s, n, c, a, ax, u in rows
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
