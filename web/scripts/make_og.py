# -*- coding: utf-8 -*-
"""OG(Open Graph) 공유 카드 이미지 생성 → web/public/og/*.png

카카오톡·네이버·페이스북은 og:image가 없으면 썸네일 없는 텍스트 카드로 렌더링한다.
이 서비스는 유입의 70~90%가 direct(카톡·문자 URL 공유 추정)이므로 공유 카드의
썸네일 유무가 유입에 직접 영향을 준다.

- 1200x630 PNG (OG 권장 규격)
- 페이지 유형별 4종: 기본/발전소/지역혜택/일자리
- 변동 수치(발전소 수 등)는 넣지 않는다. 카카오가 og:image를 장기 캐싱해
  수치가 바뀌어도 정정이 어렵고, 틀린 수치가 공유 카드에 남으면 신뢰성 문제가 된다.
- 지도 타일을 쓰지 않으므로 타일 출처 표기 의무 없음(순수 타이포그래피).

사용법: python web/scripts/make_og.py
"""
import io
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "public" / "og"

W, H = 1200, 630
BG = (15, 23, 42)          # slate-900
ACCENT = (96, 165, 250)    # blue-400
FG = (241, 245, 249)       # slate-100
DIM = (148, 163, 184)      # slate-400

FONT_DIR = Path("C:/Windows/Fonts")
BOLD = FONT_DIR / "NanumGothicBold.ttf"
REG = FONT_DIR / "NanumGothic.ttf"

CARDS = [
    ("og-default.png", "우리동네 발전소", "전국 발전소 지도 · 주변지역 혜택 · 공공기관 채용", "⚡"),
    ("og-plant.png", "발전소 상세 정보", "설비용량 · 호기별 폐지 일정 · 대체 설비 · 주변 혜택", "⚡"),
    ("og-region.png", "우리 동네 발전소 혜택", "발주법 주변지역 판정 · 전기요금 보조 · 전입 지원 시책", "🏡"),
    ("og-jobs.png", "발전 공공기관 채용·연봉", "진행 중 공고 · 평균보수 · 신입 초임 · 지역인재 채용", "💼"),
]


def font(path: Path, size: int):
    if not path.exists():
        raise SystemExit(f"폰트 없음: {path} — 나눔고딕 설치 필요")
    return ImageFont.truetype(str(path), size)


def draw_card(title: str, subtitle: str) -> Image.Image:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    # 상단 액센트 바
    d.rectangle([0, 0, W, 10], fill=ACCENT)

    # 좌측 세로 액센트 + 배경 장식(발전소 실루엣 대신 단순 도형 — 저작권 무관)
    for i, (x, h) in enumerate([(880, 150), (960, 230), (1040, 110), (1120, 190)]):
        d.rectangle([x, H - 120 - h, x + 44, H - 120], fill=(30, 41, 59))
        d.rectangle([x, H - 120 - h, x + 44, H - 120 - h + 8], fill=ACCENT)

    f_title = font(BOLD, 76)
    f_sub = font(REG, 32)
    f_url = font(BOLD, 30)
    f_tag = font(REG, 24)

    d.text((80, 170), title, font=f_title, fill=FG)
    d.text((80, 286), subtitle, font=f_sub, fill=DIM)

    # 하단 URL 바
    d.rectangle([80, 430, 80 + 6, 430 + 46], fill=ACCENT)
    d.text((104, 432), "kopower.net", font=f_url, fill=ACCENT)
    d.text((104, 486), "공공데이터 기반 · 출처 100% 명시 · 비영리 공개 서비스",
           font=f_tag, fill=DIM)
    return img


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, title, sub, _icon in CARDS:
        img = draw_card(title, sub)
        p = OUT / name
        img.save(p, "PNG", optimize=True)
        print(f"  {name}  {p.stat().st_size // 1024}KB")
    print(f"OG 이미지 {len(CARDS)}종 생성 → {OUT}")


if __name__ == "__main__":
    main()
