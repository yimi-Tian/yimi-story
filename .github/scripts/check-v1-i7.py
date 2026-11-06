#!/usr/bin/env python3
"""V1-I7：檢查 Jekyll 建置輸出（_site）。只讀取，不修改任何檔案。結束碼 0＝全部通過。
用法：python3 check-v1-i7.py <_site> <repo根目錄>
1. v1/ 內恰好 16 個檔案，且 SHA-256 與 V1-I6 authoritative-v1 清單完全一致（含 hero-r2L.png/.webp）。
2. _site 內每個檔案都必須是 git 追蹤的檔案，且位元組與 git 中完全相同（建置沒有產生或改寫任何檔案）。
3. 不應發布的內容（測試、證據、說明、備份、後台、腳本、.github 等）一個都不能出現在 _site。
4. main 既有的每個「應發布」檔案仍在 _site（以 git ls-files 扣掉排除清單後逐一確認）。"""
import os, sys, hashlib, subprocess, re
site, repo = sys.argv[1], sys.argv[2]
bad = 0
def chk(ok, label):
    global bad
    bad += (not ok); print(('OK   ' if ok else 'FAIL ') + label)
def sha(p):
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()
# 1. v1
exp = {}
for line in open(os.path.join(repo, '.github/scripts/v1-original-SHA256.txt'), encoding='utf-8'):
    line = line.strip()
    if line:
        h, f = re.split(r'\s+\*?', line, maxsplit=1); exp[f] = h
chk(len(exp) == 16, f'基準清單 16 筆（實際 {len(exp)}）')
got = sorted(os.path.relpath(os.path.join(d, f), site).replace(os.sep, '/') for d, _, fs in os.walk(os.path.join(site, 'v1')) for f in fs)
chk(got == sorted(exp), f'_site/v1 檔案集合與基準完全相同（{len(got)} 個）')
for f, h in sorted(exp.items()):
    p = os.path.join(site, f)
    chk(os.path.isfile(p) and sha(p) == h, 'v1 SHA-256 ' + f)
# 2. 每個 _site 檔案都是 git 追蹤且位元組相同
tracked = set(subprocess.check_output(['git', '-C', repo, 'ls-files', '-z']).decode('utf-8').split('\0')) - {''}
sitefiles = sorted(os.path.relpath(os.path.join(d, f), site).replace(os.sep, '/') for d, _, fs in os.walk(site) for f in fs)
untracked = [f for f in sitefiles if f not in tracked]
chk(not untracked, f'_site 內沒有 git 未追蹤（建置產生）的檔案：{untracked[:5]}')
diff = [f for f in sitefiles if f in tracked and sha(os.path.join(site, f)) != hashlib.sha256(subprocess.check_output(['git', '-C', repo, 'show', ':' + f])).hexdigest()]
chk(not diff, f'_site 內所有檔案位元組與 git 完全相同（不符 {len(diff)}）：{diff[:5]}')
# 3. 禁止出現
FORBID = re.compile(r'(^|/)(admin|supabase|tests?|tools|schemas|src|config|evidence|test-scripts|\.github|\.git)(/|$)|^(README[^/]*|_config\.yml|\.gitignore|\.env[^/]*)$|^v1/(.*/)?(README[^/]*|SHA256SUMS|ADDED_FILES\.txt)$|(^|/)(SHA256SUMS|ADDED_FILES\.txt)$|\.(py|ts|mjs|sql|toml|tar|log)$|backup-\d|\.backup\.')
leak = [f for f in sitefiles if FORBID.search(f)]
chk(not leak, f'_site 內沒有測試／證據／說明／備份／後台／腳本檔：{leak[:8]}')
chk(not any(f.startswith('v1/') and ('evidence' in f or 'README' in f or 'SHA256' in f) for f in sitefiles), 'v1/ 內沒有 evidence／README／SHA256SUMS')
# 4. 應發布檔案都在
EXC = re.compile(r'^(admin|supabase|tests|tools|schemas|src|config|\.github)/|^(README\.md|_config\.yml|\.gitignore|\.env\.example)$|^activities(-data)?\.backup-\d')
should = [f for f in tracked if not EXC.search(f) and not any(s.startswith(('.', '_')) for s in f.split('/'))]
missing = [f for f in should if f not in set(sitefiles)]
chk(not missing, f'git 追蹤且應發布的 {len(should)} 個檔案全部在 _site（缺 {len(missing)}）：{missing[:5]}')
print('_site 檔案總數', len(sitefiles), '；其中 v1/ ', len(got))
print('結果：', '全部通過' if not bad else f'有 {bad} 項不符'); sys.exit(1 if bad else 0)
