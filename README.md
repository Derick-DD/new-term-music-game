# 开学冲冲冲！

QQ 音乐开学季移动端节奏游戏。项目只有一套业务源码：`app/` 与
`public/`。部署版不是重写页面，而是通过 Next.js `output: "export"` 将当前
源码构建为纯静态 HTML、CSS、JavaScript 与图片资源。

## 音乐播放

- 正式歌曲：QQ 音乐 `songid=380208811`《恭喜你发现了宝藏》
- 业务调用：`Activity.music.play/pause/resume`
- 底层播放器：Activity H5 Skill 指定的 QMPlayer CDN
- 权限策略：不查询登录、VIP 或 SVIP；最终能否播放只以 QMPlayer 的真实
  `play` / `error` 事件为准
- 失败策略：不回退本地 MP3，也不把任何音频文件放进静态产物

## 构建、验证与 Sites 适配

```bash
npm run build:static
npm run build
npm test
```

`npm run build:static` 执行以下固定链路：

```text
当前 app/ + public/ → next build 静态导出 → out/ → 自动校验与来源清单
```

构建入口会先清理 macOS 自动生成的 `.DS_Store`；校验器随后会拒绝音频文件、
残留的 `.DS_Store`、缺失的 Activity/QMPlayer 接口、错误歌曲
ID、缺失的当前玩法/分享文案，以及任何不能与 `public/` 原文件逐字节对应的
Activity 配置文件。校验通过后会生成 `out/static-build-manifest.json`，记录本次
参与构建的所有源码 SHA-256 和静态产物树 SHA-256。

`app/data/static-image-assets.json` 覆盖 `public/` 中的全部图片。页面只有在这
些图片全部加载成功后才允许开始游戏；构建校验会阻止任何未加入预加载清单的
新增图片进入发布包。

`npm run build:sites` 仅把刚生成的 `out/` 复制到 Sites 产物中；测试会再次
逐文件核对 `out/` 和 `dist/client/`。最终交付 ZIP 也只从同一次构建的 `out/`
创建。
