# 应援大巴冲冲冲！

一款支持选歌、自动卡点、车辆升级、道具和分歌曲排行榜的 H5
像素节奏游戏。当前版本使用标准 Next.js Node.js 服务，可直接部署到阿里云
ECS，不再依赖 Cloudflare Worker、D1、Wrangler 或 vinext。

## 运行环境

- Node.js `>=22.13.0`
- npm
- 阿里云 ECS，或任何可运行 Node.js / Docker 的 Linux 服务器

## 本地运行

```bash
npm ci
npm run dev
```

打开 `http://localhost:3000`。

## 阿里云 ECS：Docker 部署（推荐）

1. 在 ECS 安全组中开放需要使用的端口，例如 `3000`，正式域名建议仅开放
   `80` 和 `443` 并通过 Nginx 转发。
2. 安装 Docker 与 Docker Compose。
3. 拉取项目后执行：

```bash
docker compose up -d --build
```

4. 打开 `http://服务器公网IP:3000`。

排行榜数据保存在 Docker 命名卷 `fan_bus_data` 中，重新构建或重启容器不会
清空成绩。备份服务器时需要同时备份这个卷。

## 阿里云 ECS：直接运行 Node.js

```bash
npm ci
npm run build
DATABASE_PATH=/var/lib/fan-bus/fan-bus.sqlite PORT=3000 npm run start
```

请确保运行服务的系统用户对 `DATABASE_PATH` 所在目录拥有写权限。生产环境
建议使用 systemd 或 PM2 保持进程运行，并使用 Nginx 配置 HTTPS。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | Node.js 服务端口 |
| `DATABASE_PATH` | `./data/fan-bus.sqlite` | 排行榜 SQLite 文件路径 |

## 排行榜存储

- 每首歌拥有独立排行榜。
- 同一设备在同一首歌中保留历史最佳成绩。
- SQLite 使用 WAL 模式，并设置写入等待时间，适合单台 ECS 部署。
- 如果后续扩展为多台 ECS，需要把排行榜切换到阿里云 RDS MySQL。

原 Cloudflare D1 中已经存在的数据不会自动出现在新的 SQLite 数据库中；如需
保留旧排行榜，需要先从 D1 导出，再单独导入服务器数据库。

## 常用命令

```bash
npm run dev
npm run lint
npm test
npm run build
npm run start
```
