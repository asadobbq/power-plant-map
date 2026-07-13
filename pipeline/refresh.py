# -*- coding: utf-8 -*-
"""월간 기계적 갱신: EPSIS 원천 재다운로드 후 plants.json 재생성.

사용법: py -X utf8 refresh.py   (또는 python refresh.py)
- 발전기 세부내역: 최신 연도부터 시도해 데이터가 있는 연도를 저장
- 발전기별 발전량: 최신 연도부터 시도 (없으면 기존 파일 유지)
- 성공 시 build.py 실행
"""
import datetime
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent
RAW = HERE / "raw"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "Content-Type": "application/x-www-form-urlencoded"}


def post(url, referer, data):
    req = urllib.request.Request(url, data=urllib.parse.urlencode(data).encode(),
                                 headers={**UA, "Referer": referer})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read().decode("utf-8", errors="replace")


def refresh_detail(year):
    txt = post("https://epsis.kpx.or.kr/epsisnew/selectEkfaFclDtlGrid.do",
               "https://epsis.kpx.or.kr/epsisnew/selectEkfaFclDtlChart.do?menuId=020600",
               {"srchDate": str(year), "selGenGubun": "", "srchNm": "", "srchYn": "Y"})
    if txt.count("gridData.push") < 100:
        return False
    (RAW / "epsis_detail_2024.txt").write_text(txt, encoding="utf-8")  # build.py가 읽는 고정 파일명
    print(f"세부내역 {year}년: {txt.count('gridData.push')}건 갱신")
    return True


def refresh_gen(year):
    txt = post("https://epsis.kpx.or.kr/epsisnew/selectEkgeGepGbpGridAjax.ajax",
               "https://epsis.kpx.or.kr/epsisnew/selectEkgeGepGbpGrid.do?menuId=060105",
               {"beginDate": str(year), "endDate": str(year)})
    if txt.count("gridData.push") < 100:
        return False
    (RAW / f"epsis_gen_{year}.txt").write_text(txt, encoding="utf-8")
    print(f"발전량 {year}년: {txt.count('gridData.push')}건 갱신")
    return True


def main():
    now = datetime.date.today().year
    for y in (now, now - 1, now - 2):
        if refresh_detail(y):
            break
    else:
        print("경고: 세부내역 갱신 실패 — 기존 파일로 빌드")
    for y in (now - 1, now - 2):  # 발전량은 전년 통계 (매년 7월경 갱신)
        if refresh_gen(y):
            break
    r = subprocess.run([sys.executable, "-X", "utf8", str(HERE / "build.py")],
                       capture_output=True, text=True, encoding="utf-8")
    print(r.stdout)
    if r.returncode != 0:
        print("빌드 실패:", r.stderr[:2000])
        sys.exit(1)
    print("갱신 완료:", datetime.date.today().isoformat())


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
