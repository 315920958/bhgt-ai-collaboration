# BHGT 后台管理接口文档（v1 · 2026-08-05）

> 文档定位：给**前端管理员后台（bhgt-admin）**与**玩家端（bhgt-h5-client）**对接用的接口权威文档。
> 服务端：bhgt-server（NestJS 11 + Mongoose，端口 4001，前缀 `/api`）。
> 范围：本轮 = S1 后台管理配置 CRUD（5 张配置表）。玩家端接口（`/game/*`）不在本文档范围。
> 配套：数据库 schema 设计见 `database-schema.md`；错误码全表见 `error-code.md`。

---

## 1. 通用约定

### 1.1 基础信息
- Base URL：`http://localhost:4001/api`（开发） / 部署域名（生产，H5 走 TapTap 平台加载）
- 所有响应统一外层结构：

```json
{
  "MESSAGE_BODY": <业务数据 或 { success: true }>,
  "auth": "<token, 登录后才有>",
  "user": {  "<当前用户信息, 登录后才有>"
    "_id": "...",
    "username": "...",
    "isAdmin": true,
    "nickname": "..."
  }
}
```

### 1.2 认证

#### 1.2.1 身份请求头

携带身份信息的请求头名为 **`Authorization`**，固定格式：

```
Authorization: Bearer <token>
```

- `<token>` 由服务端用 **AES-256-GCM** 签发（密钥 `AUTH_AES_KEY`），明文为 `{ userId, exp }`。
- 鉴权**只依赖这个请求头**；本项目不使用 cookie，`credentials` 也未启用，因此跨域不需要 `withCredentials`。

#### 1.2.2 token 从哪来

1. 调登录接口（如 `POST /api/auth/admin-login`），服务端在校验成功后，把加密 token 放在**响应外层**的 `auth` 字段（不是 `MESSAGE_BODY` 里）：

```json
{
  "MESSAGE_BODY": { "id": "...", "username": "admin", "nickname": "超管" },
  "auth": "<AES-256-GCM 加密 token>"
}
```

2. 前端在响应拦截器里读取 `envelope.auth` → 存入 `localStorage`。
3. 之后每次请求，前端请求拦截器自动塞入 `Authorization: Bearer <token>`。

#### 1.2.3 服务端如何校验

服务端 `AuthReadInterceptor` 对**所有接口**都跑（不强制登录，是否强制交给业务拦截器）：

1. 读 `authorization` 头，去掉前缀 `Bearer `（前 7 个字符）得到 token。
2. `decodeToken` 用 `AUTH_AES_KEY` **AES-256-GCM 解密** → 得到 `{ userId, exp }`。
3. 校验 `exp`：过期则抛 `TOKEN_EXPIRED(10003)`。
4. 用 `userId` 查 `sys.users`，命中则把解密后的 token 挂到 `request.auth`、用户对象挂到 `request.user`，供 controller/service 使用。
5. 无 token / 解密失败：仅置 `request.user = null`，**不抛异常**（是否拦截由 `@Public()` 与强制登录拦截器决定）。

#### 1.2.4 哪些接口免登录

- 标注 `@Public()` 的接口跳过强制登录校验（如 `admin-login` 自身）。
- 本文档中的后台管理 CRUD（`/api/admin/*` 下的 shops/realms/admins/players 等）**不存在 `@Public()`**，调用前必须先 `admin-login` 拿到 token。

#### 1.2.5 dev 联调跳过鉴权

- 仅 dev / test 环境可用：HTTP 头加 `x-skip-auth: 1`，让接口跳过 token 校验（用于 Postman / 脚本直连调试）。
- 生产环境（production）此开关无效，必须携带合法 `Authorization`。

#### 1.2.6 跨域

- CORS 已把 `Authorization` 列入允许请求头，跨域带此头不会触发预检拦截。
- 当前 CORS 策略为反射来源（`origin: true`），即请求来自哪个域名就回显哪个，开发与多域名部署均无需额外配置。

### 1.3 错误处理
- 失败响应：`{ MESSAGE_BODY: <msg>, errCode: <number>, auth?, user? }`
- 常见错误码：
  - `10001` PARAM_INVALID 参数无效
  - `10002` UNAUTHORIZED 未登录
  - `10003` TOKEN_EXPIRED 登录过期
  - `10004` FORBIDDEN 无权限
  - `10005` USER_NOT_FOUND 用户不存在
  - `10006` PASSWORD_MISMATCH 密码错误
  - `10007` NOT_FOUND 资源不存在
  - `50000` SERVER_ERROR 服务器内部错误

### 1.4 路由前缀
- 后台管理接口统一 `/api/admin/*`
- 玩家端接口 `/api/game/*`（不在本文档）

### 1.5 业务标识与 FK
- 业务读写用 `code`（字符串，唯一索引，如 `strength` / `rel_01`）
- 跨表 FK 用 ObjectId 字符串（如 `attributeId`、`qualityId`）
- 时间字段 ISO 8601 字符串

### 1.6 字段命名
- JSON 字段命名与 Mongoose schema 字段名一致（camelCase）
- 如 `code` / `name` / `description` / `min` / `max` / `qualityId` / `attributes`

---

## 2. 属性接口 `config.attributes`

### 2.1 字段规范

| 字段 | 类型 | 必填 | 唯一 | 说明 |
|---|---|---|---|---|
| `code` | string | 是 | 是 | 业务标识，如 `strength` / `luck` |
| `type` | enum | 是 | 否 | `basic`（基础属性）/ `special`（特殊属性） |
| `name` | string | 是 | 否 | 显示名 |
| `description` | string | 否 | 否 | 说明 |
| `min` | number | 否 | 否 | 最小值（基础属性建议填） |
| `max` | number | 否 | 否 | 最大值 |
| `defaultValue` | number | 否 | 否 | 玩家创建时该属性的默认值，缺省 0 |

---

### 2.2 列表

```
GET /api/admin/attributes?type=basic
```

**Query 参数**：
- `type`（可选）：`basic` / `special`，不传则全部

**响应** `MESSAGE_BODY`：
```json
[
  { "_id": "66...", "code": "strength", "type": "basic", "name": "根骨", "description": "", "min": 0, "max": 100, "defaultValue": 30, "createdAt": "...", "updatedAt": "..." },
  { "_id": "66...", "code": "luck", "type": "special", "name": "气运", "description": "", "createdAt": "...", "updatedAt": "..." }
]
```

---

### 2.3 详情

```
GET /api/admin/attributes/:code
```

**Path 参数**：
- `code`：业务标识

**响应** `MESSAGE_BODY`：单条属性对象（同列表元素）

**错误**：`10007 NOT_FOUND`（属性不存在）

---

### 2.4 新增

```
POST /api/admin/attributes
```

**Body**：
```json
{
  "code": "strength",
  "type": "basic",
  "name": "根骨",
  "description": "先天根骨，影响战斗判定",
  "min": 0,
  "max": 100,
  "defaultValue": 30
}
```

**响应** `MESSAGE_BODY`：新增的属性对象

**错误**：
- `10001 PARAM_INVALID`（缺 code / 类型 / 名称 / type 非法 / code 重复）
- `10001 PARAM_INVALID`（attributeId 找不到 — 当属性被引用时）

---

### 2.5 更新

```
PUT /api/admin/attributes/:code
```

**Path 参数**：
- `code`：业务标识

**Body**（全字段可选）：
```json
{
  "name": "根骨",
  "description": "...",
  "min": 0,
  "max": 100,
  "defaultValue": 30,
  "type": "basic"
}
```

**响应** `MESSAGE_BODY`：更新后的属性对象

**错误**：`10007 NOT_FOUND` / `10001 PARAM_INVALID`

---

### 2.6 删除

```
DELETE /api/admin/attributes/:code
```

**响应** `MESSAGE_BODY`：`{ success: true }`

**错误**：`10007 NOT_FOUND`

---

## 3. 物品接口 `config.items`

### 3.1 字段规范

**通用字段**：

| 字段 | 类型 | 必填 | 唯一 | 说明 |
|---|---|---|---|---|
| `code` | string | 是 | 是 | 业务标识，如 `rel_01` / `con_01` / `plot_01` |
| `type` | enum | 是 | 否 | `relic` / `consumable` / `plot` |
| `name` | string | 是 | 否 | 名称 |
| `description` | string | 否 | 否 | 说明 |
| `imageUrl` | string | 否 | 否 | 图片链接 |

**relic 专属**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `quality` | enum | 否 | `common` / `rare` / `epic` / `legendary` |
| `permanent` | boolean | 否 | 永久保留（重生不消失），默认 false |
| `purchasable` | boolean | 否 | 可购买，默认 false |
| `nodeReward` | boolean | 否 | 节点奖励，默认 false |

**consumable 专属**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `consumablePerUse` | number | 否 | 每次消耗数量，默认 1 |
| `maxHold` | number | 否 | 最大持有 |
| `useCondition` | string | 否 | 使用条件（文本描述） |

**plot 专属**：`purchasable` / `nodeReward` / `maxHold`（复用上面）

**统一属性效果数组**（relic / consumable 用，plot 默认 `[]`）：

```ts
attributes: [
  {
    attributeId: string;       // ObjectId, FK → config.attributes._id
    value: number;             // 正/负
    durationNodes?: number;    // 不填 = 永久（relic）；填了 = 持续 N 节点（consumable）
    kind?: 'buff' | 'debuff'   // UI 标注
  }
]
```

---

### 3.2 列表

```
GET /api/admin/items?type=relic
```

**Query 参数**：
- `type`（可选）：`relic` / `consumable` / `plot`

**响应** `MESSAGE_BODY`：物品对象数组

**示例响应元素**：
```json
{
  "_id": "66...",
  "code": "rel_01",
  "type": "relic",
  "name": "凡骨之心",
  "description": "平凡中的不凡",
  "imageUrl": "...",
  "quality": "common",
  "permanent": false,
  "purchasable": true,
  "nodeReward": true,
  "attributes": [
    { "attributeId": "66...", "value": 5, "kind": "buff" }
  ],
  "createdAt": "...",
  "updatedAt": "..."
}
```

---

### 3.3 详情

```
GET /api/admin/items/:code
```

**响应** `MESSAGE_BODY`：单条物品对象

**错误**：`10007 NOT_FOUND`

---

### 3.4 新增

```
POST /api/admin/items
```

**Body（relic 示例）**：
```json
{
  "code": "rel_01",
  "type": "relic",
  "name": "凡骨之心",
  "description": "平凡中的不凡",
  "imageUrl": "https://...",
  "quality": "common",
  "permanent": false,
  "purchasable": true,
  "nodeReward": true,
  "attributes": [
    { "attributeId": "66abc...", "value": 5, "kind": "buff" }
  ]
}
```

**Body（consumable 示例）**：
```json
{
  "code": "con_01",
  "type": "consumable",
  "name": "回春丹",
  "description": "回复 10 点寿元",
  "consumablePerUse": 1,
  "maxHold": 5,
  "useCondition": "无限制",
  "attributes": [
    { "attributeId": "66abc_hp", "value": 10 }
  ]
}
```

**Body（plot 示例）**：
```json
{
  "code": "plot_01",
  "type": "plot",
  "name": "引荐函",
  "description": "青云宗入门凭证",
  "purchasable": true,
  "nodeReward": true,
  "maxHold": 1,
  "attributes": []
}
```

**响应** `MESSAGE_BODY`：新增的物品对象

**错误**：`10001 PARAM_INVALID`（type 非法 / quality 非法 / code 重复 / 缺必填字段）

---

### 3.5 更新

```
PUT /api/admin/items/:code
```

**Body**（全字段可选）：
```json
{
  "name": "...",
  "description": "...",
  "imageUrl": "...",
  "quality": "rare",
  "permanent": true,
  "purchasable": true,
  "nodeReward": true,
  "attributes": [
    { "attributeId": "66...", "value": 8 }
  ],
  "type": "relic"
}
```

**响应** `MESSAGE_BODY`：更新后的物品对象

**错误**：`10007 NOT_FOUND` / `10001 PARAM_INVALID`

---

### 3.6 删除

```
DELETE /api/admin/items/:code
```

**响应** `MESSAGE_BODY`：`{ success: true }`

**错误**：`10007 NOT_FOUND`

---

## 4. 天赋接口 `config.talents`

### 4.1 字段规范

| 字段 | 类型 | 必填 | 唯一 | 说明 |
|---|---|---|---|---|
| `code` | string | 是 | 是 | 业务标识 |
| `name` | string | 是 | 否 | 名称 |
| `description` | string | 是 | 否 | 说明 |
| `qualityId` | string | 是 | 否 | **ObjectId**，FK → `config.talent_qualities._id` |
| `effect` | object | 是 | 否 | `TalentEffect` 结构（见下） |

**`TalentEffect` 结构**：
```ts
{
  attributeEffects?: [
    { attributeId: string; value: number }   // ObjectId, FK → config.attributes._id
  ];
  specialEffect?: string;   // 文本描述特殊效果
}
```

---

### 4.2 列表

```
GET /api/admin/talents
```

**响应** `MESSAGE_BODY`：天赋对象数组

**示例响应元素**：
```json
{
  "_id": "66...",
  "code": "tal_01",
  "name": "凡骨之心",
  "description": "先天根基，魅力更甚",
  "qualityId": "66abc_qfan",
  "effect": {
    "attributeEffects": [
      { "attributeId": "66abc_charm", "value": 5 }
    ],
    "specialEffect": "突破时额外获得 1 点天赋点"
  },
  "createdAt": "...",
  "updatedAt": "..."
}
```

---

### 4.3 详情

```
GET /api/admin/talents/:code
```

**响应** `MESSAGE_BODY`：单条天赋对象

**错误**：`10007 NOT_FOUND`

---

### 4.4 新增

```
POST /api/admin/talents
```

**Body**：
```json
{
  "code": "tal_01",
  "name": "凡骨之心",
  "description": "先天根基，魅力更甚",
  "qualityId": "66abc_qfan",
  "effect": {
    "attributeEffects": [
      { "attributeId": "66abc_charm", "value": 5 }
    ],
    "specialEffect": "突破时额外获得 1 点天赋点"
  }
}
```

**响应** `MESSAGE_BODY`：新增的天赋对象

**错误**：`10001 PARAM_INVALID`（缺 code / name / description / qualityId / effect）

---

### 4.5 更新

```
PUT /api/admin/talents/:code
```

**Body**（全字段可选）：
```json
{
  "name": "...",
  "description": "...",
  "qualityId": "66...",
  "effect": {
    "attributeEffects": [
      { "attributeId": "66...", "value": 8 }
    ],
    "specialEffect": "..."
  }
}
```

**响应** `MESSAGE_BODY`：更新后的天赋对象

**错误**：`10007 NOT_FOUND` / `10001 PARAM_INVALID`

---

### 4.6 删除

```
DELETE /api/admin/talents/:code
```

**响应** `MESSAGE_BODY`：`{ success: true }`

**错误**：`10007 NOT_FOUND`

---

## 5. 天赋品质接口 `config.talent_qualities`

### 5.1 字段规范

| 字段 | 类型 | 必填 | 唯一 | 说明 |
|---|---|---|---|---|
| `code` | string | 是 | 是 | 如 `common` / `rare` / `epic` / `legendary` |
| `name` | string | 是 | 否 | 显示名 |
| `color` | string | 否 | 否 | 前端展示色（hex，如 `#B5B0A5`） |
| `weight` | number | 否 | 否 | 随机权重 |

---

### 5.2 列表

```
GET /api/admin/talent-qualities
```

**响应** `MESSAGE_BODY`：品质对象数组

---

### 5.3 详情

```
GET /api/admin/talent-qualities/:code
```

**响应** `MESSAGE_BODY`：单条品质对象

**错误**：`10007 NOT_FOUND`

---

### 5.4 新增

```
POST /api/admin/talent-qualities
```

**Body**：
```json
{
  "code": "common",
  "name": "凡",
  "color": "#B5B0A5",
  "weight": 60
}
```

**响应** `MESSAGE_BODY`：新增的品质对象

**错误**：`10001 PARAM_INVALID`

---

### 5.5 更新

```
PUT /api/admin/talent-qualities/:code
```

**Body**（全字段可选）：
```json
{
  "name": "凡品",
  "color": "#...",
  "weight": 70
}
```

**响应** `MESSAGE_BODY`：更新后的品质对象

**错误**：`10007 NOT_FOUND` / `10001 PARAM_INVALID`

---

### 5.6 删除

```
DELETE /api/admin/talent-qualities/:code
```

**响应** `MESSAGE_BODY`：`{ success: true }`

**错误**：`10007 NOT_FOUND`

---

## 6. 全局游戏配置接口 `config.game`

### 6.1 字段规范

```ts
{
  code: 'global',                 // 固定值
  basicInfo: {
    name: string;                 // 游戏名
    version: string;              // 版本
    description?: string;         // 描述
  };
  openingInit: Record<string, number>;   // 仅属性 code → 初始值（基础/特殊属性）
  openingResources: {                    // 资源型初值（寿元、灵石），非属性
    lifespan: number;                    // 初始寿元，对应 game.users.hpInit
    spiritStone: number;                 // 初始灵石，对应 game.users.spiritStones
  };
  optionalLimit: { maxTalentCount: number };
  completionScoreTiers: [
    { minScore: number; maxScore: number; reward: string; }
  ];
  battleConfig: object;            // S1 阶段 = {} 占位，S3 战斗模块再补
}
```

---

### 6.2 详情（单例）

```
GET /api/admin/game-config
```

**响应** `MESSAGE_BODY`：
```json
{
  "code": "global",
  "basicInfo": { "name": "仙途问道", "version": "v0.1 MVP", "description": "..." },
  "openingInit": { "strength": 10, "luck": 0 },
  "openingResources": { "lifespan": 100, "spiritStone": 100 },
  "optionalLimit": { "maxTalentCount": 3 },
  "completionScoreTiers": [
    { "minScore": 0, "maxScore": 49, "reward": "天赋点+1" },
    { "minScore": 50, "maxScore": 79, "reward": "天赋点+2" },
    { "minScore": 80, "maxScore": 100, "reward": "天赋点+3" }
  ],
  "battleConfig": {}
}
```

> 本接口是 upsert：第一次调用会自动创建默认文档。

---

### 6.3 更新（部分字段）

```
PUT /api/admin/game-config
```

**Body**（全字段可选，按需更新）：
```json
{
  "basicInfo": { "name": "仙途问道", "version": "v0.2", "description": "..." },
  "openingInit": { "strength": 12, "luck": 0 },
  "openingResources": { "lifespan": 100, "spiritStone": 100 },
  "optionalLimit": { "maxTalentCount": 4 },
  "completionScoreTiers": [
    { "minScore": 0, "maxScore": 49, "reward": "天赋点+1" },
    { "minScore": 50, "maxScore": 79, "reward": "天赋点+2" },
    { "minScore": 80, "maxScore": 100, "reward": "天赋点+3" }
  ],
  "battleConfig": {}
}
```

**响应** `MESSAGE_BODY`：更新后的全局配置对象

**错误**：`50000 SERVER_ERROR`（极端情况）

---

## 7. 完整接口列表

| 方法 | 路径 | 说明 |
|---|---|---|
| **属性** | | |
| GET | `/api/admin/attributes` | 列表（可按 type 过滤） |
| GET | `/api/admin/attributes/:code` | 详情 |
| POST | `/api/admin/attributes` | 新增 |
| PUT | `/api/admin/attributes/:code` | 更新 |
| DELETE | `/api/admin/attributes/:code` | 删除 |
| **物品** | | |
| GET | `/api/admin/items` | 列表（可按 type 过滤） |
| GET | `/api/admin/items/:code` | 详情 |
| POST | `/api/admin/items` | 新增 |
| PUT | `/api/admin/items/:code` | 更新 |
| DELETE | `/api/admin/items/:code` | 删除 |
| **天赋** | | |
| GET | `/api/admin/talents` | 列表 |
| GET | `/api/admin/talents/:code` | 详情 |
| POST | `/api/admin/talents` | 新增 |
| PUT | `/api/admin/talents/:code` | 更新 |
| DELETE | `/api/admin/talents/:code` | 删除 |
| **天赋品质** | | |
| GET | `/api/admin/talent-qualities` | 列表 |
| GET | `/api/admin/talent-qualities/:code` | 详情 |
| POST | `/api/admin/talent-qualities` | 新增 |
| PUT | `/api/admin/talent-qualities/:code` | 更新 |
| DELETE | `/api/admin/talent-qualities/:code` | 删除 |
| **全局配置** | | |
| GET | `/api/admin/game-config` | 单例详情 |
| PUT | `/api/admin/game-config` | 更新 |
| **管理员账号** | | |
| GET | `/api/admin/admins` | 管理员列表 |
| GET | `/api/admin/admins/:id` | 管理员详情 |
| POST | `/api/admin/admins` | 新增管理员 |
| PUT | `/api/admin/admins/:id` | 编辑管理员 |
| DELETE | `/api/admin/admins/:id` | 删除管理员 |
| **玩家** | | |
| GET | `/api/admin/players` | 玩家（游戏角色）列表 |
| POST | `/api/admin/players/test` | 增加测试玩家 |
| **剧情节点** | | |
| GET | `/api/admin/nodes` | 节点列表（可按 `stageId` / `isBattle` / `nodeBundleCode` 过滤） |
| GET | `/api/admin/nodes/:code` | 节点详情 |
| POST | `/api/admin/nodes` | 新增节点 |
| PUT | `/api/admin/nodes/:code` | 更新节点 |
| DELETE | `/api/admin/nodes/:code` | 删除节点 |
| **节点包** | | |
| GET | `/api/admin/node-bundles` | 节点包列表（可按 `stageId` 过滤） |
| GET | `/api/admin/node-bundles/graph` | 事件级路径图（各事件入口/出口/跨事件边） |
| GET | `/api/admin/node-bundles/:code` | 节点包详情 |
| GET | `/api/admin/node-bundles/:code/nodes` | 单事件内节点连接图 |
| POST | `/api/admin/node-bundles` | 新增节点包 |
| PUT | `/api/admin/node-bundles/:code` | 更新节点包 |
| DELETE | `/api/admin/node-bundles/:code` | 删除节点包 |

---

## 8. 业务约束提示（前端实现注意）

1. **创建顺序**：天赋的 `qualityId` 必须先存在；物品的 `attributes[].attributeId` 必须先存在。建议前端先调用相关列表填充下拉。
2. **FK 字段类型**：所有 FK 字段（`qualityId`、`attributeId`）都是 ObjectId 字符串，后端会校验有效性。
3. **删除限制**：当前实现不引用计数（不代表没人引用）；后续 S2/S4 实施时会加引用检查。
4. **批量操作**：本版本不提供批量接口。如需批量，前端循环调用。
5. **分页**：本版本不提供分页（数据量小）。后续大阶段可能加 `page` / `pageSize`。
6. **排序**：列表按 `createdAt` 升序返回，无 sort 参数。

---

## 9. 错误码速查

| errCode | 含义 | 触发场景 |
|---|---|---|
| 10001 | PARAM_INVALID | 缺必填字段 / 字段值非法 / code 重复 |
| 10002 | UNAUTHORIZED | 未登录 |
| 10003 | TOKEN_EXPIRED | 登录过期 |
| 10004 | FORBIDDEN | 无权限 / 生产环境用 dev 接口 |
| 10005 | USER_NOT_FOUND | 用户不存在 |
| 10006 | PASSWORD_MISMATCH | 密码错误 |
| 10007 | NOT_FOUND | 资源不存在 |
| 50000 | SERVER_ERROR | 服务器内部错误 |

---

## 10. 文档维护

- 改 schema / 接口必须同步本文件 + `database-schema.md`
- 新增 S2/S3 接口时另开文档（如 `player-api.md` / `gameplay-api.md`）
- 鉴于此文档覆盖 S1，仅供 bhgt-admin 与未来的 bhgt-h5-client 配置读取场景使用

---

## 11. 管理员账号接口 `sys.users`（isAdmin=true）

> 底层复用系统账号表 `sys.users`，仅操作 `isAdmin=true` 的记录。
> 管理端自身通过 `/auth/admin-login` 登录，本组接口用于「增删改查管理员」。

### 11.1 列表

```
GET /api/admin/admins
```

**响应** `MESSAGE_BODY`：管理员对象数组（**不含 password**）

```json
[
  { "_id": "66...", "username": "admin", "nickname": "超管", "loginCode": "dev01", "isAdmin": true, "createdAt": "..." },
  { "_id": "66...", "username": "oper", "nickname": "运营", "loginCode": null, "isAdmin": true, "createdAt": "..." }
]
```

### 11.2 详情

```
GET /api/admin/admins/:id
```

**Path 参数**：`id` = 管理员 `_id`（ObjectId 字符串）

**响应** `MESSAGE_BODY`：单条管理员对象（不含 password）

**错误**：`10007 NOT_FOUND`

### 11.3 新增

```
POST /api/admin/admins
```

**Body**：

```json
{
  "username": "oper2",
  "password": "123456",
  "nickname": "运营二号",
  "loginCode": "dev02"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `username` | string | 是 | 登录名，唯一 |
| `password` | string | 是 | 明文，服务端以 SHA1 入库（与 admin-login 校验一致） |
| `nickname` | string | 否 | 显示名，缺省=username |
| `loginCode` | string | 否 | dev 登录码（稀疏唯一），用于 h5 dev-login；缺省不设置 |

**响应** `MESSAGE_BODY`：新增的管理员对象（不含 password）

**错误**：`10001 PARAM_INVALID`（缺 username / password / 用户名已存在 / 登录码已存在）

### 11.4 编辑

```
PUT /api/admin/admins/:id
```

**Path 参数**：`id` = 管理员 `_id`

**Body**（全字段可选）：

```json
{
  "nickname": "运营二号",
  "password": "newpass",
  "loginCode": "dev02"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `nickname` | string | 否 | 显示名 |
| `password` | string | 否 | 传则重算 SHA1 覆盖旧密码 |
| `loginCode` | string | 否 | 传空字符串则清空登录码；传值则更新（需唯一） |

**响应** `MESSAGE_BODY`：更新后的管理员对象（不含 password）

**错误**：`10007 NOT_FOUND` / `10001 PARAM_INVALID`

### 11.5 删除

```
DELETE /api/admin/admins/:id
```

**响应** `MESSAGE_BODY`：`{ success: true }`

**错误**：`10007 NOT_FOUND`

---

## 12. 玩家接口 `game.users`

> 玩家（游戏角色）存于 `game.users`，通过 `userId` 关联 `sys.users` 登录账号。
> 本组提供玩家列表，以及「增加测试玩家」（便于 h5 dev-login 直登联调）。

### 12.1 列表

```
GET /api/admin/players
```

**响应** `MESSAGE_BODY`：游戏角色数组（关联账号用户名/昵称），按创建时间倒序

```json
[
  {
    "_id": "66...",
    "name": "测试角色_ab12",
    "realm": "练气",
    "attrs": {},
    "userId": { "_id": "66...", "username": "test_x1", "nickname": "测试玩家", "isAdmin": false },
    "createdAt": "..."
  }
]
```

### 12.2 增加测试玩家

```
POST /api/admin/players/test
```

**Body**（全字段可选）：

```json
{
  "name": "测试角色A",
  "nickname": "测试玩家A",
  "loginCode": "t_demo01"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `name` | string | 否 | 角色名，缺省自动生成 |
| `nickname` | string | 否 | 账号昵称，缺省「测试玩家」 |
| `loginCode` | string | 否 | dev 登录码，缺省自动生成 `t_<随机>`；用于 h5 `/auth/dev-login` 直登 |

**行为**：
1. 在服务端生成唯一用户名 `test_<随机>` 与 `sys.users` 账号（isAdmin=false）
2. 创建一条 `game.users` 游戏角色，关联上述账号
3. 返回角色信息 + `loginCode`，管理员可据此在 h5 端 dev-login 直登

**响应** `MESSAGE_BODY`：

```json
{
  "_id": "66...（角色 id）",
  "name": "测试角色A",
  "realm": "",
  "userId": "66...（账号 id）",
  "account": { "username": "test_x1", "nickname": "测试玩家A", "isAdmin": false },
  "loginCode": "t_demo01"
}
```

**错误**：`10001 PARAM_INVALID`（loginCode 已存在）

---

## 13. 剧情节点（config.nodes）

> 分支剧情节点 + 3 随机按钮。按钮(buttons)与战斗配置(battleConfig)作为节点内嵌结构（无独立表）。
> 其中 `effects` / `conditions` / `costs` / 战斗结果 等属于灵活结构，接口以 `object` 接收，便于剧情反复调整、无需改表结构。
> 字段设计见 `database-schema.md` §6.3。路径统一用业务主键 `code`。

### 13.1 节点列表

```
GET /api/admin/nodes?stageId=<可选>&isBattle=<可选 1|true|0|false>&nodeBundleCode=<可选>
```

- `stageId`：按所属大阶段过滤（传 `config.stages._id`）。
- `isBattle`：传 `1` / `true` 只返回战斗节点；传 `0` / `false` 只返回非战斗节点。
- `nodeBundleCode`：按所属事件过滤（传 `config.nodeBundles.code`）。
- 返回：节点数组（按 `code` 升序）。

### 13.2 节点详情

```
GET /api/admin/nodes/:code
```

返回单个节点文档。不存在 → `10007 NOT_FOUND`。

### 13.3 新增节点

```
POST /api/admin/nodes
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `code` | string | 否（忽略传入值） | 只读完整编号，由服务端按 `${nodeBundleCode}_${nodeSubCode}` 自动生成 |
| `name` | string | 是 | 后台显示的节点名 |
| `title` | string | 是 | 玩家可见节点标题 |
| `stageId` | string | 否（忽略传入值） | 由所属事件自动派生 |
| `nodeBundleCode` | string | 是 | 所属事件 `config.nodeBundles.code`；节点隶属于事件，Excel 可直接填写编号 |
| `nodeSubCode` | string | 是 | 事件内子编号；完整节点编号 = `nodeBundleCode + '_' + nodeSubCode` |
| `text` | string | 否 | 节点正文，默认 `''` |
| `imageUrl` | string | 否 | 配图，默认 `''` |
| `isBattle` | boolean | 否 | 是否战斗节点，默认 false |
| `buttonCount` | number | 否 | 随机按钮数量，默认 3 |
| `afterCompletionOpenShop` | boolean | 否 | 完成后开商店，默认 false |
| `battleConfig` | object | 否 | 战斗配置（灵活结构），默认 null |
| `buttons` | array | 否 | 按钮列表，默认 `[]` |

`buttons` 元素字段（均可选，除 `code`/`text`）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `code` | string | 按钮业务标识 |
| `text` | string | 按钮文案 |
| `type` | `normal` \| `minigame` | 默认 `normal` |
| `minigameId` | string | 小游戏 `config.minigames._id`（type=minigame） |
| `isRequired` | boolean | 是否必现，默认 false |
| `weight` | number | 随机权重，默认 1 |
| `conditions` | object | 出现条件（灵活） |
| `costs` | object | 消耗（灵石/道具，灵活） |
| `effects` | object | 选择后效果（灵活） |
| `nextNodeId` | string | 跳转到的下一节点 `code`（如 `n002`）；按 code 互引，可跨节点包引用下一节点包的入口节点 |

请求示例：

```json
{
  "name": "青云宗入门",
  "nodeSubCode": "01",
  "title": "山门之前",
  "text": "你立于青云宗山门前，云雾缭绕。",
  "nodeBundleCode": "nb_1（所属事件编号）",
  "isBattle": false,
  "buttonCount": 3,
  "buttons": [
    {
      "code": "b_enter",
      "text": "叩响山门",
      "weight": 1,
      "conditions": { "minSpiritStone": 10 },
      "effects": { "spiritStone": -5, "attributes": { "rootBone": 1 } },
      "nextNodeId": "n002（下一节点 code，可跨节点包）"
    },
    {
      "code": "b_peek",
      "text": "暗中观察",
      "type": "normal",
      "costs": { "items": [{ "itemId": "66...（道具 _id）", "count": 1 }] },
      "effects": { "spiritStone": 8, "cg": ["66...（CG _id）"] }
    }
  ]
}
```

返回：新建的节点文档。错误：`10001 PARAM_INVALID`（事件/子编号/名称/标题缺失，或该事件下子编号重复）。

> **编号关系**：节点通过 `nodeBundleCode` 隶属事件，填写事件内唯一 `nodeSubCode`；服务端生成不可手填的完整 `code = nodeBundleCode + '_' + nodeSubCode`。按钮通过 `nextNodeId` 跳转目标节点完整编号。按钮本身内嵌在节点中，无独立配置表。历史库由 `scripts/migrate-node-bundle-code.ts` 从 `nodeBundleId` 迁移。

#### 13.3.1 按钮 `conditions` / `costs` / `effects` 结构约定

这三个字段服务端**原样存储（`object`，不做任何校验）**，由游戏引擎在运行时按下列键名解析。
后台节点按钮编辑器中以 JSON 文本录入，须保证为合法 JSON；非法 JSON 会被服务端透传存储、客户端解析时报错。

**`costs`（选择/出现所需消耗）**

| 键 | 类型 | 说明 |
|---|---|---|
| `spiritStone` | number | 消耗灵石（正值，如 `5`） |
| `lifespan` | number | 消耗寿元（正值） |
| `items` | array | 消耗道具：`[{ "itemId": "config.items._id", "count": 1 }]` |

**`effects`（选择后产生的效果）**

| 键 | 类型 | 说明 |
|---|---|---|
| `spiritStone` | number | 灵石变化（正加负减） |
| `lifespan` | number | 寿元变化（正加负减） |
| `attributes` | object | 属性增减：`{ "<attributeId 或属性 key>": delta }` |
| `items` | array | 发放道具：`[{ "itemId": "config.items._id", "count": 1 }]` |
| `cg` | array | 解锁 CG：`["config.cg._id", ...]` |
| `talentPoints` | number | 天赋点变化（局外成长，如启用） |

**`conditions`（按钮出现的准入条件，全部满足才出现）**

| 键 | 类型 | 说明 |
|---|---|---|
| `minSpiritStone` | number | 灵石下限 |
| `minLifespan` | number | 寿元下限 |
| `minLevel` | number | 修为/境界等级下限 |
| `attrAtLeast` | object | 属性门槛：`{ "<attributeId 或 key>": value }` |
| `hasItems` | array | 需持有道具：`[{ "itemId": "config.items._id", "count": 1 }]` |
| `hasRelics` | array | 需持有遗物：`["config.items._id", ...]` |
| `hasCg` | array | 需已解锁 CG：`["config.cg._id", ...]` |

> 引用类字段（`itemId` / `attributeId` / `cg` / `relic`）均填对应配置表的 `_id`（ObjectId 字符串，如 `507f1f77bcf86cd799439011`）。
> 上述键名为当前约定，引擎未识别的键会被忽略；后续扩展新键时请同步更新本节。

### 13.4 更新节点

```
PUT /api/admin/nodes/:code
```

字段同 13.3，全部可选（缺省字段不更新）。`stageId` 传空串视为解绑。不存在 → `10007 NOT_FOUND`。

> 注意：`buttons` 若提供则**整体替换**该节点的按钮数组（非逐项合并），需传入完整按钮列表；不传则保留原按钮不变。

### 13.5 删除节点

```
DELETE /api/admin/nodes/:code
```

返回 `{ "success": true }`。不存在 → `10007 NOT_FOUND`。

> 注意：节点间剧情图**只看按钮 `buttons[].nextNodeId`** 串接；战斗结果 `battleConfig.success/failure` 的 `nextNodeIds` 是战斗结算后的跳转，**不参与**「节点指向 / 事件入口出口 / 事件间边」的计算。删除节点不会自动清理其他节点按钮对其 `nextNodeId` 的引用，需后台自行维护。

## 14. CG 图鉴（config.cgs）

> 玩家可解锁/回看的 CG 内容。业务主键 `code`（如 `cg_01`），路径统一用 `code`。

### 14.1 列表 / 详情 / 增 / 改 / 删

```
GET    /api/admin/cgs              # 列表，按 code 升序
GET    /api/admin/cgs/:code        # 详情，不存在 → 10007
POST   /api/admin/cgs              # 新增
PUT    /api/admin/cgs/:code        # 更新（字段可选，缺省不更新）
DELETE /api/admin/cgs/:code        # 删除，不存在 → 10007
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `code` | string | 是(建) | 业务标识，唯一 |
| `name` | string | 是(建) | CG 名称 |
| `thumbnailUrl` | string | 否 | 缩略图路径，默认 `''`（**只存相对资源域名的路径**，不含域名） |
| `originalUrls` | string[] | 否 | CG 分阶段原图数组，**最多 4 张**（对应第 1~4 阶段），默认 `[]`（只存相对路径） |
| `placeholderUrl` | string | 否 | 未解锁占位图路径，默认 `''`（只存相对路径） |
| `reviewText` | string | 否 | 回看剧情文字，默认 `''` |

错误：`10001 PARAM_INVALID`（code / name 缺失或 code 重复）、`10007 NOT_FOUND`（更新/删除/详情不存在）。

> **图片只存路径、域名统一配置**：所有图片字段只接受「相对 OSS 域名的路径」（如 `/cg/x.png`）。后台编辑器中粘贴完整 URL（如 `https://bhgt-public-files.oss-cn-beijing.aliyuncs.com/cg/x.png`）时，前端会**自动去掉协议+域名**，仅保留路径存储；完整 URL 在展示时由前端 `VITE_BHGT_OSS_DOMAIN` 拼接。这样换 CDN / OSS 域名时只改该环境变量即可，无需迁移数据库。
> `originalUrls` 最多 4 个元素（第 1~4 阶段），超出时新增按钮禁用。

## 15. 战斗评分档位（config.battles）

> 战斗结算时算出「超额值」（实际表现超出阈值的量），落在某档位 `[minExcess, maxExcess]` 区间即采用该档位 `score`；`maxExcess = -1` 约定为无上限。
> 业务主键 `code`（如 `bt_01`），路径统一用 `code`。

### 15.1 列表 / 详情 / 增 / 改 / 删

```
GET    /api/admin/battles              # 列表，按 minExcess 升序（code 副排序）
GET    /api/admin/battles/:code        # 详情，不存在 → 10007
POST   /api/admin/battles              # 新增
PUT    /api/admin/battles/:code        # 更新（字段可选，缺省不更新）
DELETE /api/admin/battles/:code        # 删除，不存在 → 10007
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `code` | string | 是(建) | 档位业务标识，唯一 |
| `name` | string | 是(建) | 档位名称 |
| `minExcess` | number | 否 | 超额下限（含），默认 `0` |
| `maxExcess` | number | 否 | 超额上限（含），默认 `-1`（无上限） |
| `score` | number | 否 | 档位分值，默认 `0` |

错误：`10001 PARAM_INVALID`（code / name 缺失或 code 重复）、`10007 NOT_FOUND`（更新/删除/详情不存在）。

> 全局评分乘数（所有档位分值统一乘）由 `config.game.battleConfig.scoreMultiplier` 控制，前端在「战斗评分配置」页的全局乘数卡片中编辑（见 `GAME_CONFIG_UPDATE`）。

## 16. 节点包（config.nodeBundles）· admin 界面称「事件」

> 节点包介于「大阶段」与「剧情节点」之间，是**三层结构**的中间层：**大阶段(stage) → 节点包(nodeBundle) → 剧情节点(node)**。
> ⚠️ **双层命名**：代码 / 数据层一律称「节点包(nodeBundle)」；**admin 用户可见文案统一显示「事件」**（菜单、标题、按钮、列名、弹窗、表单标签均写「事件」），仅为展示别名，代码标识符不变。
> 业务主键 `code`（如 `nb_world_01`），路径统一用 `code`。

### 16.1 列表 / 详情 / 增 / 改 / 删

```
GET    /api/admin/node-bundles              # 列表，支持 ?stageId= 过滤，按 code 升序
GET    /api/admin/node-bundles/graph        # 事件级路径图（见 §16.2）
GET    /api/admin/node-bundles/:code        # 详情，不存在 → 10007
GET    /api/admin/node-bundles/:code/nodes  # 单事件内节点连接图（见 §16.2）
POST   /api/admin/node-bundles              # 新增
PUT    /api/admin/node-bundles/:code        # 更新（字段可选，缺省不更新）
DELETE /api/admin/node-bundles/:code        # 删除，不存在 → 10007
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `code` | string | 是(建) | 节点包业务标识，唯一。**允许编辑**：更新时传新 `code`，服务端校验全局唯一（与旧值相同则不校验） |
| `name` | string | 是(建) | 节点包名称（界面显示「事件名称」） |
| `stageId` | string | 否 | 所属大阶段 `config.stages._id`（空串视为不绑定） |
| `description` | string | 否 | 节点包描述，默认 `''` |

> 已删除字段（2026-08-06）：`positionX` / `positionY` / `entryNodeRef` / `exitNodeRef` / `nextNodeBundleId` 全部移除，图形坐标由前端画图时自行计算，不入库。

请求示例（新增）：

```json
{
  "code": "nb_world_01",
  "name": "初入青云",
  "stageId": "66...（某 stage _id）",
  "description": "主角初到青云宗外门"
}
```

错误：`10001 PARAM_INVALID`（code / name 缺失或 code 重复）、`10007 NOT_FOUND`（更新/删除/详情不存在）。

> **节点与事件的归属关系**：节点通过 `nodeBundleCode` 隶属事件（见 §13.3 字段表），指定事件编号时其 `stageId` 由事件自动派生。节点间靠按钮 `buttons[].nextNodeId`（填目标节点 **`code`**，见 §13.3.1 下方）串接，可跨事件连边。

### 16.2 事件视图（路径图）接口

> 入口 / 出口**动态计算**，不落库（见 §6.2.1 与 §6.3）。口径：**入口** = 本事件内无本事件按钮指向的节点；**出口** = 有按钮指向非本事件节点的节点；`isNormal` = 入口与出口均非空。

#### 16.2.1 事件级路径图

```
GET /api/admin/node-bundles/graph
```

**响应** `MESSAGE_BODY`：

```json
{
  "bundles": [
    { "_id": "66...", "code": "nb_world_01", "name": "初入青云", "stageId": "66..." }
  ],
  "bundleViews": [
    {
      "_id": "66...",
      "code": "nb_world_01",
      "name": "初入青云",
      "stageId": "66...",
      "entryNodeCodes": ["n001"],
      "exitNodeCodes": ["n005"],
      "isNormal": true,
      "nextBundleIds": ["66...（下一事件 _id）"]
    }
  ],
  "edges": [
    { "from": "66...（A 事件 _id）", "to": "66...（B 事件 _id）", "viaNodeCode": "n005" }
  ]
}
```

- `entryNodeCodes` / `exitNodeCodes`：本事件的入口 / 出口节点 `code` 列表。
- `isNormal=false` 的事件需在后台补全（如「缺出口」= 出口节点无按钮指向其他事件）。
- `edges`：事件间有向边，由 A 出口节点的按钮 `nextNodeId` 连到 B 入口节点产生，`viaNodeCode` 标注经手节点。

#### 16.2.2 单事件内节点图

```
GET /api/admin/node-bundles/:code/nodes
```

**响应** `MESSAGE_BODY`：

```json
{
  "bundle": {
    "_id": "66...", "code": "nb_world_01", "name": "初入青云", "stageId": "66...",
    "entryNodeCodes": ["n001"], "exitNodeCodes": ["n005"], "isNormal": true
  },
  "nodes": [
    {
      "_id": "66...", "code": "n001", "name": "山门之前", "title": "...", "isBattle": false,
      "inDegree": 0, "outDegree": 2,
      "externalOuts": [{ "code": "n101", "bundleId": "66...", "bundleName": "青云内门 (nb_world_02)" }],
      "buttons": [{ "code": "b_enter", "text": "叩响山门", "nextNodeId": "n002" }]
    }
  ],
  "edges": [
    { "from": "n001", "to": "n002", "viaButton": "b_enter" }
  ]
}
```

- `inDegree` / `outDegree`：本事件内被指向 / 指向的按钮数（仅统计本事件内边）。
- `externalOuts`：指向**其他事件**节点的出边（含目标事件名，用于跨事件连线）。
- `edges`：本事件内节点间有向边，`viaButton` 标注经手按钮 `code`。

## 17. 图片字段统一约定（全局）

后台**所有**图片字段遵循同一规则，无例外：

1. **数据库只存「相对 OSS 域名的路径」**，如 `/cg/cg_01.png`、`/item/rel_01.png`；不存协议、不存域名。
2. **完整地址由前端拼接**：`VITE_BHGT_OSS_DOMAIN` + 路径（当前值 `https://bhgt-public-files.oss-cn-beijing.aliyuncs.com`）。换 CDN / OSS 域名时只改环境变量，无需迁移数据。
3. **粘贴完整 URL 自动去域名**：编辑框粘贴 `https://<任意域名>/cg/x.png` 会自动剥成 `/cg/x.png`；失焦时再规整一次（覆盖手工输入 / 旧数据编辑的情况）。
4. **实时预览**：路径一填写/修改，输入框右侧立刻显示缩略图（点击可放大），下方展示拼接后的完整地址便于核对；图挂了显示「失败」。
5. 若字段值本身已是 `http(s)://` 开头的完整 URL（历史数据 / 外链），展示时原样使用，不再拼域名。

### 17.1 全库图片字段清单

| 集合 | 字段 | 后台页面 |
|---|---|---|
| `config.cgs` | `thumbnailUrl` | CG 图鉴 → 封面缩略图 |
| `config.cgs` | `originalUrls[]`（最多 4） | CG 图鉴 → CG 阶段图 |
| `config.cgs` | `placeholderUrl` | CG 图鉴 → 未解锁占位图 |
| `config.nodes` | `imageUrl` | 剧情节点 → 基础配置 · 剧情图片 |
| `config.nodes` | `battleConfig.success.imageUrl` | 剧情节点 → 战斗配置 · 成功图片 |
| `config.nodes` | `battleConfig.failure.imageUrl` | 剧情节点 → 战斗配置 · 失败图片 |
| `config.stages` | `mapImageUrl` | 大阶段 → 地图图片 |
| `config.stages` | `passImageUrl` | 大阶段 → 通关图片 |
| `config.items` | `imageUrl` | 物品 → 图片 |

> 新增图片字段时：admin 端一律使用 `src/components/ImagePathInput.vue`（已内置去域名 + 预览 + 完整地址提示），不要再写裸 `el-input`；列表页缩略图用 `resolveAssetUrl(path, ossDomain)`。h5 端用 `src/utils/asset.ts` 的同名方法。

## 18. 批量配置：事件 / 剧情节点 Excel（协作文档）

后台一个个配事件/节点太累，改用 Excel 批量填。模板与脚本都在 `bhgt-ai-collaboration` 协作文档下：

- 模板：`剧情配置/事件与节点配置表.xlsx`（**事件 / 剧情节点 / 按钮 三 sheet，第一行表头不读**）
- `scripts/gen-config-template.mjs` 生成模板（内部 `mkNode`/`mkBtn` 按表头映射，杜绝手写数组对不齐）
- `scripts/fill-image-paths.mjs` 图片中文名 → 真实 OSS 相对路径，输出 `_已补全路径.xlsx`
- `scripts/resolve-config.mjs` 机器生成编号 + code + 解析目标 code，输出 `_已解析.xlsx`（追加列 + 校验 sheet）
- `scripts/export-db-to-excel.mjs` 从数据库只读导出（不改库），输出 `数据库导出_事件与节点.xlsx`

### 18.1 三 Sheet 结构

| Sheet | 用途 | 关键列 |
|---|---|---|
| **事件** | 节点包（根级） | 中文名 / **ID**（AI生成）/ 所属阶段 / 描述 / 配图(中文名) |
| **剧情节点** | node | 节点ID / 节点名称(中文名) / 所属阶段 / **所属事件**(=父中文名) / 剧情标题 / 剧情正文 / 配图(中文名) / 显示按钮数 / 战斗节点 / 通过后开商店 |
| **按钮** | 独立表 | 关联节点中文名 / 序号 / 文案 / 类型 / 必现 / 权重 / 目标中文名 |

> **事件无父中文名**（事件是根级）；**节点不含战斗子字段**（战斗成功/失败效果JSON、目标等全不在批量 Excel 中）；按钮独立成表。

### 18.2 填写规则

- **不填编号、不填 code、不填节点 ID**：编号/code 全由 `resolve-config.mjs` 从「中文名→父中文名」的关系树推出来；事件的 ID 列也由 AI 帮着生成。
- **中文名全局唯一**（重名直接报错）。
- **事件**：填「中文名」，ID 列留空；父中文名不存在（事件是根）。
- **节点**：填「节点名称(中文名)」+「所属事件」（= 父中文名，只管自己的爹是谁）。
- **按钮**：独立 sheet，每行一个按钮，用「关联节点中文名」关联到节点，「目标中文名」填跳转目标的名称。
- 节点是事件的子树，**自然继承前缀**：事件 `1` → 其节点 `1.1` → `1.1.1`。

### 18.3 机器编号规则（无视「强行当爹」）

1. 从每行「中文名 / 父中文名」建树：父中文名空 = 顶级；否则挂到对应中文名之下。
2. DFS 编号：顶级按出现序 = `1`/`2`/`3`…；子节点 = `父编号 + "." + 兄弟序号`（从 1 起）。
3. code = 事件 `nb_<去点编号>` / 节点 `n_<去点编号>`（编号唯一 ⇒ code 唯一）。
4. **⚠️ 无视「强行当爹」**：任何按钮跳转造成的「额外父边」（即别的节点把某元素当终点）**不参与编号**，编号只看填写者声明的父。

示例（模板自带）：

| 元素 | 中文名 | 父(所属事件) | 编号 | code |
|---|---|---|---|---|
| 事件 | 初入青云 | （根） | `1` | `nb_1` |
| 事件 | 青云内门 | （根） | `2` | `nb_2` |
| 节点 | 山门之前 | 初入青云 | `1.1` | `n_11` |
| 节点 | 叩门 | 山门之前 | `1.1.1` | `n_111` |
| 节点 | 观望 | 山门之前 | `1.1.2` | `n_112` |
| 节点 | 正厅 | 叩门 | `1.1.1.1` | `n_1111` |
| 节点 | 内门入口 | 青云内门 | `2.1` | `n_21` |
| 节点 | 内门深处 | 内门入口 | `2.1.1` | `n_211` |

> `正厅` 的所属事件只填了「叩门」，所以编号 `1.1.1.1`；即便 `观望`(1.1.2) 的按钮也指向 `正厅`（强行当爹），也**不改** `正厅` 的编号。同理 `内门深处` 回指 `山门之前` 只是普通跳转目标。

### 18.4 图片列（只填中文名，AI 补全路径）

- 填写者填纯中文文件名（如 `平儿.jpg`）；`fill-image-paths.mjs` 在 `图片/` 目录按**完全同名**递归查找，补全为真实 OSS 相对路径（如 `/cg/清纯/平儿.jpg`），已是带 `/` 的路径不动，找不到保留原名并告警。**不转拼音**。

### 18.5 按钮目标填「目标中文名」

- 按钮 sheet 的「目标中文名」填跳转**目标节点的中文名**（不是编号）；`resolve-config.mjs` 查表翻译成 code，写入 `_已解析.xlsx` 按钮 sheet 的「目标code」列，查不到则在「校验」sheet 报错。
