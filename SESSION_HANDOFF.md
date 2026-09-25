# SESSION_HANDOFF — 司辰之书 · 沙龙点菜助手（v4 饮品切换会话）

> v4 — 2026-09-25：饮品逻辑从手填 catalog 表完全切换到维基 Data namespace 驱动。
> 根 `index.html`（= `E:\司辰之书\司辰之书_沙龙点菜助手.html`）**全程未改动**。
> 改动全部在 `src/`、`tools/`、`tests/`、`package.json`。**未推送、未发布。**

---

## 0. v4 完成的核心工作

### 0.1 菜名同步到维基条目页（西梅糕 / 苹果奶油布丁 / 香梨海伦 / 浮岛蛋糕）

维基**条目页**（人工编辑的游戏条目）和**数据页**（机器生成）长期不一致，
4 个争议甜点条目页都带「⚠名称存疑，且与数据页不匹配」标记。条目页名 = 项目菜名，
数据页 Label 是机器名（如 `Prune Whip`）。

维基 2026-07-23 把数据页 `Data:Whip.prune zh.json` 的 Label 改成「李子慕斯」，
更早条目页叫「西梅糕」——两边脱节。

**按用户决定（选 A：条目页名优先）**：本地 `_源数据/_zh/` 缓存里覆盖这 3 个数据页的 Label：

| 卡牌 ID | 数据页旧 Label | 条目页名 = 项目菜名（已应用） |
|---|---|---|
| `whip.prune` | 李子慕斯 | 西梅糕 |
| `apple.charlotte` | 苹果夏洛特蛋糕 | 苹果奶油布丁 |
| `pear.belle.helene` | 梨海伦 | 香梨海伦 |
| `floating.island` | 浮岛蛋糕 | 浮岛蛋糕（本来就一致） |

改完后 `wiki_tags.菜` 键名和 `FOODS` 项目菜名**零差异**，4 个旧名全部移除。

**⚠ 重要**：维基远端没改，改的是本地缓存。下次重抓维基会冲回旧名，需重设。
（`tools/fetch_zh.py` 跑过就把这 3 个 Label 冲回去，得再手动覆盖。）

### 0.2 饮品逻辑切换到维基数据

这是本次会话的主体工作。把饮品从手填 catalog 表彻底切到维基 `_beverage` 卡牌。

**维基饮品数据模型（87 张卡牌）：**

| 项目旧表 | 维基字段 |
|---|---|
| `饮品大杯/半壶/近满/近空`（4 张） | `aspects.distributable === 1` 统一标为容器（48 个） |
| `饮品小杯`（36 项） | `_beverage` 且无 `distributable`（37 个） |
| `小杯`（容器→杯映射） | `xtriggers.dist` 中 `morpheffect==='spawn'` |
| 容器后继（近满→近空） | `xtriggers.dist` 中 `morpheffect==='transform'` |
| `含酒精` | `aspects.intoxicating` |
| `准则`（性相） | `aspects` 中的中文映射性相 |
| **`比例`（分装杯数）** | **维基无此数据**，按项目约定从 ID 后缀推导 |

**比例推导（用户确认按此来）：**

```
bottle.*         = 3 杯     （酒类整瓶）
*.h              = 1 杯     （半壶/半罐）
*.mf             = 2 杯     （近满）
*.me             = 1 杯     （近空）
其余整壶         = 2 杯     （packet/tea/pot/pitcher/甜饮）
```

**已跳过（游戏未实装）**：`pottery.scrumpy.h`（涩果酒半瓶）、`cup.scrumpy`（涩果酒一杯）。

**维基条目页/数据页改名的饮品**（本地 `DRINK_WIKI2PROJ` 映射，用 Unicode 转义防字符混淆）：

| 维基名 | 项目名 | 字符坑 |
|---|---|---|
| 狡黠蒸馏釜 | 淘气蒸馏釜 | — |
| 圣觚石圣餐 | 圣觪石圣餐 | `觚`(0x89da) vs `觪`(0x89ea)，异体字 |
| 黑刺李杜松子酒（一瓶） | 黑刺李琴酒（一瓶） | — |

**饮品种类分组**（茶/咖啡/酒/水/特殊）维基无此字段，保留手填在 `tools/extract_drinks.py`
的 `CATEGORIES` 列表，名字用维基中文名（脚本里校验必须能匹配到）。

### 0.3 删除已无用的手填 catalog 表

app.js 切到维基后，下列 catalog 字段全部不再引用，已从 `src/data.json` 移除：

| 字段 | 条数 | 替代来源 |
|---|---|---|
| `饮品壶` | 26 | wiki_tags.饮品.容器 |
| `饮品大杯` | 25 | 同上 |
| `饮品半壶` | 12 | 同上 |
| `饮品近满` | 8 | 同上 |
| `饮品近空` | 8 | 同上 |
| `饮品小杯` | 36 | wiki_tags.饮品.杯子 |
| `可冲泡` | 5 | 包装形态不入饮品表（见 0.5） |
| `冲泡映射` | 5 | 同上 |
| `饮品别名` | 0 | 删空 |
| `INGREDIENT_ASPECTS` | 16 | CUP_ASP（从维基杯子准则取） |

catalog 剩下：`货币/交期天数/交期说明/分装比例/分装单位/分装说明/公司/食材清单/村民礼物`。

### 0.4 饮品相关逻辑（app.js）

新增 `_buildDrinks()` 函数（`src/app.js` L32-74）：

```js
function _buildDrinks(){
  // 容器：大对象存项目名；杯/后继 保留维基原名（内部查表用）
  // 杯子：set/asp 存项目名
  // drinkBase：Map<维基杯名, 容器[]>，内部查表用维基原名
  // drinkGroups：从 wiki_tags.饮品.类别 生成
}
```

导出：`DRINK_BIG`（容器数组）/ `DRINK_SMALL_ARR`（杯名数组）/ `DRINK_BASE`（分装链 Map）/
`CUP_ASP`（杯性相字典）/ `DRINK_GROUPDATA`（库存登记分组）。

**关键设计点**：`DRINK_BASE` 的 key 用维基原名（匹配容器的 `小杯` 字段），
而 `DRINK_SMALL_ARR`/`CUP_ASP` 用项目名。这样容器→杯的内部查表用维基原名，
外部展示和 `state.drinkTable` 用项目名，避免映射不一致。

### 0.5 可冲泡原料（包装形态）不入饮品表

维基 `packet.tea.assam` 等 5 个「包装」卡牌 `inherits` 是 `_leaf`/`_material`（不是 `_beverage`），
所以维基饮品提取器天然不收它们。

**但它们 `aspects.brewable === 1`，且 `xtriggers.dist` 指向冲泡产物**（`pot.tea.assam` 等）：

```json
"packet.tea.assam": { "inherits": "_leaf", "aspects": {"brewable": 1, ...},
  "xtriggers": {"dist": [{"id": "pot.tea.assam", "morpheffect": "spawn"}]}}
```

**当前未处理**：旧表的 `可冲泡`/`冲泡映射` 已删除，app.js 里 `RAW_INGR` 也删了，
所以「包装→冲泡成壶」这条链路目前**没有维基数据源**。如果 UI 里有「泡一壶茶」功能，
需要重新从 `aspects.brewable` 提取。

---

## 1. 本次会话改动清单

### 1.1 新增文件

| 文件 | 用途 |
|---|---|
| `tools/extract_drinks.py` | 从维基提取饮品模型（容器/杯子/类别/比例），写 `_源数据/_饮品模型.json` |
| `tools/apply_drinks.py` | 把 `_饮品模型.json` 写回 `data.json.wiki_tags.饮品`（支持 `--apply`） |
| `tests/test_drinks.js` | 饮品逻辑功能验证（29 项断言，确认维基数据真的在用） |
| `_源数据/_饮品模型.json` | 提取结果（48 容器 / 37 杯子 / 6 类别 / 2 已跳过） |
| `src/_backups/` | 5 个 data.json 历史备份（已归档，不再散落 src/ 根） |

### 1.2 修改文件

| 文件 | 改动 |
|---|---|
| `src/app.js` | 1473 行。新增 `_buildDrinks()`、`DRINK_WIKI2PROJ`/`DRINK_PROJ2WIKI` 映射表；删 `DRINK_BIGDICT`/`DRINK_BIG_BY_SMALL`/`CATBIG`/`RAW_INGR`；`bigOfDrinks` 改用 `DRINK_BASE.get()`；`stockItems` 饮品分类改用 `DRINK_GROUPDATA`；`aspForDrink` 改用 `CUP_ASP` |
| `src/data.json` | 新增 `wiki_tags.饮品`（容器/杯子/类别/已跳过/规则）；删除 10 个已无引用的 catalog 手填表 |
| `tools/gate.js` | `KNOWN_DIFF` 加 9 个函数、`NEW_FN` 加 `_buildDrinks` |
| `package.json` | 新增 `test:drinks`/`test:all`/`verify` scripts |
| `_源数据/_zh/p138.json` | `whip.prune` Label 覆盖为「西梅糕」 |
| `_源数据/_zh/pXXX.json` | `apple.charlotte` Label 覆盖为「苹果奶油布丁」 |
| `_源数据/_zh/pXXX.json` | `pear.belle.helene` Label 覆盖为「香梨海伦」 |

### 1.3 验证结果

```
npm run test:all   →  test_html 12/12 ✓ + test_drinks 29/29 ✓
npm run gate       →  构建确定、body 一致、95 函数覆盖、10 处已登记变更、1 新增 ✓
npm run check      →  CSS 变量 11/11 ✓
```

**已知问题（不阻断）**：
- `tools/verify-data.js` 报「FOODS 里口水油没有配方树」exit 1（项目原有问题，非本次引入）
- `verify-data.js` 提示图片占数据 91%（5MB base64），建议拆独立文件
- 可冲泡原料链路未处理（见 0.5）

---

## 2. 维基饮品提取规则（提取器内硬编码）

```python
ASP_MAP = {'heart':'心','nectar':'蜜','moon':'月','lantern':'灯','scale':'鳞',
           'forge':'铸','moth':'蛾','winter':'冬','rose':'引','edge':'刃',
           'grail':'杯','knock':'启','sky':'穹'}

# 容器判定
is_container = aspects.get('distributable') == 1

# 杯子判定
is_cup = inherits.startswith('_beverage') and not is_container

# 分装链
spawn_cups = [x['id'] for x in xtriggers.get('dist',[]) if x.get('morpheffect')=='spawn']
successor  = [x['id'] for x in xtriggers.get('dist',[]) if x.get('morpheffect')=='transform']

# 比例（维基无此数据，按项目约定）
ratio_of(wid):
    if wid.endswith('.h'):  return 1
    if wid.endswith('.me'): return 1
    if wid.endswith('.mf'): return 2
    if wid.startswith('bottle.'): return 3
    return 2

# 含酒精
is_alcohol = aspects.get('intoxicating') == 1
```

**性相提取规则**：只取 `ASP_MAP` 里的 key 且值非空；`穹`(sky) 用排除法（见 `extract_food.py`）。

---

## 3. 已知不一致（按用户决定保留）

1. **维基远端数据页 Label 未改**：本地 `_源数据/_zh/` 缓存覆盖了 3 个 Label，
   但维基远端 `Data:Whip.prune zh.json` 等仍是旧名。下次重抓维基需重设。
2. **异体字**：维基用 `觚`(0x89da)，项目用 `觪`(0x89ea)。
   `DRINK_WIKI2PROJ` 用 Unicode 转义 `\u89da`/`\u89ea` 显式区分。
3. **可冲泡原料链路未处理**：`packet.*`（包装茶/咖啡/可可）维基 `aspects.brewable`，
   但 app.js 已删除 `RAW_INGR`。如需「泡一壶」功能，需新建提取逻辑。
4. **口水油没有配方树**：`verify-data.js` 报这个，项目原有问题。

---

## 4. 下一步（未完成）

1. **可冲泡原料链路**（0.5 节）：如果 UI 有「泡一壶」功能，从 `aspects.brewable` 提取
   包装形态到冲泡产物的映射（维基 `xtriggers.dist` 已有数据）。
2. **口水油配方树**：补一个或从 FOODS 移除（verify-data.js 不阻断）。
3. **图片拆分**（可选）：data.json 91% 是 base64 图片，可拆成独立文件减小 JSON.parse 开销。
4. **重抓维基后重设 Label**：跑 `tools/fetch_zh.py` 后需重新覆盖那 3 个数据页 Label。
5. **饮品种类分组可维护性**：`CATEGORIES` 在 `tools/extract_drinks.py` 里手填，
   新增饮品需手动加到对应分组。

---

## 5. 常用命令

```bash
npm run build          # 构建 dist/
npm run test           # 基础渲染测试（12 项）
npm run test:drinks    # 饮品逻辑功能测试（29 项）
npm run test:all       # 两个都跑
npm run check          # CSS 变量检查
npm run verify:data    # 数据结构校验（可能 exit 1 因口水油）
npm run gate           # 构建门禁（必须过才能发布）
npm run lint           # check + verify:data
npm run verify         # lint + test:all + gate
```

**重新生成饮品模型**：
```bash
python tools/extract_drinks.py     # 提取，写 _源数据/_饮品模型.json
python tools/apply_drinks.py --apply  # 写回 data.json
```

**重新生成菜品标签**：
```bash
python tools/extract_food.py       # 提取，写 _源数据/_菜品标签.json
python tools/apply_tags.py --apply  # 写回 data.json
```

---

## 6. 文件清单

```
salon-repo/
├── index.html                  ← 正式版（根目录，MD5 66c8469e...，全程未动）
├── package.json                ← npm scripts
├── SESSION_HANDOFF.md          ← 本文件
├── src/
│   ├── app.js                  ← 1473 行，含 _buildDrinks()
│   ├── data.json               ← 含 wiki_tags.饮品/菜/原材料/食材/生的
│   ├── styles.css              ← 339 行
│   ├── index.html              ← 构建用骨架
│   ├── data.js                 ← data.json 加载器
│   ├── dead-code.js            ← 21 个归档死函数
│   └── _backups/               ← 5 个 data.json 历史备份
├── dist/                       ← 构建输出
├── tools/
│   ├── extract_food.py         ← 菜品标签提取（210 卡牌）
│   ├── extract_drinks.py       ← 饮品模型提取（87 卡牌）★ v4 新增
│   ├── apply_tags.py           ← 菜品标签写回
│   ├── apply_drinks.py         ← 饮品模型写回 ★ v4 新增
│   ├── match_names.py          ← 87 菜品名映射
│   ├── match_beverages.py      ← 饮品变体匹配
│   ├── fetch_wiki.py           ← 维基英文页抓取（Cloudflare UA）
│   ├── fetch_zh.py             ← 维基中文页抓取
│   ├── verify_aspects.py       ← 13 性相映射校验
│   ├── check-css-vars.js       ← CSS 变量检查
│   ├── verify-data.js          ← 数据结构校验
│   ├── gate.js                 ← 构建门禁
│   ├── archive-dead.js         ← 死函数归档
│   └── dedupe-css.js           ← CSS 去重
├── tests/
│   ├── test_html.js            ← 渲染测试（12 项）
│   └── test_drinks.js          ← 饮品逻辑测试（29 项）★ v4 新增
└── _源数据/
    ├── _content/               ← 7843 维基英文数据页
    ├── _zh/                    ← 7540 维基中文数据页
    ├── _菜品标签.json            ← 210 菜品记录
    ├── _饮品模型.json            ← 48 容器 + 37 杯子 ★ v4 新增
    ├── _性相映射.json            ← 13 性相映射
    └── 写回报告.md               ← 菜品映射报告
```
