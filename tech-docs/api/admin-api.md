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
| GET | `/api/admin/nodes` | 节点列表（可按 `stageId` / `isBattle` 过滤） |
| GET | `/api/admin/nodes/:code` | 节点详情 |
| POST | `/api/admin/nodes` | 新增节点 |
| PUT | `/api/admin/nodes/:code` | 更新节点 |
| DELETE | `/api/admin/nodes/:code` | 删除节点 |

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
GET /api/admin/nodes?stageId=<可选>&isBattle=<可选 1|true|0|false>
```

- `stageId`：按所属大阶段过滤（传 `config.stages._id`）。
- `isBattle`：传 `1` / `true` 只返回战斗节点；传 `0` / `false` 只返回非战斗节点。
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
| `code` | string | 是 | 业务标识，唯一（如 `n_001`） |
| `name` | string | 是 | 后台显示的节点名 |
| `title` | string | 是 | 玩家可见节点标题 |
| `stageId` | string | 否 | 所属大阶段 `config.stages._id`（空串视为不绑定） |
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
| `nextNodeId` | string | 跳转到的下一节点 `config.nodes._id` |
| `isOneTime` | boolean | 是否一次性，默认 false |
| `afterUse` | `hide` \| `disable` | 用后隐藏/禁用，默认 `disable` |

请求示例：

```json
{
  "code": "n_001",
  "name": "青云宗入门",
  "title": "山门之前",
  "text": "你立于青云宗山门前，云雾缭绕。",
  "stageId": "66...（某 stage _id）",
  "isBattle": false,
  "buttonCount": 3,
  "buttons": [
    { "code": "b_enter", "text": "叩响山门", "weight": 1, "nextNodeId": "66...（下一节点 _id）" },
    { "code": "b_peek", "text": "暗中观察", "type": "normal", "effects": { "spiritStone": -5 } }
  ]
}
```

返回：新建的节点文档。错误：`10001 PARAM_INVALID`（code / name / title 缺失或 code 重复）。

### 13.4 更新节点

```
PUT /api/admin/nodes/:code
```

字段同 13.3，全部可选（缺省字段不更新）。`stageId` 传空串视为解绑。不存在 → `10007 NOT_FOUND`。

### 13.5 删除节点

```
DELETE /api/admin/nodes/:code
```

返回 `{ "success": true }`。不存在 → `10007 NOT_FOUND`。

> 注意：节点间靠 `buttons[].nextNodeId` / `battleConfig.success.nextNodeIds` 串成剧情图，删除节点不会自动清理其他节点对其的引用，需后台自行维护。
