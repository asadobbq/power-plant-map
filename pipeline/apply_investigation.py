# -*- coding: utf-8 -*-
"""2026-08-11 조사 워크플로우 결과 반영.

1) benefit_local.json — 깨진 시책 출처 URL 교체 (조사로 200 확인된 대체 URL만)
2) overseas.json — 알리오(ALIO) '타법인 출자현황' 공시로 확증된 지분·명칭 정정
   - 확증된 항목만 수정. 택스에쿼티 체인 등 해석 여지가 있는 항목은 유지.

사용법: python apply_investigation.py
"""
import io
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
WEB = Path(__file__).parent.parent / "web" / "public" / "data"

# ── 1) 시책 출처 URL 교체 ─────────────────────────────────────────────
# (구 URL, 신 URL) — 조사에서 HTTP 200 + 사업 내용 부합 확인.
# 나머지 8개 깨진 URL은 재검증 시 정상 응답(일시 장애)이라 교체 불필요.
URL_FIXES = [
    (  # 함안군 청년월세 — 구 게시물 삭제, 2025 모집 보도자료로 교체
        "https://www.haman.go.kr/00429.web?amode=view&gcode=2557&idx=17215524&not_ancmt_mgt_no=17215524&gubun=present",
        "https://www.haman.go.kr/00956/00958.web?amode=view&gcode=32&idx=17202220",
    ),
    (  # 안양시 신혼부부 대출이자 — 시청 메인 상설 페이지로 교체
        "https://www.anyang.go.kr/youth/contents.do?key=3665",
        "https://www.anyang.go.kr/main/contents.do?key=3097",
    ),
    (  # 성남시 출산장려금 — 수정구청 TLS 문제, 성남복지이음 공식 포털로 교체
        "https://www.sujeong-gu.go.kr/sub/content.asp?cIdx=313",
        "https://www.snbokji.net/5223",
    ),
    (  # 안양시 출산지원금 — 보도자료 대신 보건소 상설 안내 페이지로 교체
        "https://www.anyang.go.kr/main/selectPressRelease.do?key=4107&nttNo=396855&bbsNo=1687",
        "https://www.anyang.go.kr/health/contents.do?key=1343",
    ),
    (  # 예천군 — 출산축하금 별도 페이지를 부출처로 병기 (safeUrl은 첫 URL만 링크)
        "https://www.ycg.kr/open.content/health/health.business.info/support/childbirth.support/maternity.subsidy.support/",
        "https://www.ycg.kr/open.content/health/health.business.info/support/childbirth.support/maternity.subsidy.support/ ; https://www.ycg.kr/open.content/health/health.business.info/support/childbirth.support/birth.celebrate.subsidy/",
    ),
]


def fix_links():
    p = WEB / "benefit_local.json"
    text = io.open(p, encoding="utf-8").read()
    n = 0
    for old, new in URL_FIXES:
        if old in text:
            text = text.replace(old, new)
            n += 1
        else:
            print(f"! 미발견(이미 교체됐거나 표기 상이): {old[:60]}...")
    json.loads(text)  # 유효성 검사
    io.open(p, "w", encoding="utf-8").write(text)
    print(f"benefit_local.json: URL 교체 {n}/{len(URL_FIXES)}건")


# ── 2) 해외사업 지분 정정 (알리오 공시 확증분) ────────────────────────
ALIO = {
    "서부발전": "https://www.alio.go.kr/item/itemReportTerm.do?apbaId=C0082&reportFormRootNo=31901",
    "남동발전": "https://alio.go.kr/item/itemReportTerm.do?apbaId=C0042&reportFormRootNo=31901",
}

# (company, name) → 부분 갱신 dict. name 변경은 "_rename" 키 사용.
OVERSEAS_FIXES = {
    ("서부발전", "사우디 라빅 (Rabigh IPP) 중유화력"): {
        "stake": "O&M법인(Rabigh O&M Co.) 지분 40% 보유 — 알리오 '25년말 공시. 발전지분 40%는 KEPCO 그룹",
    },
    ("서부발전", "인니 숨셀5 (Sumsel-5) 석탄화력 O&M"): {
        "stake": "0% (O&M SPC 지분 95% → 2024.5 청산완료, 알리오 공시. 발전 지분 아님)",
    },
    ("서부발전", "호주 배너튼 (Bannerton) 태양광"): {
        "stake": "실효지분 약 6% — 알리오 공시상 지주법인(KIAMCO KOWEPO Bannerton Hold Co) 지분 12.37%·취득 41억원",
    },
    ("서부발전", "UAE 아즈반 (Ajban) 태양광"): {
        "stake": "실효지분 20% (주주: Masdar, EDF-R, 서부발전) — 알리오 공시상 EDF-R 합작 중간지주(EDFR KOWEPO AJBAN PV HOLDING) 지분 50%",
    },
    ("남동발전", "네팔 UT-1 (Upper Trishuli-1) 수력"): {
        "stake": "66.1% (알리오 '25년말 공시, NWEDC 취득가액 1,103억원. 종전 안내 50%는 초기 지분 구성 — IFC·DL·계룡건설 등과 합작)",
    },
    ("남동발전", "파키스탄 Kalam-Asrit 수력"): {
        "stake": "SPC(KOAK Power) 지분 100% — 알리오 '25년말 공시, 취득가액 209.5억원",
    },
    ("남동발전", "파키스탄 Asrit-Kedam 수력"): {
        "stake": "SPC(KA Power) 지분 100% — 알리오 '25년말 공시, 취득가액 38억원 (SPC-사업 대응은 설립시기 기반 추정)",
    },
    ("남동발전", "불가리아 즐리타리차(Zlatna Livada) 태양광"): {
        "_rename": "불가리아 즐라타리차(Zlataritsa) 태양광",
        "stake": "50% (알리오 확인 — 사업법인 RES Technology AD 지분 50%·취득 119억원. SDN 보유분을 KOEN이 인수)",
    },
    ("남동발전", "불가리아 사모보덴(Samovodene) 태양광"): {
        "stake": "50% (알리오 확인 — 사업법인 ASM-BG Investicii AD 지분 50%·취득 98억원). 즐라타리차와 합산 총 41.6MW",
    },
    ("남동발전", "인니 바얀 광산 (PT Bayan Resources Tbk)"): {
        "stake": "4% (한전 20% → 2016.12 발전5사에 각 4% 현물출자 이관, 합계 20%. ALIO '25년말 4.00%·취득원가 805.6억원)",
    },
}


def fix_overseas():
    p = WEB / "overseas.json"
    data = json.load(io.open(p, encoding="utf-8"))
    applied = 0
    for it in data["items"]:
        key = (it["company"], it["name"])
        fix = OVERSEAS_FIXES.get(key)
        if not fix:
            continue
        for k, v in fix.items():
            if k == "_rename":
                it["name"] = v
            else:
                it[k] = v
        # 알리오 공시를 출처에 병기 (safeUrl은 첫 URL만 링크하므로 기존 출처 우선 유지)
        alio_url = ALIO[it["company"]]
        src = it.get("source", "")
        if "alio.go.kr" not in src:
            it["source"] = (src + " ; " if src else "") + alio_url + " (알리오 타법인 출자현황, '25년말 기준)"
        applied += 1
    data["updatedAt"] = "2026-08-11"
    note = data.get("note", "")
    tag = "지분율은 알리오(ALIO) 타법인 출자현황 공시('25년말 기준, '26.4 제출)와 대조·정정함."
    if tag not in note:
        data["note"] = (note.rstrip(". ") + ". " if note else "") + tag
    json.dump(data, io.open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"overseas.json: 정정 {applied}/{len(OVERSEAS_FIXES)}건, updatedAt=2026-08-11")
    if applied != len(OVERSEAS_FIXES):
        missing = [k for k in OVERSEAS_FIXES if k not in {(i['company'], i['name']) for i in data['items']}]
        print("! 미매칭:", missing)


if __name__ == "__main__":
    fix_links()
    fix_overseas()
