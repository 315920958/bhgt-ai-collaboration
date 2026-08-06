# 统一错误码约定（bhgt-server）

> 代码位置：`src/common/error-code.ts`（集中收口，禁止散落魔法数字）。
> 前端拿到响应里的 `errCode` 对照本文档处理；`message` 为人类语言描述，可直接弹层展示。
> 失败响应形态：`{ message, errCode, exception:{errCode}, auth, user }`（**无 MESSAGE_BODY**，与成功响应分开处理）。

## 错误码表

| errCode | 常量 | 含义 | 前端建议 |
|---|---|---|---|
| 10001 | `PARAM_INVALID` | 参数错误 | 弹层提示 `message` |
| 10002 | `NOT_LOGIN` | 未登录 / token 无效 | 弹层提示并引导登录 |
| 10003 | `TOKEN_EXPIRED` | token 已过期 | 弹层提示并引导重新登录 |
| 10004 | `FORBIDDEN` | 无权限 | 弹层提示 |
| 10005 | `USER_NOT_FOUND` | 用户不存在 | 弹层提示 |
| 10006 | `PASSWORD_MISMATCH` | 密码错误 / 账号未设置密码 | 弹层提示 |
| 10007 | `NOT_FOUND` | 业务记录不存在（配置/存档按 id 查不到） | 弹层提示 |
| 50000 | `SERVER_ERROR` | 服务器内部错误（兜底） | 弹层提示「系统繁忙，请稍后重试」 |

## 分段约定

- `10xxx` 通用 / 参数
- `11xxx` 排行榜
- `13xxx` 好友
- …… 各业务域按段划分；新增错误码统一加到 `src/common/error-code.ts` 并同步本文档。

## 服务端使用

业务层 / controller 一行断言（业务参数校验）：

```ts
import { assert } from '@/utils/assert.util';
import { ErrorCode } from '@/common/error-code';

assert(!!userId, ErrorCode.NOT_LOGIN, '请先登录');
assert(Types.ObjectId.isValid(id), ErrorCode.PARAM_INVALID, 'id 格式错误');
```

`assert` 抛出的异常由全局 `ExceptionFormatFilter` 统一捕获，转成上面的错误响应。

## 响应两种形态（前端务必区分）

- 成功：`{ MESSAGE_BODY: <业务数据>, auth, user }`
- 失败：`{ message, errCode, exception:{errCode}, auth, user }`（无 MESSAGE_BODY）

`auth` / `user` 由 auth-read 拦截器预置，未登录时为 `null`。

## 认证体系速览

- 客户端带 `Authorization: Bearer <token>`；token = AES-256-GCM 加密的 `{ userId, exp }`（密钥 `AUTH_AES_KEY`，Node 原生 crypto）。`exp` 为秒级过期时间戳，`auth-read` 会校验过期。
- `/auth/dev-login`（仅非生产）：输入 `loginCode`，无则自动创建用户，返回的加密 token 由 `ResponseFormatInterceptor` 写入外层 `auth` 字段；前端见到 `auth` 存 localStorage。
- `auth-read` 拦截器：解密 → 校验 `exp` → 查 `sys.users` → 预置 `request.auth`（原始加密 token）/ `request.user`（不强制登录）。
- `auth` 拦截器：强制登录层，`@Public()` 接口放行；其余接口 `request.user` 为空 → 抛 `10002 请先登录`。
