"""[반영] 승인 건만 benefit_local.json 병합 — 항상 사람 승인 후 (HITL, 자동 배포 금지).

입력: data/auto_approved.json + data/approved/*.json (review_viewer.html 에서 승인·내보낸 파일)
동작: --yes 없이 실행하면 병합 미리보기(diff)만 출력. --yes 시 병합 + updatedAt 갱신 + 변경 로그.
반영 후 git 커밋·배포는 별도 수동 절차(자동 push 금지).

사용법: python apply.py            # 미리보기
        python apply.py --yes     # 실제 반영
"""
import argparse
from datetime import date

from common import append_log, load_config, path_of, read_json, utf8_stdout, write_json
from validate import norm


def to_site_program(p: dict) -> dict:
    """파이프라인 출력 → 사이트 스키마({category,name,amount,condition,source})."""
    return {
        "category": p["category"],
        "name": p["name"],
        "amount": p["amount"],
        "condition": p.get("target", ""),
        "source": p["source"],
    }


def main() -> None:
    utf8_stdout()
    ap = argparse.ArgumentParser()
    ap.add_argument("--yes", action="store_true", help="실제 반영(없으면 미리보기만)")
    args = ap.parse_args()

    cfg = load_config()
    items = list(read_json(path_of(cfg, "auto_approved"), []))
    approved_dir = path_of(cfg, "approved_dir")
    if approved_dir.exists():
        for f in sorted(approved_dir.glob("*.json")):
            items.extend(read_json(f, []))
    if not items:
        print("반영할 승인 건이 없습니다 (validate.py → review_viewer.html 순서 확인).")
        return

    benefit_path = path_of(cfg, "benefit_local")
    benefit = read_json(benefit_path, None)
    if benefit is None:
        raise SystemExit(f"반영 대상 파일 없음: {benefit_path}")

    by_region = {(r["sido"], r["sigungu"]): r for r in benefit["regions"]}
    added, skipped = [], []
    for it in items:
        key = (it["sido"], it["sigungu"])
        region = by_region.get(key)
        if region is None:
            region = {"sido": it["sido"], "sigungu": it["sigungu"], "depopulation": False, "programs": []}
            by_region[key] = region
            benefit["regions"].append(region)
        exists = {norm(p["name"]) for p in region["programs"]}
        prog = to_site_program(it["program"])
        if norm(prog["name"]) in exists:
            skipped.append(f"{it['sigungu']} {prog['name']} (중복)")
            continue
        region["programs"].append(prog)
        added.append(f"{it['sido']} {it['sigungu']} — [{prog['category']}] {prog['name']} ({prog['amount']})")

    print(f"병합 대상 {len(items)}건 중 신규 {len(added)}건, 중복 제외 {len(skipped)}건\n")
    for a in added:
        print(f"  + {a}")
    for s in skipped:
        print(f"  = {s}")

    if not args.yes:
        print("\n미리보기 모드 — 반영하려면 내용 확인 후 `python apply.py --yes` 실행 (HITL)")
        return
    if not added:
        print("\n신규 건이 없어 반영하지 않습니다.")
        return

    benefit["updatedAt"] = date.today().isoformat()
    write_json(benefit_path, benefit)
    for a in added:
        append_log(cfg, f"apply + {a}")
    append_log(cfg, f"apply 완료: 신규 {len(added)}건, updatedAt={benefit['updatedAt']}")
    print(f"\n반영 완료 → {benefit_path} (updatedAt={benefit['updatedAt']})")
    print("다음 단계(수동): 사이트 확인 후 git 커밋·배포. 자동 push는 하지 않습니다.")


if __name__ == "__main__":
    main()
