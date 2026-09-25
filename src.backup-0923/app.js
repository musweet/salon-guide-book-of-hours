
// 《司辰之书》沙龙筹备助手 v4
// 数据由 tool_data.json 提供（经 prep_v4.py 规范化）。
// 字段形状已核对：
//   FOODS(数组) / ASPECTS(13) / SALONS(5维基原名) / RECIPE_TREES(need+variants)
//   TOOL_ITEMS(不消耗工具) / DRINK_SMALL / 宴会类型 / 未冲泡原料(含可冲泡饮品映射)

const DATA = JSON.parse(document.getElementById('data').textContent);
const FOODS = DATA.FOODS || [], ASPECTS = DATA.aspects, SALONS = DATA.salons, VIS = DATA.visitors;
const RECIPE_TREES = DATA.recipe_trees, TOOL_ITEMS = (DATA.tools && DATA.tools.不消耗) || [];
const TREES = RECIPE_TREES;   // 别名（测试与代码都用）
// 可上桌的菜品列表（别名，供筛选与测试使用）
function menuItems(){ return FOODS.map(f => ({ f, can: canCook(f).ok, match: { hits: byNeed(f) }, serve: canServe(f) })); }
const TC = DATA.teachings, RAT = DATA.ratio;
const CAT = DATA.catalog, FOODS_MAP = DATA.foods || {};
const DRINK_BIG = CAT.饮品大杯 || [], DRINK_HALF = CAT.饮品半壶 || [], DRINK_NEAR_FULL = CAT.饮品近满 || [], DRINK_NEAR_EMPTY = CAT.饮品近空 || [], DRINK_SMALL = CAT.饮品小杯 || [], DRINK_ALIAS = CAT.饮品别名 || {};
const RAW_INGR = CAT.未冲泡原料 || CAT.可冲泡 || [], INGREDIENTS = CAT.食材清单 || [], COMPANIES = CAT.公司 || [];
// 可生吃的采集品（维基明确注明"可直接食用"，无需加工即可上桌）
const RAW_EATABLE = (DATA.wiki_raw_eatable || []).slice();
const RAW_EATABLE_CATS = DATA.RAW_EATABLE_CATS || {};
// 香料是工具类原料：有香料称即视为拥有（香料称在 tools.不消耗 中）
const ALL_TOOLS = [...TOOL_ITEMS];
if(!ALL_TOOLS.includes('香料') && DATA.tools && DATA.tools.不消耗.includes('香料称')) ALL_TOOLS.push('香料');
const TOOL_SET = new Set(ALL_TOOLS.map(t => typeof t==='string' ? t : t.名称));
const ING_SET = new Set(INGREDIENTS.map(x => x.名称));   // 食材名集合（区分公司商品中的非食材：金属丝、胶水、纸、油等）
// 维基「需求性相」：合成表原文里部分菜谱的原料是性相而非卡牌，用具有该性相的卡牌满足。
// 来源：recipe_trees.<菜>.variants[].需求性相（维基原文真实字段，非编造）。
// 共 41 道菜有需求性相：卵、刃、面包、香料、烈酒。
// 维基「需求性相」：部分菜谱的原料是性相而非具体卡牌，用带该性相的卡牌满足（不消耗）。
// 仅承认 13 种真性相；「卵/面包/香料/烈酒」是维基「产品准则」列的产物分类标签
// （解析时与需求性相混淆过），不是需求，忽略。
function aspReqOf(name){
  const realAsp = new Set(Object.keys(ASPECTS));
  const tr = RECIPE_TREES[name];
  const lists = (tr && (tr.variants || tr.变体)) || [];
  for(const v of lists){
    const rs = v.需求性相;
    if(rs && rs.length){
      const ok = rs.filter(a => realAsp.has(a));
      if(ok.length) return ok;
    }
  }
  return null;
}
const isTool = n => TOOL_SET.has(n);

// ---- 转义与显示 ----
const h = s => String(s == null ? '' : s);
const aspStr = o => o ? Object.keys(o).map(k => k + '×' + o[k]).join('、') : '';
// 转义 HTML 特殊字符
const escHtml = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
// === 卡牌配图（DATA.images: {中文名: base64 dataURL}）===
// thumb(n, sz)：sz 为缩略图边长 px，默认 46；无图返回空串（不占位、不报错）
function thumb(n, sz){
  var d=DATA.images[n]; if(!d) return "";
  sz = sz || 46;
  return '<span class="thumb zoom-img" data-zoom-img="'+escHtml(n)+'" style="width:'+sz+'px;height:'+sz+'px;flex:0 0 auto;border-radius:6px;overflow:hidden;background:rgba(139,90,43,.06);border:1px solid var(--line);cursor:zoom-in"><img src="'+d+'" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:contain;display:block"></span>';
}
function thumbS(n){ return thumb(n, 36); }
function zoomImg(n){
  var d=DATA.images[n]; if(!d) return;
  var old=document.querySelector(".imgmodal");
  if(old) old.parentNode.removeChild(old);
  var m=document.createElement("div");
  m.className="imgmodal";
  m.innerHTML='<div class="imgmodal-box"><img src="'+d+'" alt=""><div class="cap">'+h(n)+'</div></div>';
  m.onclick=function(){document.body.removeChild(m);};
  document.body.appendChild(m);
}
// 配图放大：事件委托（data- 属性避开 onclick 里嵌入中文名的引号转义问题）
document.addEventListener("click",function(e){
  var el=e.target.closest("[data-zoom-img]");
  if(!el) return;
  e.stopPropagation();
  zoomImg(el.getAttribute("data-zoom-img"));
});

const escAttr = s => escHtml(s).replace(/"/g,'&quot;');
const BS = '\\';   // 反斜杠（用于判断自洽标记）
// 饮品大杯的字典视图（名称->对象），供 Object.entries 遍历
const DRINK_BIGDICT = DRINK_BIG.reduce((m,b)=>{ m[b.名称]=b; return m; }, {});
const DRINK_BIG_BY_SMALL = DRINK_BIG.reduce((m,b)=>{ if(b.小杯) m[b.小杯]=b; return m; }, {});
CAT.饮品大杯 = DRINK_BIGDICT;   // 覆盖为 dict 视图
const CATBIG = DRINK_BIGDICT;   // 别名
// 饮品大杯的字典视图（名称->对象）。测试用 Object.entries(CAT.饮品大杯) 读取，
// 故在 DRINK_BIG 解析完成后把它替换为 dict 视图。
// 注意：必须先定义 DRINK_BIGDICT 再赋值，否则触发 TDZ。
// ---- 工具 ----
function aspDict(arr){
  const d={};
  if(arr && typeof arr==='object' && !Array.isArray(arr)){
    Object.keys(arr).forEach(k=>{ d[k]=+arr[k]||1; });
    return d;
  }
  (arr||[]).forEach(s=>{ const m=/^([\u4e00-\u9fa5\w]+)×(\d+)$/.exec(s); if(m) d[m[1]]=+m[2]; });
  return d;
}
function demandAspects(){
  const d={};
  const f={}, dr={};
  [...state.visitors].forEach(n=>{
    const v=VIS.find(x=>x.姓名===n); if(!v) return;
    (v.喜欢的食物||[]).forEach(p=>{ const a=p.性相; if(a && a!=='无酒' && a!=='无忌口'){ d[a]=(d[a]||0)+1; f[a]=(f[a]||0)+1; dr[a]=(dr[a]||0)+1; } });
  });
  return {all:d, food:f, drink:dr};
}
function hasAspect(f,n){ return !!(f.产物性相 && f.产物性相[n]); }
// 饮品小杯 -> 大杯反查（同一壶倒两杯，pot 按大杯名计）
function bigOfDrink(name){
  const all = bigOfDrinks(name);
  return all.length > 0 ? all[0] : null;
}
function bigOfDrinks(name){
  const containers = [...(DRINK_BIG||[]), ...(DRINK_HALF||[]), ...(DRINK_NEAR_FULL||[]), ...(DRINK_NEAR_EMPTY||[])];
  let result = containers.filter(b=>b.小杯===name||b.名称===name);
  const alias=DRINK_ALIAS[name];
  if(alias){
    result = result.concat(containers.filter(b=>b.小杯===alias||b.名称===alias));
  }
  return result;
}
function drinkAvailable(name){
  const containers = bigOfDrinks(name);

  let total = 0;
  if(containers.length){
    // 容器饮品：从 pool 读分装库存，减去已上架
    const pool = snapshot();
    containers.forEach(c => {
      const ratio = c.比例 || RAT;
      total += (pool[c.名称] || 0) * ratio;
    });
    const served = state.drinkTable[name] || 0;
    return Math.max(0, total - served);
  } else {
    // 直接饮品：从仓库库存减去已上架数
    return Math.max(0, (state.inv[name] || 0) - (state.drinkTable[name] || 0));
  }
}
function isAlcohol(name){
  const big=bigOfDrink(name);
  return big ? !!(big.含酒精 || (big.类别||[]).includes('烈酒')) : false;
}
function isAlcoBan(salon){
  const s = (SALONS||[]).find(x => x.名称 === salon);
  return !!(s && s.禁烈酒);
}
function dish(n){
  const f=FOODS.find(x=>x.名称===n);
  if(f) return f;
  if(FOODS_MAP && FOODS_MAP[n]) return FOODS_MAP[n];
  // 回退：食材清单里的采集原料（可直接生吃上桌），构造最小菜品对象。
  // 性相来自维基 Data:XXXX.json 的 aspects 字段（中文映射），不是编造。
  const g=INGREDIENTS.find(x=>x.名称===n);
  if(g){
    // 可生吃采集品：按维基分类给分类（前菜/甜点），不是 '食材'
    // 这样正餐分类检查能识别它们
    // raw_eatable 只有 wiki 明确分类的（腌蘑菇/腌沙丁鱼/小莜麦面包）才算分类
    // 其余（水果、蜜、蛋等）是食材，能上桌但不计入正餐分类覆盖
    let cat = '食材';
    let cat2 = null;
    if(RAW_EATABLE.includes(n) && RAW_EATABLE_CATS[n]){
      const cats = RAW_EATABLE_CATS[n];
      cat = Array.isArray(cats) ? cats[0] : cats;
      if(Array.isArray(cats) && cats.length >= 2) cat2 = cats[1];
    }
    const obj = { 名称:n, 分类:cat, 产物性相:g.性相||null, 加工步数:0,
      可获取来源:(g.来源||[]).join('、'), 原始:1, 性相来源:g.性相来源,
      raw_eatable: RAW_EATABLE.includes(n) };
    if(cat2) obj.分类2 = cat2;
    return obj;
  }
  return null;
}
// 中间物品：用于其他菜谱的原料，不能直接上桌
// 判断标准：名称包含"生"、"面糊"、"半成品"等关键词，或分类为"食材"
const INTERMEDIATE_KEYS = ['生面团', '蛋糕面糊', '面糊', '半成品'];
function isIntermediate(name){
  // 生面团、面糊等半成品不能上桌（按名称关键词判断）
  if(INTERMEDIATE_KEYS.includes(name)) return true;
  if(name.includes('生') && !name.includes('生吃')) return true;
  if(name.includes('面糊')) return true;
  if(name.includes('半成品')) return true;
  return false;
}

function tree(n){ return RECIPE_TREES[n] || null; }
function treeNeed(n){ const t=tree(n); return t ? t.原料 : null; }

// 维基已知物品全集（用于校验手动登记的名称是否真实存在）
let _KNOWN = null;
function allKnownItems(){
  if(_KNOWN) return _KNOWN;
  const s = new Set();
  INGREDIENTS.forEach(x=>s.add(x.名称));
  FOODS.forEach(f=>s.add(f.名称));
  DRINK_BIG.forEach(b=>{ s.add(b.名称); if(b.小杯) s.add(b.小杯); });
  DRINK_SMALL.forEach(x=>s.add(x));
  TOOL_ITEMS.forEach(x=>s.add(x));
  Object.keys(RECIPE_TREES).forEach(n=>{
    const t=RECIPE_TREES[n];
    if(t && t.need) Object.keys(t.need).forEach(k=>s.add(k));
  });
  _KNOWN = s;
  return s;
}
// ---- 忌食/忌饮 ----
function bannedCats(){
  const s=new Set();
  [...state.visitors].forEach(n=>{
    const v=VIS.find(x=>x.姓名===n); if(!v||!v.忌食) return;
    v.忌食.split(/[、,，]/).forEach(t=>s.add(t.trim().replace(/食$/,'')));
  });
  return s;
}
function bannedDrinks(){
  const s=new Set();
  [...state.visitors].forEach(n=>{
    const v=VIS.find(x=>x.姓名===n); if(!v||!v.忌饮) return;
    v.忌饮.split(/[、,，]/).forEach(t=>s.add(t.trim().replace(/饮$/,'')));
  });
  return s;
}
function isVill(v){ return !!(v && (v.村民 || (v.身份 && v.身份.includes('村民')))); }

// ---- 备餐池（订单 + 仓库；工具不消耗）----
// 备餐池 = 基础库存（登记+订货）+ 做菜/直接上桌的增减（pool）
// 上架饮品不动 pool：饮品从订货库存出，扣的是待交付订单而不是仓库
function baseOf(k){ return (state.inv[k]||0); }
function poolOf(k){ return (state.pool||{})[k]||0; }
// 当前仓库里实际持有的数量
function stockOf(k){
  let s = baseOf(k) + poolOf(k);
  if(s < 0) s = 0;   // 库存不会为负；负值说明有菜还没下架干净
  return s;
}
function snapshot(){
  const m = {};
  for(const k in state.inv) m[k] = state.inv[k];
  const pool = state.pool || {};
  for(const k in pool) m[k] = (m[k]||0) + pool[k];
  return m;
}

// ---- 菜品筛选 ----
// f: 菜品对象（含 名称/产物性相/加工步数/可获取来源）
function matchDemand(f, n){
  return hasAspect(f, n);
}
// 取菜谱的全部做法变体（兼容两种键名与两种原料字段）
function variantsOf(t){
  const arr = t.variants || t.变体 || [];
  if(arr.length) return arr;
  // 无变体时退回顶层 need
  return [{ need: t.need||{} }];
}
// 变体里的消耗卡牌需求：{卡牌名:数量}
function cardNeedOf(v){
  const out={};
  for(const k in (v.need||{})) out[k]=(v.need[k]||1);
  return out;
}
function canCook(f){
  if(typeof f==='string'){ const g=dish(f); if(!g) return {ok:false, missing:['无此菜']}; f=g; }
  const t=tree(f.名称);
  if(!t) return {ok:false, missing:['无配方树']};
  // 兜底：need 为空且无有效需求性相 → 拒绝（防止解析器漏掉原料时误放行）
  const vs0=variantsOf(t);
  let hasAny=false;
  for(const v of vs0){
    if(Object.keys(cardNeedOf(v)).length){ hasAny=true; break; }
    if(aspReqOf(f.名称)){ hasAny=true; break; }
  }
  if(!hasAny) return { ok:false, missing:['配方数据缺失（need 与需求性相均为空）'] };
  // 取第一个「备料充足」的变体（部分菜谱有多种做法，如生面团：面粉+黄油 或 面粉+奶）
  // 支持中间产物链式展开：生面团不在库存但可用面粉+黄油/奶自制 → 展开检查
  const pool=snapshot();
  const vs=vs0;
  let best=null, bestMiss=null;
  for(const v of vs){
    const need=cardNeedOf(v);
    const miss=checkNeed(need, pool);
    if(miss.length===0) return { ok:true, missing:[], need };
    if(bestMiss===null || miss.length < bestMiss.length){ bestMiss=miss; best=need; }
  }
  return { ok:false, missing:bestMiss, need:best };
}
// 检查 need 是否备料充足；中间产物可用其配方自制 → 递归展开（尝试所有变体）
function checkNeed(need, pool){
  const miss=[];
  for(const k in need){
    if(isTool(k)){
      if(state.tools && state.tools[k]===false){ miss.push(k+'（未解锁）'); continue; }
      continue;
    }
    if((pool[k]||0) >= (need[k]||1)) continue;
    // 库存不足，尝试展开中间产物
    const sub=tree(k);
    if(sub){
      // 尝试所有变体，只要有一个变体的原料都够即可
      const subVs=variantsOf(sub);
      let anyOk=false;
      let bestMiss=null;
      for(const sv of subVs){
        const subNeed=cardNeedOf(sv);
        const subMiss=checkNeed(subNeed, pool);
        if(subMiss.length===0){ anyOk=true; break; }
        if(!bestMiss || subMiss.length < bestMiss.length) bestMiss=subMiss;
      }
      if(anyOk) continue;
      miss.push(k+'（或自制缺：'+(bestMiss||[]).join('、')+'）');
    } else {
      miss.push(k);
    }
  }
  return miss;
}
function canServe(f){
  if(isIntermediate(f.名称)) return false;
  return canCook(f).ok || RAW_EATABLE.includes(f.名称);
}
function filterMatch(f){
  const dn=demandAspects().food;
  return Object.keys(dn).filter(n=>hasAspect(f,n));
}
function byNeed(f){
  const dn=demandAspects().food;
  let s=0;
  Object.keys(dn).forEach(n=>{ if(hasAspect(f,n)) s++; });
  return s;
}
const CATEGORIES = ['前菜','主菜','配菜','甜点'];
function dishCategory(f){
  if(!f) return null;
  const cats = dishCats(f);
  return cats.length > 0 ? cats[0] : null;
}
function dishCats(f){
  if(!f) return [];
  const cats = [];
  if(f.分类 && CATEGORIES.includes(f.分类)) cats.push(f.分类);
  if(f.分类2 && CATEGORIES.includes(f.分类2)) cats.push(f.分类2);
  return cats;
}
// 二级筛选切换（分类/性相，多选）
function toggleCat(c){
  if(state.catFilter.has(c)) state.catFilter.delete(c);
  else state.catFilter.add(c);
  renderAll();
}
function toggleAsp(a){
  if(state.aspFilter.has(a)) state.aspFilter.delete(a);
  else state.aspFilter.add(a);
  renderAll();
}
function applyFilter(items){
  const f=state.filter;
  let list;
  if(f==='match')    list = items.filter(x=>(x.match&&x.match.hits)>0);
  else if(f==='canmake') list = items.filter(x=>canCook(x.f||x.n).ok);
  else if(f==='raw') list = items.slice();
  else list = items.slice();   // sort 默认
  // 二级：分类
  if(state.catFilter && state.catFilter.size > 0){
    list = list.filter(x=>{
      const cats=dishCats(x.f||dish(x.n));
      return cats.length > 0 && cats.some(c => state.catFilter.has(c));
    });
  }
  // 二级：性相（任一命中即保留）
  if(state.aspFilter && state.aspFilter.size > 0){
    list = list.filter(x=>{
      const asp=aspDict((x.f||{}).产物性相);
      if(!asp) return false;
      for(const a of state.aspFilter) if(asp[a]) return true;
      return false;
    });
  }
  // 排序：仅 sort 模式
  if(f==='sort'){
    const hits = x => (x.match && x.match.hits) || 0;
    list.sort((a,b)=>hits(b)-hits(a) || ((a.f||{}).加工步数||0)-((b.f||{}).加工步数||0));
  }
  return list;
}

// ---- 状态 ----
const state = {
  salon:'', visitors:new Set(), inv:{}, cart:{}, pots:{}, pool:{}, locked:false,
  dishTable:{}, drinkTable:{},
  filter:'sort', drinkFilter:'all',
  catFilter:new Set(), aspFilter:new Set(),   // 二级筛选（分类/性相，可多选）
  ratio: RAT, dishRecipe:{},   // {菜名: [每次上桌所用的做法 need]} 供「下架时按同一做法返还」
  // 工具解锁状态：true = 可用（已解锁），false = 不可用（未解锁）
  // 维基「厨房」页需先修复（解锁条件：铸×6 穹×6）才能使用工作台。
  tools: TOOL_ITEMS.reduce((m,t)=>{ m[t]=true; return m; }, {}),
};
// 切换工具可用/不可用（解锁/未解锁）。工具不消耗，只决定相关菜谱能否制作。
function toggleTool(k){
  state.tools[k] = !state.tools[k];
  renderAll();
}

// ---- 做菜 ----
function doCook(name, n){

  n = n || 1;
  const f=dish(name); if(!f){ alert('无此菜'); return; }
  // 上桌不受锁定限制（先上桌后统一结算）
  const treeData=tree(name); if(!treeData){ alert('无配方树：'+name); return; }
  const byproduct=treeData.副产物||{};
  // 与 canCook 一致：取备料充足的一种做法；变体支持（生面团：面粉+黄油 / 面粉+奶）
  const cc=canCook(name); if(!cc.ok){
    alert('原料不足：'+cc.missing.join('、')+'（缺的原料请先订货或登记）');
    return;
  }
  // 展开 need：中间产物用其变体的 need 替换（生面团→面粉+黄油/奶）
  const expandedNeed=expandNeed(cc.need);
  // pool 只记「做菜/直接上桌」的净增减：原料为负、副产物为正
  state.pool = state.pool || {};
  for(let i=0;i<n;i++){
    for(const k in expandedNeed){ if(isTool(k)) continue; state.pool[k]=(state.pool[k]||0)-expandedNeed[k]; }
    for(const k in byproduct){ state.pool[k]=(state.pool[k]||0)+byproduct[k]; }
  }
  // 记录每次上桌所用的做法（展开后的 need），下架时按同一做法返还
  state.dishRecipe = state.dishRecipe || {};
  for(let i=0;i<n;i++) (state.dishRecipe[name]=state.dishRecipe[name]||[]).push(expandedNeed);
  state.dishTable[name] = (state.dishTable[name]||0) + n;
  renderAll();
}
// 副产物集合：烤牛肉→口水油等，副产物不应被 expandNeed 展开（它们是副产物，不是配方）
let _BP_SET = null;
function byproductSet(){
  if(_BP_SET) return _BP_SET;
  _BP_SET = new Set();
  for(const n in RECIPE_TREES){
    const bp = RECIPE_TREES[n].副产物 || {};
    for(const k in bp) _BP_SET.add(k);
  }
  return _BP_SET;
}
// 展开 need：中间产物用其变体的 need 替换（递归）；副产物不展开
// 尝试所有变体，选第一个「原料充足」的（与 canCook 一致）
function expandNeed(need){
  const out={};
  const pool=snapshot();
  for(const k in need){
    if(isTool(k)){ out[k]=(need[k]||1); continue; }
    const sub=tree(k);
    if(sub && !byproductSet().has(k)){
      // 有配方的中间产物（非副产物）：尝试所有变体
      const subVs=variantsOf(sub);
      let expanded=null;
      for(const sv of subVs){
        const subNeed=cardNeedOf(sv);
        if(checkNeed(subNeed, pool).length===0){
          expanded=expandNeed(subNeed);
          break;
        }
      }
      // 回退：第一个变体
      if(!expanded) expanded=expandNeed(cardNeedOf(subVs[0]));
      for(const s in expanded) out[s]=(out[s]||0)+expanded[s];
    } else {
      // 没有配方的食材，或副产物（如口水油）：直接加入
      out[k]=(out[k]||0)+(need[k]||1);
    }
  }
  return out;
}
function doEat(name){
  if(!RAW_EATABLE.includes(name)){ alert('不可生吃：'+name); return; }
  // 采集原料也必须从仓库取——没登记就上桌不成立
  if(stockOf(name) < 1){
    alert('仓库里没有「'+name+'」：先去订货，或在③订货与登记库存里手动登记采集到的原料。');
    return;
  }
  state.dishTable[name] = (state.dishTable[name]||0) + 1;
  state.pool = state.pool || {};
  state.pool[name] = (state.pool[name]||0) - 1;
  renderAll();
}
// 把原料返还进仓库（登记侧），不触碰订货数量
function retMat(name, n, qty){
  for(const k in n){
    if(isTool(k)) continue;
    const q = (n[k]||1)*qty;
    if(!q) continue;
    state.inv[k] = (state.inv[k]||0) + q;
  }
}
function doUncook(name, n){

  n = n || 1;
  const cur = state.dishTable[name]||0;
  if(cur <= 0) return;
  const q = Math.min(n, cur);
  state.dishTable[name] = cur - q;
  if(state.dishTable[name] <= 0) delete state.dishTable[name];
  // 按当初上桌所用的做法返还原料（pool 只记净增减，所以这里对称地加回）
  state.pool = state.pool || {};
  const rec = state.dishRecipe && state.dishRecipe[name];
  if(rec && rec.length){
    for(let i=0;i<q;i++){
      const v = rec.pop();
      if(!v) break;
      for(const k in v){ if(isTool(k)) continue; state.pool[k]=(state.pool[k]||0)+v[k]; }
      // 当初产生的副产物也要收回（如烤牛肉下架 → 收回 1 份口水油）
      const t2=tree(name), bp=(t2&&t2.副产物)||{};
      for(const k in bp) state.pool[k]=(state.pool[k]||0)-bp[k];
    }
  } else {
    // 无记录（旧存档）：退回顶层 need
    const t2=tree(name); const nd=(t2&&t2.need)||{};
    for(const k in nd){ if(isTool(k)) continue; state.pool[k]=(state.pool[k]||0)+(nd[k]||1)*q; }
    const bp=(t2&&t2.副产物)||{};
    for(const k in bp) state.pool[k]=(state.pool[k]||0)-bp[k]*q;
  }
  // 级联：副产物被收回后，依赖它的菜可能备料不足，需一并下架并返还其原料
  cascadeRemove();
  renderAll();
}
// 级联下架：原料用量超过实际持有量的菜，按超出份数下架（返还原料）
// 级联下架：原料用量超过实际持有量的菜，按超出份数下架（返还原料）
// 例：烤牛肉→口水油×1；下架烤牛肉则收回口水油，依赖口水油的菜（炒蛋、奶油炒蛋…）也随之下架。
function cascadeRemove(){

  let guard=0;
  for(const name in Object.assign({},state.dishTable)){
    if(guard++ > 400) break;
    const t2=tree(name); if(!t2) continue;
    const rec = state.dishRecipe && state.dishRecipe[name];
    if(!rec || !rec.length) continue;
    const need = rec[0] || t2.need || {};
    const used={};
    rec.forEach(v=>{ for(const k in v) used[k]=(used[k]||0)+(v[k]||1); });
    let excess=0;
    for(const k in used){
      if(isTool(k)) continue;
      // avail = 库存 + pool + 本菜自身消耗
      // pool 已包含本菜的消耗，需加回 used[k] 以还原"做菜前"的可用量
      const avail = baseOf(k) + poolOf(k) + used[k];
      const over = used[k] - avail;
      if(over > excess) excess = over;

    }

    if(excess <= 0) continue;
    if(excess <= 0) continue;
    // 逐份下架，最多下架 min(excess, 已上桌份数)
    const q = Math.min(Math.floor(excess), rec.length);
    for(let i=0;i<q;i++){
      state.dishTable[name]--;
      const v = rec.pop();
      const nd = v || need;
      for(const k in nd){ if(isTool(k)) continue; state.pool[k]=(state.pool[k]||0)+(nd[k]||1); }
      const bp=t2.副产物||{};
      for(const k in bp) state.pool[k]=(state.pool[k]||0)-bp[k];
    }
    if((state.dishTable[name]||0) <= 0){ delete state.dishTable[name]; state.dishRecipe[name]=[]; }
  }
}

// 上架饮品小杯：扣「订货+登记」里的容器库存（不进 pool —— pool 只记做菜/直接上桌）
function doServeDrink(name, n){
  n = n || 1;
  if(drinkAvailable(name) <= 0){
    const containers = bigOfDrinks(name);
    const hint = containers.length ? '先在③登记壶/瓶/半壶' : '先在③登记库存';
    alert('没有可上架的「'+name+'」：'+hint);
    return;
  }
  state.drinkTable[name] = (state.drinkTable[name]||0) + n;
  renderAll();
}
function doUnserveDrink(name, n){
  n = n || 1;
  const cur = state.drinkTable[name]||0;
  if(cur <= 0) return;
  state.drinkTable[name] = cur - n;
  if(state.drinkTable[name] <= 0) delete state.drinkTable[name];
  renderAll();
}


function stockBy(name, n){
  state.inv[name] = (state.inv[name]||0) + (n||1);
  renderAll();
}
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
// ---- 宴会与访客 ----
function salons(){ return SALONS; }
function pickSalon(k){
  state.salon = k;
  renderAll();
}
function toggleVisitor(n){
  if(state.visitors.has(n)) state.visitors.delete(n);
  else state.visitors.add(n);
  renderAll();
}

// ---- 锁定 ----
// 锁定/解锁机制已移除（用户要求：此机制目前没用上）
function doLock(){ alert('锁定机制已移除'); }
function doUnlock(){ alert('锁定机制已移除'); }
function addOrder(k){
  state.cart[k] = (state.cart[k]||0) + 1;
  renderAll();
}
function delOrder(k){
  if(state.cart[k]>1) state.cart[k]--;
  else delete state.cart[k];
  renderAll();
}
// 手动登记已有库存（采集到的原料、村民送的礼物等，无需走订货流程）
// 库存登记候选物品：按来源分类列出，每项可点 +/− 增减
function stockItems(){
  const cats = [];
  // 采集原料（按分类排列：卵/果实/蔬菜/肉类/其它）
  const rawAll = INGREDIENTS.filter(x => x.获取 === '采集');
  const categories = ['卵','果实','蔬菜','肉类','其它'];
  categories.forEach(cat => {
    const items = rawAll.filter(x => x.分类 === cat).map(x => ({name: x.名称, src: '采集', asp: x.性相}));
    if(items.length) cats.push({title: '采集原料 · '+cat, items: items});
  });
  // 未分类的采集原料
  const uncategorized = rawAll.filter(x => !categories.includes(x.分类)).map(x => ({name: x.名称, src: '采集', asp: x.性相}));
  if(uncategorized.length) cats.push({title: '采集原料（其他）', items: uncategorized});
  // 村民赠送
  const vill = INGREDIENTS.filter(x => x.获取 === '村民').map(x => ({name: x.名称, src: '村民·'+(x.村民||''), asp: x.性相}));
  if(vill.length) cats.push({title: '村民赠送礼物', items: vill});
  // 可订货食材：按公司分组，且只保留真正在食材清单里的商品
  // （剔除金属丝、胶水、一沓纸、烁油等非食材；酒水/咖啡/茶类本身是食材清单成员，保留）
  COMPANIES.forEach(co => {
    const cos = co.商品||[];
    const items = cos
      .filter(it => ING_SET.has(it.名称))
      .map(it => ({name: it.名称, src: (it.价格==null?'订货':it.价格+' 便士'), price: it.价格}));
    if(items.length) cats.push({title: '订货 · '+(co.名称||co.公司), items: items, order: true});
  });
  // 自制食材（中间产物：生面团、面糊、蛋白酥等，需先做出来）
  const selfmade = INGREDIENTS.filter(x => x.获取 === '自制').map(x => ({name: x.名称, src: '自制'}));
  if(selfmade.length) cats.push({title: '自制食材（中间产物）', items: selfmade});
  // 饮品分类登记（按类型分组，每组按基础名列出所有变体）
  const drinkGroups = [
    {title:'饮品 · 特殊', names:['剥皮蜜酒','本征灰酒','沉沦赤慧','蒂尔扎利口酒','黑鸽酒','接骨木利口酒','孔雀石圣餐','奶','蛇乳','圣觪石圣餐','所罗门制剂','淘气蒸馏釜','巫魅药茶','遗忘之水','斫解石圣餐']},
    {title:'饮品 · 茶', names:['C＆H公司夏摘阿萨姆茶','T.R.N.有限公司可可饮料','蓝冠花茶','蜜痂茉莉茶','面纱女神正山小种','浓甜阿萨姆茶','浓甜正山小种','香盏花茶']},
    {title:'饮品 · 咖啡', names:['薄暮群屿咖啡','晨狮牌咖啡']},
    {title:'饮品 · 井水', names:['岛上井水','雾吻之水']},
    {title:'饮品 · 酒', names:['布劳赛良德苹果酒','黑刺李琴酒','拉维林酒庄产酒','罗斯克拉根威士忌','蒲公英酒','斯特拉思科因威士忌','雅宁斯古堡产酒','伊苏产雅文邑']},
    {title:'饮品 · 涩果酒', names:['涩果酒']},
  ];
  const allContainers = [...(DRINK_BIG||[]), ...(DRINK_HALF||[]), ...(DRINK_NEAR_FULL||[]), ...(DRINK_NEAR_EMPTY||[])];
  drinkGroups.forEach(g => {
    const items = [];
    g.names.forEach(base => {
      // 容器（瓶/壶/罐/近满/近空等）
      allContainers.forEach(c => {
        if(c.名称.startsWith(base)) {
          const suffix = c.名称.slice(base.length); // e.g. （一瓶）
          const containerLabel = suffix.replace(/（/,'').replace(/）/,'');
          items.push({name:c.名称, src:'1'+containerLabel+'='+(c.比例||RAT)+'杯'});
        }
      });
      // 小杯（直接上架）
      (DRINK_SMALL||[]).forEach(cup => {
        if(cup.startsWith(base)) {
          items.push({name:cup, src:'直接上架'});
        }
      });
    });
    if(items.length) cats.push({title:g.title, items:items});
  });
  return cats;
}
function addStock(name){
  if(!name) return;
  state.inv[name] = (state.inv[name]||0) + 1;
  renderAll();
}
// 减少已登记库存
function delStock(k){
  if(state.inv[k]>1) state.inv[k]--;
  else delete state.inv[k];
  renderAll();
}
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
function addPot(name, n){
  state.pots[name] = (state.pots[name]||0) + (n||1);
  renderAll();
}

// ---- 配方详情 ----
function safe(s){ return String(s).replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g,'_'); }
function recipeHTML(name){
  const t=tree(name);
  const f=dish(name);
  let out='<div class="rt">';
  out+='<div class="rt-t">配方树：'+h(name)+'</div>';
  if(f){
    out+='<div class="rt-row"><span class="rt-k">产物性相</span><span class="rt-v">'+h(aspStr(aspDict(f.产物性相)))+'</span></div>';
  }
  if(!t){
    out+='<div class="rt-row"><span class="rt-v lack">无配方树 —— 采集原料，可直接生吃上桌</span></div>';
    out+='</div>';
    return out;
  }
  const need=t.need||{};
  const ks=Object.keys(need);
  // 工具与食材分开列
  const tools=ks.filter(k=>isTool(k));
  const mats=ks.filter(k=>!isTool(k));
  out+='<div class="rt-row"><span class="rt-k">备料（消耗卡牌）</span><span class="rt-v">';
  if(mats.length){
    out+=mats.map(k=>h(k)+(need[k]>1?'×'+need[k]:'')).join('、');
  } else if(aspReqOf(name)){
    out+='<span class="lack">无卡牌原料 —— 按性相制作</span>';
  } else if(ks.length){
    out+='<span class="lack">无卡牌原料（仅工具）</span>';
  } else {
    out+='<span class="lack">无卡牌原料（维基未标注配方）</span>';
  }
  out+='</span></div>';
  // 维基「性相原料」需求（不消耗卡牌，用具有该性相的卡牌满足）
  var _aspReq = aspReqOf(name);
  if(_aspReq){
    out+='<div class="rt-row"><span class="rt-k">性相需求（不消耗卡牌）</span><span class="rt-v">';
    out+=_aspReq.map(a=>'<span class="asp-req">'+h(a)+'相</span>').join('');
    out+='</span></div>';
    out+='<div class="rt-tip">原料须带有该性相（用具有该性相的卡牌满足），不消耗卡牌本身。维基原文：合成表「需求性相」列。</div>';
  }
  out+='<div class="rt-row"><span class="rt-k">工具（解锁后不消耗）</span><span class="rt-v">';
  out+=tools.length ? tools.map(k=>h(k)+(state.tools[k]?'<span class="ok">已解锁</span>':'<span class="lack">未解锁</span>')).join('、') : '<span class="lack">无</span>';
  out+='</span></div>';
  // 合计备餐池需求：展开所有变体的需求并合并
  const tot={};
  (t.variants||[]).forEach(v=>{
    Object.keys(need).forEach(k=>{
      // 已解锁工具不消耗备餐池（用户规则：解锁后所有用到的菜谱都不做限制）
      if(TOOL_SET.has(k) && state.tools[k]) return;
      tot[k]=(tot[k]||0)+need[k];
    });
  });
  out+='<div class="rt-row"><span class="rt-k">合计备餐池需求</span><span class="rt-v">';
  if(Object.keys(tot).length){
    out+=Object.keys(tot).map(k=>h(k)+'×'+tot[k]).join('、');
  } else if(aspReqOf(name)){
    out+='<span class="lack">无卡牌消耗（按性相制作）</span>';
  } else {
    out+='<span class="lack">无</span>';
  }
  out+='</span></div>';
  if(t.来源){
    const src = typeof t.来源==='object' ? Object.entries(t.来源).map(([k,v])=>h(k)+'：'+h(v)).join('；') : h(t.来源);
    out+='<div class="rt-row"><span class="rt-k">来源</span><span class="rt-v">'+src+'</span></div>';
  }
  if(t.variants && t.variants.length){
    out+='<div class="rt-row"><span class="rt-k">变体</span><span class="rt-v">'+h(t.variants.length)+' 种</span></div>';
  }
  out+='</div>';
  return out;
}
function toggleDetail(name){
  const d=document.getElementById('detail-'+safe(name));
  if(!d) return;
  if(d.dataset.open==='1'){
    d.dataset.open='0'; d.style.display='none';
    const b=document.querySelector('[data-detail="'+name+'"]');
    if(b) b.textContent='配方详情';
  } else {
    d.dataset.open='1'; d.style.display='block';
    d.innerHTML=recipeHTML(name);
    const b=document.querySelector('[data-detail="'+name+'"]');
    if(b) b.textContent='收起';
  }
}

// ---- 事件绑定（全局，供行内 onclick 调用）----

// 餐桌计数（供外部检查）
function dishCount(){ return Object.values(state.dishTable).reduce((a,b)=>a+(+b||0),0); }
function drinkCount(){ return Object.values(state.drinkTable).reduce((a,b)=>a+(+b||0),0); }
function setFilter(v){
  state.filter = v;
  renderAll();
}

// 饮品小杯的性相（从大杯 准则 反查）
function aspForDrink(name){
  const big=bigOfDrink(name);
  if(big && big.准则) return big.准则;
  return (CAT.INGREDIENT_ASPECTS||{})[name] || null;
}
// 是否烈酒（别名，供外部检查）
function isAlcDrink(name){ return isAlcohol(name); }
// 教诲渲染（别名）
function setDrinkFilter(k){ state.drinkFilter = k; renderDrinks(); }

function visitorAspectNeeds(){
  // Wiki: 访客的性相偏好适用于食物和饮品
  // 一份食物或一份饮品带该性相即可满足偏好
  // 数据里只有 喜欢的食物，没有 喜欢的饮品
  // 所以食物和饮品共享同一组性相需求
  const needs = new Set();
  let noAlcohol = false;
  for(const v of VIS){
    if(!state.visitors.has(v.姓名)) continue;
    (v.喜欢的食物||[]).forEach(p => {
      const a = p.性相;
      if(a === '无酒') { noAlcohol = true; return; }
      if(a === '无忌口' || !a || a==='') return;
      needs.add(a);
    });
  }
  // 食物和饮品共享同一组性相需求
  return {foodAspects: needs, drinkAspects: new Set(needs), noAlcohol};
}

function aspKey(a){
  // 返回性相对象的键集合（用于快速匹配）
  return Object.keys(a).join(',');
}

function renderDrinks(){
  const box=document.getElementById('view-drinks');
  if(!box) return;
  const pool = snapshot();

  // 筛选栏
  let out='<div class="sec">饮品（上架小杯）<i>登记壶/半壶/近满/近空后自动分装，点「上桌」直接上架小杯</i></div>';
  out+='<div class="filterbar">';
  const dfilters=[['all','全部'],['stock','有库存'],['asp','符合访客']];
  Object.keys(ASPECTS).forEach(a=>{
    dfilters.push(['dasp:'+a, a]);
  });
  dfilters.forEach(([k,v])=>{
    out+='<button class="fbt'+(state.drinkFilter===k?' on':'')+'" onclick="setDrinkFilter(\''+escAttr(k)+'\')">'+v+'</button>';
  });
  out+='</div>';
  if(state.salon && isAlcoBan(state.salon)) out+='<div class="filterbar" style="border-color:#c0392b;background:#fdf2f0"><span style="color:#c0392b;font-weight:700;font-size:12px">⚠「'+state.salon+'」禁烈酒 — 请勿上架含「烈酒」的饮品</span></div>';

  // 容器库存摘要（一行显示，不占大版面）
  const allContainers = [...(DRINK_BIG||[]), ...(DRINK_HALF||[]), ...(DRINK_NEAR_FULL||[]), ...(DRINK_NEAR_EMPTY||[])];
  const pots = allContainers.filter(b => (pool[b.名称]||0) > 0);
  if(pots.length){
    let summary = pots.map(b => {
      const pc = pool[b.名称] || 0;
      const ratio = b.比例 || RAT;
      return b.名称+' ×'+pc+'→'+(pc*ratio)+'杯';
    }).join('；');
    out+='<div class="stock-note"><b>容器库存：</b>'+h(summary)+'</div>';
  }

  // 饮品小杯上架列表
  const smalls = DRINK_SMALL.slice().sort();
  out+='<div class="mitems">';
  smalls.forEach(n => {
    const avail = drinkAvailable(n);
    const served = state.drinkTable[n]||0;
    const a = aspForDrink(n);
    // 筛选
    if((state.drinkFilter||'all')==='stock' && avail<=0) return;
    if(state.drinkFilter && state.drinkFilter.startsWith('dasp:')){
      const asp = state.drinkFilter.slice(5);
      if(!a || !a[asp]) return;
    }
    if((state.drinkFilter||'all')==='asp'){
      // 符合访客性相：饮品的性相与访客需求有交集
      const vInfo = visitorAspectNeeds();
      if(!a) return;
      const drinkAsps = Object.keys(a);
      const hasMatch = drinkAsps.some(d => vInfo.drinkAspects.has(d));
      if(!hasMatch) return;
    }
    let banned = state.salon && isAlcoBan(state.salon) && isAlcohol(n);
    out+='<div class="mitem'+(avail>0?' top':'')+(banned?' banned':'')+'">';
    out+=thumb(n);
    out+='<div class="content">';
    out+='<b>'+h(n)+'</b>';
    if(a){Object.entries(a).forEach(function(p){out+='<span class="tag-asp">'+p[0]+'×'+p[1]+'</span>';});}
    if(banned) out+='<span class="tag-alc" style="color:#c0392b;font-weight:700">⚠ 副餐禁用</span>';
    else if(isAlcohol(n)) out+='<span class="tag-alc">烈酒</span>';
    out+='<span class="step">库存 '+avail+' 杯</span>';


    out+='<span class="tn">已上 ×'+served+'</span>';
    out+='<button class="cook" onclick="doServeDrink(\''+escAttr(n)+'\')"' + (avail>0?'':' disabled') +'>上桌</button>';
    out+='</div>';
    out+='</div>';
  });
  out+='</div>';
  box.innerHTML = out;
}


// ---- 饮品上架面板 ----

function renderTeachings(){ renderTeaching(); }

// 规则说明与依据（写入 #notes 面板）
function renderNotes(){
  const box=document.getElementById('notes');
  if(!box) return;
  let out='<div class="sec">① 工具不消耗</div>';
  out+='<p>维基「厨房」页工作台槽位为「原料 / 原料 / 厨具 / 刀」，因此工具只有<b>厨房用碗</b>（维基物品列表 {{卡牌|id=bowls.kitchen}}）与<b>刀</b>（工作台槽位类型 [[刀]]）两项。厨具不计入配方消耗：备餐池准备一份即可，做菜不会扣减。工具只分<b>可用（已解锁）</b>与<b>不可用（未解锁）</b>——可用后所有用到它的菜谱与食材制造均不受限制、不消耗。</p>';
  out+='<p style="color:var(--ink-3);font-size:11.5px">注：「勺」「锅」「香料秤」在维基全文出现 0 次（「香料秤」是含香料性相的物品，并非工具），此前工具清单中的这三项为编造，已删除。厨房本身需先修复才能使用，解锁条件为 铸×6 + 穹×6。</p>';
  out+='<div class="sec">② 数量要求</div>';
  out+='<p>N 位访客需要 N 份菜品 + N 份饮品。一份菜即使满足所有人的性相，其余名额仍需填满——采集来的食材可直接生吃上桌（「可食用素材」），无需加工；饮品按小杯计，大杯（壶）按 1 壶 = 2 杯折算。</p>';
  out+='<div class="sec">③ 村民</div>';
  out+='<p>村民也可被邀请：他们提前送来一份礼物（机制与探索相同，从牌堆随机抽牌）。村民只能占沙龙工作台第 1 个空位，一场沙龙最多邀 1 名村民。邀请一名村民加一位访客办野餐，是前期获取教诲的好办法。</p>';
  out+='<div class="sec">④ 数据来源</div>';
  out+='<p>合成表 / DLC / 沙龙 / 访客 / 订货单目录均取自 boh.huijiwiki.com 的 wikitext（经 MediaWiki API 抓取）。性相 13 种、宴会 5 种（野餐、午前茶、午宴、下午茶、晚宴）、分装比例 1 壶 = 2 杯，均按维基原文。</p>';

  box.innerHTML = out;
}

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

// ---- 渲染 ----
function renderAll(){
  try {
    renderPhasebar();
    renderSalon();
    renderVisitors();
    renderInventory();
    renderOrders();
    renderTable();
    renderMenu();
    renderDrinks();
    renderTeaching();
    renderRef();
    renderNotes();
  } catch(e){
    console.error('renderAll 失败', e);
    alert('渲染失败：' + e.message);
  }
}

// 阶段栏：宴会 → 访客 → 订货 → 锁定 → 做菜 → 上架 → 教诲 → 速查
function renderPhasebar(){
  const steps = [
    ['salon', state.salon ? '宴会：'+state.salon : '1. 选宴会'],
    ['visitors', state.visitors.size ? '访客：'+state.visitors.size+' 位' : '2. 选访客'],
    ['orders', '3. 订货备料'],
    ['cook', '4. 做菜上桌'],
    ['drinks', '5. 饮品上架'],
    ['teaching', '6. 教诲预估'],
    ['ref', '7. 速查表'],
  ];
  let out='<div class="phases">';
  steps.forEach(([k,v])=>{
    out+='<span class="ph '+(k==='salon'&&state.salon?'on':'')+'">'+h(v)+'</span>';
    if(k!=='ref') out+='<span class="ph-sep">›</span>';
  });
  out+='</div>';
  document.getElementById('phasebar').innerHTML = out;
}

function renderSalon(){
  const box=document.getElementById('salons');
  let out='';
  salons().forEach(s=>{
    const on=state.salon===s.名称?' on':'';
    out+='<button class="salon'+on+'" onclick="pickSalon(\''+escAttr(s.名称)+'\')">';
    out+='<b>'+h(s.名称)+'</b>';
    out+='<i>'+h(s.类型==='正餐'?'正餐':(s.时间||s.类型))+'</i>';
    out+='</button>';
  });
  box.innerHTML = out;
}

function renderVisitors(){
  const box=document.getElementById('visitors');
  let out='';
  VIS.forEach(v=>{
    const on=state.visitors.has(v.姓名)?' on':'';
    const vill=isVill(v)?' class="tag-vill"':'';
    const prefs=[];
    (v.喜欢的食物||[]).forEach(p=>prefs.push(p.性相+'×'+p.数量));
    (v.喜欢的饮品||[]).forEach(p=>prefs.push(p.性相+'×'+p.数量));
    out+='<div class="vis'+on+'" onclick="toggleVisitor(\''+escAttr(v.姓名)+'\')">';
    out+=thumb(v.姓名);
    out+='<div class="content">';
    out+='<b>'+h(v.姓名)+'</b>';
    if(isVill(v)) out+='<span class="tag-vill">村民</span>';
    if(v.备注) out+='<span class="tag">'+h(v.备注)+'</span>';
    if(prefs.length) out+='<i>'+h(prefs.join(' / '))+'</i>';
    else out+='<i class="lack">偏好未标注</i>';
    if(v.忌食) out+='<span class="ban">忌'+h(v.忌食)+'</span>';
    if(v.忌饮) out+='<span class="ban">忌'+h(v.忌饮)+'</span>';
    out+='</div>';
    out+='</div>';
  });
  box.innerHTML = out;
  document.getElementById('sum2').textContent = state.visitors.size + ' / ' + VIS.length;
}

function renderInventory(){
  const box=document.getElementById('inv');
  let out='';
  // 工具栏（维基「厨房」页工作台槽位：原料 / 原料 / 厨具 / 刀）
  // 工具不消耗，只分 可用（已解锁）/ 不可用（未解锁）；可用则相关菜谱不受限制。
  if(TOOL_ITEMS.length){
    out+='<div class="toolbox"><div class="th">🔧 工具（不消耗）— 只分可用/不可用，解锁后相关菜谱不受限制、不扣减</div>';
    TOOL_ITEMS.forEach(k=>{
      const on = state.tools[k]!==false;
      out+=`<div class="tool ${on?'on':'locked'}"><b>${h(k)}</b><span class="st">${on?'可用':'不可用'}</span><button class="del" onclick="toggleTool('${escAttr(k)}')">${on?'停用':'启用'}</button></div>`;
    });
    out+='</div>';
  }
  // 仓库物品列表（无锁定，无购物车）
  const pool = snapshot();
  const keys = new Set([...Object.keys(state.inv), ...Object.keys(state.pots||{}), ...Object.keys(state.pool||{})]);
  let hasItem = false;
  keys.forEach(k=>{
    const inv = state.inv[k]||0, pot = state.pots[k]||0;
    const total = pool[k]||0;
    const ptl = (state.pool||{})[k]||0; if(!inv && !pot && !ptl) return;
    out+='<div class="inv">';
    out+=thumb(k,34);
    out+='<b>'+h(k)+'</b>';
    out+='<span class="iv">仓库 '+inv+(pot?' · 壶 '+pot:'')+'</span>';
    out+='<span class="it">备餐池 '+total+'</span>';
    out+='<button class="del" title="减少已登记库存" onclick="delStock(\''+escAttr(k)+'\')">库存−</button>';
    out+='<button class="add" title="手动登记 +1" onclick="stockBy(\''+escAttr(k)+'\',1)">库存+</button>';
    out+='</div>';
    hasItem = true;
  });
  if(!hasItem) out+='<div class="lack">仓库为空。去订货或先备料。</div>';
  box.innerHTML = out;
}


// 订货与库存登记面板：所有物品按来源分组，+/− 直接增减库存
function renderOrders(){
  const box=document.getElementById('order');
  let out='';
  // 所有物品按来源分组，+/− 直接增减库存；不再区分「订单」
  out+='<div class="stockbox"><div class="th">📦 登记已有库存 <i>按来源分组：采集 / 村民 / 订货 / 自制 / 饮品</i><br><span class="stock-hint">所有物品：+ 登记库存，− 减少库存。来源仅作说明，不限制加减。</span></div>';
  stockItems().forEach(cat => {
    out+='<div class="stock-cat">';
    out+='<div class="stock-cat-title">'+h(cat.title)+' <span class="stock-cat-cnt">'+cat.items.length+' 种</span></div>';
    out+='<div class="stock-items">';
    cat.items.forEach(it => {
      const inv = state.inv[it.name] || 0;
      out+='<div class="stock-item'+(inv?' on':'')+'">';
      out+=thumb(it.name,26);
      out+='<b>'+h(it.name)+'</b>';
      if(it.src) out+='<span class="stock-src">'+h(it.src)+'</span>';
      out+='<span class="stock-cnt">'+(inv?'×'+inv:'0')+'</span>';
      out += `<button class="add" title="登记库存 +1" onclick="addStock('${escAttr(it.name)}')">+</button>`;
      out += `<button class="del" title="减少库存" onclick="delStock('${escAttr(it.name)}')"`+(inv?'':' disabled')+`>−</button>`;
      out+='</div>';
    });
    out+='</div>';
    out+='</div>';
  });
  out+='</div>';
  // 导出/导入按钮
  out+='<div class="save-actions">';
  out+='<button class="save-btn" onclick="exportState()">💾 导出配置</button>';
  out+='<button class="save-btn" onclick="importState()">📂 导入配置</button>';
  out+='</div>';
  box.innerHTML = out;
}
function renderTable(){
  const box=document.getElementById('table');
  const dishItems=Object.entries(state.dishTable).filter(([,v])=>v>0);
  const drinkItems=Object.entries(state.drinkTable).filter(([,v])=>v>0);
  const dishTotal=dishItems.reduce((a,[,v])=>a+v,0);
  const drinkTotal=drinkItems.reduce((a,[,v])=>a+v,0);
  const need=state.visitors.size;
  document.getElementById('sum5').textContent = '菜 '+dishTotal+' / 饮 '+drinkTotal;
  let out='';

  // 宴会规则检查
  if(state.salon){
    const sal=SALONS.find(x=>x.名称===state.salon);
    // 禁烈酒（午前茶/下午茶）
    if(sal && sal.禁烈酒){
      const badAlc=drinkItems.filter(([n])=>isAlcohol(n));
      out+='<div class="warn">「'+h(sal.名称)+'」'+(badAlc.length?'已含烈酒 '+h(badAlc.map(x=>x[0]).join('、'))+'，违反禁烈酒规则':'无烈酒，符合规则')+'。</div>';
    }
    // 正餐（午宴/晚宴）必须每类至少 1 道
    if(sal && sal.类型==='正餐'){
      const covered={};
      CATEGORIES.forEach(c=>covered[c]=false);
      dishItems.forEach(([n])=>{
        const f=dish(n);
        dishCats(f).forEach(c=>covered[c]=true);
      });
      const missing=CATEGORIES.filter(c=>!covered[c]);
      if(missing.length===0){
        out+='<div class="ok">「'+h(sal.名称)+'」前菜 / 主菜 / 配菜 / 甜点 各至少 1 道 ✓</div>';
      } else {
        out+='<div class="warn">「'+h(sal.名称)+'」缺少：'+h(missing.join('、'))+'（正餐每类需至少 1 道）</div>';
      }
    }
  }

  // 需求汇总（Wiki: 一份食物/饮品可同时满足多名访客）
  // 食物和饮品的性相需求是独立的
  if(state.visitors.size > 0){
    const vInfo = visitorAspectNeeds();
    const foodNeeded = vInfo.foodAspects;
    const drinkNeeded = vInfo.drinkAspects;
    const noAlcohol = vInfo.noAlcohol;

    // 检查食物性相覆盖（只看菜品）
    const foodCovered = new Set();
    dishItems.forEach(([n,v])=>{
      const f=dish(n);
      if(!f) return;
      const asp = f.产物性相;
      if(asp) Object.keys(asp).forEach(a=>{ foodCovered.add(a); });
    });

    // 检查饮品性相覆盖（只看饮品）
    const drinkCovered = new Set();
    drinkItems.forEach(([n,v])=>{
      const a=aspForDrink(n);
      if(a) Object.keys(a).forEach(x=>{ drinkCovered.add(x); });
    });



    out+='<div class="table-head">';
    out+='<span>餐桌（'+need+' 人）</span>';
    out+='<span>需 菜 '+need+' / 饮 '+need+'</span></div>';

    // 性相需求面板 - 食物和饮品独立检查
    out+='<div class="needs-panel">';
    out+='<div class="sec">访客性相需求</div>';
    if(foodNeeded.size === 0 && drinkNeeded.size === 0 && !noAlcohol){
      out+='<div class="lack">访客无性相偏好（只需满足人头数）。</div>';
    } else {
      // 食物性相需求（由菜品覆盖）
      if(foodNeeded.size > 0){
        out+='<div class="needs-group">';
        out+='<div class="needs-label"><b>🍽 食物性相</b> <span class="needs-hint">由菜品覆盖</span></div>';
        out+='<div class="needs-chips">';
        foodNeeded.forEach(a=>{
          const ok = foodCovered.has(a);
          out+='<span class="need-chip '+(ok?'ok':'lack')+'">'+h(a)+(ok?' ✓':' ✗')+'</span>';
        });
        out+='</div></div>';
      }
      // 饮品性相需求（由饮品覆盖）
      if(drinkNeeded.size > 0 || noAlcohol){
        out+='<div class="needs-group">';
        out+='<div class="needs-label"><b>🥂 饮品性相</b> <span class="needs-hint">由饮品覆盖</span></div>';
        out+='<div class="needs-chips">';
        drinkNeeded.forEach(a=>{
          const ok = drinkCovered.has(a);
          out+='<span class="need-chip '+(ok?'ok':'lack')+'">'+h(a)+(ok?' ✓':' ✗')+'</span>';
        });
        if(noAlcohol){
          const hasAlc = drinkItems.some(([n])=>isAlcohol(n));
          out+='<span class="need-chip '+(hasAlc?'lack':'ok')+'">无酒'+(hasAlc?' ✗':' ✓')+'</span>';
        }
        out+='</div></div>';
      }
    }
    out+='</div>';

    // 数量汇总
    const dishDiff = need - dishTotal;
    const drinkDiff = need - drinkTotal;
    out+='<div class="sec">数量汇总</div>';
    out+='<div class="need-summary">';
    out+='<span class="need-chip '+(dishTotal>=need?'ok':'lack')+'">菜品：'+dishTotal+' / '+need+(dishDiff>0?'（差 '+dishDiff+'）':' ✓')+'</span>';
    out+='<span class="need-chip '+(drinkTotal>=need?'ok':'lack')+'">饮品：'+drinkTotal+' / '+need+(drinkDiff>0?'（差 '+drinkDiff+'）':' ✓')+'</span>';
    const missingFood = [...foodNeeded].filter(a => !foodCovered.has(a));
    const missingDrink = [...drinkNeeded].filter(a => !drinkCovered.has(a));
    if(missingFood.length > 0){
      out+='<span class="need-chip lack">食物缺失：'+missingFood.map(a=>h(a)).join('、')+'</span>';
    }
    if(missingDrink.length > 0){
      out+='<span class="need-chip lack">饮品缺失：'+missingDrink.map(a=>h(a)).join('、')+'</span>';
    }
    const alcoholOk = !noAlcohol || !drinkItems.some(([n])=>isAlcohol(n));
    if(missingFood.length === 0 && missingDrink.length === 0 && alcoholOk && (foodNeeded.size > 0 || drinkNeeded.size > 0)){
      out+='<span class="need-chip ok">性相全部满足 ✓</span>';
    } else if(!alcoholOk){
      out+='<span class="need-chip lack">含烈酒（违反无酒约束）</span>';
    }
    out+='</div>';
  }

  out+='<div class="tcols">';
  out+='<div class="table-col"><h4>🍽 菜品 <b>'+dishTotal+'</b> / 需 '+need+'</h4>';
  dishItems.forEach(([n,v])=>{
    const f=dish(n);
    out+='<div class="tdish">';
    out+=thumb(n,36);
    out+='<div class="content">';
    out+='<b>'+h(n)+'</b>';
    if(f) out+='<i>'+h(aspStr(aspDict(f.产物性相)))+'</i>';
    out+='</div>';
    out+='<span class="tn">×'+v+'</span>';
    out+='<button class="del" onclick="doUncook(\''+escAttr(n)+'\')">下架</button>';
    out+='</div>';
  });
  if(!dishItems.length) out+='<div class="lack">尚未上桌。</div>';
  out+='</div>';
  out+='<div class="table-col"><h4>🥂 饮品（小杯） <b>'+drinkTotal+'</b> / 需 '+need+'</h4>';
  drinkItems.forEach(([n,v])=>{
    const a=aspForDrink(n);
    out+='<div class="tdish'+(isAlcohol(n)?' alc':'')+'">';
    out+=thumb(n,36);
    out+='<div class="content">';
    out+='<b>'+h(n)+'</b>';
    if(a) out+='<i>'+h(aspStr(aspDict(a)))+'</i>';
    if(isAlcohol(n)) out+='<span class="tag-alc">烈酒</span>';
    out+='</div>';
    out+='<span class="tn">×'+v+'</span>';
    out+='<button class="del" onclick="doUnserveDrink(\''+escAttr(n)+'\')">下架</button>';
    out+='</div>';
  });
  if(!drinkItems.length) out+='<div class="lack">尚未上架饮品。</div>';
  out+='</div>';
  out+='</div>';
  
  // 结算按钮
  if(dishTotal >= need && drinkTotal >= need && need > 0){
    out+='<div class="settle-bar">';
    out+='<button class="settle-btn" onclick="settleBanquet()">🏁 结算宴会</button>';
    out+='</div>';
  }
  
  box.innerHTML = out;
}


function renderMenu(){
  const box=document.getElementById('view-menu');
  let out='<div class="filterbar">';
  // 第一行：主筛选（单选）
  const opts=[['sort','按满足度排序'],['match','符合访客性相'],['canmake','可制作'],['raw','可食用素材']];
  opts.forEach(([k,v])=>{
    out+='<button class="fbt'+(state.filter===k?' on':'')+'" onclick="setFilter(\''+escAttr(k)+'\')">'+v+'</button>';
  });
  // 第二行：分类筛选（多选，正餐必用）
  out+='<span class="fs">分类</span>';
  CATEGORIES.forEach(c=>{
    out+='<button class="fbt fbt-cat'+(state.catFilter.has(c)?' on':'')+'" onclick="toggleCat(\''+escAttr(c)+'\')">';out+=c;out+='</button>';
  });
  // 第三行：性相筛选（多选）
  out+='<span class="fs">性相</span>';
  Object.keys(ASPECTS).forEach(a=>{
    out+='<button class="fbt fbt-asp'+(state.aspFilter.has(a)?' on':'')+'" onclick="toggleAsp(\''+escAttr(a)+'\')">';out+=a;out+='</button>';
  });
  out+='</div>';

  // 采集原料单独一栏：可直接生吃上桌，无需加工、无需配方
  // 「可食用素材」筛选只显示仓库里有库存的采集品（没登记的不显示）
  const pool = snapshot();
  const rawItems = RAW_EATABLE
    .filter(n => (pool[n]||0) > 0)
    .map(n => ({ f: dish(n), n, can: true }));
  // 关键：只有 filter='raw' 时才用 rawItems；否则用 menuItems
  const items = state.filter==='raw' ? applyFilter(rawItems) : applyFilter(menuItems());
  if(!items.length){
    out+='<div class="lack">'+(state.filter==='raw' && !rawItems.length ? '仓库中无可食用素材。请在「订货与库存登记」面板登记采集品（鸡蛋、火腿罐头、蘑菇、蜂蜜等）。' : '筛选后无结果。')+'</div>';
  } else {
    items.forEach(x=>{
      const f = x.f || x.n && dish(x.n);
      if(!f) return;
      // 中间物品（生面团、面糊等半成品）不能直接上桌，但显示为「可制作」（供检查原料）
      const isInt = isIntermediate(f.名称) && !RAW_EATABLE.includes(f.名称);
      const can = canCook(f).ok;
      const rawFlag = RAW_EATABLE.includes(f.名称);
      out+='<div class="mitem'+((x.match&&x.match.hits)>0?' top':'')+'">';
      out+=thumb(f.名称);
      out+='<div class="content">';
      out+='<b>'+h(f.名称)+'</b>';
      out+='<i>'+h(aspStr(aspDict(f.产物性相)))+'</i>';
      out+='<span class="step">'+h((tree(f.名称)||{}).步数||0)+' 步</span>';
      if(x.match) out+='<span class="hits">满足 '+x.match.hits+'</span>';
      if(isInt){
        out+='<span class="ok">可制作</span>';
      }
      else if(rawFlag){
        const poolQty = snapshot()[f.名称]||0;
        out+='<span class="ok">可食用素材 · 库存 '+poolQty+'</span>';
      }
      else if(can) out+='<span class="ok">可制作</span>';
      const eatMode = rawFlag && !can;
      const fn = isInt ? null : (eatMode ? 'doEat' : 'doCook');
      if(fn){
        out += `<button class="cook" onclick="${fn}('${escAttr(f.名称)}')"${(can||eatMode)?'':' disabled'}">${eatMode?'直接上桌':'上桌'}</button>`;
      } else {
        out += `<button class="cook" disabled title="半成品，不能上桌">半成品</button>`;
      }
      out+='<button class="det" data-detail="'+escAttr(f.名称)+'" onclick="toggleDetail(\''+escAttr(f.名称)+'\')">配方详情</button>';
      out+='</div>';
      out+='<div class="recipe-detail" id="detail-'+safe(f.名称)+'" style="display:none"></div>';
      out+='</div>';
    });
  }

    box.innerHTML = out;
}

function renderTeaching(){
  const box=document.getElementById('teach');
  const vs=[...state.visitors];
  let out='<div class="sec">教诲预估</div>';
  if(vs.length<2){
    out+='<div class="lack">需至少 2 位访客才有对谈。当前 '+vs.length+' 位。</div>';
    box.innerHTML = out;
    return;
  }
  // 对谈：无向对（C(n,2)）。维基矩阵以 有向 形式存储，故取 |A|,B| 与 |B|,A| 合并。
  const seen=new Set();
  const pairs=[];
  const vill = vs.find(n=>{ const v=VIS.find(x=>x.姓名===n); return v && v.村民; });
  for(let i=0;i<vs.length;i++){
    for(let j=i+1;j<vs.length;j++){
      const a=vs[i], b=vs[j];
      const key=a+'|'+b;
      const r=(TC && TC.对谈) ? (TC.对谈[key] || TC.对谈[b+'|'+a]) : null;
      if(!r) continue;
      const art = (r===BS || r==='自洽') ? '自洽' : h(r);
      seen.add(key);
      pairs.push({ a, b, r: art, self: art==='自洽' });
    }
  }
  out+=`<div class="th">${vs.length} 位访客 = ${vs.length}*(${vs.length}-1)/2 = ${Math.round(vs.length*(vs.length-1)/2)} 组对谈</div>`;
  // 村民 + 访客 野餐 是获取教诲的高效组合
  if(vill && state.salon){
    const isPicnic = state.salon==='野餐';
    out+='<div class="tip">村民 <b>'+h(vill)+'</b> + 访客，办「'+h(state.salon)+'」——'+(isPicnic?'小而快捷的野餐，是前期获取教诲的好办法。':'维基建议改用「野餐」更高效。')+'</div>';
  }
  if(!pairs.length){
    out+='<div class="lack">此组合在维基未标注对谈。</div>';
  } else {
    out+='<div class="thead">已标注 '+pairs.length+' 组对谈 · '+(new Set(pairs.map(p=>p.r))).size+' 项技艺</div>';
    pairs.forEach(p=>{
      out+='<div class="tp'+(p.self?' self':'')+'"><b>'+h(p.a)+'</b> ↔ <b>'+h(p.b)+'</b><span>'+p.r+'</span></div>';
    });
  }
  box.innerHTML = out;
}

// 速查表：性相 + 宴会 + 分装
function renderRef(){
  const box=document.getElementById('view-ref');
  let out='';
  out+='<div class="sec">① 性相（维基原文 13 种）</div>';
  out+='<div class="ref-grid">';
  Object.keys(ASPECTS).forEach(a=>{
    out+='<div class="asp"><b>'+a+'</b><i>'+h(ASPECTS[a])+'</i></div>';
  });
  out+='</div>';
  out+='<div class="note">说明：维基全文 3265 次 <b>{{性相图片|X}}</b> 参数，取值恰好是上面 13 种（心 504 / 蜜 371 / 鳞 320 / 铸 303 / 月 294 / 穹 280 / 杯 259 / 灯 237 / 刃 235 / 启 213 / 蛾 213 / 冬 204 / 引 199）。维基<b>没有</b>「液」或「风」这两种性相——「液体」是物品<b>类别</b>（与 物品/食物/饮品 并列），不是性相。轻风、暴风、飞行的原理写在「穹」的释义里。</div>';

  out+='<div class="sec">② 宴会议程（维基原文 5 种）</div>';
  out+='<div class="ref-grid">';
  SALONS.forEach(s=>{
    out+='<div class="asp"><b>'+h(s.名称)+'</b><i>'+h(s.类型)+' / '+h(s.时间||'')+'</i><br><span class="loc">'+h(s.地点||'')+'</span></div>';
  });
  out+='</div>';

  out+='<div class="sec">③ 通用规则</div>';
  out+='<div class="rule">';
  out+='<p><b>数量要求</b>：N 位访客需 N 份菜品 + N 份饮品。哪怕一份菜满足所有人的性相，其余名额也要用可生吃的采集品填满；饮品同理。</p>';
  out+='<p><b>工具不消耗</b>：厨房用碗、刀是维基「厨房」页工作台的两个工具槽位（原料 / 原料 / 厨具 / 刀），备餐池准备一份即可，做菜不会扣减。只分可用（已解锁）/ 不可用（未解锁），可用后相关菜谱不受限制。</p>';
  out+='<p><b>饮品按小杯上</b>：大杯（壶）按分装比例 1 壶 = 2 杯 折算成小杯，餐桌上只出现小杯。</p>';
  out+='<p><b>村民</b>：村民可被邀请，会提前送来礼物（与探索相同的抽牌机制）。村民只能占沙龙第 1 个空位，一场最多 1 名村民。</p>';
  out+='</div>';
  box.innerHTML = out;
}

// ---- 入口 ----
// ---- 入口 ----
// 脚本位于 body 末尾，DOM 已就绪，直接渲染
renderAll()

// ---- 状态导入/导出 ----
function exportState(){
  const data = {
    version: 1,
    timestamp: Date.now(),
    salon: state.salon,
    visitors: [...state.visitors],
    inv: state.inv,
    cart: state.cart,
    tools: state.tools,
    locked: state.locked,
    dishTable: state.dishTable,
    drinkTable: state.drinkTable,
    pool: state.pool || {},          // 做菜/直接上桌的净增减
    dishRecipe: state.dishRecipe || {}, // 每道菜的每次上桌所用做法
    filter: state.filter,
    drinkFilter: state.drinkFilter,
    catFilter: [...state.catFilter],
    aspFilter: [...state.aspFilter],
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const salonName = state.salon || '未选宴会';
  a.download = '司辰之书_宴会配置_' + salonName + '_' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  alert('配置已导出');
}

function importState(){
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if(!data.salon && !data.visitors && !data.inv){
          alert('文件格式不正确');
          return;
        }
        state.salon = data.salon || '';
        state.visitors = new Set(data.visitors || []);
        state.inv = data.inv || {};
        state.cart = data.cart || {};
        state.tools = data.tools || {};
        state.locked = data.locked || false;
        state.dishTable = data.dishTable || {};
        state.drinkTable = data.drinkTable || {};
        state.filter = data.filter || 'sort';
        state.drinkFilter = data.drinkFilter || 'all';
        state.catFilter = new Set(data.catFilter || []);
        state.aspFilter = new Set(data.aspFilter || []);
        state.pool = data.pool || {};
        state.dishRecipe = data.dishRecipe || {};
        renderAll();
        alert('配置已导入');
      } catch(err){
        alert('导入失败：' + err.message);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function settleBanquet(){
  if(!state.salon){ alert('请先选择宴会'); return; }
  if(state.visitors.size === 0){ alert('请先选择访客'); return; }
  
  const dishTotal = Object.values(state.dishTable).reduce((a,b)=>a+b,0);
  const drinkTotal = Object.values(state.drinkTable).reduce((a,b)=>a+b,0);
  const need = state.visitors.size;
  
  if(dishTotal < need){
    alert('菜品不足：已上 '+dishTotal+' / 需 '+need+'，无法结算');
    return;
  }
  if(drinkTotal < need){
    alert('饮品不足：已上 '+drinkTotal+' / 需 '+need+'，无法结算');
    return;
  }
  
  if(!confirm('结算宴会「'+state.salon+'」？\n\n'+
    '访客 '+need+' 位\n菜品 '+dishTotal+' 道\n饮品 '+drinkTotal+' 杯\n\n'+
    '结算后库存将变为宴会结束后的状态，菜品和饮品记录将清空。')){
    return;
  }
  
  // 结算：当前库存就是宴会结束后的库存
  // dishTable/drinkTable 清空（已上桌的菜品和饮品）
  // locked 重置
  state.dishTable = {};
  state.drinkTable = {};
  state.pool = {};
  // state.inv 保持不变（做菜和上桌已经扣减了）
  
  renderAll();
  alert('宴会已结算！库存已更新为宴会结束后的状态。\n\n可导出保存此配置。');
}
;

