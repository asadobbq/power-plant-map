"""파이프라인 공통 유틸 — 설정 로드, 경로 해석, 로그."""
import json
import sys
from datetime import datetime
from pathlib import Path

import yaml

BASE = Path(__file__).resolve().parent


def utf8_stdout() -> None:
    """Windows 콘솔(cp949)에서 한글 출력 깨짐 방지."""
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except AttributeError:
            pass


def load_config() -> dict:
    with open(BASE / "pipeline_config.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)


def path_of(cfg: dict, key: str) -> Path:
    """config paths.* 를 이 디렉토리 기준 절대경로로."""
    return (BASE / cfg["paths"][key]).resolve()


def read_json(p: Path, default):
    if not p.exists():
        return default
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def write_json(p: Path, data) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def append_log(cfg: dict, message: str) -> None:
    log = path_of(cfg, "change_log")
    log.parent.mkdir(parents=True, exist_ok=True)
    with open(log, "a", encoding="utf-8") as f:
        f.write(f"{datetime.now().isoformat(timespec='seconds')} {message}\n")
