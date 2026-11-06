/* V1-M1 整合層（獨立檔，不改十鄉鎮原始程式）
   1) ?town=朴子 深連結 → 呼叫原有 go(key)
   2) 返回網站入口
   3) 資訊卡 → 正式網站成果連結（資料來自 m1-links.js；無對應不顯示）
   只讀取原有全域：go、VIEWS、#p（資訊卡面板）。 */
(()=>{
'use strict';
const CFG=window.YIMI_M1_LINKS||{items:[]};
const KEY={'六腳':'lj','朴子':'pz','東石':'ds','布袋':'bd','義竹':'yz','新港':'xg','太保':'tb','水上':'ss','鹿草':'lc','中埔':'zp'};
const KEYS=Object.values(KEY);
window.__M1={status:{deepLink:'none'}};
/* ---- 樣式 ---- */
const st=document.createElement('style');
st.textContent='#m1-back{position:fixed;z-index:3;top:calc(12px + env(safe-area-inset-top,0px));left:14px;display:inline-flex;align-items:center;min-height:36px;box-sizing:border-box;padding:0 12px;border-radius:12px;background:var(--card);color:var(--acc);font-size:13px;font-weight:bold;text-decoration:none;box-shadow:0 4px 14px #0003}#m1-back:hover,#m1-back:focus-visible{background:var(--acc);color:#fff;outline:none}'
+'#p .m1-link{margin:2px 0 8px;padding-bottom:6px;border-bottom:1px dashed #8886;font-size:13px;line-height:1.6}#p .m1-link small{display:block;opacity:.7;font-size:12px}#p .m1-link a{color:var(--acc);font-weight:bold;word-break:break-all}';
document.head.appendChild(st);
/* ---- 返回網站（桌機：標題卡下方；窄螢幕：標題卡右側；皆避開導覽列） ---- */
const back=document.createElement('a');back.id='m1-back';const SITE=window.YIMI_SITE||{};back.href=SITE.homeHref||CFG.backHref||'#';back.textContent=SITE.homeLabel||CFG.backLabel||'← 返回網站';back.setAttribute('aria-label','返回邑米地方知識探索平台網站');
document.body.appendChild(back);
function placeBack(){const t=document.getElementById('t');if(!t)return;const r=t.getBoundingClientRect();if(innerWidth>1000){back.style.left=Math.round(r.left)+'px';back.style.top=Math.round(r.bottom+8)+'px';back.style.minHeight='36px'}else{back.style.left=Math.round(r.right+8)+'px';back.style.top=Math.round(r.top)+'px';back.style.minHeight=Math.round(r.height)+'px'}}
placeBack();addEventListener('resize',placeBack);addEventListener('load',placeBack);
/* ---- 深連結 ---- */
function normTown(v){if(!v)return null;v=v.trim();if(KEYS.includes(v.toLowerCase()))return v.toLowerCase();if(KEY[v])return KEY[v];if(v.length>2&&/[鄉鎮市]$/.test(v)&&KEY[v.slice(0,-1)])return KEY[v.slice(0,-1)];return null}
const q=new URLSearchParams(location.search).get('town');
if(q){const k=normTown(q);
 if(!k){window.__M1.status.deepLink='invalid:'+q}
 else{window.__M1.status.deepLink='pending:'+k;let n=0;
  const run=()=>{if(typeof go==='function'&&typeof VIEWS!=='undefined'&&VIEWS[k]){try{go(k);window.__M1.status.deepLink='ok:'+k}catch(e){window.__M1.status.deepLink='error:'+e.message}}else if(n++<100)setTimeout(run,100);else window.__M1.status.deepLink='timeout'};
  if(document.readyState==='complete')run();else addEventListener('load',run)}}
/* ---- 資訊卡連結 ---- */
const P=document.getElementById('p');if(!P)return;
const h3=P.querySelector('h3');
function url(it){return (SITE.platformBase||CFG.siteBase)+it.route}
function sync(){
 const title=(h3.textContent||'').trim();
 const it=(CFG.items||[]).find(x=>x.cardTitle===title);
 const old=P.querySelector('.m1-link');
 if(!it){if(old)old.remove();return}
 if(old&&old.dataset.id===it.activityId)return;
 if(old)old.remove();
 const d=document.createElement('div');d.className='m1-link';d.dataset.id=it.activityId;
 const a=document.createElement('a');a.href=url(it);a.target='_blank';a.rel='noopener noreferrer';a.textContent=it.relation+'：'+it.activityName+' ↗';
 const s=document.createElement('small');s.textContent='於邑米地方知識探索平台開啟（'+it.activityId+'）';
 d.append(a,s);P.insertBefore(d,h3.nextSibling)}
new MutationObserver(sync).observe(P,{childList:true,subtree:true,characterData:true});
sync();
})();
