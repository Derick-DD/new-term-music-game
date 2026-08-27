# Activity H5 静态资源说明

## 唯一来源

静态部署资源由当前仓库的 `app/`、`public/`、静态入口及锁定依赖直接构建，
不存在第二套手写发布页面，也不会从 `releases/` 复制页面。

生成目录：

- `out/`：Vite 生成的纯静态资源，可直接上传到正式静态服务器
- `out/static-build-manifest.json`：源码与产物的 SHA-256 来源证明

## QQ 音乐端能力

- 歌曲：`songid=380208811`
- 业务接口：`Activity.music.play/pause/resume/on/off/getState`
- 播放实现：QMPlayer 官方 CDN
- 会员处理：不检测用户或会员身份；播放成功与否只看播放器真实事件
- 本地音频：禁止 MP3、M4A、WAV、AAC、OGG、FLAC
- 端外拉起：关闭，不加载广告拉端组件

官方依赖保持为远程脚本，不进入 ZIP，并按下列顺序加载：

1. `https://y.qq.com/lib/commercial/h5/polyfill.min.js?max_age=2592000`
2. `https://y.qq.com/lib/h5/preact.js?max_age=2592000`
3. `https://y.qq.com/lib/h5/music.js?max_age=604800`
4. `window.Music = window.Music || window.M`
5. `https://y.qq.com/component/m/qmfe-unity-report/iife/index.js?max_age=2592000`
6. `https://y.qq.com/component/m/fixTopBar/dist/fixTopBar.js?max_age=2592000`
7. `https://y.qq.com/component/m/qmplayer/qmplayer.music.js?max_age=604800`

其中 `preact.js` 是 `music.js` 的运行依赖；`music.js` 提供正式 H5 的 PV/UV
统计和 QQ 音乐端能力。发布入口不再加载 `music-2.4.0`，避免两套 Music 核心
同时初始化。

## 分享与图片

分享使用 `Activity.share`；分享二维码与分享链接指向
`https://y.qq.com/viber_pub/campus_gogogo/index.html?_hidehd=1&_miniplayer=1`。
所有本地图片会在开始游戏前预加载；`app/data/static-image-assets.json` 必须与
`public/` 下图片集合完全一致。
