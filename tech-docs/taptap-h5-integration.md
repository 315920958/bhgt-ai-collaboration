# TapTap 接入分析（BHGT）

> 目标：把肉鸽修仙剧情 H5 小游戏 BHGT 上架 TapTap。
> 当前状态：**开发者已认证，TapTap 凭据已下发并配置（2026-08-07）**。
> **方案更新（2026-08-10）**：玩家端已切换为 Cocos Creator 3.8.8 2D 项目。远程仓库仍为 `bhgt-h5-client`，本地目录为 `bhgt-cocos-client`；旧 React H5 方案暂时废弃。
> 本文结论基于 TapTap 官方开发者文档 + 小游戏 API 文档 + 快速上架公告 + 防沉迷规范核对，并经用户拍板。

---

## 0. 结论速览

| 项 | 决策 |
|---|---|
| 发布形态 | 当前走 **TapTap 小游戏包通道**，使用 Cocos Creator 适配与构建；旧 H5 通道方案暂时废弃 |
| 客户端 | Cocos Creator 3.8.8 + TypeScript，2D 场景与 Canvas/UI 节点 |
| 上传物 | Cocos 构建生成的 TapTap 小游戏包；不再以 React `dist` 作为主发布物 |
| 登录 | 双模式：`dev` 万能登录（仅非生产开放）/ `prod` TapTap OAuth2；配置守卫 |
| 商业化 | **灵石不可购 → 无内购 → 免版号**，以「开放试玩」形式长期运营 |
| 合规底线 | 防沉迷实名**强制**（含测试态、无游客例外）；隐私合规 + ICP 备案（联网） |
| 开发者认证 | 用户自行办理（个人=身份证，约 2 工作日），拿到 appid/clientId 后填 SDK 初始化 |

---

## 1. 当前方案：Cocos TapTap 小游戏包

- 本地项目：`bhgt-cocos-client`；远程 Git 仓库仍是 `bhgt-h5-client`。
- Cocos 项目版本：3.8.8；项目类型：2D。
- 首页和 UI 由 TypeScript 运行时创建，主场景为 `assets/scenes/Main.scene`。
- Chrome / Cocos 本地预览使用 Mock 登录；进入 TapTap 小游戏调试容器后再调用运行时注入的 `tap.login()`。
- 后端仍由 `bhgt-server` 提供认证、角色初始化、节点与存档接口。
- 正式上传应使用 Cocos Creator 的 TapTap/小游戏构建流程，不能把 Cocos 源码当作普通 Vite `dist` 上传。

## 2. 历史方案：两条上架通道的关键区别（暂时废弃）

以下内容记录此前 React H5 方案的调研结论，仅供追溯，当前不作为开发依据。

TapTap 实际有两条上架通道，早期调研对话将其混为一谈，必须区分：

### A. 小游戏包通道（即时小游戏 / instant minigame）
- 运行在 **JS VM**，**没有 BOM/DOM、没有 window/document**。
- 需 `game.js` / `game.json` 固定结构 + 引擎 Adapter（Cocos/Laya/Egret 自带抹平层）。
- canvas 类渲染游戏走这条。
- React-DOM 文字游戏若无额外 DOM shim 无法直接运行。

官方依据：`developer.taptap.cn/minigameapidoc/dev/tutorial/overview/`
> "小游戏的运行环境不同于 Web 环境，在真机上运行时，没有 BOM API，因此也就没有 window 对象以及其上面的各种属性。"

### B. H5 游戏通道（H5 game / 快速上架）
- 开发者后台「快速上架」：**"你只需准备好 H5 游戏包，无需等待认证审核即可上架，移动端和 Web 端都能体验"**。
- 本质是 **WebView / 浏览器渲染，DOM 完整可用**。
- 上传构建产物（如 Vite 的 `dist`），平台负责加载；无需自有服务器 / Nginx / 路由重写。
- 上传工具：`prepare_h5_upload` / `upload_h5_game`（或 `@taptap/tds-mcp-server`），也可后台直接传。

官方依据：`m.taptap.cn/moment/684468229845813399`（快速上架公告）

### 选型结论
**BHGT 是纯 DOM 文字 + 按钮驱动的剧情游戏，没有 canvas 渲染 → 选 B（H5 游戏通道）。**
B 通道里"运行时没有 DOM"不成立，React 整套 UI 可直接跑，所谓"把 React 转成 TapTap 项目"的"工具"在此就是 H5 上传 / 构建流水线，而非 React→canvas 转译器。h5-client 不用为 canvas 做任何事。

---

## 3. 历史客户端（bhgt-h5-client）约定：React 方案暂时废弃

- 技术栈：React 18 + Vite + TypeScript + axios（端口 4002，`/api` → 4001）。
- 开发方式：按标准 React Web App 写，浏览器调试、生态（antd / redux / axios）照用。
- **路由：统一 `HashRouter`**（`#/page1` 形式），不依赖 `window.history`，避免任何环境差异风险。（注：B 通道其实有 window，`BrowserRouter` 也能跑，但统一 HashRouter 最稳。）
- 上传物：`npm run build` 产物 `dist`。
- 不碰 canvas，无需 DOM shim / 适配层。
- 部署相关（Nginx、自有服务器、路由重写）由 TapTap 平台托管，无需关心。

---

## 4. 登录体系（双模式，当前由 Cocos 平台适配层承载）

同一套客户端，靠配置切换两条登录链路。

### 开发态（仅 dev）
- 入口：`/auth/dev-login`（万能登录界面 / 接口）。
- 行为：任意 `userId` → 直接返回 dev token；可造测试档案、跳过实名。
- 守卫：仅 `NODE_ENV !== 'production'`（或 `AUTH_MODE === 'dev'`）时开放。
- **生产编译中必须彻底不暴露该路由。**
- 官方支撑：TapTap 防沉迷测试账号允许使用**自定义唯一标识**（不强制 unionid）→ developer.taptap.com/docs/v3/sdk/anti-addiction/features/

### 生产态（TapTap OAuth2）
1. 客户端 `tap.login()` → 平台返回临时 `code`。
2. 客户端把 `code` 发给 `/auth/taptap-login`。
3. 服务端用 `code` 调 TapTap `code2Session` → 得 `openid` / `unionid`（`session_key` **只留服务端、绝不下发**）。
4. 服务端据此发自定义 token 给客户端，后续通信用该 token。
5. 强制接入 TapTap 防沉迷 SDK（实名认证）。

### 玩家唯一标识
- dev：自定义 userId（跑通全流程、造测试档）。
- prod：TapTap `openid`（天然主键，服务局外成长 / meta 进度）。

---

## 5. 服务端（bhgt-server）待办

新增 `auth` 模块，双模式：
- `dev`：`/auth/dev-login` 万能登录（仅非生产开放）。
- `taptap`：生产 `/auth/taptap-login`（`code` → code2Session → openid → token）。

用 `AUTH_MODE` 配置或 `NODE_ENV` 守卫 dev 接口。其余核心逻辑（战斗判定、存档、配置驱动）原样保留，客户端包仍走 `/api`。

---

## 6. 合规与资质

官方资质矩阵（`developer.taptap.cn/docs/store/standardies-operation`）：

| 游戏性质 | 所需资质 | 上架形式 |
|---|---|---|
| 联网 + 无内购 | ICP 备案 + 防沉迷认证 + 隐私合规 | **开放试玩** |
| 联网 + 有内购 | 版号 + 软著 + ICP + 防沉迷 + 隐私 | 正式上线 |

- **BHGT = 联网 + 无内购（灵石不可购）→ 免版号，走「开放试玩」**，可长期运营，不必啃版号。
- **防沉迷实名是强制底线**：所有联网游戏（含测试态、无游客例外）必须接入，绕不掉；但是套 SDK，不是版号。
- 内容红线（`developer.taptap.cn/minigameapidoc/tap-operation/operation-standards/content-standards/`）：
  - 禁止出现 ¥ / $ 等现金符号或暗示真实货币交易 → BHGT 用「灵石」虚拟币且不可购，合规；但 **UI 中绝不能出现 ¥ / $ 字样**。
  - 禁止赌博 / 博彩框架 → 战斗 / 投掷（roll）机制需规避赌博表述。

---

## 7. 开发者认证与凭据（已下发 · 2026-08-07）

- 注册开发者（免审，功能受限）/ 认证开发者（约 2 工作日；个人主体=身份证，企业主体=营业执照）。
- 快速上架可"无需等待认证审核"先发 H5，但正式能力 / 财务仍要认证开发者身份。
- **2026-08-07 凭据已下发，并已写入各仓库 `.env.*`（见 §6.1）。客户端用 `VITE_TAPTAP_CLIENT_ID` 拼授权地址拿 `code`；服务端用 `TAPTAP_CLIENT_ID` + `TAPTAP_SERVER_SECRET` 在服务端换 `openid`。**

### 6.1 凭据与存储约定（重要）

**团队共享策略（用户拍板，2026-08-07）**：本团队为小团队开发，**所有代码与配置信息（含第三方密钥）对团队全员共享、可入库**。因此：

- 所有 `.env.*`（含 server `.env.production` 生产密钥）**均进 git 跟踪、明文留存**，不忽略任何 env 文件。
- TapTap **不分环境**（dev/test/prod 同一套凭据），故各环境 `.env.*` 写入**完全相同**的凭据，无需按环境区分。
- `TAPTAP_SERVER_SECRET` / `TAPTAP_CLIENT_PUBLIC_KEY` **仅服务端读取，绝不进入前端构建产物**；`TAPTAP_CLIENT_ID` 为公开标识，前端经 `VITE_TAPTAP_CLIENT_ID` 注入包内（公开，安全）。

**环境变量映射**

| env 变量 | 值 | 存放位置 | 说明 |
|---|---|---|---|
| `TAPTAP_CLIENT_ID` | `uhgnomb86qttlu987a` | server 全环境 | 公开 client_id，授权地址与换 token 都用它 |
| `TAPTAP_CLIENT_TOKEN` | `i3vMUFmnyYlVaj9ZfmOhogBa8FiYWp2z3pvRkSBG` | server 全环境 | client_token（client-credentials 类调用 / 开放 API 用，当前登录流暂未用） |
| `TAPTAP_SERVER_SECRET` | `vRvGl51esrL0yt8qA1bcSNI9Ey4gRkMs` | server 全环境，**仅服务端** | code→token 服务端交换的 client_secret |
| `TAPTAP_CLIENT_PUBLIC_KEY` | `MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArzoz1pVURjgwdhfw6kc7sDjMdsFmy6oVtuwlKwVLZiSjrbuWhKU6abaU2q2HqtSz79aGEWsjEgKxB3ZBQgAwXOOaorb6M+Gy0EEwpWySJPv9PcuhaGv543ClFgNtIxv1eb9pHNALXUZV3GZJrXb+0NQ0BxUVfKzqywO21DYv4E9Fnng2kn5phlKCWrA9J8l8laXo6mu2TFdMQmc8T+Cn+pJ5FQPo0YiQh2q1biQ973Mfxqye+AzA0iGXsdVI6kKrCii5YEhWlF1KKhpf3ilzL+kT5keIx82y12sjM5J3b5lWXoS89sD0kxuq7u+yZ6cKud0CWjIiz2EfXPG8tskD7QIDAQAB` | server 全环境，**仅服务端** | RSA 公钥，用于校验 TapTap 回传数据签名（如 mac_token / webhook） |
| `TAPTAP_REDIRECT_URI` | `https://player.bhgt.sixonehub.site/auth/callback` | server 全环境 | 授权回调地址，**必须与 TapTap 开发者中心登记的回调完全一致**（含协议/路径） |
| `VITE_TAPTAP_CLIENT_ID` | `uhgnomb86qttlu987a` | h5 全环境 | 前端公开 client_id，构建时注入包内 |

**实现状态**：`bhgt-server` `AuthService.taptapLogin` 已由占位升级为真实调用（`callTapTapToken` → `POST https://connect.tapapis.cn/token`，用 client_id+client_secret+code 换 openid/unionid）。仅生产态（或 `AUTH_MODE=taptap`）走此链路；dev 仍走 dev-login。

> 待办：回调地址 `TAPTAP_REDIRECT_URI` 需在 TapTap 开发者中心登记；Client Token / Public Key 的用途（client-credentials 开放 API、签名校验）后续按需接入。

---

## 8. 落地步骤与责任分工

**现在可做（不阻塞开发）**
- Cocos 玩家端：继续完善登录、创建角色、剧情和 TapTap 调试适配。
- bhgt-server：设计 `auth` 模块双模式，先实现 `dev` 万能登录打通全流程。

**用户侧**
- 去 TapTap 开发者中心认证开发者，拿到 appid 后告知。

**上线前（不紧急）**
- 接 TapTap 防沉迷 SDK + 隐私合规。
- ICP 备案（联网）。
- 使用 Cocos Creator 的 TapTap 小游戏构建流程生成小游戏包，再上传到 TapTap。

---

## 9. 待确认 / 开放项

1. **B 通道运行时是否确为 WebView**：依据公告与 H5 形态强烈推断为 WebView / DOM 可用，注册后建议真机 / 后台实测确认一次。
2. **广告接入**：H5 小游戏广告走「开发者中心 - 小游戏广告」（激励视频 / 插屏 / Banner），与 v0.0.2 记录的「真实 TapTap 广告接入待调研」「Demo 先用模拟广告」需衔接，单独另立调研。
3. **防沉迷测试账号接入细节**：自定义唯一标识如何在测试账号体系内落地，待注册后查 SDK 文档。
4. **正式上线路径**：若未来要做「正式上线 / 开放内购」，需补版号 + 软著；当前无此计划（灵石不可购）。

---

## 参考来源

- 小游戏运行环境（无 window/DOM）：`developer.taptap.cn/minigameapidoc/dev/tutorial/overview/`
- 引擎适配原理（Adapter 抹平 BOM/DOM）：`developer.taptap.cn/minigameapidoc/dev/engine/Cocos-Laya-Egret/`
- 开发者注册 / 认证：`developer.taptap.io/docs/zh-Hans/store`、`developer.taptap.com/docs/store/`
- 游戏资质矩阵 + 防沉迷要求：`developer.taptap.cn/docs/store/standardies-operation`
- 实名认证与防沉迷功能（测试账号自定义标识）：`developer.taptap.com/docs/v3/sdk/anti-addiction/features/`
- 快速上架（H5 游戏包）：`m.taptap.cn/moment/684468229845813399`
- 小游戏内容规范（禁现金符号 / 赌博）：`developer.taptap.cn/minigameapidoc/tap-operation/operation-standards/content-standards/`
- TapTap Maker / H5 上传 MCP：`https://raw.githubusercontent.com/taptap/instant-games-open-mcp/main/README.md`
