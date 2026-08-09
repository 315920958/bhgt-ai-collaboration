# BHGT 数据库 Schema 设计文档

> 文档定位：BHGT 项目的数据库 schema 设计权威文档。给 **AI 生成代码** 与 **程序员实现** 看的字段级设计。
> 命名约定：见 `database-naming.md`。
> 维护者：AI 协作 + 用户拍板（2026-08-05 全面重设计）。
> 状态图例：✅ 已实现（S0） ｜ 🎯 S1 落地（设计已定、S1 实施） ｜ 📐 设计前置（schema 已定、不在 S1 实施） ｜ ⏳ 占位（仅字段草样、待后续 sprint 设计）

---

## 1. 通用约定

### 1.1 `code` 业务标识字段
- 每张配置表（`config.*`）和 `game.users` 都有 `code: string` 唯一索引字段
- 用于：业务读写、admin UI、API 引用、debug 日志
- **不参与 FK 关联**
- 例如：`strength` / `rel_01` / `qi_refining` / `infant`

### 1.2 FK 关联规则（**最重要**）
- **凡是有另一张表的，FK 一律用 ObjectId 引用对方 `_id`**
- `code` 字段保留做业务标识，但不参与 FK
- 即使目标表未建（如 `config.cgs`），FK 字段也用 ObjectId 占位；业务侧不写该字段即可
- 例外：`nodeId` / `cgCode` 类历史遗留字符串 FK——若发现，统一改 ObjectId

### 1.3 表名 / 集合命名
- 使用 `.` 分隔（如 `sys.users` / `config.attributes`）
- 二级配置表统一 `config.*` 前缀
- 玩家数据表用 `game.*` 前缀
- 平台相关表用平台缩写前缀（`tt.users` / `wx.users` 等）

### 1.4 字段命名
- snake_case（在 Mongoose schema 里用 camelCase，MongoDB 落库蛇形）
- 示例：`obtainedFrom` / `currentRound` / `unlockedCgs`

### 1.5 时间戳
- 所有表带 `createdAt` / `updatedAt`（Mongoose `timestamps: true`）
- 业务时间字段用 `Date`（如 `obtainedAt` / `startedAt`）

### 1.6 临时状态原则（2026-08-05 确认）
- 数组存储、叠加、单独到期、重生清空（权威清单 §⑥ 暂缓实施）
- 当前 schema 留扩展位 `attributes.sources.tempStatus`

---

## 2. 复用子 Schema

### 2.1 `AttributeEffect`
```ts
{
  attributeId: ObjectId;     // FK → config.attributes._id
  value: number;             // 正/负
}
```
适用：relic 永久加成、talent 永久加成、节点按钮的永久属性变化。

### 2.2 `TimedAttributeEffect`
```ts
{
  attributeId: ObjectId;
  value: number;
  durationNodes?: number;    // 不填 = 永久；>0 = 持续 N 节点到 0 清除
}
```
适用：consumable 持续效果、节点按钮的临时效果。

### 2.3 `TalentEffect`（结构已锁定）
```ts
{
  attributeEffects?: AttributeEffect[];   // 永久属性加成
  specialEffect?: string;                  // 文本描述特殊效果
}
```
后续扩展走数据迁移，不在 schema 里开 flexible 兜底。

---

## 3. 表清单总览

| 表 | 归属 | 状态 | 说明 |
|---|---|---|---|
| `sys.users` | S0 | ✅ 已实现 | 登录账号主表 |
| `tt.users` | S0 | ✅ 已实现 | TapTap 平台账号绑定 |
| `game.users` | S4 | 📐 设计前置 v4 | 玩家角色完整状态（替代 S0 占位） |
| `game.node_records` | S4 | 📐 设计前置 | 副本记录表 |
| `config.attributes` | S1 | 🎯 S1 落地 | 属性（基础/特殊同表） |
| `config.items` | S1 | 🎯 S1 落地 | 物品（3 种 type 区分） |
| `config.talents` | S1 | 🎯 S1 落地 | 天赋列表 |
| `config.talent_qualities` | S1 | 🎯 S1 落地 | 天赋品质 |
| `config.game` | S1 | 🎯 S1 落地 | 全局单例游戏配置 |
| `config.realms` | S3 | 📐 设计前置 | 境界 |
| `config.stages` | S2 | 📐 设计前置 | 大阶段 |
| `config.nodeBundles` | S2 | ✅ 已实现 | 节点包（阶段→节点包→节点 中间层，`/api/admin/node-bundles`） |
| `config.nodes` | S2 | 📐 设计前置 | 副本配置（含 buttons 子文档） |
| `config.minigames` | S5 | ⏳ 占位 | 小游戏配置 |
| `config.shops` | S2/S3 | ⏳ 占位 | 商店商品 |
| `config.battles` | S3 | ✅ 已实现 | 战斗评分档位（`/api/admin/battles`，按 `code` 增删改查） |
| `config.cgs` | S3 | ✅ 已实现 | CG 解锁内容（`/api/admin/cgs`，按 `code` 增删改查） |

---

## 4. S0 已实现

### 4.1 `sys.users`（登录账号主表）

| 字段 | 类型 | 必填 | 唯一 | 说明 |
|---|---|---|---|---|
| `_id` | ObjectId | 是 | 是 | Mongo 自动 |
| `username` | string | 否 | 是（稀疏） | 管理员登录名（如手机号）；仅 `isAdmin=true` 必填 |
| `password` | string \| null | 否 | 否 | SHA1 hex 哈希（无盐） |
| `isAdmin` | boolean | 是 | 否 | 是否管理员 |
| `nickname` | string | 是 | 否 | 显示昵称 |
| `loginCode` | string | 否 | 是（稀疏） | 开发环境万能登录码；正式环境不暴露 `/auth/dev-login` |
| `createdAt` / `updatedAt` | Date | — | — | timestamps |

### 4.2 `tt.users`（TapTap 平台绑定）

| 字段 | 类型 | 必填 | 唯一 | 说明 |
|---|---|---|---|---|
| `_id` | ObjectId | 是 | 是 | |
| `userId` | ObjectId | 是 | 否 | FK → `sys.users._id` |
| `openid` | string | 是 | 是 | TapTap 玩家主键 |
| `unionid` | string | 否 | 否 | 跨应用统一标识 |
| `createdAt` / `updatedAt` | Date | — | — | timestamps |

### 4.3 `game.users`（当前 S0 占位）

仅 4 字段占位：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `_id` | ObjectId | 是 | |
| `userId` | ObjectId | 是 | FK → `sys.users._id` |
| `name` | string | 是 | 角色名 |
| `realm` | string | 是 | 境界（占位字符串） |
| `attrs` | object | 是 | 占位，后续扩展用 |
| `createdAt` / `updatedAt` | Date | — | — |

> **S4 阶段替换为 §6.4 的 v4 设计**。当前 S0 占位字段在 S4 实施前保留。

---

## 5. S1 配置表（落地）

### 5.1 `config.attributes`（属性 · 基础/特殊同表）

| 字段 | 类型 | 必填 | 唯一 | 说明 |
|---|---|---|---|---|
| `_id` | ObjectId | 是 | 是 | |
| `code` | string | 是 | 是 | 业务标识，如 `strength` / `luck` |
| `type` | enum: `basic` \| `special` | 是 | 否 | 基础属性 / 特殊属性 |
| `name` | string | 是 | 否 | 显示名 |
| `description` | string | 否 | 否 | |
| `min` | number | 否 | 否 | 最小值（基础属性建议填） |
| `max` | number | 否 | 否 | 最大值 |
| `defaultValue` | number | 否 | 否 | 玩家创建时该属性的默认值，缺省 0 |

> 悟性 / 任何第三特殊属性都由后台通过此表配置，schema 通用支持，无特殊字段。

### 5.2 `config.items`（物品 · 3 种 type 区分）

通用字段：

| 字段 | 类型 | 必填 | 唯一 | 说明 |
|---|---|---|---|---|
| `_id` | ObjectId | 是 | 是 | |
| `code` | string | 是 | 是 | 业务标识，如 `rel_01` / `con_01` / `plot_01` |
| `type` | enum: `relic` \| `consumable` \| `plot` | 是 | 否 | |
| `name` | string | 是 | 否 | |
| `description` | string | 否 | 否 | |
| `imageUrl` | string | 否 | 否 | |

类型专属 flat 字段（不适用的类型不写入）：

| 字段 | 类型 | 适用类型 | 说明 |
|---|---|---|---|
| `quality` | enum: `common` \| `rare` \| `epic` \| `legendary` | relic | 遗物品质 |
| `permanent` | boolean | relic | 永久保留（重生不消失） |
| `purchasable` | boolean | relic / plot | 可购买 |
| `nodeReward` | boolean | relic / plot | 节点奖励 |
| `consumablePerUse` | number | consumable | 每次消耗数量，默认 1 |
| `maxHold` | number | consumable / plot | 最大持有 |
| `useCondition` | string | consumable | 使用条件（可选） |
| `lifespan` | number | consumable | 寿元增益（独立字段，不放入 `attributes`；消耗品使用增加的寿元） |

**统一属性效果数组**（relic、consumable 使用；plot = `[]`）：

```ts
attributes: [
  {
    attributeId: ObjectId;     // FK → config.attributes._id
    value: number;             // 正/负
    durationNodes?: number;    // 不填 = 永久（relic）；填了 = 临时（consumable）
    kind?: 'buff' | 'debuff'   // UI 标注
  }
]
```

### 5.3 `config.talents`（天赋列表）

| 字段 | 类型 | 必填 | 唯一 | 说明 |
|---|---|---|---|---|
| `_id` | ObjectId | 是 | 是 | |
| `code` | string | 是 | 是 | |
| `name` | string | 是 | 否 | |
| `description` | string | 是 | 否 | |
| `qualityId` | ObjectId | 是 | 否 | FK → `config.talent_qualities._id` |
| `effect` | `TalentEffect` | 是 | 否 | 结构已锁定（见 §2.3） |

```ts
effect: {
  attributeEffects?: AttributeEffect[];   // 永久属性加成
  specialEffect?: string;                  // 文本描述特殊效果
}
```

### 5.4 `config.talent_qualities`（天赋品质）

| 字段 | 类型 | 必填 | 唯一 | 说明 |
|---|---|---|---|---|
| `_id` | ObjectId | 是 | 是 | |
| `code` | string | 是 | 是 | 如 `common` / `rare` / `epic` / `legendary` |
| `name` | string | 是 | 否 | |
| `color` | string | 否 | 否 | 前端展示色 |
| `weight` | number | 否 | 否 | 随机权重 |

### 5.5 `config.game`（全局单例）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `_id` | ObjectId | 是 | 固定值，upsert 维护单例 |
| `basicInfo` | `{ name: string; version: string; description?: string }` | 是 | 游戏基本信息 |
| `openingInit` | `Record<attributeCode, number>` | 是 | 开局初值：仅**属性**（基础/特殊）code → 初始值 |
| `openingResources` | `{ lifespan: number; spiritStone: number }` | 是 | 资源型初值：寿元、灵石（非属性，独立字段） |
| `optionalLimit` | `{ maxTalentCount: number }` | 是 | 可选上限 |
| `completionScoreTiers` | `{ minScore: number; maxScore: number; reward: string }[]` | 是 | 通关评分档位 |
| `battleConfig` | object | 否 | **S1 写入 `{}`，S3 战斗模块再补** |

---

## 6. 设计前置（schema 已定，不在 S1 实施）

### 6.1 `config.realms`（境界）

| 字段 | 类型 | 必填 | 唯一 | 说明 |
|---|---|---|---|---|
| `_id` | ObjectId | 是 | 是 | |
| `code` | string | 是 | 是 | 如 `qi_refining` / `foundation` / `golden_core` |
| `name` | string | 是 | 否 | 如 "练气期" / "筑基期" / "金丹期" |
| `order` | number | 是 | 否 | 排序，1 起递增 |
| `levels` | number | 是 | 否 | 境界内层级数（如练气一~九层 = 9） |
| `progressPerLevel` | number | 是 | 否 | 每层所需修为进度 |
| `breakthrough` | object | 是 | 否 | 突破效果 |

```ts
breakthrough: {
  success: {
    hpBonus: number;             // 成功增加寿元
    attributePoints: number;     // 发放可分配属性点总数
    perAttributeCap: number;     // 单项属性上限
  };
  failure: {
    hpPenalty: number;           // 失败扣寿元
  };
}
```

> `game.users` 当前境界 = `{ realmId, realmLevel, realmProgress }`，进度公式 `realmProgress / realm.progressPerLevel`。

### 6.2 `config.stages`（大阶段）

| 字段 | 类型 | 必填 | 唯一 | 说明 |
|---|---|---|---|---|
| `_id` | ObjectId | 是 | 是 | |
| `code` | string | 是 | 是 | 如 `infant` / `youth` / `qingyun` / `heifeng` / `luoyun` |
| `name` | string | 是 | 否 | 如 "婴幼儿" / "少年" / "青云宗" |
| `order` | number | 是 | 否 | 排序，1 起递增（= 第 N 卷） |
| `description` | string | 否 | 否 | |
| `atmosphere` | string | 否 | 否 | 氛围描述 |
| `mapImageUrl` | string | 否 | 否 | 地图切图 |

> 大阶段 = 第 N 卷（dev-plan §1.1 已确认"阶段即卷"），不单独配置卷名。

### 6.2.1 `config.nodeBundles`（节点包 / 界面称「事件」 · ✅ 已实现）

介于「大阶段」与「剧情节点」之间的中间层，三层结构：**大阶段(stage) → 节点包(nodeBundle) → 剧情节点(node)**。

服务端 collection：`config.nodeBundles`，按 `code` 增删改查（`/api/admin/node-bundles`，见 admin-api.md §16）。

> ⚠️ **双层命名规则（2026-08-07 起）**
> - **代码 / 数据层**：一律称「**节点包(nodeBundle)**」——集合 `config.nodeBundles`、路由 `/node-bundles`、字段 `nodeBundleCode`、组件 `NodeBundleListView` 等都用 nodeBundle，**不得叫「事件」**。
> - **admin 用户可见文案层**：左侧菜单、路由 meta、页面标题 / 按钮 / 列名 / 弹窗 / 表单标签**统一显示「事件」**（纯展示别名，代码标识符不变）。仅改展示文案，不改名代码。

| 字段 | 类型 | 必填 | 唯一 | 说明 |
|---|---|---|---|---|
| `_id` | ObjectId | 是 | 是 | 主键 |
| `code` | string | 是 | 是 | 节点包业务标识（如 `nb_world_01`）。**允许编辑**：更新时若变更 code，服务端校验全局唯一（见 admin-api.md §16.1） |
| `name` | string | 是 | 否 | 节点包名称 |
| `stageId` | ObjectId | 否 | 否 | FK → `config.stages._id`（所属大阶段；导入脚本按阶段编号查得 `_id` 后写入） |
| `description` | string | 否 | 否 | 节点包描述 |
| `createdAt` | Date | 自动 | — | Mongoose timestamps |
| `updatedAt` | Date | 自动 | — | Mongoose timestamps |

> **入口 / 出口节点（动态计算，不落库）**：节点包**不再存储** `entryNodeRef` / `exitNodeRef` / `positionX` / `positionY` / `nextNodeBundleId`（这 5 个字段已于 2026-08-06 删除；图形坐标由前端画图时自行计算，不入库）。入口与出口改为按事件内节点的**按钮指向**动态推导（算法见 §6.3 与 admin-api.md §16.2）：
> - **入口节点** = 本事件内**没有被任何本事件按钮指回**的节点（即它是起点）。
> - **出口节点** = 有按钮指向**非本事件节点**的节点（即它跨事件出边）。
> - `isNormal` = 入口与出口**均非空**；两者任一为空即标记为非正常（如「缺出口」「缺入口」）。
> - 事件间边 = A 的出口节点 → B 的入口节点（经 A 某出口节点的按钮 `nextNodeId` 连到）。

### 6.3 `config.nodes`（副本配置 · 含 buttons 子文档）

```ts
{
  _id: ObjectId,
  code: string,                  // 只读完整编号：`${nodeBundleCode}_${nodeSubCode}`
  name: string,
  stageId: ObjectId,              // FK → config.stages._id（指定 nodeBundleCode 时由事件自动派生）
  nodeBundleCode: string,         // FK → config.nodeBundles.code（节点隶属于事件；Excel 直接填写事件编号）
  nodeSubCode: string,            // 事件内子编号；与 nodeBundleCode 联合唯一
  title: string,
  text: string,
  imageUrl?: string,
  isBattle: boolean,
  buttonCount: number,            // 默认 3
  afterCompletionOpenShop: boolean,

  // 战斗节点才填
  battleConfig?: {
    attributeThresholds: [{
      attributeId: ObjectId,      // FK → config.attributes._id
      minValue: number
    }],
    useLuckCompensation: boolean,
    useRollCount: boolean,
    success: {
      text: string,
      imageUrl?: string,
      effects: object,
      nextNodeIds: string[]      // 目标节点 code[]（战斗结算后跳转；不计入事件图"指向"）
    },
    failure: {
      text: string,
      imageUrl?: string,
      effects: object,
      extraHpDeduction?: number,
      allowAd: boolean,
      adId?: ObjectId,            // FK → config.ads._id (待定)
      adAfterHpDeduction?: boolean,
      adAfterSuccessReward?: boolean,
      adNextNodeIds?: string[]   // 目标节点 code[]（广告续命后跳转；不计入事件图）
    }
  },

  // 按钮（合并入节点，无独立 config.buttons 表）
  buttons: [{
    code: string,
    text: string,
    type: 'normal' | 'minigame',
    minigameId?: ObjectId,        // FK → config.minigames._id
    isRequired: boolean,          // 必现
    weight: number,               // 随机权重
    conditions: object,           // 等级/属性/剧情道具/遗物/CG 条件
    costs: object,                // 灵石/剧情道具消耗
    effects: object,              // 属性/寿元/灵石/物品/CG 变化
    nextNodeId: string,           // 目标节点 `code`（如 `n002`）；按 code 互引，可跨事件（不存 ObjectId / referenceId）
    isOneTime: boolean,
    afterUse: 'hide' | 'disable'
  }]
}
```

> 按钮不存独立表，不在 `game.users` 留引用（`currentNodeButtonResult.buttonIds` 改为 `nodeId` 即可，buttons 通过查节点配置拉）。

> ⚠️ **剧情配置编号引用（2026-08-09 起）**：事件 → 剧情节点的归属字段为 `nodeBundleCode`，直接填写 `config.nodeBundles.code`；节点完整编号 `code` 为只读派生值：`${nodeBundleCode}_${nodeSubCode}`；按钮 → 下一剧情节点使用 `nextNodeId`，直接填写目标 `config.nodes.code`；按钮本身是节点内嵌子文档，不建立独立引用。相关索引：事件/节点 `code` 全局唯一索引、节点 `nodeBundleCode` 普通索引、`{ nodeBundleCode, nodeSubCode }` 联合唯一索引、`buttons.nextNodeId` 多键索引。仅大阶段仍使用 `stageId: ObjectId`，由 Excel 导入脚本按阶段编号查找后写入。
>
> ⚠️ **「指向」只看按钮**：节点 / 事件图的入口出口、事件间边**只依据按钮 `buttons[].nextNodeId`** 计算；战斗结果 `battleConfig.success.nextNodeIds` / `failure.adNextNodeIds` 是战斗结算后的跳转，**不计入**「节点指向 / 事件入口出口 / 事件间边」。

### 6.4 `game.users` v4（完整玩家状态）

> 字段数：约 30 个。按"身份 / 进度 / 属性 / 资源 / 持有 / CG / 节点状态 / 局外成长"8 组。

#### 身份 / 元数据

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `_id` | ObjectId | 是 | |
| `userId` | ObjectId | 是 | FK → `sys.users._id` |
| `name` | string | 是 | 角色名 |
| `gender` | enum: `male` \| `female` \| `other` | 否 | 玩家选择 |
| `age` | number | 是 | 0 起，每回合 +1（Q9 已确认） |
| `createdAt` / `updatedAt` / `rebornAt?` | Date | — | |

#### 进度 / 位置

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `realmId` | ObjectId | 是 | FK → `config.realms._id` |
| `realmLevel` | number | 是 | 1..N |
| `realmProgress` | number | 是 | 当前修为 |
| `stageId` | ObjectId | 是 | FK → `config.stages._id` |
| `nodeId` | ObjectId | 是 | FK → `config.nodes._id` |
| `currentRound` | number | 是 | 本世已用回合 |

#### 属性（v3 · base + sources 字典）

```ts
attributes: {
  // ① 开局初值（一世基准；重生按新一世 openingInit 重置）
  base: Record<attributeCode, number>,

  // 来源叠加字典（6 个来源，⑥ 暂缓）
  sources: {
    relic:      Record<attributeCode, number>;   // ② 遗物总贡献
    talent:     Record<attributeCode, number>;   // ③ 天赋
    consumable: Record<attributeCode, number>;   // ④ 消耗品活跃总效果
    nodeButton: Record<attributeCode, number>;   // ⑤ 节点按钮累计
    allocated:  Record<attributeCode, number>;   // ⑦ 分配属性点
    // tempStatus: Record<attributeCode, number>  // ⑥ 扩展位（schema 当前不实现）
  }
}
```

**战斗判定**：`effectiveValue(attr) = base[attr] + Σ sources.*[attr]`

**重生清空规则**（按权威清单）：

| source | 重生是否保留 | 动作 |
|---|---|---|
| `base` | 不保留 | 按新一世 `config.game.openingInit` 重置 |
| `sources.relic` | 部分保留 | 重新计算（清掉 per-life 后，剩永久保留遗物的贡献） |
| `sources.talent` | 保留 | 不动 |
| `sources.consumable` | 清空 | = `{}` |
| `sources.nodeButton` | 清空 | = `{}` |
| `sources.allocated` | 清空 | = `{}` |

#### 资源

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `hp` | number | 是 | 当前寿元 |
| `maxHp` | number | 是 | 寿元上限 |
| `hpInit` | number | 是 | 本世初始寿元（重生回该值；创建时 = `config.game.openingResources.lifespan`） |
| `spiritStones` | number | 是 | 灵石（= Σ收入 − Σ支出；创建时 = `config.game.openingResources.spiritStone`） |
| `score` | number | 是 | 本世评分点数 |

#### 持有物品（v4 · 单数组 inventory）

```ts
inventory: [{
  itemId: ObjectId,             // FK → config.items._id
  quantity: number,             // relic=1, consumable/plot=N
  obtainedAt: Date,
  obtainedFrom: string,         // 'node:n012' / 'shop:shop_01' / 'relic' / 'start'

  // 消耗品专属：当前活跃效果（3 种时长类型）
  activeEffects?: [{
    attributeId: ObjectId,
    value: number,
    durationType: 'instant' | 'n_nodes' | 'scene_limited',
    remainingNodes?: number,    // durationType='n_nodes' 时填
    sceneKey?: string,          // durationType='scene_limited' 时填
    startedAt: Date
  }]
}]
```

**3 种时长类型处理逻辑**：
- `instant`：使用一次 → 立即生效 → `quantity--` → 不入 `activeEffects`
- `n_nodes`：使用 → 入 `activeEffects` + `remainingNodes = 配置值` → 每过 1 个节点 remainingNodes--，到 0 移除（同步从 `sources.consumable` 扣减）
- `scene_limited`：使用 → 入 `activeEffects` + `sceneKey` → 进入该 scene 前置生效，进入后/结束后移除

> `sources.consumable` = 当前所有 `inventory[].activeEffects` 对各属性的聚合值。

#### CG（带阶段）

```ts
unlockedCgs: [{
  cgId: ObjectId,               // FK → config.cgs._id（✅ 该表已实现 2026-08-06）
  collectedCount: number,       // 阶段（1, 2, 3...）
  firstCollectedAt: Date,
  lastCollectedAt: Date,
  sources: string[]             // 每次收集的来源节点/战斗/小游戏
}]
```

#### 当前节点状态

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `currentNodeButtonResult` | `{ nodeId: ObjectId; rolledAt: Date }` | 否 | 本节点按钮随机筛选结果，重进不刷新 |

> 按钮由 `config.nodes.buttons[]` 加载；`game.users` 不存 `buttonIds` 引用（无独立 buttons 表）。

#### 局外成长（重生保留）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `lifetimeRounds` | number | 是 | 累计回合 |
| `totalRuns` | number | 是 | 累计通关次数 |
| `talentPoints` | number | 是 | 当前可用天赋点 |
| `maxSelectableTalents` | number | 是 | 可选上限（开局 + 通关提升） |
| `selectedTalents` | `[{ talentId: ObjectId; selectedAt: Date; source: 'opening' \| 'cumulative' }]` | 是 | 已选天赋 |
| `unlockedTalents` | `ObjectId[]` | 是 | 已解锁但未选 |
| `permanentRelics` | `[{ relicId: ObjectId; keptFromRun: number; keptAt: Date }]` | 是 | 永久保留遗物（跨世累加） |

> `sources.relic` 运行时 = `Σ(inventory[].itemId → relic)` + `Σ(permanentRelics[].relicId)`。

### 6.5 `game.node_records`（副本记录表）

```ts
{
  _id: ObjectId,
  gameUserId: ObjectId,         // FK → game.users._id
  nodeId: ObjectId,             // FK → config.nodes._id
  firstEnteredAt: Date,
  lastEnteredAt: Date,
  completedAt?: Date,
  status: 'in_progress' | 'success' | 'failure',
  battleResult?: {
    score: number,
    hpDelta: number,
    effectsApplied: object
  },
  buttonsRolled: ObjectId[],    // 本次随机筛选出的按钮子文档引用
  isCurrent: boolean            // 单纯 boolean，不加唯一索引（业务侧保证）
}
```

---

## 7. 配置表补录 / 占位（小游戏 / 商品 待设计；CG / 战斗评分 已实现）

### 7.1 `config.minigames`（小游戏 · S5）
转盘 / 答题 / 炼丹三类，结果档位、配方式结果可配。

### 7.2 `config.shops`（商品 · S2/S3）
引用 `config.items._id`（仅 purchasable=true 的）+ 灵石价格 + 上架/重复购买/每世上限。

### 7.3 `config.battles`（战斗评分档位 · ✅ 已实现 2026-08-06）
定义「血量溢出值」→「评分档位」的阈值映射；全局乘数 `scoreMultiplier` 在 `config.game.battleConfig`。

服务端 collection：`config.battles`，按 `code` 增删改查（`/api/admin/battles`，见 admin-api.md §15）。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `code` | string | 是 | 业务主键，全局唯一（索引） |
| `name` | string | 是 | 档位名称（如「碾压」「险胜」「惜败」） |
| `minExcess` | number | 否（默认 0） | 血量溢出下限（含），即阈值区间下界 |
| `maxExcess` | number | 否（默认 -1） | 血量溢出上限（不含）；`-1` 表示无上限 |
| `score` | number | 否（默认 0） | 该档位对应的评分点数 |
| `createdAt` | Date | 自动 | Mongoose timestamps |
| `updatedAt` | Date | 自动 | Mongoose timestamps |
| `_id` | ObjectId | 自动 | 主键 |

匹配逻辑：战斗结算取 `excess = playerHp - enemyHp`，落入区间 `[minExcess, maxExcess)` 的档位取 `score`；列表按 `minExcess` 升序返回。

### 7.4 `config.cgs`（CG 解锁内容 · ✅ 已实现 2026-08-06）
每张 CG 的图与回看文字；玩家解锁记录挂在 `game.users.unlockedCgs[]`。

服务端 collection：`config.cgs`，按 `code` 增删改查（`/api/admin/cgs`，见 admin-api.md §14）。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `code` | string | 是 | 业务主键，全局唯一（索引） |
| `name` | string | 是 | CG 名称 |
| `thumbnailUrl` | string | 否 | 缩略图 URL（列表 / 卡片用），仅存相对资源域名的路径 |
| `originalUrls` | string[] | 否 | CG 分阶段原图数组，**最多 4 张**（对应第 1~4 阶段），仅存相对资源域名的路径 |
| `placeholderUrl` | string | 否 | 未解锁占位图 URL，仅存相对资源域名的路径 |
| `reviewText` | string | 否 | 回看 / 鉴赏文字 |
| `createdAt` | Date | 自动 | Mongoose timestamps |
| `updatedAt` | Date | 自动 | Mongoose timestamps |
| `_id` | ObjectId | 自动 | 主键 |

> **图片只存相对路径、域名统一配置（全库通用）**：本库**所有**图片字段——CG 的 `thumbnailUrl` / `originalUrls` / `placeholderUrl`，节点的 `imageUrl` 与 `battleConfig.success|failure.imageUrl`，阶段的 `mapImageUrl` / `passImageUrl`，物品的 `imageUrl`——一律只存「相对 OSS 域名的路径」（如 `/cg/x.png`），完整 URL 由前端 `VITE_BHGT_OSS_DOMAIN` 拼接。后台填写时若粘贴完整 URL，前端自动去掉域名只留路径，并实时预览缩略图。换 CDN / OSS 域名时只改该环境变量，无需改数据。字段清单与实现约定见 **admin-api.md §17**。

关联：`game.users.unlockedCgs[].cgId` → `config.cgs._id`（FK，ObjectId 引用对方主键）。

---

## 8. 决策日志（2026-08-05）

| # | 决策 | 依据 |
|---|---|---|
| 1 | 物品合并为单 collection + `type` 区分符 | 用户拍板 |
| 2 | `items.attributes` 统一为单数组（替代 `attributeBonuses` + `effects`） | 用户拍板 |
| 3 | 属性叠加结构 v3（`base` + `sources` 字典，6 个来源） | 用户拍板 + player-modules.md 权威清单 |
| 4 | 持有物品合并为 `inventory[]` 单数组 | 用户拍板 |
| 5 | `permanentRelics[]` 单独保留（不并入 `inventory`） | 用户拍板（语义清晰、重生逻辑解耦） |
| 6 | ⑥ 临时状态数组 设计暂缓，留扩展位 `attributes.sources.tempStatus` | player-modules.md 权威清单 |
| 7 | CG 有阶段（`collectedCount` = 阶段数） | 用户告知 |
| 8 | 副本配置表 vs 副本记录表分离（`config.nodes` + `game.node_records`） | 用户拍板 |
| 9 | 按钮合并入节点（无独立 `config.buttons` 表） | 用户拍板 |
| 10 | 所有 FK 一律 ObjectId 引用对方 `_id`（`code` 不参与 FK） | 用户最终拍板 |
| 11 | `isCurrent` 单纯 boolean，不加唯一索引 | 用户拍板 |
| 12 | `code` 业务标识字段保留，全表唯一索引 | 用户拍板 |
| 13 | 三层结构中间层命名为「节点包(nodeBundle)」而非 event；admin 界面文案显示「事件」 | 用户拍板（双层命名：代码 nodeBundle / 界面 事件） |
| 14 | 节点包删除 `positionX/Y`、`entryNodeRef`、`exitNodeRef`、`nextNodeBundleId` 字段，图形坐标前端画图自算 | 用户拍板（2026-08-06） |
| 15 | 节点互引用 `code`，彻底删除 `referenceId`（含数据库索引与数据）；按钮 `nextNodeId` 填目标节点 code | 用户拍板（2026-08-06） |
| 16 | 「指向」只看按钮 `buttons[].nextNodeId`；战斗结果 `nextNodeIds` 不计入事件图入口出口 / 事件间边 | 用户拍板 |
| 17 | 入口节点 = 本事件内无本事件按钮指向的节点；出口节点 = 有按钮指向非本事件节点的节点 | 用户拍板（驱动事件视图） |
| 18 | 事件(节点包)与节点的 `code` 均允许编辑，更新时服务端做全局唯一校验 | 用户拍板（2026-08-07） |
| 20 | 事件—节点归属改为 `nodeBundleCode`（事件编号）引用；按钮仍内嵌节点，按钮跳转使用节点编号；大阶段继续 ObjectId | 用户拍板（2026-08-09，支持 Excel 编写/导入） |
| 21 | 节点增加事件内 `nodeSubCode`；完整节点编号固定派生为 `${nodeBundleCode}_${nodeSubCode}`，后台只读展示 | 用户拍板（2026-08-09） |
| 19 | CG `originalUrl` 单值改为 `originalUrls: string[]`（最多 4 张分阶段图）；所有图片字段只存相对 OSS 域名的路径，域名由前端 `VITE_BHGT_OSS_DOMAIN` 统一拼接；粘贴完整 URL 时前端自动去域名 | 用户拍板（2026-08-07） |

---

## 9. 待确认 / 开放项

1. **`config.items.attributes[]` 中的 `kind: 'buff' | 'debuff'`**：当前标注为可选，UI 用途。是否需要？后续可由前端根据 `value` 符号自动判断。
2. **`game.users.inventory[].activeEffects` 中 `sceneKey` 的取值规范**：建议用 `'battle:<nodeId>'` / `'minigame:<minigameId>'` 等命名约定，待 S2/S5 设计时确认。
3. **`game.users.currentNodeButtonResult` 当前只存 `nodeId`**：是否需要缓存 `rolledButtons` 快照以防配置变更？待 S2 节点服务化时确认。
4. **`game.users.rebornAt` 字段**：当前设为可选，是否需要保留历史重生时间戳数组（用于后期回放 / 统计）？待 S4 设计时确认。
5. **每种 CG 的最大阶段数**：当前 `collectedCount` 无限递增。本次实现 `config.cgs` 时**未**加 `maxStage` 字段，维持现状；若后期需限制阶段上限，在 `config.cgs` 增 `maxStage` 字段并在解锁逻辑做封顶即可（待 S2/S5 设计确认）。

---

## 10. 文档维护

- 改 schema 必须先改本文件，再改代码
- 字段含义如变更，附 changelog 于此
- 命名规范变更需同步 `database-naming.md`
