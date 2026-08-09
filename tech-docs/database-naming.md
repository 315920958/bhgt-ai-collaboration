# Database Naming & Environment Mapping

本项目使用 MongoDB。区分生产环境与开发/测试环境，使用不同数据库名。

## 数据库名

| 环境 | 数据库名 | 说明 |
| --- | --- | --- |
| 生产 (production) | `bhgt` | 线上正式数据 |
| 开发 / 测试 (development / test) | `bhgt_test` | 本地开发与测试数据 |

## 命名约定

- 数据库名使用下划线（snake_case）：`bhgt`、`bhgt_test`。
- 不使用横杠（`-`）：横杠在部分驱动 / 工具 / URI 解析下存在边界情况；下划线在 shell、连接串、Mongoose 中零歧义且无需转义。
- `_test` 后缀为测试库通用习惯，语义一眼可辨。

## 连接方式

- 本地通过 SSH 隧道连接线上库：`scripts/tunnel-mongo.sh` 将远端 `127.0.0.1:27017` 映射到本机 `47017`，
  连接串为 `mongodb://localhost:47017`。
- 直接在服务器上时：`mongosh`。
- MongoDB 惰性建库：`use <db>` 后插入首条数据（或建集合）库才真正落盘。

## 双层命名约定（代码 / 界面分离 · 2026-08-07 起）

本项目存在一个**代码标识符**与**用户可见文案**双层命名的特殊情况：

- 集合 `config.nodeBundles` 在**代码 / 数据层**称为「**节点包(nodeBundle)**」——路由 `/node-bundles`、字段 `nodeBundleCode`、组件名 `NodeBundleListView` 等一律用 `nodeBundle`。
- 在 **admin 后台的用户可见文案层**统一显示「**事件**」（左侧菜单、路由标题、页面标题、按钮、列表列名、弹窗、表单标签），仅为展示别名，**代码标识符不变**。

> 规则：凡涉及「该集合」的命名——数据 / 接口 / 数据库层面写 nodeBundle（节点包），只有给人看的 UI 文案写「事件」。切勿在代码层混用「事件」二字。

## TODO

- 数据表（集合）设计：待补充，见后续 `database-schema.md`。
