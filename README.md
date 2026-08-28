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

## 後台 V1.0 階段 2：Supabase 基礎架構

本階段加入可版本控制的 Supabase local development 基礎，不建立或連結正式雲端專案。公開網站仍只讀取已合併至 `main` 的靜態資料，Supabase 草稿不會直接進入前台。

### 架構與 migrations

`supabase/config.toml` 定義本機 Auth、Database、Storage 與 Edge Function 設定。兩支 migration 依穩定順序執行：

1. `202608180001_admin_foundation.sql`：9 個 enum、6 張管理 table、foreign keys、updated_at/revision triggers、RLS 與最小 grants。
2. `202608180002_storage_policies.sql`：`cms-drafts`、`cms-public` buckets 與 Storage policies。

主要 table：

- `admin_users`：Supabase Auth 使用者的 V1 管理員 allow-list；只可由安全 migration、本機管理流程或 service role 維護。
- `content_items`：班級花絮與活動的穩定公開 ID。
- `content_drafts`：每個內容一份 active draft；每次 UPDATE 由 DB trigger 自動將 `revision` 加一。
- `media_assets`：既有 GitHub 圖片及新上傳圖片的 metadata，刪除狀態使用 `deleted_at`。
- `publication_snapshots`：不可由瀏覽器修改的核准發布快照。
- `github_publications`：預留未來 Draft PR 發布狀態，本階段不呼叫 GitHub。

### Local development

需要 Supabase CLI 及 Docker-compatible runtime。不要執行 `supabase link`，也不要填入 production project ref：

```powershell
supabase start
supabase db reset
supabase functions serve --env-file .env.local
```

`supabase db reset` 會從空白本機資料庫重跑 migrations 與 `supabase/seed.sql`。本階段 seed 刻意不建立 `auth.users`、正式內容、真實 Email 或密碼；測試管理員應透過本機 Studio 或明確的 test-only admin 流程建立。

目前 repository 契約測試不需要 Docker：

```powershell
node --test tests/supabase/*.test.mjs
node --test tests/content/*.test.mjs
```

若系統 PATH 沒有 Node，可改用 Codex bundled Node 的完整路徑。完整 migration、RLS 與 Storage 整合測試仍應在具備 Docker 的環境執行 `supabase db reset` 後確認。

### Auth 與 RLS

- Email/password provider 保持啟用供既有管理員登入；全域 `auth.enable_signup` 與 anonymous sign-in 關閉，因此公開註冊仍不可用。
- 正式管理員帳號由 Supabase Dashboard 或安全 admin 流程建立；repository 不存放 Email、密碼或預設密碼。
- `public.is_active_admin()` 是固定 `search_path` 的 `security definer` helper，避免查詢 `admin_users` 時發生 RLS recursion。
- anonymous、一般登入者與停權管理員無後台資料權限。
- active admin 可 SELECT/INSERT/UPDATE content、draft 與 media，但 V1 不提供 DELETE。
- active admin 對 `publication_snapshots`、`github_publications` 僅能 SELECT；寫入保留給 service role／Edge Function。

### Storage

`cms-drafts` 是 private bucket，限制 10 MB，接受 JPEG、PNG、WebP。active admin 只能操作以自己 UUID 開頭的路徑：

```text
{user_id}/{content_type}/{content_uuid}/{asset_uuid}/original.{ext}
```

V1 允許刪除自己 prefix 下的 draft object；對應 `media_assets` 仍採 `deleted_at` soft delete。後續 UI 預覽應簽發 10 分鐘 signed URL。

`cms-public` 是 public-read bucket，browser role 沒有寫入 policy，只有 service role／Edge Function 可發布：

```text
v1/class-results/{public_id}/{asset_uuid}-{sha256前12碼}.{ext}
v1/activities/{public_id}/{asset_uuid}-{sha256前12碼}.{ext}
```

既有 GitHub 圖片保持原路徑，本階段不搬遷也不上傳正式圖片。

### Edge Functions

- `admin-health`：公開 runtime health check，只回傳 `ok`、service version 與 timestamp。
- `validate-admin`：要求使用者 JWT，重新向 Supabase Auth 驗證後查詢 `admin_users.is_active`；未登入回 401，非管理員或停權管理員回 403。
- `_shared`：集中 CORS、JSON response、可測試的 admin handler 與 server-only Supabase 查詢。

允許的瀏覽器 origin 由 `ADMIN_ALLOWED_ORIGIN` 設定，不使用 `*`。Client response 不回傳 stack、env、key、token 或 project secret。

### 環境變數與 secrets

複製 `.env.example` 為本機 `.env.local` 後再填入本機值；`.env.local` 已被忽略：

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`：僅 Edge Function/server 使用，禁止進瀏覽器 bundle。
- `ADMIN_ALLOWED_ORIGIN`
- GitHub App 變數名稱只為後續階段預留，本階段未使用。

任何真實 key、JWT secret、GitHub private key、production host 或管理員憑證都不得 commit。

### 本階段未包含

- React 後台 UI
- 56 筆班級與 63 筆活動正式匯入
- GitHub App 或 GitHub API
- Draft PR 自動建立
- 正式圖片遷移
- 多角色審核或自動合併

## 後台 V1.0 階段 3：既有內容 Supabase 基準匯入

本階段把 GitHub `main` 已公開的 56 筆班級成果與 63 筆活動，映射成 local Supabase 的 baseline published state。GitHub `main` 靜態 JSON、CSV 與 fallback 仍是 production source；公開網站不讀取 Supabase，匯入器也不修改任何正式內容或圖片。

Canonical source 只有 `data/class-results.json` 與 `activities.csv`。fallback 僅由既有回歸測試驗證一致性，不作匯入來源。執行 dry-run 不連線或寫入 DB：

```powershell
node tools/import-baseline-to-supabase.mjs --dry-run
```

套用前必須先啟動 local Supabase 並重跑 migrations：

```powershell
supabase start
supabase db reset
node tools/import-baseline-to-supabase.mjs --apply
```

`--apply` 僅接受 `localhost`、`127.0.0.1` 或 `::1` 的 `54322` port，且會再確認 local DB container port；不提供 production override。匯入以單一 transaction 執行，預期建立 119 個 `content_items`、119 個 `baseline_published` snapshots、714 個 `github_legacy` media metadata，並保持 0 個 drafts、0 個 GitHub publication jobs、0 個 Storage objects。

Baseline snapshot 使用既有 schema version，`snapshot_source = baseline_import`、`source_draft_id = NULL`、`source_revision = 0`。這代表 CMS revision history 之前的已發布起點，不會為滿足 FK 建立假 draft。local integration 使用固定的 `baseline-importer@example.test` system identity，只作 created-by FK；未來 cloud baseline 必須建立 production-specific import identity，不可沿用 local UUID，也不得把它當管理員帳號。

Legacy media 不搬移、不轉檔、不上傳 Storage。metadata 由 tracked 圖片 header 與檔案內容取得 filename、MIME、尺寸、bytes 與 SHA-256；`rights_status = legacy_retained`，未經檢視的 portrait metadata 以 `contains_portrait = NULL` 表示 unknown。新上傳仍要求明確 portrait metadata，不因 legacy 規則而放寬。

每個 snapshot checksum 由固定 schema version、完整 canonical CMS data 與 stable media manifest 產生；object key 排序固定、array 保留正式順序，不包含 UUID、timestamp 或機器路徑。相同來源再次 apply 會略過 119 筆且不新增資料；同一 `content_type + public_id` 的 checksum 或 media metadata 不同時，整筆 transaction 以 `BASELINE_CONFLICT` 中止，不會 silently overwrite 歷史。

既有 63 筆不可安全解析的日期保留原 `dateLabel`，4 筆服務範圍外 district 原值保留，`112-015` 缺封面亦不補造；這 68 筆 legacy warnings 不阻擋 baseline。完整 canonical snapshot 可保留 `internalNotes`，但 public JSON、CSV 與 fallback exporter 仍必須排除內部備註。

一般契約測試不要求 Docker；真正 local integration 必須明確開啟：

```powershell
node --test tests/supabase/*.test.mjs
$env:YIMI_RUN_SUPABASE_INTEGRATION = "1"
node --test tests/supabase/baseline-import.integration.test.mjs
```

## 後台 V1.0 階段 4A：Cloud Supabase 正式資料層

Cloud Supabase 是 CMS 的正式後端；公開網站仍只讀取 GitHub `main` 已合併的靜態 JSON、CSV 與 fallback。Cloud 草稿、管理資料或尚未合併的內容不會直接出現在 GitHub Pages。Stage 4A 完成正式資料層、identities 與安全驗證；Stage 5A 已建立 React 管理介面骨架，Stage 4B 已部署 production Edge Functions 並完成 managed CORS 驗收。Stage 5B-1 接續提供文字內容 CRUD；GitHub App、Draft PR 自動發布與既有圖片搬遷仍未建立。

### Production Auth 與 identities

- Email/password 登入啟用，但 public signup、anonymous sign-in 與公開 onboarding 關閉。
- V1 只有一個 active admin；管理員 Email 不寫入 repository，密碼必須由管理員本人透過安全流程設定。
- baseline 使用獨立的 production system identity 作為 `created_by` provenance。該 identity 不加入 `admin_users`、禁止一般登入，也不可沿用 local 固定 UUID。
- Stage 4 migration 使 `content_type`、`public_id` 與 `created_by` 在建立後不可更改；active admin 可編輯 system-owned baseline 的其他允許欄位。

### Migration 與 drift 原則

Cloud schema 只能透過 repository 中依序版本化的 migration 變更。正式套用前須先執行 linked migration list、`db push --dry-run`，確認沒有非預期 drop、truncate 或 delete，再執行 `db push`。已合併的歷史 migration 不回寫修改；需要修正時新增 migration。Dashboard 人工建立的 admin/system identity 是資料差異，不得以未記錄 SQL 造成 schema drift。

### Production baseline 安全模式

一般 `--apply` 仍只接受 local Supabase。正式匯入必須額外指定 `--production-baseline`，且下列條件必須全部成立：

- `ALLOW_PRODUCTION_BASELINE_IMPORT=true`
- expected、actual 與 confirmation project ref 完全相同
- expected region 與官方 pooler host 完全相符
- database URL 只能指向該 project 的 direct database 或官方 shared pooler
- production system actor UUID 有效且不是 local 固定 identity

缺少任一 gate 就拒絕連線。匯入使用單一 transaction，保留 checksum conflict 與 idempotency；不允許 arbitrary remote host 或 overwrite。正式 baseline 為 56 筆班級、63 筆活動、119 個 published snapshots 與 714 個 `github_legacy` media metadata，drafts 與 GitHub publication jobs 皆為 0。714 張既有圖片不會上傳或搬移。

### Secrets 管理

`.env.example` 只能保存 placeholder。真實 project ref、DB password、管理員 Email 與一次性匯入 gate 應放在 ignored 且限制存取的本機檔案。publishable key 可供未來 browser 使用；service role key、DB password 與 Edge Function privileged operations 永遠只存在 server-side。service role key 不得進 React bundle、log、回覆或 Git。Edge Function secrets 由 Supabase secrets 管理。

### Cloud RLS 與 Storage

- anonymous、一般登入者與 inactive admin 無 CMS table 權限；active admin 只能依 Stage 2 RLS 操作 content、draft 與 media，publication snapshot 與 GitHub publication 仍是唯讀。
- `cms-drafts` 保持 private、10 MB、JPEG/PNG/WebP，active admin 只能操作自己的 UUID prefix，預覽使用短效 signed URL。
- `cms-public` 可公開讀取，但 browser admin 不可寫入；只有 service role／Edge Function 可以發布。

Stage 4A 已在 managed Cloud 實測 anonymous、non-admin、inactive admin 與 active admin 的 RLS 邊界，也完成兩個 bucket 的 private/public、prefix、signed URL 與 browser/service-role 寫入邊界。測試帳號、資料列及 Storage objects 已清除。

### Stage 4B：Edge Functions 與 managed CORS

`admin-health` 與 `validate-admin` 已部署至 managed Supabase production。正式 admin origin 固定為 `https://yimi-story-admin.pages.dev`；`ADMIN_ALLOWED_ORIGIN` 透過 Supabase secrets 設定，不寫入 repository，也不使用 GitHub Pages 公開網站、localhost、Supabase Dashboard、假網域或 wildcard 替代。

- `admin-health` 提供不需 JWT 的安全連線檢查，只回傳 `ok`、版本與 timestamp。
- `validate-admin` 僅接受 POST，在 server 端以 `auth.getUser(token)` 驗證 JWT，再查詢 `admin_users.is_active`；不信任 client role 或 localStorage。
- 兩個 Functions 都關閉 managed gateway JWT 攔截，由各自 handler 統一處理 CORS 與驗證。這避免 gateway 在 no-JWT error 上覆寫 `Access-Control-Allow-Origin: *`；`validate-admin` 並未因此略過 JWT 或 active-admin 驗證。
- allowed origin 的 GET／POST 與 OPTIONS 均回傳精確 ACAO；unknown origin 回 403 且不含 ACAO。production 沒有 `Access-Control-Allow-Origin: *`，也不啟用 credentials。
- no JWT 與 invalid JWT 為 401，active admin 為 200，non-admin 與 inactive admin 為 403；response 不含 UUID、Email、claims、token 或內部錯誤。
- service role key 只由 Supabase Function runtime 使用，不進入 React bundle。Stage 5A 仍為單一正式管理員，尚未建立內容 CRUD、GitHub App 或 PR 發布流程。

`LOCAL-CORS-001` 狀態為 **Closed for production**，範圍只剩 Supabase CLI local Kong gateway。managed production CORS 已通過，不再阻擋後續 server-side API 開發。

正式 Storage host 為該 project 的 `https://<project-ref>.supabase.co`。目前公開網站沒有 Supabase 圖片，因此 `allowedExternalImageHosts` 維持空陣列；等第一張 `cms-public` 圖片確定要發布時，再以獨立變更加入真實 host 並執行前台回歸。

### 安全操作順序

```powershell
supabase migration list --linked
supabase db push --dry-run
supabase db push
node tools/import-baseline-to-supabase.mjs --dry-run
node tools/import-baseline-to-supabase.mjs --production-baseline --apply
```

最後一個指令只有在所有 production gates 由受保護的 process environment 提供時才會執行。不要將含 secret 的 command line、輸出或 `.env` 檔加入版本控制。

### Stage 4A 完成界線

Stage 4A 已完成 Cloud migrations、production admin、不可登入且非管理員的 system import identity、56＋63／119 筆 baseline、119 個 published pointers、714 個 `github_legacy` media metadata、第二次匯入冪等性、Cloud RLS、Cloud Storage、migration drift 核對、secrets scan 與 Stage 1～3 回歸。Stage 4B 已接續完成 production Edge Functions deployment、managed CORS 與 admin auth 邊界驗收；Stage 5B-1 才在此安全基礎上新增 content／draft 寫入流程。

## 後台 V1.0 階段 5A：React 管理介面骨架

React 後台位於獨立的 `admin/`，不與既有 GitHub Pages 公開網站混合。正式入口為 `https://yimi-story-admin.pages.dev`，由 Cloudflare Pages 提供固定 HTTPS 與 SPA fallback；直接開啟 `/login` 或 `/dashboard` 都會回到 React router。

### Local development 與 build

Stage 5A 使用 React、TypeScript、Vite、React Router、Supabase JavaScript client 與 Vitest。需要先在 `admin/` 建立 ignored 的 `.env.local`，只提供兩個 browser-safe 值：

```text
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

不得加入 service role key、DB password、Supabase access token、JWT secret、GitHub token 或 private key。安裝、測試與建置：

```powershell
cd admin
pnpm install --frozen-lockfile
pnpm test
pnpm run build
pnpm run dev
```

如果 Node／pnpm 不在系統 PATH，應使用已核准的 bundled runtime，不要全域安裝或修改系統 PATH。Cloudflare direct upload 使用已注入 browser-safe build-time variables 的 `dist/`：

```powershell
pnpm exec wrangler pages deploy dist --project-name yimi-story-admin --branch main
```

### Auth、權限與目前界線

- 後台提供 Email/password 登入、登出與最小密碼復原，不提供 signup、邀請或帳號管理介面。
- 「忘記密碼」使用 Supabase Auth `resetPasswordForEmail`，正式 redirect 回到 `/update-password`；recovery session 成立後才呼叫 `updateUser({ password })`。新密碼不寫入本站資料庫、log、Git 或回覆。
- Supabase session 成立後，仍須由 `admin_users` 與 RLS 確認 active admin；前端狀態或 localStorage role 不是安全邊界。
- 無 session 會導向 `/login`；non-admin 與 inactive admin 都不能進入 dashboard。
- dashboard 的班級、活動、published snapshots 與 media 數量由 Cloud Supabase read-only count query 即時取得，不永久 hard-code。
- Stage 5A 只提供 dashboard 與未完成功能提示，尚未製作內容編輯、圖片上傳、draft、預覽或 GitHub PR 發布。

Supabase Auth Redirect URLs 已加入正式 `/update-password` recovery URL。正式 origin 保存在 ignored 的本機設定，並已作為 Supabase production secret 提供給 `admin-health`／`validate-admin`；值不進入 Git。Stage 4B managed CORS 與 admin auth 邊界均已完成驗收。

### Stage 5A production 驗收

- 正式管理員 Email/password 登入成功，active admin allow-list 與 RLS 正常。
- dashboard 即時顯示班級 56、活動 63、published snapshots 119、media metadata 714。
- 直接重新整理 `/dashboard` 後 SPA routing 與 Supabase session 均保留。
- Cloud 連線狀態正常；登出會清除 session 並返回登入頁。
- 密碼復原信、recovery redirect 與新密碼更新流程已由管理員本人完成。

## 後台 V1.0 階段 5B-1：班級與活動文字草稿

正式後台新增班級花絮與活動成果的列表、關鍵字搜尋、年度／地區／狀態等篩選，以及新增與編輯頁。表單資料不直接等同資料庫 row，而是經 Stage 1 canonical normalizer 與 validator 後才寫入 `content_drafts`；錯誤與提醒分開呈現，驗證有錯誤時仍可保存為 `draft`。

- 第一次編輯既有 published 內容時，資料庫 RPC 會以 immutable publication snapshot 建立唯一的 revision 1 draft；再次開啟會沿用同一筆 draft。
- 新內容以單一 transaction 建立 `content_items` 與 draft，`published_snapshot_id` 保持 `NULL`。年度 public ID 由 advisory transaction lock 保護並在資料庫配置；前端顯示的 next ID 只供預覽。
- 每次儲存由資料庫 trigger 增加 revision 並回傳實際版本與時間。通過明確內容檢查的 draft 可標示為 `validated`，任何後續欄位修改都會立即降回 `draft`。
- `publicNotes` 與 `internalNotes` 在介面明確分區；公開 exporter 仍會排除 internal notes。既有 legacy date 不推測 ISO 日期，非現行服務區的既有 district 也不會在編輯時遺失。
- 離開 route、重新整理或關閉有未儲存變更的頁面前會提醒。Stage 5B-1 不提供刪除或 autosave。
- 圖片區只顯示既有 media metadata 數量，不上傳、排序、刪除或寫入 Storage／`media_assets`。
- 本階段不建立 publication snapshot、不寫入 GitHub publication、不產生 PR，也不修改 GitHub Pages 的 JSON、CSV、fallback 或既有圖片與文件。公開網站只會繼續讀取已合併至 `main` 的靜態正式資料。

## 後台 V1.0 階段 5B-2：Private 草稿圖片

Stage 5B-2 在班級與活動草稿編輯器加入封面與相簿圖片管理。新圖只寫入 private `cms-drafts`，不寫入 `cms-public`、publication snapshot、Git repository 或公開網站。

- 接受 JPEG、PNG、WebP；每張上限 `10 * 1024 * 1024` bytes。SVG、GIF、HEIC、TIFF、BMP、magic bytes 不符、損壞圖及任一邊超過 12000px 均拒絕。任一邊低於 300px 只產生提醒。
- Browser 先檢查 MIME、副檔名、header、尺寸並以 Web Crypto 計算 SHA-256；上傳後 `validate-media-upload` Edge Function 會重新下載 private object，複驗 magic bytes、尺寸、大小與 checksum，成功後才以 server credential 建立 metadata row。
- Storage key 固定為 `{admin_uid}/{content_item_id}/{media_uuid}/{media_uuid}.{ext}`。原始檔名只保存為顯示用 metadata，不參與路徑，也不允許 `..`、反斜線或任意 path segment。
- `media_source` 明確區分 `github_legacy`、`cms_draft`、`cms_public`。既有 714 筆 Legacy media 不搬移、不修改且只讀；草稿解除 Legacy 引用不會刪除 Git 圖片或 metadata row。
- Canonical 內容仍只使用 `coverAssetId`／`galleryAssetIds`。封面最多一張；新草稿相簿最多 20 張，既有超過上限的 Legacy composition 不會被強制刪除。
- 草稿圖 metadata 包含原始檔名、MIME、bytes、尺寸、SHA-256、alt、人物狀態、權利狀態、content／draft ownership 與 private object path。同一 content 的 active `cms_draft` SHA-256 不得重複。
- alt 可留空保存，但內容檢查會提醒；人物可選「有／無／尚未確認」，權利可選「社大自有／自行拍攝／已取得授權／尚未確認」。系統不做人臉辨識，也不自動產生 alt。
- 圖片 metadata、cover／gallery 引用與排序在管理員按「儲存草稿」時由單一 RPC 交易更新，draft revision 只增加一次。Browser 不能直接更新 source、bucket、path、checksum、bytes 或 ownership。
- `cms-drafts` 預覽使用 900 秒 signed URL，不寫入 localStorage。Legacy 預覽由既有 GitHub Pages 相對路徑產生，不使用 signed URL。
- Storage 成功但 server validation／DB insert 失敗時會精確刪除該 object；解除引用後才允許刪除 `cms_draft` metadata。未附加的本次上傳可由 UI cleanup utility 清理，production 不設自動 cron。
- `cms-public` 保持 public-read／browser-write-deny；Stage 5B-2 不發布任何 object。正式發布、圖片轉檔、縮圖、裁切、WebP 轉換與 EXIF removal 延後至 publication 階段評估。
- `CR-115-xxx` 只作為後台與資料庫識別碼；本階段不修改公開網站顯示規則，也不把該 ID 加到前台。公開端仍以課程名稱／成果名稱作為主要識別資訊。

V1 draft upload 暫不處理 EXIF removal。管理員應避免上傳含敏感定位資料的原始檔，正式發布階段需再次評估 EXIF 清除策略。

## 後台 V1.0 階段 6：管理員草稿預覽

Stage 6 在既有受保護的 Admin SPA 內加入班級與活動預覽；預覽不是發布，也不新增公開網站 route。編輯頁只有在內容及圖片均已儲存後才能前往預覽，未儲存變更會先要求管理員儲存。

- `/class-results/:publicId/preview` 與 `/activities/:publicId/preview` 都受既有 active-admin route guard 與 RLS 保護，不提供匿名或分享型預覽。
- 資料來源採 draft-first：有 `content_drafts` 時顯示已儲存草稿；沒有 draft 但有 publication snapshot 時唯讀顯示目前正式版本。純預覽不建立 draft、不增加 revision，也不建立 snapshot。
- canonical data 先經共用 public projection 移除 `internalNotes`，exporter 與預覽共用同一份公開欄位規則。預覽 component 不接收完整 DB row，不顯示 UUID、Storage path、technical source 或 raw validation JSON。
- `github_legacy` 使用既有公開圖片 URL；`cms_draft` 只使用 900 秒 signed URL。指定封面與顯示層 hero 分開：existing published activity 若 canonical `coverAssetId` 為空，沿用 Public site 的 `public/images/activities/{publicId}/cover.jpg` 慣例，該圖失敗才退到 gallery 第一張；canonical data、snapshot 與 media metadata 不會因此改寫。gallery 仍依 `galleryAssetIds` 排序，單張失敗只顯示 placeholder。
- 管理控制區清楚標示草稿／新內容／目前正式版本、尚未發布、revision、validation errors 與 warnings；這些資訊不混入模擬民眾內容。
- 預覽只用 React text rendering 與 HTTPS 連結，不使用 `dangerouslySetInnerHTML`、iframe、localStorage、IndexedDB 或 service worker cache。
- Stage 6 不寫 `cms-public`、不建立 GitHub publication、PR 或公開 snapshot，也不修改 GitHub Pages 的 JSON、CSV、fallback、圖片或文件。

## 後台 V1.0 階段 6.5：草稿圖片旋轉與裁切

Stage 6.5 只允許 active admin 編輯自己內容下的新上傳 `cms_draft` 圖片。影像在瀏覽器使用 Canvas 套用 EXIF orientation、90°／180°／270° 旋轉及原始、自由、4:3、3:4、16:9、1:1 裁切；JPEG 固定以 0.92 品質輸出，PNG 保留透明度，WebP 維持原格式，輸出後仍須通過 Stage 5B-2 的 client 與 Edge 完整驗證。

- 原始 private object 與 media row 永遠保留；編輯結果是不同 UUID path 的新 `cms_draft` object。`original_media_id` 直接指向根原圖，`transformation` 只記錄正規化後的旋轉與裁切，不保存 Canvas 或 signed URL 狀態，也不建立深層版本鏈。
- attach／restore 由受控 RPC 原子切換 `coverAssetId` 或原 gallery 位置，增加 draft revision、把狀態降回 `draft` 並要求重新驗證。Alt、人物及權利 metadata 預設繼承；新檔重新計算 checksum、bytes、width 與 height。
- 「恢復原圖」只把草稿引用切回根原圖；無其他引用的編輯版本才可清除。Orphan 判斷會保護仍有編輯版本指向的原圖，Storage／DB／attach 任一步驟失敗均採精確補償，不先破壞既有引用。
- `github_legacy` 維持唯讀，不顯示圖片編輯或恢復功能，714 筆既有 metadata 與 Git 圖片均不回填、不搬移、不轉檔。未來若需修改 Legacy 圖片，必須另行設計 `Legacy public image → copy/import as cms_draft → edit copied draft version`，不得直接修改 Git asset。
- 本階段不新增 image-processing Edge Function 或第三方圖片套件，不寫 `cms-public`、publication snapshot、GitHub publication 或公開網站；Stage 6 預覽只依目前已儲存的 draft media reference 顯示 private signed image。
