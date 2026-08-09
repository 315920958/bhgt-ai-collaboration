import { execSync } from 'child_process'

const py = `/Users/user/.workbuddy/binaries/python/envs/default/bin/python`
const code = `
import pymongo, datetime
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment

def default(o):
    if isinstance(o, datetime.datetime): return o.isoformat()
    return str(o)

c = pymongo.MongoClient("mongodb://127.0.0.1:47017", serverSelectionTimeoutMS=5000)
db = c["bhgt_test"]

# ---- 读取（只读，不改库）----
bundles = list(db["config.nodeBundles"].find({}))
nodes   = list(db["config.nodes"].find({}))
stages  = {str(s["_id"]): s.get("name","") for s in db["config.stages"].find({})}

# 映射表
node_by_code = {n["code"]: n for n in nodes}
node_name_by_code = {n["code"]: n.get("name","") for n in nodes}
bundle_by_id = {str(b["_id"]): b for b in bundles}
bundle_name_by_id = {str(b["_id"]): b.get("name","") for b in bundles}

# ============================================================
#  表头（三 sheet）
# ============================================================
H_EVENT = ['中文名', 'ID', '所属阶段', '描述', '配图(中文名)']
H_NODE  = [
    '节点ID', '节点名称', '所属阶段', '所属事件',
    '剧情标题', '剧情正文', '配图(中文名)',
    '显示按钮数', '战斗节点', '通过后开商店'
]
H_BTN   = [
    '关联节点中文名', '序号', '文案', '类型', '必现', '权重', '目标中文名'
]

def yn(b): return '是' if b else '否'

# ============================================================
#  Sheet 1: 事件
# ============================================================
event_rows = []
for b in bundles:
    event_rows.append([
        b.get('name',''),
        b.get('code',''),                          # ID（AI 可帮生成，但得有）
        stages.get(str(b.get('stageId','')), str(b.get('stageId',''))),
        b.get('description',''),
        b.get('imageUrl','')
    ])

# ============================================================
#  Sheet 2: 剧情节点（仅基础配置，不含战斗子字段）
# ============================================================
node_rows = []
for n in nodes:
    parent_name = bundle_name_by_id.get(str(n.get('nodeBundleId','')), str(n.get('nodeBundleId','')))
    node_rows.append([
        n.get('code',''),                           # 节点 ID
        n.get('name',''),                           # 节点名称（中文名）
        stages.get(str(n.get('stageId','')), str(n.get('stageId',''))),
        parent_name,                                # 所属事件（= 父中文名）
        n.get('title',''),
        n.get('text',''),
        n.get('imageUrl',''),
        n.get('buttonCount',''),
        yn(n.get('isBattle', False)),
        yn(n.get('afterCompletionOpenShop', False))
    ])

# ============================================================
#  Sheet 3: 按钮（独立表）
# ============================================================
def btn_target_name(nc):
    return node_name_by_code.get(nc, nc)

btn_rows = []
for n in nodes:
    node_name = n.get('name','')
    buttons = n.get('buttons') or []
    for idx, btn in enumerate(buttons):
        btn_rows.append([
            node_name,
            idx + 1,
            btn.get('text',''),
            btn.get('type','normal'),
            yn(btn.get('isRequired', False)),
            btn.get('weight',''),
            btn_target_name(btn.get('nextNodeId',''))
        ])

# ============================================================
#  写出 xlsx
# ============================================================
wb = Workbook()
HDR_FILL = PatternFill("solid", fgColor="FFE8E0D0")
HDR_FONT = Font(bold=True)
HDR_ALIGN = Alignment(vertical="center", wrap_text=True)

def style(ws, ncols):
    for col in range(1, ncols + 1):
        cell = ws.cell(row=1, column=col)
        cell.font = HDR_FONT
        cell.fill = HDR_FILL
        cell.alignment = HDR_ALIGN
    ws.row_dimensions[1].height = 28

# --- 事件 ---
wsEv = wb.active
wsEv.title = '事件'
wsEv.append(H_EVENT)
for r in event_rows: wsEv.append(r)
style(wsEv, len(H_EVENT))

# --- 剧情节点 ---
wsNd = wb.create_sheet('剧情节点')
wsNd.append(H_NODE)
for r in node_rows: wsNd.append(r)
style(wsNd, len(H_NODE))
wsNd.column_dimensions['F'].width = 50   # 正文
wsNd.column_dimensions['B'].width = 14   # 名称

# --- 按钮 ---
wsBtn = wb.create_sheet('按钮')
wsBtn.append(H_BTN)
for r in btn_rows: wsBtn.append(r)
style(wsBtn, len(H_BTN))

out = "/Users/user/Documents/dev/nodejs/bhgt/bhgt-ai-collaboration/剧情配置/数据库导出_事件与节点.xlsx"
wb.save(out)
print("✅ 导出完成（只读，未改动数据库）:", out)
print(f"   事件: {len(event_rows)} 行 | 剧情节点: {len(node_rows)} 行 | 按钮: {len(btn_rows)} 行")
`
import fs from 'fs'
fs.writeFileSync('/tmp/_export.py', code)
console.log(execSync(`${py} /tmp/_export.py`).toString())
