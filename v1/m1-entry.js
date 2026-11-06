/* 入口：點擊「探索十鄉鎮」才前往互動 3D 頁；首頁本身不載入 Three.js。
   「直接瀏覽資料」連到現有成果故事館（網址取自 site-config.js）。 */
(()=>{const go=()=>{location.href='./3d/index.html'};const b=document.getElementById('m1-start2');if(b)b.addEventListener('click',go);
 const S=window.YIMI_SITE;const d=document.getElementById('data-link');if(d&&S&&S.platformBase)d.href=S.platformBase+(S.overviewRoute||'#/overview');})();
