#!/usr/bin/env python3
"""data/events.json の書式チェック。
使い方:  python3 tools/check_data.py
日付の形式・種類・出典URL・重複を確認し、問題があれば一覧で表示します。
"""
import json, re, sys, pathlib
from collections import Counter

path = pathlib.Path(__file__).resolve().parent.parent / "data" / "events.json"
d = json.loads(path.read_text(encoding="utf-8"))
types = set(d["meta"]["types"])
errs = []
for i, e in enumerate(d["events"]):
    where = f'#{i} {e.get("date")} {e.get("title", "")[:30]}'
    if not re.fullmatch(r"\d{4}(-\d{2}(-\d{2})?)?", e.get("date", "")):
        errs.append(f"{where}: 日付は YYYY-MM-DD / YYYY-MM / YYYY の形式にしてください")
    if e.get("type") not in types:
        errs.append(f'{where}: type "{e.get("type")}" は meta.types にありません')
    if not e.get("title"):
        errs.append(f"{where}: title が空です")
    if not e.get("src"):
        errs.append(f"{where}: 出典(src)がありません")
    for s in e.get("src", []):
        if not str(s.get("url", "")).startswith(("https://", "http://")):
            errs.append(f"{where}: 出典URLが不正です: {s}")
    if "setlist" in e and not (isinstance(e["setlist"], list) and all(isinstance(x, str) for x in e["setlist"])):
        errs.append(f"{where}: setlist は文字列の配列にしてください")
dup = [k for k, n in Counter((e["date"], e["title"], e.get("note", "")) for e in d["events"]).items() if n > 1]
errs += [f"重複: {k}" for k in dup]

if errs:
    print("\n".join(errs)); sys.exit(1)
print(f'OK: {len(d["events"])}件')
