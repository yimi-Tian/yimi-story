/* 站點設定：依網址判斷環境。
   正式環境 = 主機 yimi-tian.github.io 且路徑在 /yimi-story/ 之下（避免同帳號其他儲存庫／測試頁被誤判為正式）。
   其餘（本機、測試頁、file://）皆為測試環境：返回連結回測試首頁。
   成果連結（platformBase）在兩種環境皆指向正式站已公開頁面。 */
(()=>{
  const PROD_HOST='yimi-tian.github.io';
  const PROD_PATH='/yimi-story/';
  const prod=location.hostname.toLowerCase()===PROD_HOST&&location.pathname.toLowerCase().indexOf(PROD_PATH)===0;
  window.YIMI_SITE={
    env:prod?'production':'test',
    platformBase:'https://yimi-tian.github.io/yimi-story/',
    overviewRoute:'#/overview',
    homeHref:prod?'https://yimi-tian.github.io/yimi-story/platform.html':'../index.html',
    homeLabel:'← 返回網站'
  };
})();
