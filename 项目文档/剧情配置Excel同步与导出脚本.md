# 剧情配置 Excel 同步与导出脚本

## 1. 目标

用 `剧情配置/事件与节点配置表.xlsx` 维护以下三层数据：

```text
大阶段（数据库已有，ObjectId 引用）
└─ 事件 config.nodeBundles（业务编号引用）
   └─ 剧情节点 config.nodes（事件编号 + 子编号）
      └─ 按钮 buttons[]（节点内嵌）
```

用户填写名称和子编号，脚本负责名称反查、完整编号生成、类型转换、图片路径转换以及数据库 upsert。

## 2. 脚本

| 脚本 | 作用 |
|---|---|
| `scripts/sync-story-config.mjs` | 校验 Excel、补全图片路径、可选上传图片、同步到 `bhgt_test` |
| `scripts/export-story-config.mjs` | 从 `bhgt_test` 只读导出事件 / 剧情节点 / 按钮三 Sheet Excel |

数据库默认连接 `mongodb://127.0.0.1:47017/bhgt_test`，可通过 `--mongo-uri`、`--db-name` 或环境变量覆盖。47017 端口由 MongoDB 反向隧道提供。

## 3. 同步脚本用法

```bash
cd bhgt-ai-collaboration/scripts

# 仅校验并将结果写回 Excel（错误单元格标红）
node sync-story-config.mjs --check

# 先调用既有图片上传脚本，再校验
node sync-story-config.mjs --upload-images --check

# 自动先上传图片、再校验；全部通过才同步数据库
node sync-story-config.mjs --sync-db

# 图片上传 + 校验 + 同步
node sync-story-config.mjs --upload-images --sync-db
```

可选参数：

| 参数 | 说明 |
|---|---|
| `--input <xlsx>` | 输入工作簿，默认 `剧情配置/事件与节点配置表.xlsx` |
| `--upload-images` | 最先执行 `upload-images-to-oss.mjs`；上传失败则立即停止 |
| `--check` | 校验并把图片补全/错误红字写回输入工作簿 |
| `--sync-db` | 自动先上传图片并执行 check；有任一错误则不写数据库 |
| `--mongo-uri <uri>` | 默认 `mongodb://127.0.0.1:47017` |
| `--db-name <name>` | 默认且只建议使用 `bhgt_test` |

没有操作参数时只显示帮助，不上传、不改 Excel、不访问数据库。

## 4. 编号规则

- 事件：读取「ID」并原样作为事件业务编号（兼容 `1.1`、`nb_002` 等现有格式）；留空时按事件行顺序生成 `nb_1`、`nb_2`……。
- 节点：优先读取「节点子编号」，并兼容旧表头「节点ID」。留空时按同事件内出现顺序生成 `1`、`2`……。
- 节点完整编号：`${事件编号}_${节点子编号}`，只由脚本生成，例如 `nb_11_01`。
- 按钮编号：`b_${节点完整编号}_${序号}`，仅作为节点内嵌按钮标识，不供其它表引用。
- 按钮「关联节点中文名」「目标中文名」分别反查所属节点和目标节点的完整编号。

中文名必须唯一；重名、父名称不存在、目标名称不存在均属于阻塞错误。

## 5. 图片规则

图片总目录固定为 `bhgt-ai-collaboration/图片/`。

1. 所有标题包含「图」的图片字段都参与处理。
2. 若单元格已经精确等于本地图片的中文相对路径，则保持不动。
3. 否则按相对路径或纯文件名在图片总目录中精确查找。
4. 找到后，将以 `/` 开头的中文相对路径写回 Excel；例如 `平儿.jpg` 补全为 `/cg/清纯/平儿.jpg`。
5. 找不到或同名文件不唯一时，保留原值并把单元格字体标红；校验失败。
6. 同步写数据库时，才将该中文路径逐段转为无声调小写拼音 OSS 路径；例如 `/cg/清纯/平儿.jpg → /cg/qingchun/pinger.jpg`。
7. 导出时，脚本按 `图片/` 目录把数据库的 OSS 拼音路径反查回中文相对路径。

## 6. 数据类型与关联转换

- 「是 / 否」转换为 boolean。
- 显示按钮数、按钮序号、权重转换为 number。
- 大阶段按 Excel 中的阶段名称查询 `config.stages`，写入其 `_id`；找不到或名称不唯一则报错。
- 事件与节点的所属关系使用 `nodeBundleCode`。
- 节点完整编号使用 `nodeBundleCode + '_' + nodeSubCode`。
- 按钮目标使用目标节点完整编号 `nextNodeId`。

若节点 Sheet 的「所属阶段」与其事件的阶段不一致，相关阶段单元格标红并阻止同步。

## 7. 数据库写入规则

- 事件优先按 `code` 匹配；若编号变化，则按全局唯一中文名匹配原记录。
- 节点优先按完整 `code` 匹配；若首次启用子编号导致完整编号变化，则按全局唯一节点名称匹配原记录。
- 已存在时只 `$set` 业务字段，保留原 MongoDB `_id`。
- 不存在时插入，由 MongoDB 生成新 `_id`。
- 按钮随节点整体更新。
- Excel 未出现的数据库记录不删除。
- `--sync-db` 的校验不通过时，数据库零写入。

## 8. 导出脚本用法

```bash
node export-story-config.mjs
node export-story-config.mjs --output ../剧情配置/自定义导出.xlsx
```

导出脚本只读数据库，将 ObjectId / 编号反查为 Excel 可编辑名称，并输出「事件」「剧情节点」「按钮」三张 Sheet。默认输出：`剧情配置/数据库导出_事件与节点.xlsx`。
