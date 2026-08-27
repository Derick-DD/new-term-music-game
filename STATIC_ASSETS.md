# Activity H5 static resource inventory

The canonical deployment source is
`releases/fan-bus-rhythm-rush-h5-20260827/`. It follows Activity H5 Builder
version `2026082502` and is copied unchanged into the Sites static output.

## Local deployment resources

- `index.html`, `reset.css`, `rem.780.css`, `style.css`, and `preserve.css` —
  uncompiled mobile H5 page and 780 rem presentation.
- `activity.config.js` — song ID, membership requirement, sharing, reporting,
  and WebView configuration.
- `runtime.js` — reviewed Activity capability runtime, including
  `Activity.music`, `Activity.user`, sharing, reporting, and WebView adapters.
- `app.js` — game state, preloading, controls, QMPlayer event handling, and
  business interactions. Business code calls only `Activity.*` integrations.
- `activity.project.json` and `README.md` — Skill project identity and Codelix
  handoff documentation.
- `assets/campus-season/` and `assets/ui/` — current campus artwork and controls.
- `assets/game-chart.json` — timing/chart metadata only; it contains no audio
  URL or local audio path.

There is no MP3, M4A, WAV, AAC, OGG, or FLAC file in the package. Production
playback does not fall back to a bundled audio file.

## Online music playback

The configured song is QQ Music `songid=380208811`. Business code calls:

- `Activity.music.play(song, 0)`
- `Activity.music.pause()`
- `Activity.music.resume()`
- `Activity.music.on("play pause ended error", callback)`

The reviewed runtime delegates these calls to QMPlayer. QMPlayer selects the
in-client or H5 implementation and enforces the signed-in account's real
playback entitlement. The game starts only after a real `play` event; playback
errors or a timeout remain errors and never fall back to local MP3.

## Approved QQ Music CDN dependencies

- `https://y.qq.com/lib/commercial/h5/polyfill.min.js?max_age=2592000`
- `https://y.qq.com/component/m/qmfe-unity-report/iife/index.js?max_age=2592000`
- `https://y.qq.com/lib/commercial/h5/music-2.4.0.min.js?max_age=604800`
- `https://y.qq.com/component/m/fixTopBar/dist/fixTopBar.js?max_age=2592000`
- `https://y.qq.com/component/m/qmfe-unity-ad/iife/index.js?max_age=604800&v=20201223`
- `https://y.qq.com/component/m/qmplayer/qmplayer.music.js?max_age=604800`

These scripts remain remote dependencies and are not copied into the handoff
ZIP.
