// 已归档的死代码：以下函数在 app.js 中定义但从未被调用，从主文件移出。
// 用途：保留可恢复性，而不是直接删除。
//
// 为什么不做成静态分析自动判断？因为有两个"假死"陷阱：
//   1. doCook / doEat 被 `const fn = eatMode ? 'doEat' : 'doCook'` 以字符串形式引用，
//      纯文本搜索抓不到，误删会导致"上桌"按钮失效。
//   2. renderTeachings（复数）是 typo，真正用的是 renderTeaching（单数）——
//      这类拼写错误靠人工判断。
//
// 恢复方法：把对应函数粘回 app.js，重新构建即可。
// 本文件不参与构建（不在 index.html 的 script 引用里）。

// ---- thumbS (原 L59-59) ----
function thumbS(n){ return thumb(n, 36); }

// ---- treeNeed (原 L192-192) ----
function treeNeed(n){ const t=tree(n); return t ? t.原料 : null; }

// ---- bannedCats (原 L211-219) ----
// ---- 忌食/忌饮 ----
function bannedCats(){
  const s=new Set();
  [...state.visitors].forEach(n=>{
    const v=VIS.find(x=>x.姓名===n); if(!v||!v.忌食) return;
    v.忌食.split(/[、,，]/).forEach(t=>s.add(t.trim().replace(/食$/,'')));
  });
  return s;
}

// ---- bannedDrinks (原 L220-227) ----
function bannedDrinks(){
  const s=new Set();
  [...state.visitors].forEach(n=>{
    const v=VIS.find(x=>x.姓名===n); if(!v||!v.忌饮) return;
    v.忌饮.split(/[、,，]/).forEach(t=>s.add(t.trim().replace(/饮$/,'')));
  });
  return s;
}

// ---- matchDemand (原 L249-253) ----
// ---- 菜品筛选 ----
// f: 菜品对象（含 名称/产物性相/加工步数/可获取来源）
function matchDemand(f, n){
  return hasAspect(f, n);
}

// ---- filterMatch (原 L326-329) ----
function filterMatch(f){
  const dn=demandAspects().food;
  return Object.keys(dn).filter(n=>hasAspect(f,n));
}

// ---- dishCategory (原 L337-341) ----
function dishCategory(f){
  if(!f) return null;
  const cats = dishCats(f);
  return cats.length > 0 ? cats[0] : null;
}

// ---- retMat (原 L487-495) ----
// 把原料返还进仓库（登记侧），不触碰订货数量
function retMat(name, n, qty){
  for(const k in n){
    if(isTool(k)) continue;
    const q = (n[k]||1)*qty;
    if(!q) continue;
    state.inv[k] = (state.inv[k]||0) + q;
  }
}

// ---- stockHint (原 L594-608) ----
// 输入时提示该物品是否维基已知，及其性相
function stockHint(){
  const el=document.getElementById('stock-hint');
  const inp=document.getElementById('stock-name');
  if(!el||!inp) return;
  const name=(inp.value||'').trim();
  if(!name){ el.textContent=''; return; }
  if(allKnownItems().has(name)){
    const f=dish(name);
    const asp=f && aspStr(aspDict(f.产物性相));
    el.textContent='✓ 维基已知'+(asp?' · '+asp:'');
  } else {
    el.textContent='⚠ 不在维基物品清单';
  }
}

// ---- doLock (原 L621-623) ----
// ---- 锁定 ----
// 锁定/解锁机制已移除（用户要求：此机制目前没用上）
function doLock(){ alert('锁定机制已移除'); }

// ---- doUnlock (原 L624-624) ----
function doUnlock(){ alert('锁定机制已移除'); }

// ---- addOrder (原 L625-628) ----
function addOrder(k){
  state.cart[k] = (state.cart[k]||0) + 1;
  renderAll();
}

// ---- delOrder (原 L629-633) ----
function delOrder(k){
  if(state.cart[k]>1) state.cart[k]--;
  else delete state.cart[k];
  renderAll();
}

// ---- decant (原 L706-715) ----
// 分装：1 壶 -> N 杯（可调）
function decant(name, n){
  if(state.pots[name] < 1){ alert('无壶：'+name); return; }
  state.pots[name] -= 1;
  const small = (DRINK_BIG||[]).find(b=>b.名称===name);
  if(small && small.小杯){
    state.pots[small.小杯] = (state.pots[small.小杯]||0) + n;
  }
  renderAll();
}

// ---- addPot (原 L716-719) ----
function addPot(name, n){
  state.pots[name] = (state.pots[name]||0) + (n||1);
  renderAll();
}

// ---- dishCount (原 L808-809) ----
// 餐桌计数（供外部检查）
function dishCount(){ return Object.values(state.dishTable).reduce((a,b)=>a+(+b||0),0); }

// ---- drinkCount (原 L810-810) ----
function drinkCount(){ return Object.values(state.drinkTable).reduce((a,b)=>a+(+b||0),0); }

// ---- isAlcDrink (原 L822-823) ----
// 是否烈酒（别名，供外部检查）
function isAlcDrink(name){ return isAlcohol(name); }

// ---- aspKey (原 L847-850) ----
function aspKey(a){
  // 返回性相对象的键集合（用于快速匹配）
  return Object.keys(a).join(',');
}

// ---- renderTeachings (原 L926-926) ----
function renderTeachings(){ renderTeaching(); }

// ---- bindCollapse (原 L945-958) ----
function bindCollapse(){
  document.querySelectorAll('.panel .phead').forEach(hd => {
    if(hd.dataset.bound) return;
    hd.dataset.bound = '1';
    const id = hd.dataset.toggle;
    hd.onclick = () => {
      if(!id) return;
      const sec = document.getElementById(id);
      if(!sec) return;
      const on = sec.classList.toggle('collapsed');
      hd.classList.toggle('collapsed', on);
    };
  });
 }
