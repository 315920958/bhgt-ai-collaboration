# TapTap 联调指南（开发 + 测试环境）

> 目标：让开发者和联调人员清楚地知道
> - 三套环境分别怎么登录
> - 配置项在哪、怎么改
> - 完整 OAuth 时序
> - 常见问题与排查

最后更新：2026-08-10

> **方案更新**：玩家端远程仓库仍为 `bhgt-h5-client`，但 `develop` 已替换为本地目录 `bhgt-cocos-client` 的 Cocos Creator 3.8.8 2D 项目。旧 React H5 / Vite / 4002 开发方案暂时废弃，本文中涉及旧 H5 的地址、命令和 `dist` 上传流程不再作为当前操作依据。
>
> **终端原则**：BHGT 手机端优先，主要验证手机竖屏、触摸操作和 TapTap 小游戏容器；桌面 Chrome 只用于辅助预览。

> **Cocos 编译原则（重要）**：源码修改不等同于预览运行产物已经更新。若源码看起来已修改、运行效果却仍是旧行为，先停止预览，确认资源已重新导入并重新编译，再重新运行；必要时关闭并重新打开项目。协作排查时，如果代码逻辑成立但现象不一致，优先确认“这次是否已经重新编译/重新运行”，并检查 `temp/programming/packer-driver/targets/preview` 是否包含最新代码。

---

## 1. 环境分级速查

| 环境 | NODE_ENV | 登录方式 | 是否需要 TapTap appid | 前端访问地址 |
|---|---|---|---|---|
| 本地开发 / Web 试玩 | Cocos Creator 浏览器预览或 Nginx Web 构建 | 真实 TapTap **设备码扫码登录** | ✅ 需要 | 浏览器页面显示二维码 |
| TapTap 联调 / 测试 | TapTap 调试工具 + 真机容器 | 宿主 `tap.login()` | ✅ 需要 | TapTap 调试工具二维码 |
| 生产 | Cocos 构建后的 TapTap 小游戏包 | 宿主 `tap.login()` | ✅ 需要 | TapTap 小游戏容器 |

**核心原则**：TapTap 不分环境（一份 Client ID / 凭据全环境共用）；登录方式由运行能力分流——检测到 `tap.login` 则使用小游戏宿主，否则使用真实 OAuth2 设备码扫码。玩家端不使用 Mock 身份。

### 当前玩家端调试流程

1. 用 Cocos Creator 3.8.8 打开 `bhgt-cocos-client`（远程仓库名仍是 `bhgt-h5-client`）。
2. 打开 `assets/scenes/Main.scene`，点击编辑器运行按钮查看首页。
3. 修改脚本后，先停止当前预览，等待 Cocos 完成脚本重新导入/编译，再重新运行；若预览仍表现为旧代码，关闭并重新打开 Cocos 项目。
4. Chrome / Web Mobile 本地预览点击登录后显示真实 TapTap 扫码二维码；后端取得真实 `openid` 后创建/读取角色。
5. 接入 TapTap 调试工具后，通过真机 TapTap 容器验证 `tap.login()`、code 上送服务端及角色初始化。

登录按钮的正确时序是“先真实 TapTap 授权、后服务端”：小游戏容器使用 `tap.login()`；浏览器使用设备码扫码。两者都不能直接伪造 BHGT 登录态。

以下旧 H5 章节中的 React、4002、H5 OAuth 回调和 `dist` 流程属于历史方案记录，暂时不作为当前玩家端操作依据；服务端凭据与 code 换 openid 的部分仍可作为接口参考。

---

## 2. TapTap 凭据准备（一次性）

### 2.1 创建应用

登录 [TapTap 开发者中心](https://developer.taptap.cn) → 创建新应用，拿到四样东西：

| 字段 | 用途 | 谁能看 |
|---|---|---|
| `client_id` | appid（公开标识） | 服务端 + 前端 |
| `client_token` | 公共 token | 服务端 |
| `server_secret` | 仅服务端持有，换 token 用（架构上不需进前端，进 H5 bundle 会被反编译且无用途） | 服务端 |
| `client_public_key` | 仅服务端持有 | 服务端 |

### 2.2 登记回调地址

在「应用配置 → OAuth 配置」登记回调地址（**字符级别完全一致**）：

```
https://sixonehub.site/api/auth/taptap/callback
```

注意：
- 末尾**无 `/`**，无 query string
- 协议 `https`、域名 `sixonehub.site`、路径 `/api/auth/taptap/callback`，一字不差
- 多了/少了字符会直接报 `redirect_uri_mismatch`

### 2.3 加测试白名单

把你的 TapTap 账号加进测试白名单（内部测试 / 篝火测试机制）。游戏没正式发布也能用白名单账号登。

### 2.4 证书确认

`sixonehub.site` 的 SSL 证书必须在有效期内。当前证书由 TrustAsia 颁发，~89 天有效（约 3 个月一续）。下次到期：**2026-08-14**。检查命令：

```bash
echo | openssl s_client -connect sixonehub.site:443 -servername sixonehub.site 2>/dev/null \
  | openssl x509 -noout -dates
```

---

## 3. 环境变量配置

### 3.1 server 侧（`bhgt-server/.env.*`）

`development` / `test` / `production` / `example` 四个文件均已写入同一套 TapTap 凭据：

| Key | 值 |
|---|---|
| `TAPTAP_CLIENT_ID` | `uhgnomb86qttlu987a` |
| `TAPTAP_CLIENT_TOKEN` | `i3vMUFmnyYlVaj9Z...` |
| `TAPTAP_SERVER_SECRET` | `vRvGl51esrL0yt8q...` |
| `TAPTAP_CLIENT_PUBLIC_KEY` | `MIIBIjANBgkqhkiG9w0...` |
| `TAPTAP_REDIRECT_URI` | `https://sixonehub.site/api/auth/taptap/callback` |
| `TAPTAP_MINIGAME_APP_ID` | `tapmcmzigyn5dwcqds` |
| `TAPTAP_MINIGAME_SECRET` | `sQp2gXwauBubTomL5sxBvC7xgZMuuNc9`（仅服务端，禁止写入客户端） |

**项目硬性规则**：所有 `.env.*` 文件进 git 跟踪、团队共享（无 `.env.*` ignore）。生产密钥现已随仓库分发，团队自行评估是否轮换。

### 3.2 玩家客户端（`bhgt-cocos-client`）

当前 Cocos 玩家端**不保存任何 TapTap 凭据**：

| 运行环境 | 客户端登录动作 | 凭据所在位置 |
|---|---|---|
| 普通浏览器 / Nginx Web 试玩 | 请求服务端创建 OAuth2 设备码，显示二维码并轮询 | `TAPTAP_CLIENT_ID` 仅由服务端使用 |
| TapTap 小游戏调试器、测试包、正式包 | 调用宿主注入的 `tap.login()` | 小游戏 ID/测试权限由 TapTap 后台与包体配置管理；不写入游戏脚本 |

客户端**绝不**写 `TAPTAP_CLIENT_TOKEN`、`TAPTAP_SERVER_SECRET` 或 `TAPTAP_CLIENT_PUBLIC_KEY`。`Client ID` 虽是公开标识，但在当前两条客户端流程中也无需注入；设备码申请和用户资料读取均由服务端完成。

### 3.3 玩家登录态持久化

- 真实 TapTap 登录成功后，服务端签发只含 `userId + exp` 的 AES-GCM 密文 token；客户端无法读取或修改其中身份信息。
- Cocos 玩家端使用 `sys.localStorage` 保存键 `bhgt.auth`：Web 映射到浏览器 localStorage，小游戏包映射到宿主本地存储。恢复登录时，只有服务端明确返回 token 无效/过期才清除本地 token；网络故障或临时接口错误会保留 token，等待下次重试。
- Cocos 玩家端的后端请求统一经过 `assets/scripts/api-request.ts`：浏览器预览使用 `fetch`，TapTap 小游戏容器使用宿主提供的 `tap.request`。因此修改网络请求代码后必须重新构建并上传测试包，旧包不会自动更新。
- 下次启动先携带该 token 请求 `GET /api/auth/session`。验证成功则恢复 TapTap 昵称、头像并检查 `game.users`，不再扫码。
- token 过期、被篡改、用户不存在或 TapTap 绑定不存在时，客户端删除本地 token，再要求玩家重新登录。
- 当前 token 默认有效期由服务端 `AUTH_TOKEN_EXPIRES_IN_SECONDS` 控制；不在客户端保存 TapTap Access Token、Server Secret 或其他平台密钥。

---

## 4. nginx 配置

在服务器 `/etc/nginx/sites-available/sixonehub.site.conf` 的 HTTPS server 块里，紧挨 `location /` 之前加：

```nginx
location = /api/auth/taptap/callback {
    return 302 $arg_state?code=$arg_code;
}
```

**关键点**：
- `=` 精确匹配 → 优先级最高，不影响其它请求（其它照旧走 `location /` 转给 AI-Anchor V2）
- `$arg_state` / `$arg_code` 是 nginx 内置变量，URL 自动解码
- `state` 由前端 URL 编码后传入；TapTap 解码回显；nginx 拼 `code` 后 302 跳回目标

部署：

```bash
sudo nginx -t && sudo nginx -s reload
```

本地镜像文件（不在服务器）：`bhgt-ai-collaboration/nginx_conf/sites-available/sixonehub.site.conf`（与服务器结构同，含 OAuth 回调 location 块）。

---

## 5. 本地开发（dev-login）

**完全不需要 appid、不需要真实 OAuth。**

1. 启后端：`cd bhgt-server && npm run start:dev`（自动加载 `.env.development`）
2. 启前端：`cd bhgt-h5-client && npm run dev`（自动加载 `.env.development`）
3. 浏览器打开 `http://localhost:4002`
4. 点登录页的「万能登录」→ 直接进游戏

所有游戏逻辑（剧情、战斗、属性、商店、C……、重生）都在本地 dev 完成。

---

## 6. 联调测试（test 环境）—— 真实 OAuth

### 6.1 准备 checklist

- [ ] 已在 TapTap 开发者中心登记回调（见 §2.2）
- [ ] 已加白名单账号（见 §2.3）
- [ ] 证书有效（见 §2.4）
- [ ] server 已部署 `.env.test`，含完整 TapTap 凭据
- [ ] h5 已构建（`vite build --mode test`），注入 `VITE_TAPTAP_*`
- [ ] 服务器 nginx 已加 OAuth 回调 location（见 §4）

### 6.2 联调操作

1. 浏览器打开 `https://develop.h5.bhgt.sixonehub.site/`
2. 点「TapTap 登录」按钮
3. 前端跳到 TapTap 授权页：

   ```
   https://accounts.tapapis.cn/oauth2/v1/authorize
       ?client_id=uhgnomb86qttlu987a
       &redirect_uri=https%3A%2F%2Fsixonehub.site%2Fapi%2Fauth%2Ftaptap%2Fcallback
       &response_type=code
       &scope=basic_info
       &state=<encoded target url>
   ```

4. 用你的白名单 TapTap 账号登
5. TapTap 302 跳到 `https://sixonehub.site/api/auth/taptap/callback?code=xxx&state=<encoded url>`
6. nginx 拦截 `location = /api/auth/taptap/callback`，302 跳回 `http://develop.h5.bhgt.sixonehub.site/#/login?code=xxx`
7. 浏览器地址栏变成 `http://develop.h5.bhgt.sixonehub.site/#/login?code=xxx`，进入游戏

⚠️ **HTTPS → HTTP 浏览器降级提示**：callback 是 HTTPS（六站），target 是 HTTP（开发机）。浏览器会显示「不安全」提示，点继续能进。**测试环境特性**，生产环境 target 必须 HTTPS。

### 6.3 验证 302（不通过浏览器）

手动 curl 验证 nginx 配置：

```bash
curl -I "https://sixonehub.site/api/auth/taptap/callback?code=test_code&state=https%3A%2F%2Fdevelop.h5.bhgt.sixonehub.site%2F%23%2Flogin"
```

应返回：

```
HTTP/1.1 302 Found
Location: http://develop.h5.bhgt.sixonehub.site/#/login?code=test_code
```

---

## 7. 完整 OAuth 时序（test 环境）

```
前端                   TapTap                  nginx                 浏览器
 │                      │                       │                     │
 │ 1. window.location = authorize URL ───────►  │                     │
 │                      │                       │                     │
 │ 2. 用户登录 ◄──────────────────────────────── │                     │
 │                      │                       │                     │
 │ 3. ◄──── 302 redirect ─────────────────────── │                     │
 │                      │   Location: /api/auth/taptap/callback      │
 │                      │   ?code=xxx&state=encoded_url              │
 │                      │                       │                     │
 │ 4. ──────────────────────────────────────────► 拦截 location =     │
 │                                              /api/auth/.../callback│
 │                                              return 302            │
 │                                              Location: state?code  │
 │                      │                       │                     │
 │ 5. ◄────────── 302 ◄─────────────────────────│                     │
 │                                                                            │
 │ 6. ──────────► 浏览器跳到 state URL（带 ?code=）                        │
 │                                                                            │
 │ 7. 进游戏 ◄────────────────────────────────────────────────────────── │
```

---

## 8. 常见问题（FAQ）

### Q1：浏览器报 `redirect_uri_mismatch`

TapTap 字符串比对，**字符级别**必须一致：协议 / 域名（大小写）/ 端口 / 路径 / 末尾斜杠。一个字符不对就拒。

### Q2：state 里特殊字符被截断

state 必须 `encodeURIComponent()` 后再传给 TapTap。否则 `?` `&` `=` `/` `#` `:` 会被当 URL 分隔符吃掉，nginx 收到的 `$arg_state` 是残缺的。

### Q3：nginx 拿到的 state 是编码过的吗

不，`$arg_state` 是 nginx 自动解码后的明文值。nginx 把整个 `$arg_state` 放进 Location 头时会再次按需编码，浏览器正确解析。

### Q4：`code` 是不是 token？

**不是**。`code` 是单次授权码（5-10 分钟有效），本身不含用户信息，也不能解密。要拿到 `openid` / `unionid`，必须服务端用 `server_secret` + `code` 换 `access_token`，再用 `access_token` 调 TapTap profile 接口。

口诀：**code 是门票，access_token 是身份证，server_secret 是你的印章**——三者凑齐才能开门。

### Q5：本地为什么不能直接走 appid？

TapTap OAuth 要求回调是**公网 HTTPS**。`http://localhost:4002/...` 是 HTTP 且内网地址，TapTap 不会接受。本地用 dev-login 不碰 TapTap。

### Q6：浏览器提示「不安全/降级」？

HTTPS → HTTP 跳转触发浏览器降级提示。**测试环境可接受**，生产环境 target 必须 HTTPS。

### Q7：联调时 `code` 没传给游戏

nginx 302 跳转后 `code` 进了浏览器 URL（`?code=xxx`）。要让它真正进游戏、创建登录态，**前端必须在登录路由读 URL 上的 `code`**（test 环境是 placeholder，生产要走服务端换 token 流程）。当前 test 环境的 302 跳转是「可达性测试」版本，没做完整登录态绑定。

### Q8：证书过期了怎么办？

`notAfter` 字段一过，所有 HTTPS 服务都报「证书过期」。本项目 `sixonehub.site` 证书下次到期 **2026-08-14**。续期流程：
1. TrustAsia 后台申请新证书（仍绑定 `sixonehub.site` + `www.sixonehub.site`）
2. 续期时考虑加专属子域 SAN（如 `oauth.bhgt.sixonehub.site`）
3. 下载新 bundle / key，覆盖服务器 `/home/ubuntu/ssl/`
4. `sudo nginx -t && sudo nginx -s reload`

---

## 9. 切换到生产环境（待办）

生产环境的 REDIRECT_URI / 域名 / 证书都需要重新评估：

| 待办 | 说明 |
|---|---|
| 生产域名 | 建议 `oauth.bhgt.sixonehub.site` 专属子域 |
| 生产证书 | 续期时把生产域名加进 SAN |
| `.env.production` | 当前仍是旧占位 `https://player.bhgt.sixonehub.site/auth/callback`（小团队无秘密，值本身可共享；此处待改仅因生产域名 / 证书 SAN 决策未定）|
| TapTap 开发者中心 | 重新登记生产 REDIRECT_URI |
| 前端生产 build | `vite build --mode production`，注入生产 VITE_TAPTAP_* |

---

## 10. 参考

- `tech-docs/taptap-h5-integration.md`：TapTap 上线总策略（H5 通道、防沉迷、ICP、实名等）
- `nginx_conf/sites-available/sixonehub.site.conf`：本地镜像配置（含 OAuth 回调 location）
- `scripts/pull_nginx_conf.sh` / `scripts/push_nginx_conf.sh`：nginx 配置同步脚本
- `项目内存 2026-08-07.md`：当日 OAuth 设计与证书预警
