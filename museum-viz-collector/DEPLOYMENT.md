# 部署说明

现在服务器端只用 Python，不需要 Node/NPM。

前端还是放在 Nginx 的 `collection` 目录下：

```text
/collection/index.html
```

后端单独跑 Python 服务，只负责：

```text
/exhibition_api/
/exhibition_uploads/
```

## 数据目录

默认数据目录就是项目里的 `data/`：

```text
/opt/museum-viz-collector/data/
```

里面会保存：

```text
data/
├── submissions/
│   └── user_xxxxxxxxxxxx/
│       ├── draft.json
│       └── voice_recordings.jsonl   # 语音输入的后台日志（不在前端显示）
└── uploads/
    └── user_xxxxxxxxxxxx/
        ├── environment/
        ├── photos/
        └── audio/                   # 语音输入的原始录音也存在这里
```

> 用户点「🎤 语音」时，原始录音会存进 `uploads/<user>/audio/`，同时在 `submissions/<user>/voice_recordings.jsonl` 追加一条记录（每行一条 JSON）：录音时间 `createdAt`（按先后顺序）、所属分段 `section`/`sectionLabel`、`unitId`/`itemId`、以及识别出的 `text`。这些只在后台保存，前端不展示。以后想换方案（如本地 Whisper）批量重转时，audio 目录里的原始录音就是数据源。

## 推送代码

在本机项目目录执行：

```bash
DEPLOY_HOST=49.233.250.13 \
DEPLOY_USER=root \
DEPLOY_PATH=/opt/museum-viz-collector \
STATIC_WEB_ROOT=/usr/share/nginx/html/collection \
./ops/deploy-python-rsync.sh
```

这个脚本会：

1. 在本机执行 `npm run build`。
2. 把 `dist/` 上传到服务器的 `collection` 目录。
3. 把 `backend/python_server.py` 上传到服务器。

如果你的 Nginx 目录不是 `/usr/share/nginx/html/collection`，把 `STATIC_WEB_ROOT` 改成真实路径。

## 启动后端

进入你的 Conda 环境后，在服务器上执行：

```bash
cd /opt/museum-viz-collector
python backend/python_server.py
```

默认端口就是 `8787`，默认数据目录就是当前项目的 `data/`。

检查后端：

```bash
curl http://127.0.0.1:8787/exhibition_api/health
```

## 语音转写（腾讯云一句话识别）

描述框里的「🎤 语音」按钮会把录音发到 `/exhibition_api/transcribe`，后端调腾讯云一句话识别（SentenceRecognition）转成文字。要让它工作，服务器上需要：

1. **装 ffmpeg**（把手机录的 webm/m4a 统一转成 16k 单声道 wav，识别最稳）：

   ```bash
   conda install -c conda-forge ffmpeg   # 或 apt install ffmpeg
   ```

2. **配置密钥**（环境变量，不要写进代码）。去[腾讯云访问管理](https://console.cloud.tencent.com/cam/capi)拿 SecretId / SecretKey，并在控制台开通「一句话识别」服务：

   ```bash
   cd /opt/museum-viz-collector
   pkill -f backend/python_server.py
   TENCENT_SECRET_ID=你的SecretId \
   TENCENT_SECRET_KEY=你的SecretKey \
   nohup python backend/python_server.py > python-server.log 2>&1 &
   ```

   可选环境变量：`TENCENT_ASR_REGION`（默认 `ap-guangzhou`）、`TENCENT_ASR_ENGINE`（默认 `16k_zh` 中文普通话）。

### 额度自动兜底

默认用「一句话识别」（同步、快、5000 次/月免费）。当它返回 `FailedOperation.UserHasNoFreeAmount` 或 `FailedOperation.UserHasNoAmount`（免费额度/资源包用尽）时，后端会**自动切换到「录音文件识别」**（异步、慢几秒，有独立的 10 小时/月免费额度），所以也要在控制台一并开通「录音文件识别」。`voice_recordings.jsonl` 里的 `engine` 字段会标明每条用的是 `sentence` 还是 `file`。

想**演示/测试**这个切换而不真的耗尽额度：启动时加 `TENCENT_ASR_SIMULATE_NO_QUOTA=1`，它会假装一句话识别额度用尽、强制走录音文件识别。验证完去掉这个变量即可。

排查：`transcribe` 返回 `Not Found`(404) = 新后端没部署；返回 `服务器未配置腾讯云语音识别密钥`(503) = 没设密钥；返回文字 = 成功。

## Nginx 配置

保留你原来的 `/collection/` 静态前端配置，再加这两段：

```nginx
location /exhibition_api/ {
  proxy_pass http://127.0.0.1:8787;
}

location /exhibition_uploads/ {
  proxy_pass http://127.0.0.1:8787;
}
```

如果需要完整一点：

```nginx
server {
  listen 80;
  server_name 你的域名或服务器IP;

  root /usr/share/nginx/html;
  client_max_body_size 60m;

  location /collection/ {
    try_files $uri $uri/ /collection/index.html;
  }

  location /exhibition_api/ {
    proxy_pass http://127.0.0.1:8787;
  }

  location /exhibition_uploads/ {
    proxy_pass http://127.0.0.1:8787;
  }
}
```

改完 Nginx 后：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 可选：后台常驻

如果你不想一直开着 SSH，可以用 `nohup`：

```bash
cd /opt/museum-viz-collector
nohup python backend/python_server.py > python-server.log 2>&1 &
```

查看：

```bash
tail -f python-server.log
```

停止：

```bash
pkill -f backend/python_server.py
```


### 数据同步

服务器数据拉到本地：(默认会从root@49.233.250.13:/opt/museum-viz-collector/data/同步到本地：/Users/mxy/Desktop/博物馆可视化/museum-viz-collector/data/)
```bash
cd /Users/mxy/Desktop/博物馆可视化/museum-viz-collector
npm run sync:data
```
打开本地浏览页：npm run review:data

访问：http://127.0.0.1:5173/?review=1

**后端只有在 MUSEUM_VIZ_REVIEW=1 时才开放“列出全部提交”的接口，正常线上部署不会默认暴露这个接口。浏览页可以按姓名、手机号、博物馆、展览搜索，左侧选提交，右侧看详情、图片/音频和导出单份 JSON。**
