# -*- coding: utf-8 -*-
"""EPSIS 발전기 세부내역 + WRI 좌표 + 11차 전기본을 조인해 web/public/data/plants.json 생성.

원천:
  raw/epsis_detail_2024.txt  EPSIS 발전기 세부내역(POST selectEkfaFclDtlGrid.do, srchDate=2024)
  raw/wri_kor.json           WRI Global Power Plant Database v1.3 한국분 (CC BY 4.0)
  raw/municipalities.json    시군구 경계(southkorea-maps, KOSTAT 2013) — 폴백 좌표용
  curated/plan11.json        11차 전력수급기본계획 폐지·대체·신규 (검증 리서치 기반 큐레이션)
"""
import json, re, sys
from collections import defaultdict, Counter
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE.parent / "web" / "public" / "data"
OUT.mkdir(parents=True, exist_ok=True)

FUEL_CAT = {
    "농축U": "원자력", "천연U": "원자력",
    "유연탄": "석탄", "무연탄": "석탄", "역청탄": "석탄", "유연탄*": "석탄",
    "LNG": "LNG", "LPG*": "LNG",
    "중유": "유류", "경유": "유류", "LSWR": "유류",
    "바이오중유": "바이오", "바이오": "바이오",
    "수력": "수력", "소수력": "수력",
    "양수": "양수",
    "해양 에너지": "해양",
}

# WRI 영문명 → EPSIS 발전소 기본명 (좌표 소스: WRI GPPD v1.3, 검증됨)
WRI_MAP = {
    "Hanbit": "한빛", "Hanul": "한울", "Kori": "고리", "Shin-Kori": "신고리",
    "Wolsong": "월성", "Shin-Wolsong": "신월성",
    "Yeongheung": "영흥", "Boryeong (poryang)": "보령", "Dangjin": "당진",
    "Hadong": "하동", "Taean": "태안", "Samcheonpo": "삼천포",
    "Samcheok Green power station": "삼척그린파워", "Shin Boryeong power station": "신보령",
    "Bukpyung power station": "북평", "Yeosu": "여수",
    "Incheon": "포스코인천", "KOMIPO Incheon": "인천", "Seoincheon": "서인천", "Shinincheon": "신인천",
    "Dongducheon": "동두천", "Boryeong (CC)": "보령복합", "Busan (pusan)": "부산",
    "Pocheon": "포천", "Bugok": "부곡", "Yulchon": "율촌", "Pyeongtaek": "평택",
    "Kwangyang": "광양", "Bundang": "분당", "Ilsan": "일산", "Yeongwol": "영월",
    "Ansan Project": "안산", "Oseong": "오성", "Gunsan": "군산", "Sejong City": "세종열병합",
    "Paju": "파주", "Hwasung KDHC": "화성", "Ulsan": "울산",
    "Anyang CHP": "안양열병합", "Bucheon Power": "부천복합", "Donghae power station": "동해",
    "Seocheon": "신서천", "Yeongnam": "영남", "Honam": "호남",
    "Gwangyang POSCO": "광양포스코", "Pohang Works": "포항",
}
# WRI에 없는 사이트 보정 + 발전5사 공식 홈페이지 도로명주소 기반 좌표(근사 발전소 정밀화)
EXTRA_COORDS = {
    "새울": (35.3271, 129.3017),
    "신세종열병합": (36.4683, 127.2479),
    # 발전5사 홈페이지 소재지(도로명주소) 기반 — 기존 시군구 근사 대체
    "서울복합": (37.5406, 126.9065),  # 중부 서울발전본부(당인리) 마포구 토정로 56
    "안동": (36.5866, 128.6203),  # 남부 안동빛드림본부 풍산읍
    "김포열병합": (37.667, 126.62),  # 서부 김포발전본부 양촌읍
    "제주복합": (33.523, 126.573),  # 중부 제주발전본부 원당로 133
    "제주": (33.523, 126.573),
    "제주내연": (33.523, 126.573),
    "남제주": (33.2358, 126.343),  # 남부 남제주빛드림본부 안덕면
    "남제주복합": (33.2358, 126.343),
    "영동": (37.75, 129.03),  # 남동 영동에코발전본부 강릉 강동면
}

SIDO_NORM = {"강원도": "강원", "경기도": "경기", "충청남도": "충남", "충청북도": "충북",
             "전라남도": "전남", "전라북도": "전북", "경상남도": "경남", "경상북도": "경북",
             "제주특별자치도": "제주", "서울특별시": "서울", "세종시": "세종",
             "세종특별자치시": "세종", "층남": "충남", "강원특별자치도": "강원",
             "전북특별자치도": "전북"}

SIDO_CODE = {"서울": "11", "부산": "21", "대구": "22", "인천": "23", "광주": "24",
             "대전": "25", "울산": "26", "세종": "29", "경기": "31", "강원": "32",
             "충북": "33", "충남": "34", "전북": "35", "전남": "36", "경북": "37",
             "경남": "38", "제주": "39"}

COMP_SUFFIX = re.compile(r"\s+(GT|ST|CC|G/T|S/T)$")


def parse_units():
    txt = (HERE / "raw" / "epsis_detail_2024.txt").read_text(encoding="utf-8")
    pat = re.compile(
        r'c1 = "(.*?)";\s*c2 = "(.*?)";\s*c3 = "(.*?)";\s*c4 = "(.*?)";\s*c5 = "(.*?)";\s*'
        r'c6 = "(.*?)";\s*c7 = "(.*?)";\s*c8 = "(.*?)";\s*c9 = "(.*?)";\s*c10 = "(.*?)";\s*'
        r'c11 = "(.*?)";\s*c12 = "(.*?)";\s*c13 = "(.*?)";\s*c14 = "(.*?)";\s*c15 = "(.*?)";\s*'
        r'c16 = "(.*?)";\s*c17 = "(.*?)";\s*c18 = "(.*?)";')
    units = []
    for m in pat.findall(txt):
        (ftype, name, ucap, cnt, cap, done, ftype2, fuel, mk_b, mk_t, mk_g,
         company, volt, biz, member, market, central, addr) = m
        raw = re.sub(r"\s+", " ", name).strip()
        comp = ""
        mm = COMP_SUFFIX.search(raw)
        if mm:
            comp = mm.group(1)
            raw = raw[: mm.start()].strip()
        raw = raw.replace(" ", "")  # '한 빛 #6' → '한빛#6'
        if "#" in raw:
            base, unit_no = raw.split("#", 1)
        else:
            base, unit_no = raw, ""
        try:
            mw = float(cap) / 1000.0
        except ValueError:
            mw = 0.0
        units.append({
            "base": base, "unit": unit_no, "comp": comp,
            "ftype": ftype, "fuel": fuel, "fuelCat": FUEL_CAT.get(fuel, "기타"),
            "mw": round(mw, 1), "count": cnt, "completed": done,
            "company": company, "biz": biz, "member": member,
            "market": market, "central": central, "addr": addr,
            "makerB": mk_b, "makerT": mk_t, "makerG": mk_g,
        })
    return units


def company_group(c):
    for key, g in (("한국수력원자력", "한수원"), ("남동발전", "남동발전"), ("중부발전", "중부발전"),
                   ("서부발전", "서부발전"), ("남부발전", "남부발전"), ("동서발전", "동서발전"),
                   ("지역난방", "지역난방공사"), ("수자원공사", "수자원공사"), ("수력원자력", "한수원")):
        if key in c:
            return g
    return "민간·기타" if c and c != "-" else "민간·기타"


def addr_keys(addr):
    """소재지 → (시도, 시군구후보들)"""
    toks = addr.split()
    if not toks:
        return None, []
    sido = SIDO_NORM.get(toks[0], toks[0])
    cands = []
    if len(toks) >= 3 and toks[1].endswith("시") and toks[2].endswith("구"):
        cands.append(toks[1] + toks[2])
    if len(toks) >= 2:
        cands.append(toks[1])
    if sido == "세종":
        cands.append("세종시")
    return sido, cands


def lookup_centroid(pref, cands, cent):
    """정확 일치 → 전방일치(분할 구는 평균)로 시군구 중심점 탐색"""
    for c in cands:
        if (pref, c) in cent:
            return cent[(pref, c)]
    for c in cands:
        hits = [v for (p, n), v in cent.items() if p == pref and n.startswith(c)]
        if hits:
            return (round(sum(h[0] for h in hits) / len(hits), 4),
                    round(sum(h[1] for h in hits) / len(hits), 4))
    return None


GEN_FUEL_CAT = dict(FUEL_CAT)
GEN_FUEL_CAT.update({"원자력": "원자력", "국내탄": "석탄", "유류": "유류"})

# 발전량 데이터의 발전소명 → 세부내역 기준명
GEN_ALIAS = {"새울": "신고리", "포스코에너지": "포스코",
             "내포그린에너지열병합": "내포그린열병합", "삼척화력": "삼척블루파워"}


def parse_gen():
    """EPSIS 발전기별 발전량(연간) → [{base, unit, cc, fuelCat, capKw, mwh, cf}]"""
    import glob
    files = [f for f in sorted(glob.glob(str(HERE / "raw" / "epsis_gen_*.txt")), reverse=True)
             if Path(f).stat().st_size > 10000]
    if not files:
        return None, []
    path = files[0]
    year = re.search(r"epsis_gen_(\d{4})", path).group(1)
    txt = Path(path).read_text(encoding="utf-8")
    pat = re.compile(
        r'c1 = "(.*?)";\s*c2 = "(.*?)";\s*c3 = "(.*?)";\s*c4 = "(.*?)";\s*c5 = "(.*?)";\s*'
        r'c6 = "(.*?)";\s*c7 = "(.*?)";\s*c8 = "(.*?)";\s*c9 = "(.*?)";\s*'
        r'gridData\.push\(\{"Period":"(\d+)",\s*"Power":"(.*?)",\s*"Fuel":"(.*?)",\s*"Fuel2":"(.*?)",\s*'
        r'"Comp":"(.*?)",\s*"Comp2":"(.*?)",\s*"Equip":"(.*?)",')
    rows = []
    for m in pat.findall(txt):
        c1, c2, _, _, _, _, _, c8, _, _, power, fuel, fuel2, comp, _, equip = m
        e = equip.replace(" ", "")
        cc = e.endswith("C/C")
        if cc:
            e = e[:-3]
        base, unit = (e.split("#", 1) + [None])[:2] if "#" in e else (e, None)
        base = GEN_ALIAS.get(base, base)
        try:
            rows.append({"base": base, "unit": unit, "cc": cc,
                         "fuelCat": GEN_FUEL_CAT.get(fuel) or GEN_FUEL_CAT.get(power),
                         "capKw": float(c1 or 0), "mwh": float(c2 or 0), "cf": float(c8 or 0)})
        except ValueError:
            continue
    return year, rows


def parse_wind():
    """에너지공단 풍력기 위치정보(15085304) → 단지 단위 집계. 파일 없으면 []"""
    path = HERE / "raw" / "wind.csv"
    if not path.exists():
        return []
    import csv
    farms = {}
    with open(path, encoding="cp949", errors="replace") as f:
        rdr = csv.reader(f)
        next(rdr, None)
        for row in rdr:
            if len(row) < 5:
                continue
            no, name, unit, mw, addr = row[0], row[1].strip(), row[2], row[3], row[4].strip()
            key = (no, name)
            farm = farms.setdefault(key, {"name": name, "units": 0, "mw": 0.0, "addr": addr})
            farm["units"] += 1
            try:
                farm["mw"] += float(mw)
            except ValueError:
                pass
    return list(farms.values())


def build_muni_centroids():
    d = json.loads((HERE / "raw" / "municipalities.json").read_text(encoding="utf-8"))
    cent = {}  # (sido_prefix, name) -> (lat, lng)
    for f in d["features"]:
        code = f["properties"]["code"]
        name = f["properties"]["name"]
        geom = f["geometry"]
        pts = []
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        for poly in polys:
            for ring in poly[:1]:
                pts.extend(ring)
        if not pts:
            continue
        lng = sum(p[0] for p in pts) / len(pts)
        lat = sum(p[1] for p in pts) / len(pts)
        cent[(code[:2], name)] = (round(lat, 4), round(lng, 4))
    return cent


def region_coords(region, cent):
    """'경북 구미시' 같은 문자열 → 시군구 중심점"""
    sido, cands = addr_keys(region)
    pref = SIDO_CODE.get(sido or "")
    if not pref:
        return None
    return lookup_centroid(pref, cands, cent)


def main():
    units = parse_units()
    wri = json.loads((HERE / "raw" / "wri_kor.json").read_text(encoding="utf-8"))
    plan = json.loads((HERE / "curated" / "plan11.json").read_text(encoding="utf-8"))
    cent = build_muni_centroids()

    # WRI 좌표 인덱스 (한국명 기준)
    coords = dict(EXTRA_COORDS)
    used_wri = set()
    for w in wri:
        kn = WRI_MAP.get(w["name"])
        if kn and kn not in coords:
            coords[kn] = (float(w["lat"]), float(w["lng"]))
            used_wri.add(w["name"])

    # 발전소 그룹핑: (기본명, 연료구분, 시군구)
    groups = defaultdict(list)
    for u in units:
        sido, cands = addr_keys(u["addr"])
        sigungu = cands[-1] if cands else ""
        groups[(u["base"], u["fuelCat"], sido or "", sigungu)].append(u)

    retire_idx = {(r["plant"], r["unit"]): r for r in plan["retirements"]}
    repl_idx = defaultdict(list)
    for r in plan["replacements"]:
        repl_idx[r["from"]].append(r)

    plants, stats = [], Counter()
    for (base, fcat, sido, sigungu), us in sorted(groups.items(), key=lambda kv: -sum(x["mw"] for x in kv[1])):
        total = round(sum(x["mw"] for x in us), 1)
        addr = us[0]["addr"]
        # 좌표: 큐레이션(WRI) → 시군구 중심점
        latlng, prec = None, None
        if base in coords:
            latlng, prec = coords[base], "exact"
        else:
            pref = SIDO_CODE.get(sido)
            if pref:
                _, cands = addr_keys(addr)
                got = lookup_centroid(pref, cands, cent)
                if got:
                    latlng, prec = got, "sigungu"
        stats["coord_" + (prec or "none")] += 1

        # 호기 정리 + 전기본 결합
        out_units, retire_years = [], []
        def unit_key(x):
            m = re.match(r"(\d+)", x["unit"])
            return (int(m.group(1)) if m else 9999, x["unit"], x["comp"])

        for u in sorted(us, key=unit_key):
            ou = {"label": ("#" + u["unit"] if u["unit"] else "") + ((" " + u["comp"]) if u["comp"] else ""),
                  "mw": u["mw"], "count": u["count"], "completed": u["completed"],
                  "fuel": u["fuel"], "ftype": u["ftype"],
                  "makers": {"b": u["makerB"], "t": u["makerT"], "g": u["makerG"]}}
            if fcat == "석탄":
                key = (base, u["unit"])
                if key in retire_idx:
                    r = retire_idx[key]
                    ou["retire"] = {"year": r["year"], "type": r["type"]}
                    retire_years.append(r["year"])
                rk = f"{base}#{u['unit']}"
                if rk in repl_idx:
                    ou["replacements"] = [{"to": x["to"], "planned": x["planned"], "note": x["note"]}
                                          for x in repl_idx[rk]]
            out_units.append(ou)

        companies = Counter(u["company"] for u in us if u["company"] not in ("", "-"))
        top_company = companies.most_common(1)[0][0] if companies else ""
        plants.append({
            "id": f"p{len(plants):04d}",
            "name": base, "fuelCat": fcat,
            "company": top_company,
            "companyGroup": company_group(top_company),
            "status": "운영중",
            "address": addr, "sido": sido, "sigungu": sigungu,
            "lat": latlng[0] if latlng else None, "lng": latlng[1] if latlng else None,
            "precision": prec,
            "totalMw": total,
            "central": us[0]["central"], "market": us[0]["market"], "biz": us[0]["biz"],
            "units": out_units,
            "firstRetireYear": min(retire_years) if retire_years else None,
        })

    # 신규(전기본) 발전소 추가
    name_to_id = {p["name"]: p["id"] for p in plants}
    for nb in plan["newBuilds"]:
        latlng, prec = None, None
        if nb.get("lat") is not None and nb.get("lng") is not None:
            latlng, prec = (nb["lat"], nb["lng"]), nb.get("precision", "sigungu")
        elif nb.get("coordsFrom") and nb["coordsFrom"] in coords:
            latlng, prec = coords[nb["coordsFrom"]], "exact"
        elif nb["region"].startswith("부지 미정"):
            pass
        else:
            latlng = region_coords(nb["region"], cent)
            prec = "sigungu" if latlng else None
        plants.append({
            "id": f"n{len(plants):04d}",
            "name": nb["name"], "fuelCat": nb["fuelCat"], "company": nb.get("company", ""),
            "companyGroup": nb.get("companyGroup", "건설·계획"),
            "status": nb["status"], "address": nb["region"],
            "sido": (addr_keys(nb["region"])[0] or "") if not nb["region"].startswith("부지 미정") else "",
            "sigungu": (addr_keys(nb["region"])[1][-1] if addr_keys(nb["region"])[1] else ""),
            "lat": latlng[0] if latlng else None, "lng": latlng[1] if latlng else None,
            "precision": prec, "totalMw": nb.get("mw", 0) or 0,
            "central": "", "market": "", "biz": "",
            "units": [], "firstRetireYear": None,
            "planned": {"when": nb["when"], "note": nb.get("note", "")},
        })
        name_to_id[nb["name"]] = plants[-1]["id"]

    # 폐지완료 발전소 (큐레이션)
    for rp in plan.get("retired", []):
        latlng, prec = None, None
        if rp.get("coordsFrom") and rp["coordsFrom"] in coords:
            latlng, prec = coords[rp["coordsFrom"]], "exact"
        else:
            latlng = region_coords(rp["region"], cent)
            prec = "sigungu" if latlng else None
        plants.append({
            "id": f"r{len(plants):04d}",
            "name": rp["name"], "fuelCat": rp["fuelCat"],
            "company": rp.get("company", ""), "companyGroup": rp.get("companyGroup", "민간·기타"),
            "status": "폐지완료", "address": rp["region"],
            "sido": addr_keys(rp["region"])[0] or "",
            "sigungu": (addr_keys(rp["region"])[1][-1] if addr_keys(rp["region"])[1] else ""),
            "lat": latlng[0] if latlng else None, "lng": latlng[1] if latlng else None,
            "precision": prec, "totalMw": rp["mw"],
            "central": "", "market": "", "biz": "",
            "units": [], "firstRetireYear": None,
            "retiredAt": rp["retiredAt"],
            "planned": {"when": f"{rp['retiredAt']} 폐지", "note": rp.get("note", "")},
        })

    # 풍력 단지 추가 (에너지공단 풍력기 위치정보, 2025-12-31 기준)
    wind_farms = parse_wind()
    for wf in wind_farms:
        sido, cands = addr_keys(wf["addr"])
        pref = SIDO_CODE.get(sido or "")
        latlng = lookup_centroid(pref, cands, cent) if pref else None
        disp = wf["name"] if "풍력" in wf["name"] else wf["name"] + "풍력"
        plants.append({
            "id": f"w{len(plants):04d}",
            "name": disp, "fuelCat": "풍력", "company": "",
            "companyGroup": "민간·기타", "status": "운영중",
            "address": wf["addr"], "sido": sido or "", "sigungu": cands[-1] if cands else "",
            "lat": latlng[0] if latlng else None, "lng": latlng[1] if latlng else None,
            "precision": "sigungu" if latlng else None,
            "totalMw": round(wf["mw"], 1),
            "central": "", "market": "", "biz": "",
            "units": [{"label": f"{wf['units']}기", "mw": round(wf['mw'], 1), "count": str(wf['units']),
                       "completed": "", "fuel": "풍력", "ftype": "풍력"}],
            "firstRetireYear": None,
        })

    # 연간 발전량·이용률 조인 (발전소·호기 단위)
    gen_year, gen_rows = parse_gen()
    gen_matched, gen_missed = 0, []
    if gen_rows:
        acc = {}  # plant.id -> [sum_mwh, sum_capkw]
        for g in gen_rows:
            cand = None
            names = [g["base"] + "복합", g["base"]] if g["cc"] else [g["base"]]
            for nm in names:
                for p in plants:
                    if p["name"] == nm and (g["fuelCat"] is None or p["fuelCat"] == g["fuelCat"] or g["cc"]):
                        cand = p
                        break
                if cand:
                    break
            if not cand:
                gen_missed.append(g)
                continue
            gen_matched += 1
            a = acc.setdefault(cand["id"], [0.0, 0.0])
            a[0] += g["mwh"]
            a[1] += g["capKw"]
            if g["unit"]:
                for u in cand["units"]:
                    if u["label"].lstrip("#").split(" ")[0] == g["unit"]:
                        u["gen"] = {"gwh": round(g["mwh"] / 1000, 1), "cf": round(g["cf"], 1)}
                        break
        pidx0 = {p["id"]: p for p in plants}
        for pid, (mwh, capkw) in acc.items():
            if capkw > 0:
                pidx0[pid]["gen"] = {"year": gen_year, "gwh": round(mwh / 1000, 1),
                                     "cf": round(100 * mwh / (capkw * 8.76), 1)}

    # 폐지→대체 연결선 (양끝 좌표 있는 것만)
    links = []
    pidx = {p["id"]: p for p in plants}
    for r in plan["replacements"]:
        fb = r["from"].split("#")[0]
        src = next((p for p in plants if p["name"] == fb and p["fuelCat"] == "석탄"), None)
        # 대체설비명에서 그룹명 추출 ('용인복합#1' → '용인복합#1·2' 신규 항목과 전방일치)
        dst = None
        if not r["to"].startswith("미정"):
            to_base = r["to"].split("#")[0].replace("(추정)", "")
            to_unit = r["to"].split("#")[1] if "#" in r["to"] else None
            cands = [p for p in plants if p["id"].startswith("n") and
                     p["name"].split("#")[0].replace("(추정)", "") == to_base]
            if to_unit:
                for p in cands:
                    pu = p["name"].split("#")[1] if "#" in p["name"] else ""
                    if to_unit in re.split(r"[·,~]", pu):
                        dst = p
                        break
            if dst is None and cands:
                dst = cands[0]
        if src and dst and (dst["totalMw"] == 0 or dst.get("mwEstimated")):
            # 대체설비 용량 미상이면 대체 대상 호기 용량 합으로 추정 (다호기 대체는 누적)
            un = r["from"].split("#")[1] if "#" in r["from"] else ""
            mw = sum(u["mw"] for u in src["units"] if u["label"].lstrip("#").split(" ")[0] == un)
            if mw:
                dst["totalMw"] = round(dst["totalMw"] + mw, 1)
                dst["mwEstimated"] = True
        if src and dst and src["lat"] and dst["lat"]:
            links.append({"from": src["id"], "fromUnit": r["from"], "to": dst["id"],
                          "toName": r["to"], "planned": r["planned"], "note": r["note"]})

    # 상세(도로명)주소 큐레이션 병합 — 발전사 홈페이지 조사 결과.
    # (발전소명, 시도, 읍면동) 키 — 동명 사이트(예: 당진 석문면/송악읍) 분리.
    def _emd_of(a):
        for tok in (a or "").split():
            if re.search(r"(읍|면|동)$", tok) and not re.search(r"(로|길|대로|번길)$", tok):
                return tok
        return None
    addr_path = HERE / "curated" / "addresses.json"
    if addr_path.exists():
        adet = json.loads(addr_path.read_text(encoding="utf-8"))
        amap = {(e["name"], e.get("sido", ""), e.get("emd")): e["addressDetail"]
                for e in adet.get("addresses", []) if e.get("addressDetail")}
        hit = 0
        for p in plants:
            v = amap.get((p["name"], p.get("sido", ""), _emd_of(p["address"])))
            if v:
                p["addressDetail"] = v
                hit += 1
        print("상세주소 병합:", hit, "/", len(plants))

    result = {
        "generatedAt": "2026-07-13",
        "sources": [
            "전력거래소 EPSIS 발전기 세부내역(2024) — epsis.kpx.or.kr menuId=020600",
            "WRI Global Power Plant Database v1.3 (CC BY 4.0) — 좌표",
            "제11차 전력수급기본계획(산업통상자원부 공고 제2025-169호) 부록 5·11 — 폐지·대체·신규",
            "시군구 경계: KOSTAT 2013(southkorea-maps) — 근사 좌표 폴백",
        ],
        "plants": plants,
        "links": links,
    }
    (OUT / "plants.json").write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")

    # ---- 리포트 ----
    print(f"units: {len(units)} → plants: {len(plants)} (기존 {len(groups)} + 신규 {len(plan['newBuilds'])} + 풍력 {len(wind_farms)})")
    print("좌표:", dict(stats))
    print("links(좌표 연결 가능):", len(links), "/", len(plan["replacements"]))
    nocoord = [p for p in plants if p["lat"] is None and not p["address"].startswith("부지 미정")]
    big_nocoord = sorted(nocoord, key=lambda p: -p["totalMw"])[:12]
    print("좌표 없는 대형:", [(p["name"], p["totalMw"], p["address"]) for p in big_nocoord])
    unmapped_wri = [w["name"] for w in wri if w["name"] not in used_wri
                    and w["fuel"] in ("Gas", "Coal", "Nuclear", "Oil") and float(w["mw"]) >= 300]
    print("미사용 WRI(300MW+):", unmapped_wri)
    exact_mw = sum(p["totalMw"] for p in plants if p["precision"] == "exact")
    all_mw = sum(p["totalMw"] for p in plants)
    print(f"정밀좌표 커버리지(용량 기준): {exact_mw:.0f}/{all_mw:.0f} MW = {100*exact_mw/all_mw:.1f}%")
    if gen_rows:
        top_missed = sorted(gen_missed, key=lambda g: -g["mwh"])[:10]
        print(f"발전량({gen_year}) 조인: {gen_matched}/{len(gen_rows)}건 매칭, 미매칭 상위:",
              [(g['base'] + ('#' + g['unit'] if g['unit'] else '') + ('C/C' if g['cc'] else ''), round(g['mwh']/1000)) for g in top_missed])


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
