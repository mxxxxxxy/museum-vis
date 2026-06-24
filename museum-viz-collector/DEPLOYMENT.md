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
│       └── draft.json
└── uploads/
    └── user_xxxxxxxxxxxx/
        ├── environment/
        ├── photos/
        └── audio/
```

## 推送代码

在本机项目目录执行：

```bash
DEPLOY_HOST=你的服务器IP \
DEPLOY_USER=root \
DEPLOY_PATH=/opt/museum-viz-collector \
STATIC_WEB_ROOT=/usr/share/nginx/html/collection \
./scripts/deploy-python-rsync.sh
```

这个脚本会：

1. 在本机执行 `npm run build`。
2. 把 `dist/` 上传到服务器的 `collection` 目录。
3. 把 `server/python_server.py` 上传到服务器。

如果你的 Nginx 目录不是 `/usr/share/nginx/html/collection`，把 `STATIC_WEB_ROOT` 改成真实路径。

## 启动后端

进入你的 Conda 环境后，在服务器上执行：

```bash
cd /opt/museum-viz-collector
python server/python_server.py
```

默认端口就是 `8787`，默认数据目录就是当前项目的 `data/`。

检查后端：

```bash
curl http://127.0.0.1:8787/exhibition_api/health
```

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
nohup python server/python_server.py > python-server.log 2>&1 &
```

查看：

```bash
tail -f python-server.log
```

停止：

```bash
pkill -f server/python_server.py
```
