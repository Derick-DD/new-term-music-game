# 开学冲冲冲！

一款为开学季活动设计的 H5 校园节奏游戏。玩家在蓝、绿、粉配色的校园道路上
跟随强拍收集目标、避开障碍并使用道具，交通工具会依次从自行车升级为摩托车、
小轿车和校车大巴。游戏使用唯一活动歌曲与随版本发布的预制节拍谱面，并包含
五档结局分享卡和活动排行榜。

当前版本使用标准 Next.js Node.js 服务，可直接部署到阿里云 ECS，不依赖
Cloudflare Worker、D1、Wrangler 或 vinext。

## 音乐与授权

当前版本只使用《恭喜你发现了宝藏》这一首歌曲，不提供选歌或本地上传入口：

- 音频：`public/audio/congratulations-treasure-tf-family.mp3`
- 时长：86 秒，120 BPM
- SHA-256：`448bddb1c19d0da0fe5911a28babbdbe6ce73477c1bcc0eaffea64c49e8874b5`
- 预制谱面：`app/data/congratulations-treasure.chart.json`
- 谱面版本：`treasure-120bpm-v1`

谱面包含 173 个严格递增的时间点，以及等长的车道、音符强度和节奏能量数组。
浏览器不会下载整首歌曲后执行 `decodeAudioData` 或现场卡点分析，因此本地文件与
线上接口返回同一音频版本时都能立即使用一致的谱面。更换母带、剪辑开头、改变
歌曲时长或调整速度时，必须重新生成谱面并同步更新音频哈希与 `chartVersion`。

部署方仍需确保拥有覆盖母带、词曲、小游戏内使用、信息网络传播、剪辑循环及活动
推广的有效授权；平台会员、试听和离线下载权限本身不等于上述授权。

### 线上音频接口

默认使用仓库内音频。也可以通过环境变量将播放源切换为同版本线上文件，预制谱面
仍由应用包直接提供：

- `NEXT_PUBLIC_TREASURE_AUDIO_URL`：直接指定同版本音频 URL。
- `NEXT_PUBLIC_TREASURE_AUDIO_API`：返回音频信息的接口，JSON 至少包含
  `url`、`audioId` 和 `chartVersion`。

接口的 `audioId` 必须为 `congratulations-treasure-tf-family`，且
`chartVersion` 必须为 `treasure-120bpm-v1`。接口不可用或版本不匹配时会回退到
本地音频；远端文件时长若与预制的 86 秒相差超过 750 毫秒，也会自动回退，避免
错误母带造成画面与音乐错拍。

## 校园季内容

- 地图：蓝绿粉手绘校园道路，不包含海报文字或入口按钮。
- 车辆：自行车 → 摩托车 → 小轿车 → 校车大巴。
- 道具与障碍：书包仅作为惊喜道具；磁铁、闪电保留，道路障碍改为路锥、维修坑洼和隔离路障；撞到过街老人会进入失败结算页。
- 结局称号：佛系咸鱼、知识分子、卷王本王、隐形学霸、天才学神。

## ImageGen 图标

游戏使用 20 个透明 PNG 图标，统一存放在
`public/assets/campus-season/icons/`。它们覆盖知识星、书包、磁铁、闪电、三类障碍、
过街老人、播放与操控按钮，以及五档结局称号。所有图标均使用校园蓝、薄荷绿、粉、
奶油白和黄色的手绘彩铅风格，并由 `app/page.tsx` 显式引用。

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

提交前建议完整验证：

```bash
npm run lint
npm test
```

`npm test` 会先执行生产构建，再运行校园主题与核心玩法的静态回归测试，包括唯一
音频、预制谱面版本与哈希、数组完整性，以及 20 个 ImageGen 图标的存在性和引用。
也可以仅检查生产构建：

```bash
npm run build
```

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
| `NEXT_PUBLIC_TREASURE_AUDIO_URL` | 空 | 同版本线上音频直链；为空时使用本地音频 |
| `NEXT_PUBLIC_TREASURE_AUDIO_API` | 空 | 返回 `url`、`audioId`、`chartVersion` 的线上音频接口 |

## 排行榜存储

- 当前唯一歌曲按 `audioId + chartVersion` 使用独立排行榜键。
- 同一设备在当前歌曲和谱面版本中保留历史最佳成绩。
- 成绩按照“粉丝数 × 最大连击”计算，并映射为五档校园称号。
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
