# -*- coding: utf-8 -*-
"""발전소주변지역 지원사업(발주법) 판정 데이터 생성.

법적 기준: 발전기 설치지점 반경 5km 이내(육지·섬)가 걸치는 읍·면·동 전체 (발주법 §2).
근사: 발전소 대표 좌표(호기별 아님) × 읍면동 경계(KOSTAT 2013 간소화본) — 안내용 추정.

입력: raw/emd.json(읍면동 3,482), raw/municipalities.json, ../web/public/data/plants.json
출력: ../web/public/data/benefit_zones.json
"""
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).parent
WEB = HERE.parent / "web" / "public" / "data"
RADIUS_M = 5000.0

SIDO_NAME = {"11": "서울", "21": "부산", "22": "대구", "23": "인천", "24": "광주",
             "25": "대전", "26": "울산", "29": "세종", "31": "경기", "32": "강원",
             "33": "충북", "34": "충남", "35": "전북", "36": "전남", "37": "경북",
             "38": "경남", "39": "제주"}


def rings_of(geom):
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    return [poly[0] for poly in polys if poly]  # 외곽 링만


def bbox_of(rings):
    xs = [p[0] for r in rings for p in r]
    ys = [p[1] for r in rings for p in r]
    return min(xs), min(ys), max(xs), max(ys)


def point_in_ring(lng, lat, ring):
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > lat) != (yj > lat) and lng < (xj - xi) * (lat - yi) / (yj - yi + 1e-12) + xi:
            inside = not inside
        j = i
    return inside


def dist_point_seg(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def min_dist_m(lng, lat, rings):
    """점→폴리곤 최소거리(m). 내부면 0."""
    for r in rings:
        if point_in_ring(lng, lat, r):
            return 0.0
    kx = 111320.0 * math.cos(math.radians(lat))
    ky = 110540.0
    best = float("inf")
    for r in rings:
        for i in range(len(r) - 1):
            d = dist_point_seg(lng * kx, lat * ky,
                               r[i][0] * kx, r[i][1] * ky,
                               r[i + 1][0] * kx, r[i + 1][1] * ky)
            if d < best:
                best = d
    return best


def main():
    emd = json.loads((HERE / "raw" / "emd.json").read_text(encoding="utf-8"))["features"]
    muni = json.loads((HERE / "raw" / "municipalities.json").read_text(encoding="utf-8"))["features"]
    plants = json.loads((WEB / "plants.json").read_text(encoding="utf-8"))["plants"]

    muni_name = {f["properties"]["code"]: f["properties"]["name"] for f in muni}

    # 판정 대상: 좌표 보유 + (운영중 10MW 이상 또는 건설·계획). 폐지완료는 지원 대상 아님
    cands = [p for p in plants if p["lat"] is not None and p["status"] != "폐지완료" and
             ((p["status"] == "운영중" and p["totalMw"] >= 10) or p["status"] != "운영중")]

    # 읍면동 전처리
    emds = []
    for f in emd:
        rings = rings_of(f["geometry"])
        if not rings:
            continue
        code = f["properties"]["code"]
        emds.append({"code": code, "name": f["properties"]["name"],
                     "muni": muni_name.get(code[:5], ""), "sido": SIDO_NAME.get(code[:2], ""),
                     "rings": rings, "bbox": bbox_of(rings)})

    zones = {}
    for p in cands:
        lat, lng = p["lat"], p["lng"]
        dlat = 0.0555  # ~6.1km
        dlng = 0.0555 / max(0.2, math.cos(math.radians(lat)))
        for e in emds:
            x0, y0, x1, y1 = e["bbox"]
            if lng < x0 - dlng or lng > x1 + dlng or lat < y0 - dlat or lat > y1 + dlat:
                continue
            d = min_dist_m(lng, lat, e["rings"])
            if d <= RADIUS_M:
                zones.setdefault(e["code"], []).append({
                    "id": p["id"], "name": p["name"], "fuelCat": p["fuelCat"],
                    "mw": p["totalMw"], "status": p["status"],
                    "distKm": round(d / 1000, 1),
                    "approx": p["precision"] != "exact",
                })

    for v in zones.values():
        v.sort(key=lambda x: x["distKm"])

    # 드롭다운 트리 (전체 읍면동)
    tree = {}
    for e in emds:
        if not e["sido"] or not e["muni"]:
            continue
        tree.setdefault(e["sido"], {}).setdefault(e["muni"], []).append([e["code"], e["name"]])
    for s in tree.values():
        for lst in s.values():
            lst.sort(key=lambda x: x[1])

    out = {
        "generatedAt": "2026-07-13",
        "note": "발주법 §2 기준(발전기 반경 5km가 걸치는 읍면동 전체)의 근사 판정 — 발전소 대표좌표·2013 행정경계 기준 안내용 추정이며 법적 판정이 아님. 10MW 미만 소규모 발전소 제외.",
        "tree": tree,
        "zones": zones,
    }
    (WEB / "benefit_zones.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")

    hit_plants = {x["id"] for v in zones.values() for x in v}
    print(f"판정 대상 발전소: {len(cands)} (혜택권 형성: {len(hit_plants)})")
    print(f"주변지역 해당 읍면동: {len(zones)} / {len(emds)}")
    sample = [(e['sido'], e['muni'], e['name']) for e in emds if e['code'] in zones and '태안' in e['muni']][:5]
    print("태안군 예시:", sample)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
