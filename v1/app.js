const views={
  original:{eyebrow:'走進邑米服務的十鄉鎮',code:'A',caption:'晴天、清透、有生命力',preview:'探索十鄉鎮',previewSub:'點選地標開始'},
  a11:{eyebrow:'走進邑米服務的十鄉鎮',code:'A1.1',caption:'首頁成為十鄉鎮知識地景的入口',preview:'探索十鄉鎮',previewSub:'點選地標開始'}
};
const root=document.documentElement;
function setView(view,replace=false){
  if(!views[view])view='a11';
  root.dataset.view=view;
  document.querySelector('[data-eyebrow]').textContent=views[view].eyebrow;
  document.querySelector('[data-view-code]').textContent=views[view].code;
  document.querySelector('[data-view-caption]').textContent=views[view].caption;
  document.querySelector('[data-preview-title]').textContent=views[view].preview;
  document.querySelector('[data-preview-subtitle]').textContent=views[view].previewSub;
  document.querySelectorAll('[data-set-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.setView===view)));
  const url=new URL(location.href);url.searchParams.set('view',view);
  history[replace?'replaceState':'pushState']({},'',url);
  document.title=`邑米十鄉鎮知識地景｜邑米地方知識探索平台`;
}
function setUi(visible){root.dataset.ui=visible?'shown':'hidden';const url=new URL(location.href);url.searchParams.set('ui',visible?'1':'0');history.replaceState({},'',url)}
document.querySelectorAll('[data-set-view]').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.setView)));
document.querySelector('[data-hide-ui]').addEventListener('click',()=>setUi(false));
addEventListener('popstate',()=>setView(new URL(location.href).searchParams.get('view')||'a11',true));
addEventListener('keydown',event=>{if(event.key.toLowerCase()==='o')setView('original');if(event.key.toLowerCase()==='a')setView('a11');if(event.key.toLowerCase()==='h')setUi(root.dataset.ui==='hidden')});
const params=new URL(location.href).searchParams;
setUi(params.get('ui')==='1');
setView(params.get('view')||'a11',true);
window.__YIMI_STYLE__={setView,setUi};
