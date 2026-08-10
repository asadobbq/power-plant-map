"""[검증] 구조화 결과 자동 검증 → 자동 통과분 / 수동검토 큐(HITL) 분리.

자동 검증 규칙:
  1. category enum 일치 (구조화 스키마가 1차 보장 — 재확인)
  2. amount 에서 숫자 파싱 가능 여부 ("금액 미명시"는 검토 큐로)
  3. source URL 형식(http/https) — --check-urls 시 실제 응답(HEAD)도 확인
  4. 기존 benefit_local.json 과 중복(name+sigungu 정규화 매칭) 탐지
  5. confidence < thresholds.review_confidence → 수동검토 큐

사용법: python validate.py [--check-urls]
"""
import argparse
import re

from common import load_config, path_of, read_json, utf8_stdout, write_json

CATEGORIES = {"전입정착", "출산육아", "주거", "청년일자리", "기타"}


def norm(s: str) -> str:
    return re.sub(r"[\s()\[\]·\-]", "", s or "").lower()


def main() -> None:
    utf8_stdout()
    ap = argparse.ArgumentParser()
    ap.add_argument("--check-urls", action="store_true", help="source URL 실제 응답 확인(네트워크)")
    args = ap.parse_args()

    cfg = load_config()
    threshold = cfg["thresholds"]["review_confidence"]
    structured_dir = path_of(cfg, "structured_dir")
    benefit = read_json(path_of(cfg, "benefit_local"), {"regions": []})
    existing = {
        (r["sigungu"], norm(p["name"]))
        for r in benefit["regions"]
        for p in r["programs"]
    }

    session = None
    if args.check_urls:
        import requests
        session = requests.Session()

    auto, review = [], []
    for f in sorted(structured_dir.glob("*.json")):
        rec = read_json(f, None)
        if not rec or not rec.get("doc_relevant"):
            continue
        for p in rec["programs"]:
            issues = []
            if p["category"] not in CATEGORIES:
                issues.append(f"category 불일치: {p['category']}")
            if not re.search(r"\d", p.get("amount", "")):
                issues.append("amount 숫자 없음")
            if not re.match(r"^https?://", p.get("source", "")):
                issues.append("source URL 형식 오류")
            elif session is not None:
                try:
                    r = session.head(p["source"], timeout=10, allow_redirects=True)
                    if r.status_code >= 400:
                        issues.append(f"source URL 응답 {r.status_code}")
                except Exception as e:
                    issues.append(f"source URL 접속 실패: {e}")
            dup = (rec["sigungu"], norm(p["name"])) in existing
            if dup:
                issues.append("기존 데이터와 중복(name+sigungu)")
            low_conf = p.get("confidence", 0) < threshold
            if low_conf:
                issues.append(f"confidence {p.get('confidence')} < {threshold}")

            item = {
                "sido": rec["sido"],
                "sigungu": rec["sigungu"],
                "program": p,
                "doc": rec.get("_meta", {}),
                "issues": issues,
            }
            # 중복·저신뢰·형식 문제 중 하나라도 있으면 사람 검토(HITL)
            (review if issues else auto).append(item)

    write_json(path_of(cfg, "auto_approved"), auto)
    write_json(path_of(cfg, "review_queue"), review)
    print(f"검증 완료: 자동 통과 {len(auto)}건 → auto_approved.json")
    print(f"          수동 검토 {len(review)}건 → review_queue.json (review_viewer.html 로 처리)")
    print("※ 자동 통과분도 apply.py 는 사람 확인(--yes) 없이는 반영하지 않습니다.")


if __name__ == "__main__":
    main()
