# 开学冲冲冲！活动 H5 交接说明

## 需求与背景

将仓库内原 Next.js/React 校园节奏游戏改造成 QQ 音乐运营环境可直接检查和上传的纯静态移动 H5。交付包不包含 React、TypeScript、npm、构建步骤或本地音频；原主题曲本地 MP3 播放已替换为 Activity H5 Builder 受控运行时的 `Activity.music` 接口，并通过 QMPlayer 播放 QQ 音乐歌曲 `songid=380208811`。

本次按现有页面原貌保留校园首页、手绘校园主视觉、BEST/BANK、本页规则、新手练习、五车道移动、节拍判定、知识与连击、四级载具、障碍减分、校园护盾、锦囊、磁铁、无敌、行人安全失败、结果人设、成绩卡预览和 QQ 音乐图片分享。原 WebAudio 厚/细滤镜调整为同节拍的受击视觉反馈，原因是受控 QMPlayer 接口不开放媒体节点滤镜。

## 页面内容与交互

| 页面/模块 | 用户可见内容 | 功能与交互 | 空态/失败/边界状态 | 配置或依赖 |
| --- | --- | --- | --- | --- |
| 首页 | 原页面活动标题、手绘校园主视觉、本机 BEST/BANK、主题曲卡片 | 首次进入并行预加载全部页面图片与谱面；全部成功后才开放开局 | 任一必需图片或谱面失败时显示重新加载；主题曲不提供本地音频回退 | 保留的原页面 DOM/CSS、本地图片与 `assets/game-chart.json` |
| 玩法页 | 升级、节拍、隐藏人设、安全提示 | 返回首页或直接开始 | 开始时仍校验谱面与在线播放器 | 纯前端交互 |
| 在线主题曲 | 《恭喜你发现了宝藏》、TF家族、歌曲 ID | QQ 音乐用户态可用时先用 `Activity.user.queryProfile` 查询 VIP/SVIP，再用 `Activity.music.play` 播放；必须收到真实 `play` 事件才开局 | 明确非会员或取消登录时阻止播放；站外缺少 `Music.user`、会员查询异常时交由 QMPlayer 校验实际版权；`error` 或 8 秒未收到 `play` 均失败；仅 `localhost + debug=1` 可无声模拟 | `music.songs[0].id=380208811`、`user.requiredMembership=vip` |
| 新手练习 | 强提示的换道与 HIT 两步引导 | 明确提示按住摇杆持续拖动、圆环重合时点击 HIT；每个会话展示一次 | 9 秒自动结束；练习不计分 | `sessionStorage` 仅保存本会话标记 |
| 核心游戏 | 五车道校园道路、载具、知识星星、障碍、进度 | 摇杆按住后以 `requestAnimationFrame` 连续换道、画布滑动、键盘换道和 HIT；按谱面判定 PERFECT/GREAT/GOOD/MISS | 松手、取消、失去指针捕获或离开游戏态时立即停止持续换道 | 本地谱面；移动端 Canvas 480×720 内部坐标 |
| 载具升级 | 自行车、摩托车、小轿车、校车 | 按知识命中、PERFECT 和最高连击自动升级 | 校车为最高等级 | 本地车辆图片与固定升级条件 |
| 道具与受击 | 锦囊、磁铁、闪电、护盾、障碍 | 锦囊随机翻倍/减半；磁铁自动 PERFECT；闪电无敌；护盾减伤 | 道具均按当前局状态清理；障碍不会产生本地奖励或服务端写入 | 纯游戏内状态 |
| 行人安全事件 | 斑马线提示与过街行人 | 提前换道避让 | 碰撞立即暂停音乐并结算失败，活力币为 0 | 本地谱面 `grannyBeats` |
| 暂停与声音 | 暂停遮罩、继续、重开、回首页 | QMPlayer 与内部节拍时钟一起暂停/继续 | 受控播放器没有独立音量接口，因此游戏内 SOUND OFF 等同安全暂停，避免声音与判定漂移 | `Activity.music.pause/resume` |
| 结果 | 新学期人设、知识、最高连击、校园积分、活力币 | 再玩、回首页、生成分享图 | 最低档也有完整结果；本机成绩存储失败不阻断结算 | `localStorage`，不写入 QQ 音乐账户 |
| 分享 | 个性化成绩卡预览、长按保存、QQ 音乐图片分享 | `Activity.share.drawCanvas` 生成 base64，`Activity.share.callImage` 打开客户端分享 | 图片 Bridge 不可用时保留页面内预览；实际分享事件单独上报 | `sharing` 配置、客户端 JSBridge |

## 页面参数

所有业务 ID 与环境参数位于 `activity.config.js`，工程路径元数据位于不可随意改名的 `activity.project.json`。

| 配置 | 当前值 | 所有者/来源 | 发布说明 |
| --- | --- | --- | --- |
| `music.songs[0].id` | `380208811` | 需求方提供的 QQ 音乐歌曲 ID | 唯一音频播放来源 |
| `user.required` | `true` | 会员歌曲播放要求 | 开局前要求 QQ 音乐登录态 |
| `user.requiredMembership` | `vip` | 会员歌曲播放要求 | `isVip` 或 `isSuperVip` 均通过预检查；最终权限仍由 QMPlayer 决定 |
| `reporting.pageId` | `1cc50c37-85ad-4110-bc0c-0f41e99a23b6` | Skill 默认 FQM | 正式环境若有专属 FQM ID，应整体替换 |
| `reporting.pageName` | `y.qq.com/vibe_h5_dev/fan-bus-rhythm-rush-h5-20260827/index.html` | dev 部署映射 | 正式目录确定后同步更新 |
| `reporting.elementIds` | `campus_rush.*` 稳定事件名 | 当前发布版上报设计 | FQM 负责人若分配正式 element_id，应保持逻辑 key 不变并替换值 |
| `sharing.title/desc` | 当前运营文案 | 当前活动文案 | 上线前由运营复核 |
| `sharing.image/url` | `fastest.y.qq.com/vibe_h5_dev` 对应资源与入口 | Skill 已知 dev 映射 | 正式 stage 未提供，生产发布前必须替换为最终落地地址 |
| `webview.topBar` | `.activity-page`，仅状态栏安全区 | Skill 默认 H5 规则 | `_hidehd=1` 隐藏 Header 后防止内容被刘海遮挡 |
| `webview.outsideLaunch` | dev/线上端外启用 | Skill 默认 H5 规则 | localhost 与 `debug=1` 自动禁用 |

页面仍按移动 H5 交付并加载 Skill 规定的 `rem.780.css`。由于输入页面已经具有经过验证的 320–780px 响应式规则，为避免改变现有构图，`preserve.css` 保留其原始 16px 根字号；没有对 Canvas 坐标、媒体查询或现有响应式 CSS 做机械换算。活动入口、分享落地页和预览二维码使用 `_hidehd=1&_miniplayer=1` 隐藏 QQ 音乐 WebView Header 与 MiniBar；dev 真机预览另带 `_tde_id=73860`。

## 文件结构

- `index.html`：按当前页面 class/DOM 结构迁移的首页、规则、游戏与所有弹层。
- `reset.css`：Skill 通用样式重置。
- `rem.780.css`：780px H5 根字号和横竖屏/Pad/折叠屏适配。
- `style.css`：从当前静态构建产物保留的完整视觉、触控和响应式样式，仅把本地资源 URL 改为相对路径。
- `preserve.css`：静态运行时所需的隐藏态、包装层和原页面根字号兼容规则；不重设计页面。
- `activity.config.js`：歌曲、分享、上报和 WebView 配置。
- `activity.project.json`：工程名、目标、日期、上传目录与入口元数据。
- `runtime.js`：Skill 组装的 core、fonts、debug、reporting、webview、navigation、sharing、share-canvas、music-assets、user-context 受控运行时。
- `app.js`：纯 JavaScript 资源预加载、游戏状态机、Canvas 绘制、会员/播放验证、QMPlayer、分享和上报逻辑。
- `assets/game-chart.json`：86 秒、120 BPM 的预计算谱面；已移除本地音频路径。
- `assets/campus-season/`：原项目校园道路、载具、道具、障碍、结局等本地图片。

交付目录内没有 `package.json`、`node_modules`、React、JSX、TypeScript、音频或视频文件，也没有运行时构建步骤。

## 外部依赖

- polyfill: `https://y.qq.com/lib/commercial/h5/polyfill.min.js?max_age=2592000` (global: `none`)
- unity-report: `https://y.qq.com/component/m/qmfe-unity-report/iife/index.js?max_age=2592000` (global: `QmfeUnityReport`)
- music-browser: `https://y.qq.com/lib/commercial/h5/music-2.4.0.min.js?max_age=604800` (global: `Music`)
- fix-top-bar: `https://y.qq.com/component/m/fixTopBar/dist/fixTopBar.js?max_age=2592000` (global: `fixTopBar`)
- outside-app-launch: `https://y.qq.com/component/m/qmfe-unity-ad/iife/index.js?max_age=604800&v=20201223` (global: `QMPlugin`)
- qmplayer: `https://y.qq.com/component/m/qmplayer/qmplayer.music.js?max_age=604800` (global: `QMPlayer`)

未声明其他远程脚本或样式。所有远程调用都来自 Skill runtime：FQM 页面/点击/曝光/分享/播放上报、QQ 音乐分享初始化与图片分享、WebView top bar/端外拉端、QMPlayer 播放。

## 客户端能力

- `Activity.music.play(song, 0)`：以歌曲 ID 380208811 开始播放；QMPlayer 自行选择客户端内或 H5 播放实现。
- `Activity.music.pause()` / `resume()`：暂停弹层、锦囊、页面隐藏、失败和完成时同步节拍时钟。
- `Activity.music.on()`：实际 play/pause/ended/error 更新游戏和播放上报。
- `Activity.user.requireLogin()` / `queryProfile()`：QQ 音乐用户态可用时使用当前会话登录并读取 `isVip`、`isSuperVip`；不保存 UIN、GUID 或 token。站外环境没有 `Music.user` 时跳过这一步，并由 QMPlayer 的真实 `play` / `error` 事件决定是否可开局。
- `Activity.share.init()` / `on()`：初始化链接分享并以客户端实际 share 回调作为分享上报唯一来源。
- `Activity.share.call()`：专用 Web 分享面板接口；本活动的个性化成绩卡使用更匹配的 `drawCanvas()` / `callImage()` 专用图片分享接口。
- `Activity.webview` 自动初始化：隐藏 Header 页面安全区和端外打开 QQ 音乐提示。
- `Activity.report`：页面、曝光、点击、分享与播放事件。

本活动仅在 QQ 音乐用户态可用时要求登录以预检会员；不调用用户资产写入、投票、任务、广告、领奖、下载或视频能力。

## Scheme 与导航

页面没有业务跳转按钮，也不直接调用 `location.href`、`window.open`、原始 Bridge 或 `Music.openScheme`。分享落地地址由 `sharing.url` 提供，当前是 dev 用户预览入口并带 `_hidehd=1&_miniplayer=1&_tde_id=73860`。未来如新增 `y.qq.com`、`qqmusic://` 或外站跳转，必须配置在 `navigation.links` 并只通过 `Activity.navigation.open()` 调用；外站 HTTP(S) 需保留确认提示，可执行协议必须拒绝。

## 上报矩阵

| 逻辑事件 key | 类型 | 触发时机 | element_id | 关键 ext 字段 | 验证状态 |
| --- | --- | --- | --- | --- | --- |
| page | 页面 | `Activity.configure` 后页面初始化 | FQM page event | `pageName` | 静态接入完成；dev 真机待验证 |
| homeExposure | 曝光 | 首页初始化完成 | `campus_rush.home.exposure` | `content_id=380208811`, `content_type=song` | 静态接入完成；dev 真机待验证 |
| rulesOpen | 点击 | 切换到原版玩法页 | `campus_rush.rules.open.click` | 无 | localhost 可验证 |
| gameStart | 点击 | QMPlayer 成功开始后进入游戏 | `campus_rush.game.start.click` | `content_id`, `content_type` | QQ 音乐 WebView 待验证 |
| gamePause | 点击 | 按钮、声音关闭、页面隐藏或播放器错误触发暂停 | `campus_rush.game.pause.click` | `source`, `elapsed_ms` | localhost UI 可验证；播放器待真机 |
| gameResume | 点击 | QMPlayer 成功继续播放 | `campus_rush.game.resume.click` | `elapsed_ms` | QQ 音乐 WebView 待验证 |
| gameRestart | 点击 | 暂停、成功或失败页重新开局 | `campus_rush.game.restart.click` | `source` | localhost 可验证 |
| move | 点击 | 按钮、滑动或键盘成功换道 | `campus_rush.game.move.click` | `direction`, `source` | localhost 可验证 |
| hit | 点击 | 正式游戏每次 HIT 判定 | `campus_rush.game.hit.click` | `quality`, `timing_ms`, `source` | localhost 可验证 |
| luckyOpen | 点击 | 用户开启锦囊并得到结果 | `campus_rush.game.lucky.open.click` | `outcome`, `before`, `after` | localhost 可验证 |
| gameFinish | 曝光 | 谱面或歌曲结束进入成功结算 | `campus_rush.game.finish.exposure` | `fans`, `max_combo`, `score`, `tier` | localhost 可验证 |
| gameFail | 曝光 | 行人碰撞进入安全失败 | `campus_rush.game.fail.exposure` | `reason`, `fans`, `max_combo`, `progress` | localhost 可验证 |
| shareOpen | 点击 | 生成个性化成绩卡 | `campus_rush.result.share.open.click` | `tier`, `score` | localhost 可验证 |
| share | 分享 | QQ 音乐客户端实际 share 回调 | `campus_rush.result.share.success` | `share_type`, `score`, `tier` | QQ 音乐 WebView 待验证 |
| songPlayback | 播放 | QMPlayer 实际 play 事件 | `campus_rush.song.playback.play` | `action_type=0`, `content_id`, `content_type` | QQ 音乐 WebView 待验证 |
| songPause | 播放 | QMPlayer 实际 pause 事件 | `campus_rush.song.playback.pause` | `action_type=1`, `content_id`, `content_type` | QQ 音乐 WebView 待验证 |
| soundToggle | 点击 | 首页或游戏 SOUND 按钮切换 | `campus_rush.sound.toggle.click` | `enabled`, `source` | localhost UI 可验证 |

## 调试方法

1. 语法检查：`node --check app.js` 与 `node --check activity.config.js`。
2. 规范检查：`node activity-h5-builder/scripts/validate.js ./fan-bus-rhythm-rush-h5-20260827 --draft`；交付前不带 `--draft` 再执行一次。
3. localhost：`node activity-h5-builder/scripts/serve-debug.js ./fan-bus-rhythm-rush-h5-20260827 --port 3000 --prefix /activity-debug`，访问脚本打印的 `index.html?debug=1`。
4. localhost 优先以当前页面为视觉基准检查 390×844 等移动视口、图片、规则、触控/键盘、画布、弹层、谱面加载、成绩计算、localStorage 和成绩卡 base64 预览。CDN 不可用时自动进入仅限 debug 的无声谱面模拟。桌面浏览器不能代表 QQ 音乐 JSBridge。
   本次交付已在 390×844 视口回归首页、玩法页、游戏页、换道/HIT、暂停恢复、锦囊、行人失败、完整结算与成绩卡图片预览。
5. 本地检查完成后可按需运行 `publish-preview.js` 的 dev stage。用户真实预览地址应是 `fastest.y.qq.com/vibe_h5_dev/fan-bus-rhythm-rush-h5-20260827/index.html` 并带标准 WebView 参数；`y.qq.com/vibe_h5_dev` 仅是代理源路径。
6. QQ 音乐内重点检查歌曲 380208811 的播放/暂停/继续/结束事件、实际节拍同步、分享图片 Bridge、实际分享渠道回调、Header/MiniBar 隐藏和端外拉端。
7. 代码修改后必须重新上传，已有 dev 页面不会自动同步。

## 限制

- 附件 Skill 的公司内网版本检查在本机沙盒内 DNS 不通、沙盒外连接超时；本包基于附件本地版本 `2026082502`。
- 当前 Skill 只定义 dev 发布映射，没有生产 stage。`sharing.image`、`sharing.url`、`reporting.pageName` 当前使用确定的 dev 路径，正式发布前必须由部署负责人替换为最终地址并复验分享回流。
- QMPlayer 受控接口没有公开 `currentTime`、seek、volume 或 WebAudio 节点。游戏在 `Activity.music.play/resume` 成功后用单调时钟驱动同一份 120 BPM 谱面，并在每次 pause/resume 时同步冻结；真机仍需检查歌曲实际首帧延迟与 86 秒谱面的偏差。
- VIP/SVIP 查询只描述账号会员身份，不能代表歌曲在地区、设备、数字专辑或其他版权条件下一定可播；最终以 QMPlayer 的真实 `play`/`error` 事件为准。本 Skill 没有提升权限或绕过会员版权的接口。
- `Music.user` 只在 QQ 音乐用户态可用；ChatGPT Sites 等站外域名缺少该能力时，页面不会把 `Music user CDN is unavailable` 当作播放失败，而是跳过会员预检并继续让 QMPlayer 验证在线歌曲权限。
- 线上播放失败时不允许把预制 MP3 放入 Activity H5 作为版权兜底；可接受的产品方案只有提示用户登录/开通相应权限、由运营更换可播歌曲，或在 localhost 调试时使用无声谱面模拟。
- SOUND OFF 不能独立静音而保持歌曲时间轴，因此游戏内切换为关闭声音时会同步暂停游戏；继续时重新调用 `Activity.music.resume()`。这是防止节拍漂移的安全降级。
- 原版本受击后的厚/细 WebAudio 滤镜不能合法作用于 QMPlayer，已改为持续 8 拍的视觉状态与提示，歌曲播放速度和节拍不变。
- 本机 BEST 与 BANK 仅保存在浏览器 localStorage；清理站点数据或换设备会重置，不代表 QQ 音乐账户资产或真实奖励。
- localhost 可验证普通交互与成绩卡预览，但不能证明 QQ 音乐 Cookie、JSBridge、QMPlayer、分享渠道、FQM 和端外拉端在正式域名可用。
- 本 Skill 只完成生成期规范验证和交付打包，不执行 Codelix 专用 Agent 的正式走查。

## 接手说明

接手开发首先保持工程目录名与 `activity.project.json` 一致，不要把 React 构建结果、原 MP3、原始 Bridge、CGI 或未声明 CDN 放回交付包。生产映射明确后，更新 `activity.config.js` 中的分享图片、分享落地页、上报 pageName；FQM 负责人如给出正式 pageId/element_id，同步替换配置并保留 `app.js` 的逻辑事件 key。

回归重点是现有首页/规则/游戏视觉一致性、歌曲 380208811 与谱面首拍/尾帧同步、暂停/继续、页面切后台自动暂停、锦囊暂停恢复、歌曲 ended 结算、行人失败、连续重开、低端 Android Canvas 性能、客户端图片分享和实际 share 回调。完成 localhost 与 QQ 音乐 dev 真机检查后，再生成 handoff ZIP，前往 https://codelix.woa.com/vibe 新建项目并上传；ZIP 上传后的正式走查、需求转换和开发交接由专用 Agent 流程负责。
