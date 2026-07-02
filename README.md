# 邑米社區大學 112-115 成果故事館

這是可部署到 GitHub Pages 的靜態網站，使用 HTML、CSS、JavaScript 製作，不需要後端伺服器、資料庫或付費 API。

## 後續資料維護

- 年度活動資料：目前由 `activities-data.js` 匯入 112 年 `activities.csv` 內容。之後 113-115 年活動資料若整理成相同欄位，可放進同一份 CSV 資料格式，網站會依年度、地區、SDGs 自動分類。
- 地方知識主題館：請修改 `script.js` 裡的 `siteData.themes`。
- 成果展示頁：請修改 `script.js` 裡的 `siteData.showcase`。
- 赤蘭溪互動體驗文字與連結：請修改 `script.js` 裡的 `siteData.chilan`。
- 數位走讀互動館：請修改 `script.js` 裡的 `siteData.digitalTours`。
- 社團記錄：請修改 `script.js` 裡的 `siteData.clubs`。
- 赤蘭溪早年生活 Podcast：請修改 `script.js` 裡的 `siteData.earlyLifePodcast`。

## 圖片位置

- LOGO：`public/images/yimi-logo.png`
- Placeholder：`public/images/placeholder.svg`
- 活動照片：`public/images/activities/活動ID/`
- 活動封面：`public/images/activities/活動ID/cover.jpg`
- SDGs 圖標：`public/images/sdgs/1.png` 到 `public/images/sdgs/17.png`
- 赤蘭溪早年生活速寫：`public/images/digital/early-life/`
- 赤蘭溪早年生活音檔：`public/audio/early-life/`

## 四年成果總覽

目前四年成果總覽提供兩種瀏覽方式：

- 依地區分類：同一活動若填寫多個鄉鎮市區，會同時出現在各自地區，不會合併成單一頁籤。
- 依 SDGs 分類：同一活動若對應多個 SDGs，會同時出現在各 SDG 分類。

點進地區或 SDGs 後，頁面會提供 112、113、114、115 年度標籤。現在 112 年已有測試資料，113-115 年先顯示待補。
