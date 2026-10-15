#!/usr/bin/env python3
"""週1回のメンテナンスで tools/x_weekly.js が集めたツイートを、サイトのデータに足す。

使い方:
  python3 tools/merge_x_weekly.py fan  集めたファイル.txt   # data/x_top5.json（関連ツイート）に足す
  python3 tools/merge_x_weekly.py mem  集めたファイル.txt   # data/x_members.json（メンバーのツイート）に足す

ファイルは1行1日付「件数 日付 チェックサム id:いいね,...」。チェックサム（Σ(id+いいね) mod 1000000007）が
合わない行は取り込まない。同じIDは二重に入れず、いいね数は新しい値で上書き。日付ごとにいいね順で
関連ツイートは最大30件、メンバーのツイートは最大5件にそろえる。何度実行しても安全。
"""
import json, sys, datetime, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
M = 1000000007
kind, src = sys.argv[1], sys.argv[2]
path = ROOT / "data" / ("x_top5.json" if kind == "fan" else "x_members.json")
cap = 30 if kind == "fan" else 5
X = json.loads(path.read_text(encoding="utf-8"))
X.setdefault("dates", {})
bad, added, days = [], 0, 0
for l in open(src, encoding="utf-8"):
    l = l.strip()
    if not l:
        continue
    c, d, s, rest = l.split(" ", 3)
    it = [x.split(":") for x in rest.split(",")]
    if sum(int(a) + int(b) for a, b in it) % M != int(s) or len(it) != int(c):
        bad.append(d)
        continue
    cur = {t["id"]: t for t in X["dates"].get(d, [])}
    before = set(cur)
    for a, b in it:
        cur[a] = {"id": a, "likes": int(b)}
    lst = sorted(cur.values(), key=lambda t: -t["likes"])[:cap]
    new = {t["id"] for t in lst} - before
    if new or lst != X["dates"].get(d):
        X["dates"][d] = lst
        added += len(new)
        days += 1
X["dates"] = dict(sorted(X["dates"].items()))
X["updated"] = datetime.date.today().isoformat()
path.write_text(json.dumps(X, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print("bad", bad, "days changed", days, "tweets added", added)
