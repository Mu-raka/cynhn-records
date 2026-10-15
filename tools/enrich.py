#!/usr/bin/env python3
"""events.json の各出来事に、一覧表示と絞り込みに使う項目を付ける。

  id      … 共有リンク（#年/ID）用の番号。日付・タイトル・補足から決まるので、内容を変えない限り変わらない
  imp     … 重要度 3=★★★（hl:true） / 2=★★（ワンマン・ツアー・CDリリース・主催公演・メンバーの動き） / 1=それ以外
  tags    … 種別タグ（ワンマン・ライブ・フェス・ツアー・生誕・リリース・特典会・ファンイベント・配信・展示・メディア・メンバー・その他）
  members … タイトル・補足・セットリストに名前が出てくるメンバー

手で imp や tags を書いた出来事は上書きしません（"imp_manual": true / "tags_manual": true を付けておく）。
データを取り込んだり編集したりしたあとに実行します:  python3 tools/enrich.py
すでに id・members が付いている出来事はそのまま（共有リンクを変えないため）。新しい出来事には id と added（追加日）を付けます。
"""
import json, re, zlib, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
EVENTS = ROOT / "data" / "events.json"
import sys
ALL = "--all" in sys.argv

ONEMAN = re.compile(r"ワンマン|ONE ?MAN|Anniversary (LIVE|EVENT)|Link to Blue|Pray for Blue|Ordinary Blue|Re Blue|Blue Spring|Our Blue|"
                    r"Blue Cresc|Thank you Blue|Blue Light|BLUE RAINBOW|アガパンサス|Octablue|November First|Blue Symphony|"
                    r"Acoustic live|Predawn Blue|フリーライブ|記念ライブ〜はりぼて|がんばりまCYNHN|Blue Encount", re.I)
FES = re.compile(r"フェス|FES|FESTIVAL|EXPO|TIF|横丁|夏まつり|サーキット|祭り|まつり|Mash UP|NATSUZOME|SPARK|LEADING|IDORISE|ギュウ農|HERO GATE", re.I)
BIRTH = re.compile(r"生誕|バースデー|Birthday|周年記念イベント|周年イベント|\d+th Anniversary(?! (LIVE|EVENT))", re.I)
TOKUTEN = re.compile(r"リリースイベント|リリイベ|発売記念|サイン会|チェキ|特典会|お披露目会|試聴会|ガラポン|Release LIVE|お渡し|撮影会|インストア")
FAN = re.compile(r"ファンミーティング|ファン感謝祭|オフ会|新年会|トーク|ぽやら|Tea Party|ラジオ|チャットルーム|来店|パーティ|定期イベント|"
                 r"旅|鹿児島|労働施設|店長|しゃべり場|SHAKE UP|上映会|みるハコ|夏の思い出配信|ハロウィン|朗読劇|文化祭|ロリィタ部|X PARK")
STREAM = re.compile(r"配信|Streaming|オンライン|\.yell|インターネット|Zaiko|TikTok", re.I)
EXHIBIT = re.compile(r"展(?!開)|パネル展|写真展")
HOST = re.compile(r"CYNHN ?主催|主催対バン|Blue Session|CYNHN Blue Session", re.I)
CD = re.compile(r"シングル|アルバム|EP|DVD|Blu-ray")

def tags_for(e):
    t = e["type"]
    text = e["title"] + " " + e.get("note", "")
    tags = []
    if t == "member": tags.append("メンバー")
    if t == "release": tags.append("リリース")
    if t == "media": tags.append("メディア")
    if t == "tour": tags.append("ツアー")
    if t in ("live", "tour", "event") and ONEMAN.search(text) and not TOKUTEN.search(text): tags.append("ワンマン")
    if BIRTH.search(text) and t != "release": tags.append("生誕")
    if t in ("live", "event") and FES.search(text) and "ワンマン" not in tags: tags.append("フェス")
    if TOKUTEN.search(text): tags.append("特典会")
    if t in ("event", "live", "other") and FAN.search(text) and "特典会" not in tags: tags.append("ファンイベント")
    if STREAM.search(text): tags.append("配信")
    if EXHIBIT.search(text) and t != "release": tags.append("展示")
    if t == "live" and not set(tags) & {"ワンマン", "フェス", "生誕", "ファンイベント", "特典会"}: tags.insert(0, "ライブ")
    if not tags: tags.append({"event": "ファンイベント", "other": "その他", "live": "ライブ"}.get(t, "その他"))
    seen, out = set(), []
    for x in tags:
        if x not in seen:
            seen.add(x); out.append(x)
    return out

def imp_for(e, tags):
    if e.get("hl"): return 3
    text = e["title"] + " " + e.get("note", "")
    if e["type"] in ("member", "tour"): return 2
    if e["type"] == "release" and CD.search(text): return 2
    if "ワンマン" in tags or HOST.search(text): return 2
    return 1

def main():
    data = json.loads(EVENTS.read_text(encoding="utf-8"))
    names = [m["name"] for m in data["meta"].get("members", [])]
    # すでに付いている id（共有リンク）と members は変えない。新しく足した出来事だけに付ける
    used = {e["id"] for e in data["events"] if "id" in e}
    for e in sorted(data["events"], key=lambda x: (x["date"], x["title"], x.get("note", ""))):
        if e["type"] == "tour" and TOKUTEN.search(e["title"]):
            e["type"] = "event"   # ツアー名を含むリリースイベントはイベント扱い
        # tags・imp も、すでに付いていれば変えない（全部付け直したいときは --all）
        if not e.get("tags_manual") and (ALL or "tags" not in e):
            e["tags"] = tags_for(e)
        if not e.get("imp_manual") and (ALL or "imp" not in e):
            e["imp"] = imp_for(e, e["tags"])
        hay = e["title"] + " " + e.get("note", "") + " " + " ".join(e.get("setlist", []))
        if "members" not in e:
            e["members"] = [n for n in names if n in hay]
        if "id" in e:
            continue
        n = zlib.crc32((e["date"] + "|" + e["title"] + "|" + e.get("note", "")).encode()) % 900000 + 100000
        while n in used:
            n += 1
        used.add(n)
        e["id"] = n
        e.setdefault("added", __import__("datetime").date.today().isoformat())
    data["meta"]["tags"] = ["ワンマン", "ライブ", "フェス", "ツアー", "生誕", "リリース", "特典会", "ファンイベント",
                            "配信", "展示", "メディア", "メンバー", "その他"]
    EVENTS.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    from collections import Counter
    c = Counter(t for e in data["events"] for t in e["tags"])
    print("tags:", dict(c.most_common()))
    print("imp:", dict(Counter(e["imp"] for e in data["events"])))
    print("members:", dict(Counter(m for e in data["events"] for m in e["members"])))

if __name__ == "__main__":
    main()
