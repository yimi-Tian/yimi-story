#!/usr/bin/env python3
"""check-site.py 強化版（v2）：除了必要／應排除檢查，另外**逐一驗證全部 13 張顯示版 WebP**。
用法：python3 check-site-v2.py <_site 目錄> [--expect-images]   （--expect-images：PR1 已合併）
只讀取，不修改任何檔案。結束碼 0＝全部通過。
13 張 WebP 檢查項：檔案存在、是真正的 WebP（RIFF…WEBP 檔頭）、大小>0 且小於對應原圖、對照表有登記、對照表指向的顯示版與原圖後備都存在。"""
import os, re, sys, json
site = sys.argv[1]; imgs = '--expect-images' in sys.argv
WEBP13 = {  # 原圖 → 顯示版
 'public/images/activities/113-002/01.JPG': 'public/images/display/activities/113-002/01-1600.webp',
 'public/images/activities/114-016/01.JPG': 'public/images/display/activities/114-016/01-1600.webp',
 'public/images/activities/114-022/05.jpg': 'public/images/display/activities/114-022/05-1600.webp',
 'public/images/activities/114-026/01.jpg': 'public/images/display/activities/114-026/01-1600.webp',
 'assets/images/platform-home/latest-river.jpg': 'public/images/display/platform-home/latest-river-1200.webp',
 'assets/images/platform-home/banner-river.jpg': 'public/images/display/platform-home/banner-river-2000.webp',
 'public/images/activities/114-033/01.JPG': 'public/images/display/activities/114-033/01-1600.webp',
 'assets/images/platform-home/banner-community.jpg': 'public/images/display/platform-home/banner-community-2000.webp',
 'assets/images/platform-home/latest-field.jpg': 'public/images/display/platform-home/latest-field-1200.webp',
 'public/images/activities/112-010/cover.jpg': 'public/images/display/activities/112-010/cover-1200.webp',
 'public/images/activities/112-011/cover.jpg': 'public/images/display/activities/112-011/cover-1200.webp',
 'public/images/activities/112-006/03.jpg': 'public/images/display/activities/112-006/03-1200.webp',
 'public/images/activities/114-016/03.JPG': 'public/images/display/activities/114-016/03-1200.webp',
}
DUPS = {'public/images/activities/114-017/01.JPG': 'public/images/display/platform-home/banner-river-2000.webp',
        'public/images/activities/114-017/03.JPG': 'public/images/display/platform-home/latest-river-1200.webp',
        'public/images/activities/114-018/01.jpg': 'public/images/display/platform-home/banner-community-2000.webp',
        'public/images/activities/114-018/03.jpg': 'public/images/display/platform-home/latest-field-1200.webp'}
P = lambda p: os.path.join(site, p)
bad = 0
def chk(ok, label):
    global bad
    bad += (not ok); print(('OK   ' if ok else 'FAIL ') + label)
must = ['index.html','platform.html','script.js','styles.css','local-exploration.js','local-exploration.css','local-exploration-data.js',
        'js/public-ux.js','js/platform-home.js','css/platform-home.css','css/platform-shared.css',
        'activities.csv','activities-data.js','data/class-results.json','data/class-results-data.js','data/platform-home.json','data/platform-home-data.js',
        'data/themes-data.js','data/showcase-data.js','data/walking-records-data.js','data/digital-walks-data.js','data/clubs-data.js','public/images/placeholder.svg']
for p in must: chk(os.path.isfile(P(p)), '必要檔 ' + p)
for o in WEBP13: chk(os.path.isfile(P(o)), '原圖仍在 ' + o)
gone = ['admin','supabase','tests','tools','schemas','src','config','README.md','_config.yml','.github','.env.example',
        'activities.backup-20260617-113529.csv','activities.backup-20260617-113706.csv','activities-data.backup-20260617-113529.js','activities-data.backup-20260617-113706.js']
for p in gone: chk(not os.path.exists(P(p)), '不應存在 ' + p)
extra = [os.path.join(d, f) for d, _, fs in os.walk(site) for f in fs if f.endswith(('.ts','.mjs','.sql','.toml'))]
chk(not extra, f'發布樹內 .ts/.mjs/.sql/.toml 檔 {len(extra)} 個 {extra[:3]}')
if imgs:
    mp = P('data/image-display-map-data.js'); chk(os.path.isfile(mp), '對照表 data/image-display-map-data.js')
    M = {}
    if os.path.isfile(mp):
        t = open(mp, encoding='utf-8').read(); m = re.search(r'window\.YIMI_IMAGE_DISPLAY_MAP\s*=\s*(\{.*\})\s*;', t, re.S)
        try: M = json.loads(m.group(1))
        except Exception as e: chk(False, f'對照表可解析為 JSON（{e}）')
    chk(len(M) == 17, f'對照表筆數 = 17（13 張＋4 複本），實際 {len(M)}')
    for o, d in {**WEBP13, **DUPS}.items():
        e = M.get(o.lower()); chk(bool(e) and e.get('d') == d, '對照表登記 ' + o + ' → ' + d)
        if e: chk(e.get('o') == o and os.path.isfile(P(e['o'])), '  後備原圖存在（精確大小寫） ' + e.get('o', '?'))
    for o, d in WEBP13.items():
        f = P(d); ok = os.path.isfile(f)
        chk(ok, 'WebP 存在 ' + d)
        if ok:
            with open(f, 'rb') as fh: h = fh.read(12)
            chk(h[:4] == b'RIFF' and h[8:12] == b'WEBP', '  真正的 WebP 檔頭')
            sz = os.path.getsize(f); osz = os.path.getsize(P(o)) if os.path.isfile(P(o)) else None
            chk(sz > 0 and (osz is None or sz < osz), f'  大小 {sz//1024} KB' + (f' < 原圖 {osz//1024} KB' if osz else ''))
    chk(len([f for d,_,fs in os.walk(P('public/images/display')) for f in fs if f.endswith('.webp')]) == 13, 'public/images/display 內恰好 13 個 .webp')
n = sum(len(fs) for _, _, fs in os.walk(site)); print('_site 檔案總數', n)
print('結果：', '全部通過' if not bad else f'有 {bad} 項不符'); sys.exit(1 if bad else 0)
