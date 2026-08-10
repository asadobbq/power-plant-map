"""[추출] 수집 문서 → 텍스트 변환.

- HWP  → hwp5txt(pyhwp) CLI
- HWPX → ZIP 내 section XML에서 텍스트 추출(표준 OWPML)
- PDF  → pdftotext(poppler) CLI, 없으면 pypdf 폴백
- HTML → 본문 텍스트(BeautifulSoup)
- 실패한 원문은 보류 큐(_hold_queue.json)에 기록하고 계속 진행

사용법: python extract.py
"""
import re
import shutil
import subprocess
import zipfile
from pathlib import Path

from bs4 import BeautifulSoup

from common import load_config, path_of, read_json, utf8_stdout, write_json


def hwp_to_text(p: Path) -> str:
    exe = shutil.which("hwp5txt")
    if not exe:
        raise RuntimeError("hwp5txt 미설치 (pip install pyhwp)")
    out = subprocess.run([exe, str(p)], capture_output=True, timeout=120)
    if out.returncode != 0:
        raise RuntimeError(f"hwp5txt 실패: {out.stderr.decode(errors='replace')[:200]}")
    return out.stdout.decode("utf-8", errors="replace")


def hwpx_to_text(p: Path) -> str:
    texts = []
    with zipfile.ZipFile(p) as z:
        for name in z.namelist():
            if re.match(r"Contents/section\d+\.xml$", name):
                xml = z.read(name).decode("utf-8", errors="replace")
                texts.append(re.sub(r"<[^>]+>", " ", xml))
    if not texts:
        raise RuntimeError("HWPX 섹션 없음")
    return re.sub(r"\s+", " ", "\n".join(texts))


def pdf_to_text(p: Path) -> str:
    exe = shutil.which("pdftotext")
    if exe:
        out = subprocess.run([exe, "-layout", str(p), "-"], capture_output=True, timeout=120)
        if out.returncode == 0:
            return out.stdout.decode("utf-8", errors="replace")
    try:
        from pypdf import PdfReader
    except ImportError as e:
        raise RuntimeError("pdftotext·pypdf 모두 없음") from e
    return "\n".join(page.extract_text() or "" for page in PdfReader(str(p)).pages)


def html_to_text(p: Path) -> str:
    soup = BeautifulSoup(p.read_text(encoding="utf-8", errors="replace"), "html.parser")
    for tag in soup(["script", "style", "nav", "header", "footer"]):
        tag.decompose()
    return re.sub(r"\n{3,}", "\n\n", soup.get_text("\n", strip=True))


def main() -> None:
    utf8_stdout()
    cfg = load_config()
    raw_dir = path_of(cfg, "raw_dir")
    text_dir = path_of(cfg, "text_dir")
    text_dir.mkdir(parents=True, exist_ok=True)
    hold_path = path_of(cfg, "hold_queue")
    hold = read_json(hold_path, [])
    index = read_json(raw_dir / "_index.json", {})

    ok = fail = skip = 0
    for key, meta in index.items():
        out_txt = text_dir / f"{key}.txt"
        if out_txt.exists():
            skip += 1
            continue

        parts = []
        # 첨부가 있으면 첨부 우선(공고 원문), 없으면 게시글 HTML 본문
        sources = meta.get("files") or [f"{key}.html"]
        errors = []
        for fname in sources:
            p = raw_dir / fname
            if not p.exists():
                errors.append(f"{fname}: 파일 없음")
                continue
            try:
                if fname.endswith(".hwp"):
                    parts.append(hwp_to_text(p))
                elif fname.endswith(".hwpx"):
                    parts.append(hwpx_to_text(p))
                elif fname.endswith(".pdf"):
                    parts.append(pdf_to_text(p))
                else:
                    parts.append(html_to_text(p))
            except Exception as e:
                errors.append(f"{fname}: {e}")

        if parts:
            out_txt.write_text("\n\n".join(parts), encoding="utf-8")
            write_json(text_dir / f"{key}.meta.json", meta)
            ok += 1
            print(f"+ {meta['sigungu']} {meta['title'][:40]}")
        else:
            fail += 1
            hold.append({"key": key, "meta": meta, "errors": errors})
            print(f"! 보류: {meta['title'][:40]} — {errors}")

    write_json(hold_path, hold)
    print(f"\n추출: 성공 {ok} · 보류 {fail} · 기존 {skip} → {text_dir}")


if __name__ == "__main__":
    main()
