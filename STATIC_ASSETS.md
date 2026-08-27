# Activity H5 静态资源说明

## 唯一来源

静态部署资源由当前仓库的 `app/`、`public/`、Next 配置及锁定依赖直接构建。
仓库内不存在第二套手写发布页面，也不从 `releases/` 复制页面。

生成目录：

- `out/`：Next.js 静态导出，可直接交付到普通静态服务器
- `dist/client/`：Sites 发布资源，内容逐文件继承 `out/`
- `out/static-build-manifest.json`：源码与产物的 SHA-256 来源证明

## QQ 音乐端能力

- 歌曲：`songid=380208811`
- 业务接口：`Activity.music.play/pause/resume/on/off/getState`
- 播放实现：Skill 审核的 QMPlayer CDN
- 会员处理：不检测用户或会员身份；播放成功与否只看播放器真实事件
- 本地音频：禁止 MP3、M4A、WAV、AAC、OGG、FLAC

官方依赖保持为远程脚本，不进入 ZIP：

- `https://y.qq.com/lib/commercial/h5/music-2.4.0.min.js?max_age=604800`
- `https://y.qq.com/component/m/qmplayer/qmplayer.music.js?max_age=604800`
- `https://y.qq.com/component/m/qmfe-unity-report/iife/index.js?max_age=2592000`
- `https://y.qq.com/component/m/fixTopBar/dist/fixTopBar.js?max_age=2592000`
- `https://y.qq.com/component/m/qmfe-unity-ad/iife/index.js?max_age=604800&v=20201223`

## 分享与图片

分享使用 `Activity.share`；分享二维码指向
`https://y.qq.com/viber_pub/campus_gogogo/index.html?_hidehd=1&_miniplayer=1`。
所有本地图片仍由当前页面的预加载流程加载完成后再开始游戏。
`app/data/static-image-assets.json` 必须与 `public/` 下的图片集合完全一致；
构建校验会阻止漏预加载图片的版本发布。
