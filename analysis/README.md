# analysis

博物馆展陈可视化采集数据的后续分析项目。

`museum-viz-collector` 只负责前端采集、后端存储和本地浏览；本目录负责从服务器拉取一份只读本地镜像，并在各个分析步骤中消费这份镜像。

## 数据镜像

本地镜像位置：

```bash
data/
```

结构保持服务器原样：

```bash
data/submissions/<userKey>/draft.json
data/uploads/<userKey>/...
```

同步命令：

```bash
./ops/sync-data-from-server.sh
```

这个同步是单向的：服务器是 source，本地 `data/` 是 destination。脚本不会把本地数据写回服务器；`rsync --delete-delay` 只影响本地镜像。

## 当前步骤

- `1-filter-viz/`：用 LLM 基于文字信息初筛是否属于展陈可视化。
