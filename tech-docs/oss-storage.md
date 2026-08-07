# 阿里云 OSS 存储配置（BHGT 协作仓库）

> 小团队约定：所有凭据在团队内共享，明文写入本仓库与各代码工程的 `.env.*`。
> 2026-08-07 启用。Bucket 由用户手动创建并设 ACL。

## 一、凭据（AccessKey）

| 字段 | 值 |
|---|---|
| AccessKey ID | `LTAI5tAHKRU7xm74Spht8KC9` |
| AccessKey Secret | `Tma5Gtq8hctLxs10dLwTNRpLfG6CKw` |
| RAM 用户权限 | `AliyunOSSFullAccess`（子用户，非主账号）|

## 二、Bucket 信息

| 字段 | 值 |
|---|---|
| Bucket 名称 | `bhgt-public-files` |
| 地域（Region） | `oss-cn-beijing`（华北 2 / 北京）|
| Endpoint | `https://oss-cn-beijing.aliyuncs.com` |
| 外网访问域名（三级域名）| `https://bhgt-public-files.oss-cn-beijing.aliyuncs.com` |
| 存储类型 | Standard |
| ACL | `public-read` —— 公网**匿名可 GET（读）**；**写 / 删 / 列** 必须带 AccessKey 签名 |

## 三、访问方式

- **浏览器 / 前端直接读**（公开资源，如 CG 图片、静态包）：直接用三级域名，无需任何 key。
  ```
  https://bhgt-public-files.oss-cn-beijing.aliyuncs.com/<object-key>
  ```
- **服务端写 / 删 / 列**：用 `bhgt-server` 的 `OSS_*` 环境变量 + 官方 SDK（`ali-oss`）。
- ⚠️ **必须用三级域名**（`bucket.endpoint/key`），不能用 `endpoint/bucket/key` 二级域名形式，否则 OSS 返回 `SecondLevelDomainForbidden`。

## 四、服务端环境变量（已写入 `bhgt-server/.env.*`）

```bash
OSS_ACCESS_KEY_ID=LTAI5tAHKRU7xm74Spht8KC9
OSS_ACCESS_KEY_SECRET=Tma5Gtq8hctLxs10dLwTNRpLfG6CKw
OSS_BUCKET=bhgt-public-files
OSS_REGION=oss-cn-beijing
OSS_ENDPOINT=https://oss-cn-beijing.aliyuncs.com
```

> 小团队无秘密：所有凭据明文进 git 共享。技术上，Secret 只服务端需要（OSS 写 / 删 / 列都在后端），放进 H5 bundle 会被反编译暴露且无用途，故本项目 Secret 留在 `bhgt-server/.env.*`；前端只读走三级域名公开 URL。团队内如需前端也持有，无保密顾虑，仅自担反编译暴露风险。

## 五、图片批量上传脚本

位置：`scripts/upload-images-to-oss.mjs`（依赖装在 `scripts/node_modules`，已被 `.gitignore` 忽略）。

### 用法

```bash
cd bhgt-ai-collaboration
node scripts/upload-images-to-oss.mjs <图片目录> [--env <env文件路径>] [--recursive]
```

- `<图片目录>`：必填，要上传的图片所在目录。
- `--env <path>`：可选，覆盖默认读取的 env 文件（默认读 `../bhgt-server/.env.test`，凭据各环境一致）。
- `--recursive`：可选，递归扫描子目录（保留目录结构，避免重名覆盖）。

### 脚本规则（与协作流程对齐）

1. **遍历目录**下所有图片（扩展名：jpg/jpeg/png/gif/webp/bmp/svg/ico/tiff/heic/avif）。
2. **中文名转拼音**：文件名含中文时，转成汉语拼音（无声调、小写），作为 OSS 上的对象名；不含中文则保持原名。递归模式下目录结构也同步转拼音。
3. **上传后写 SHA1**：每张成功上传的图片，在其**同目录、同名**位置写一个 `<图片名>.sha1.txt`，内容为文件 SHA1 值。
4. **忽略 / 覆盖规则**（幂等靠 OSS 对象元数据 `x-oss-meta-sha1` 判定，不依赖本地清单）：
   - 转换文件名后，**线上已存在同名对象且 SHA1 一致** → 跳过，不传。
   - 转换文件名后，**线上已存在同名对象但 SHA1 不一致** → **覆盖上传**。
5. SHA1 同时写入 OSS 对象元数据 `x-oss-meta-sha1`，供后续比对线上文件是否被改过。

### 设计决策（可改）

- 「同名 TXT」文件名约定为 `<原图片路径>.sha1.txt`（如 `风景.png` → `风景.png.sha1.txt`），写在原图同目录。
- 递归模式下对象名保留相对路径（如 `cg/fengjing/scene1.png`），避免不同子目录同名文件互相覆盖。
