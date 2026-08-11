# -*- coding: utf-8 -*-
"""월간 자동 갱신 정합성 검증 — 갱신된 plants.json을 직전 커밋(HEAD)과 비교.

자동 갱신이 잘못된 원천 데이터를 그대로 내보내지 않도록 하는 게이트:
급격한 변화(개수·용량)나 스키마 이상이 있으면 실패(exit 1)해 PR 생성을 막는다.
통과 시 사람 검토용 요약(sanity 리포트)을 stdout으로 출력한다.

사용법: python sanity_check.py  (git 저장소 루트 기준 상대 경로 사용)
"""
import io
import json
import subprocess
import sys
from datetime import date
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).parent
ROOT = HERE.parent
PLANTS = "web/public/data/plants.json"
ZONES = "web/public/data/benefit_zones.json"

FUELS = {"원자력", "석탄", "LNG", "유류", "수력", "양수", "풍력", "바이오", "해양", "기타"}
errors, notes = [], []


def load_head(path):
    r = subprocess.run(["git", "show", f"HEAD:{path}"], capture_output=True, cwd=ROOT)
    if r.returncode != 0:
        return None
    return json.loads(r.stdout.decode("utf-8"))


new = json.load(io.open(ROOT / PLANTS, encoding="utf-8"))
old = load_head(PLANTS)

np_, op_ = new["plants"], (old or {}).get("plants", [])
n_cnt, o_cnt = len(np_), len(op_)
n_mw = sum(p["totalMw"] for p in np_)
o_mw = sum(p["totalMw"] for p in op_) if op_ else n_mw

# ── 절대 검증 ──
if not 400 <= n_cnt <= 600:
    errors.append(f"발전소 수 이상: {n_cnt} (허용 400~600)")
if len(new.get("links", [])) < 15:
    errors.append(f"폐지→대체 연결 수 이상: {len(new.get('links', []))} (<15)")
try:
    age = (date.today() - date.fromisoformat(new.get("generatedAt", "1970-01-01"))).days
except ValueError:
    age = 9999
if age > 2:  # 빌드 직후 실행 전제 — 자정 경계 감안 이틀 허용
    errors.append(f"기준일 미갱신: {new.get('generatedAt')} ({age}일 경과)")
bad_fuel = [p["name"] for p in np_ if p.get("fuelCat") not in FUELS][:5]
if bad_fuel:
    errors.append(f"연료 분류 이상: {bad_fuel}")
noname = sum(1 for p in np_ if not (p.get("name") or "").strip())
if noname:
    errors.append(f"이름 없는 발전소 {noname}건")

# ── HEAD 대비 변화량 검증 ──
if op_:
    if abs(n_cnt - o_cnt) > 25:
        errors.append(f"발전소 수 급변: {o_cnt} → {n_cnt} (|Δ|>25)")
    if o_mw and abs(n_mw - o_mw) / o_mw > 0.10:
        errors.append(f"총 설비용량 급변: {o_mw:,.0f} → {n_mw:,.0f} MW (>10%)")
    old_names = {p["name"] for p in op_}
    new_names = {p["name"] for p in np_}
    added = sorted(new_names - old_names)
    removed = sorted(old_names - new_names)
    if added:
        notes.append(f"신규 {len(added)}곳: " + ", ".join(added[:8]) + ("…" if len(added) > 8 else ""))
    if removed:
        notes.append(f"제외 {len(removed)}곳: " + ", ".join(removed[:8]) + ("…" if len(removed) > 8 else ""))

# ── benefit_zones 검증 ──
try:
    zones = json.load(io.open(ROOT / ZONES, encoding="utf-8"))
    zc = len(zones.get("zones", zones.get("regions", []))) or len(zones) if isinstance(zones, dict) else len(zones)
    if not 1200 <= zc <= 1500:
        errors.append(f"혜택 구역(읍면동) 수 이상: {zc} (허용 1200~1500)")
    else:
        notes.append(f"혜택 구역 읍면동 {zc}개")
except FileNotFoundError:
    errors.append("benefit_zones.json 없음")

# ── 리포트 ──
print("## 월간 데이터 갱신 정합성 리포트")
print(f"- 발전소: {o_cnt} → **{n_cnt}곳** · 총 설비 {o_mw:,.0f} → **{n_mw:,.0f} MW**")
print(f"- 기준일: {new.get('generatedAt')} · 폐지→대체 연결 {len(new.get('links', []))}건")
for x in notes:
    print(f"- {x}")
if errors:
    print("\n### ❌ 검증 실패 — 자동 반영 중단(사람 확인 필요)")
    for e in errors:
        print(f"- {e}")
    sys.exit(1)
print("\n### ✅ 자동 검증 통과 — 아래 diff를 사람이 확인 후 병합하세요")
print("(병합 전 확인: 신규·제외 발전소가 실제 변동인지, 발전량 연도가 맞는지)")
