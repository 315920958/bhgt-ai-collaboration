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

## TODO

- 数据表（集合）设计：待补充，见后续 `database-schema.md`。
