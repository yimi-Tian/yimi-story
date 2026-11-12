/* 對外模式：預設隱藏開發／效能控制項（動畫逐鄉開關、效能、陰影聚焦、實例化）。
   加上 ?dev=1 即可還原全部控制項。只影響按鈕顯示，不改任何場景、相機、動畫或預設狀態。
   保留對外有用的「標示」與「全場暫停」。 */
(()=>{
 const dev=new URLSearchParams(location.search).get('dev')==='1';
 if(dev){document.documentElement.classList.add('yimi-dev');return}
 const ids=['animbtn','bdanimbtn','yzanimbtn','lcanimbtn','tbanimbtn','ssanimbtn','zpanimbtn','xganimbtn','perfbtn','shfbtn','instbtn'];
 const st=document.createElement('style');
 st.textContent=ids.map(i=>'#lt #'+i).join(',')+'{display:none!important}';
 document.head.appendChild(st);
})();
