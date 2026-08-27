# 开学冲冲冲！

QQ 音乐开学季移动端节奏游戏。当前唯一发布源是
`releases/fan-bus-rhythm-rush-h5-20260827/`，它是 Activity H5 Builder
`2026082502` 校验通过的纯静态 H5：不包含 React、TypeScript、npm 构建依赖
或本地音频文件。

## 音乐播放

- 正式歌曲：QQ 音乐 `songid=380208811`《恭喜你发现了宝藏》
- 业务调用：`Activity.music.play/pause/resume`
- 底层播放器：Skill 审核过的 QMPlayer CDN
- 权限处理：先检查登录与 VIP/SVIP；最终是否可播放以 QMPlayer 的真实
  `play`/`error` 事件为准
- 失败策略：正式环境不回退本地 MP3；只有 `localhost + debug=1` 可以进入
  无声交互模拟

游戏节拍数据位于静态包的 `assets/game-chart.json`。它只包含时间与玩法
数据，不包含音频 URL 或本地音频路径。

## 静态包结构

```text
index.html
reset.css
rem.780.css
style.css
preserve.css
activity.config.js
activity.project.json
runtime.js
app.js
assets/
README.md
```

页面按 Skill 要求加载官方 `music-2.4.0.min.js`、QMPlayer、统一上报、
`fixTopBar` 和端外拉端依赖。业务代码不直接调用 QMPlayer、JSBridge 或
`Music.client`。

## 构建与验证

```bash
npm run build
npm test
```

`npm run build:static` 会先检查静态 H5 中不存在音频文件，再把同一份 Skill
包复制到 `out/`；`npm run build:sites` 将 `out/` 原样打入 Sites 发布产物。
因此 Codelix 交付 ZIP 与 Sites 线上页面使用同一个静态资源来源。
