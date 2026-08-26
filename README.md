# 开学冲冲冲！

开学季移动端校园节奏游戏。玩家跟着《恭喜你发现了宝藏》收集知识、切换五条车道、避开校园道路障碍，并将载具从自行车升级为摩托车、小轿车和校车大巴。

项目为纯静态前端：不包含排行榜、服务端 API 或数据库。`next build` 会生成可直接托管的 `out/`，Sites 构建仅增加一个静态资源转发壳。

## 内容与玩法

- 唯一歌曲：`public/audio/congratulations-treasure-tf-family.mp3`
- 版本化节拍数据：`app/data/congratulations-treasure.chart.json`
- 五条固定车道；知识和障碍生成后不会改变车道
- 每局固定出现 2 个书包，另有磁铁与闪电道具
- 行人提前提示并慢速通过，只在斑马线中央形成短暂危险窗口
- 结局称号：佛系咸鱼、知识分子、卷王本王、隐形学霸、天才学神
- 分享卡预留二维码位置，后续替换为活动正式网址

更换音频母带、剪辑开头或调整播放速度时，必须同步更新版本化节拍数据。部署方需要确保拥有覆盖小游戏和活动推广的完整音乐授权。

## 线上同版本音频

默认播放仓库内音频。静态构建时可以配置：

- `NEXT_PUBLIC_TREASURE_AUDIO_URL`：同版本音频直链
- `NEXT_PUBLIC_TREASURE_AUDIO_API`：返回 `url`、`audioId`、`chartVersion` 和 `audioSha256` 的接口

接口版本信息不匹配或不可用时会回退到本地音频，游戏仍使用随站点发布的同一份节拍数据。

## ImageGen 素材

`public/assets/campus-season/` 中的四级载具均由 ImageGen 重新设计：自行车和摩托车有驾驶员，小轿车和校车能看到乘员。`icons/` 中的知识、书包、磁铁、闪电、障碍、行人、控制按钮和结局图标也使用统一的校园蓝、薄荷绿、粉色和奶油白手绘风格。

## 本地开发

需要 Node.js `>=22.13.0` 和 npm。

```bash
npm ci
npm run dev
```

打开 `http://localhost:3000`。

## 构建与验证

```bash
npm run lint
npm test
```

完整构建包含两步：

```bash
npm run build:static  # 生成 out/
npm run build:sites   # 将 out/ 适配为 Sites 发布包
```

也可以直接运行：

```bash
npm run build
```

静态站点入口为 `out/index.html`。Sites 产物位于 `dist/client/`，`dist/server/index.js` 只负责返回静态资源。

## Docker 静态托管

```bash
docker compose up -d --build
```

镜像使用 Nginx 直接托管 `out/`，默认映射到宿主机 `3000` 端口，不需要持久化卷。

## 常用命令

```bash
npm run dev
npm run lint
npm test
npm run build
npm run start
```
