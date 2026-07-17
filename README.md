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

- `activities.csv` 是 62 筆活動的正式維護來源，目前包含 112、113、114 年資料；115 年保留為後續年度入口。
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
