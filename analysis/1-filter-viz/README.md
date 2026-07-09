# 1-filter-viz

第一步：只基于众包采集记录的文字信息，初步筛选哪些记录可能属于“博物馆展陈可视化”。

这个目录属于后续分析工作，不属于 `museum-viz-collector` 采集/浏览系统。采集数据由上层 `analysis/` 项目统一同步和管理。

筛选结果默认输出到：

```bash
data/results/llm_visualization_filter.jsonl
data/results/llm_visualization_filter.summary.json
```

## 环境变量

LLM 配置放在本目录的 `.env`，不要依赖 `museum-viz-collector/backend/.env`。脚本会读取：

```bash
IKUNCODE_BASE_URL
IKUNCODE_API_KEY
IKUNCODE_MODEL
IKUNCODE_TEMPERATURE
IKUNCODE_TIMEOUT_SECONDS
IKUNCODE_TIMEOUT_MS
IKUNCODE_MAX_RETRIES
```

## 运行

先做不调用 LLM 的结构检查：

```bash
python3 classify_visualization_items.py --dry-run --limit 1
```

小批量真实调用：

```bash
python3 classify_visualization_items.py --limit 10 --concurrency 1
```

全量运行：

```bash
python3 classify_visualization_items.py --resume --concurrency 2
```

## 输出说明

JSONL 一行对应一个 `VizItem`。每行包含：

- `source`：来源 draft、unit、item 的定位信息。
- `input`：送入 LLM 的文字字段。
- `result`：LLM 初筛结果，包含 `label`、`is_visualization`、`reason`。

脚本会校验：

- `label` 必须是 `A/B/C/D`。
- `is_visualization` 必须和 `label` 一致：`A=true`，`C=false`，`B/D=null`。
- `reason` 不截断，保留完整文字依据。
