#!/usr/bin/env python3
"""公式サイトの LIVE/EVENT 一覧から書き写した行（「日付|カテゴリ|タイトル|URL」）のうち、
data/raw/official_live_event.txt にまだ無いURLの行だけを先頭に足す。
使い方: python3 tools/prepend_official.py 書き写した行のファイル.txt
"""
import sys, pathlib
RAW = pathlib.Path(__file__).resolve().parent.parent / "data" / "raw" / "official_live_event.txt"
old = RAW.read_text(encoding="utf-8")
have = {l.rsplit("|", 1)[-1].strip() for l in old.splitlines() if "|" in l}
new = [l.strip() for l in open(sys.argv[1], encoding="utf-8") if l.count("|") >= 3 and l.rsplit("|", 1)[-1].strip() not in have]
if new:
    RAW.write_text("\n".join(new) + "\n" + old, encoding="utf-8")
print("new lines", len(new))
for l in new:
    print(" ", l)
