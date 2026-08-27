# 开学冲冲冲！

QQ 音乐开学季移动端节奏游戏。业务源码位于 `app/` 与 `public/`，发布版由
Vite 直接构建为纯静态 HTML、CSS、JavaScript 与图片资源；最终产物不包含
Next 运行时或 `_next/`。

## 音乐播放与统计

- 正式歌曲：QQ 音乐 `songid=380208811`《恭喜你发现了宝藏》
- 业务调用：`Activity.music.play/pause/resume`
- 底层播放器：QMPlayer 官方 CDN
- 播放权限：不查询登录、VIP 或 SVIP，播放结果以 QMPlayer 的真实
  `play` / `error` 事件为准
- 失败策略：不回退本地 MP3，静态产物中不包含音频文件
- 端外拉起：`webview.outsideLaunch.enabled=false`，不加载
  `qmfe-unity-ad`，不创建 `QMPlugin`
- PV/UV：按正式 H5 入口顺序加载 `preact.js`、`music.js`；`music.js` 自动
  初始化页面统计，并通过 `window.Music = window.Music || window.M` 兼容
  QMPlayer 与页面现有端内能力调用

`music.js` 包含 QQ 音乐域名保护逻辑，发布包应部署在
`https://y.qq.com/viber_pub/campus_gogogo/`，不能用非 QQ 音乐域名作为正式
验收地址。

## 构建与交付

```bash
npm run build
npm test
```

构建链路：

```text
当前 app/ + public/ → Vite 浏览器静态构建 → out/ → 自动校验与来源清单
```

校验器会拒绝音频文件、`.DS_Store`、Next 运行时、旧主题资源、测试域内容、
错误的官方脚本顺序、错误歌曲 ID，以及任何未进入预加载清单的图片。校验通过
后生成 `out/static-build-manifest.json`，记录参与构建的源码与静态产物树
SHA-256。

`app/data/static-image-assets.json` 覆盖 `public/` 中全部图片；页面只有在所有
图片加载成功后才允许开始游戏。最终交付 ZIP 只从本次构建生成的 `out/` 创建。
