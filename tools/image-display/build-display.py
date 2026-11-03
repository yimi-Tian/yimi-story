#!/usr/bin/env python3
"""由原圖產生 WebP 顯示版與 data/image-display-map-data.js（只新增檔案，不覆蓋、不刪除原圖）。
用法（在儲存庫根目錄）：python3 tools/image-display/build-display.py
參數：WebP q84；latest-river 用 q86；EXIF 轉正；LANCZOS 縮至長邊 T。"""
import os, json, sys
from PIL import Image, ImageOps
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
# (原圖, 長邊px, 品質, 顯示版相對路徑, 其他位元組相同的原圖路徑)
J = [
 ('public/images/activities/113-002/01.JPG', 1600, 84, 'activities/113-002/01', []),
 ('public/images/activities/114-016/01.JPG', 1600, 84, 'activities/114-016/01', []),
 ('public/images/activities/114-022/05.jpg', 1600, 84, 'activities/114-022/05', []),
 ('public/images/activities/114-026/01.jpg', 1600, 84, 'activities/114-026/01', []),
 ('assets/images/platform-home/latest-river.jpg', 1200, 86, 'platform-home/latest-river', ['public/images/activities/114-017/03.JPG']),
 ('assets/images/platform-home/banner-river.jpg', 2000, 84, 'platform-home/banner-river', ['public/images/activities/114-017/01.JPG']),
 ('public/images/activities/114-033/01.JPG', 1600, 84, 'activities/114-033/01', []),
 ('assets/images/platform-home/banner-community.jpg', 2000, 84, 'platform-home/banner-community', ['public/images/activities/114-018/01.jpg']),
 ('assets/images/platform-home/latest-field.jpg', 1200, 84, 'platform-home/latest-field', ['public/images/activities/114-018/03.jpg']),
 ('public/images/activities/112-010/cover.jpg', 1200, 84, 'activities/112-010/cover', []),
 ('public/images/activities/112-011/cover.jpg', 1200, 84, 'activities/112-011/cover', []),
 ('public/images/activities/112-006/03.jpg', 1200, 84, 'activities/112-006/03', []),
 ('public/images/activities/114-016/03.JPG', 1200, 84, 'activities/114-016/03', []),
]
M = {}
for src, T, q, rel, dups in J:
    im = ImageOps.exif_transpose(Image.open(os.path.join(ROOT, src))).convert('RGB')
    im.thumbnail((T, T), Image.LANCZOS)
    out = f'public/images/display/{rel}-{max(im.size)}.webp'
    os.makedirs(os.path.dirname(os.path.join(ROOT, out)), exist_ok=True)
    im.save(os.path.join(ROOT, out), 'WEBP', quality=q, method=6)
    for o in [src] + dups:
        M[o.lower()] = {'d': out, 'o': o}
# 既有大小寫錯誤：資料引用 03.jpg，實際檔案是 03.JPG（key 一律小寫比對，已涵蓋）
body = json.dumps(M, ensure_ascii=False, indent=1, sort_keys=True)
open(os.path.join(ROOT, 'data/image-display-map-data.js'), 'w', encoding='utf-8').write(
 '/* 圖片顯示版對照表（由 tools/image-display/build-display.py 產生；非發布白名單檔）。\n   key＝原圖路徑小寫；d＝WebP 顯示版；o＝原圖實際路徑（顯示版載入失敗時的後備）。 */\nwindow.YIMI_IMAGE_DISPLAY_MAP = ' + body + ';\n')
print(len(M), 'map entries')
