# 邑米地方知識探索平台 V1.0

這是可部署到 GitHub Pages 的靜態網站，使用 HTML、CSS 與 JavaScript，不需要後端伺服器或資料庫。

## 網站根目錄

目前實際網站根目錄：

`C:\Users\USER\Documents\Codex\yimi-story-site\112-112-activities-csv-1-sdgs\outputs\site`

入口頁：

- 平台首頁：`platform.html`
- 成果故事館及各館 SPA：`index.html`
- 成果展示：`index.html#/showcase`

## 活動資料

- `activities.csv` 是 63 筆活動的正式維護來源，目前包含 112、113、114、115 年資料。
- `activities-data.js` 將同一份 CSV 內容包裝為 `window.ACTIVITIES_CSV`，讓網站直接開啟 HTML 或部署為靜態網站時都能載入。
- 更新活動資料時必須維持活動 ID 不重複，並同步產生 `activities-data.js`。不可只修改其中一份。
- 班級花絮與成果不得寫入活動 CSV，以免改變既有活動統計與成果故事館內容。

## 成果展示設定

- `data/showcase.json` 是成果展示分類、精選活動 ID、照片上限與取樣設定的正式來源。
- `data/showcase-data.js` 是由 JSON 產生的靜態備援，提供 `window.SHOWCASE_DATA`；不要直接手動修改。
- `script.js` 只讀取 `window.SHOWCASE_DATA`，資料不存在時才使用最低限度的安全預設值。

修改 `data/showcase.json` 後，在網站根目錄執行：

```powershell
node tools/sync-static-data.mjs
```

這會由正式 JSON 重新產生靜態備援檔，避免在程式與 JSON 之間維護兩份獨立設定。

## 班級花絮與成果資料

- `data/class-results.json` 是班級花絮與成果的正式資料來源；目前已上架第一筆經確認可公開的正式資料。
- `data/class-results-data.js` 是由 JSON 產生的靜態備援，提供 `window.CLASS_RESULTS_DATA`；不要直接手動修改。
- 前台只顯示 `publicationStatus` 完全等於 `approved` 的項目；`pending`、`private`、未填或其他值都不顯示。
- 班級群組照片、通訊軟體群組素材或含可辨識個人的影像，不可因已取得檔案就自動視為具有公開授權。
- 不應填寫或顯示未經同意的個別學員姓名。

班級花絮與成果支援欄位：

- `id`
- `title`
- `year`
- `term`
- `className`
- `courseCode`
- `instructor`
- `summary`
- `description`
- `districts`
- `venue`
- `resultType`
- `relatedActivityId`
- `sourceType`
- `coverImage`
- `coverImageAlt`
- `images`
- `imageAlts`
- `publicationStatus`：`approved`、`pending` 或 `private`
- `containsPortrait`
- `rightsNote`
- `credits`
- `tags`
- `sdgs`
- `featured`
- `displayOrder`
- `publishedDate`

新增班級花絮與成果的基本步驟：

1. 確認素材來源、公開範圍及必要授權，不以取得班級群組檔案代替公開同意。
2. 將確認可用的素材放入另行規劃的班級花絮與成果圖片資料夾，不覆蓋活動照片。
3. 在 `data/class-results.json` 新增資料；未完成確認時使用 `pending` 或 `private`。
4. 執行 `node tools/sync-static-data.mjs` 產生 `data/class-results-data.js`。
5. 檢查 `#/showcase/class-results`，確認只有 `approved` 資料顯示，且沒有未授權姓名或影像。

舊路由 `#/showcase/student-works` 保留相容，會顯示同一個班級花絮與成果分類。

## 活動照片

- 活動照片位於 `public/images/activities/活動ID/`。
- 目前資料夾內共有 371 張圖片，但這不代表 371 張都已作為前台成果卡片上架。
- 活動資料目前引用 356 個不同圖片路徑，引用檔案均存在。
- 成果展示每個活動最多使用 3 張，依序先為所有活動取第 1 張，再取第 2 張、最後取第 3 張，並在 120 張上限截取。
- 分散取樣可避免前段活動耗盡上限；精選成果則直接從完整活動資料查找，不受一般 120 張限制。

## 其他資料位置

- LOGO：`public/images/yimi-logo.png`
- Placeholder：`public/images/placeholder.svg`
- SDGs 圖標：`public/images/sdgs/1.png` 到 `public/images/sdgs/17.png`
- 地方知識主題：`data/themes.json` 與 `data/themes-data.js`
- 地方探索：`data/exploration-modules.json`、`local-exploration-data.js` 與 `local-exploration.js`
- 社團紀錄：`data/clubs.json`
- 平台首頁：`data/platform-home.json` 與 `data/platform-home-data.js`

## 後台 V1.0 階段 1：內容資料契約

本階段只建立「同一筆資料如何被正規化、驗證與穩定匯出」的基礎，尚未包含 Supabase、Auth、React 後台 UI、GitHub App 或 Draft PR 自動化。

### Canonical schema

- `schemas/class-result.schema.json` 與 `src/content-types/class-result.ts` 定義班級花絮與成果 canonical 資料。
- `schemas/activity.schema.json` 與 `src/content-types/activity.ts` 定義活動 canonical 資料。
- `schemas/publication.schema.json`、`src/content-types/publication.ts` 與 `src/content-types/media.ts` 定義核准發布資料及圖片參照。
- schema 採 `additionalProperties: false`，並明確限制 required、字數、格式、陣列數量與唯一性。

`internalNotes` 只供後台內部使用，任何正式 exporter 都不得輸出。`publicNotes` 才是可公開備註；班級 JSON 固定輸出此欄位，活動因既有 CSV 沒有獨立公開備註欄，V1 暫映射到既有「備註」欄。既有 `remarks` 或 CSV「備註」在 dry-run 匯入時一律先放進 `internalNotes`，不假設其可公開。

### 日期策略

- 新活動必須提供 `startDate`，格式為 `YYYY-MM-DD`；`endDate` 可省略，但不得早於開始日期。
- exporter 由 ISO 日期產生單日、跨日或跨年度 `dateLabel`。
- 既有 CSV 日期可能代表多次活動或不完整月份，dry-run 只保留原 `dateLabel`，將 `startDate`、`endDate` 設為 `null` 並提出 `legacyImport.dateUnparsed` warning，不自行猜測日期。
- 正式 `activities.csv` 仍維持原有 23 個中文欄位，不新增 ISO 日期欄。

### Deterministic exporter

`tools/export-approved-content.mjs` 會以固定欄位、排序、編碼與換行產生：

- `data/class-results.json`
- `data/class-results-data.js`
- `activities.csv`
- `activities-data.js`

必須提供 canonical approved input；預設只列出輸出雜湊，不寫檔。只有明確加入 `--write` 才會寫入指定 output root：

```powershell
node tools/export-approved-content.mjs --input path/to/approved-content.json
node tools/export-approved-content.mjs --input path/to/approved-content.json --output-root path/to/output --write
```

同一輸入重複執行不含時間戳、隨機值或不穩定排序。活動輸出使用 RFC 4180 相容 CSV，支援逗號、雙引號及欄位內換行；static fallback 由相同輸出直接產生。

### 外部圖片 URL 白名單

`config/content-settings.json` 的 `allowedExternalImageHosts` 是正式圖片 host 白名單，目前刻意保持空陣列；Supabase 專案確定後才能填入真實 host。正式外部圖片必須：

- 使用 HTTPS。
- host 位於白名單。
- 位於 Supabase `cms-public` bucket。
- 不得是草稿 signed URL。

既有 `public/images/...` 與 `/images/...` 相對路徑繼續支援，並可執行檔案存在與大小寫檢查。`http:`、`javascript:`、`data:` 與 `blob:` 一律拒絕。

### 既有資料 dry-run

以下指令只讀取 `data/class-results.json` 與 `activities.csv`，不寫 Supabase、不修改正式資料、不掃描整個 `public` 目錄，也不處理未追蹤素材：

```powershell
node tools/import-existing-content-dry-run.mjs
```

報告包含成功筆數、舊日期 warning、重複 ID、欄位錯誤、SDG 修正、重複段落、內部備註及圖片參照統計。

### 測試

本階段使用 Node 內建 test runner，不需要 npm 或大型測試框架：

```powershell
node --test tests/content/*.test.mjs
```

測試涵蓋正規化、資料驗證、URL 白名單、RFC 4180、deterministic 輸出、56 筆班級、63 筆活動、static fallback、首頁統計、正式資料檔雜湊與未追蹤檔案不變。

### Git 維護安全

- 禁止使用 `git add .` 或 `git add -A`；只 stage 明確的階段檔案。
- 禁止使用 `git clean` 或 `git reset --hard`。
- 不得搬移、刪除、忽略化或提交既有未追蹤素材。
- deterministic exporter 不掃描未追蹤目錄，也不修改圖片檔案。
