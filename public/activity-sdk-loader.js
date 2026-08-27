(function (global) {
  "use strict";

  var hostname = String(global.location && global.location.hostname || "").toLowerCase();
  var isQqMusicHost = hostname === "localhost" || hostname === "qq.com" || hostname.slice(-7) === ".qq.com";
  var dependencies = {
    music: "https://y.qq.com/lib/commercial/h5/music-2.4.0.min.js?max_age=604800",
    topBar: "https://y.qq.com/component/m/fixTopBar/dist/fixTopBar.js?max_age=2592000",
    player: "https://y.qq.com/component/m/qmplayer/qmplayer.music.js?max_age=604800"
  };

  global.ACTIVITY_QQ_MUSIC_SDK = {
    enabled: isQqMusicHost,
    hostname: hostname,
    reason: isQqMusicHost ? "qq-music-host" : "outside-qq-music-host"
  };

  function loadClassicScript(src) {
    document.write('<script src="' + src + '"></script>');
  }

  if (isQqMusicHost) loadClassicScript(dependencies.music);
  loadClassicScript(dependencies.topBar);
  if (isQqMusicHost) loadClassicScript(dependencies.player);
})(window);
