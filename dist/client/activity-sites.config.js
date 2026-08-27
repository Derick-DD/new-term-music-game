(function (global) {
  "use strict";

  var entry = new URL(global.location.href);
  entry.searchParams.set("_hidehd", "1");
  entry.searchParams.set("_miniplayer", "1");

  global.ACTIVITY_CONFIG = {
    webview: {
      topBar: {
        enabled: true,
        selectors: [{ className: ".activity-page", navBar: false }]
      },
      outsideLaunch: {
        enabled: true,
        pagename: "fan_bus_rhythm_rush_campus",
        type: 44,
        showBannerIfEmpty: true,
        disableOnLocalhost: true,
        disableInDebug: true
      }
    },
    sharing: {
      title: "开学冲冲冲！校园节奏挑战",
      desc: "跟着歌曲节拍收集知识，解锁你的新学期隐藏人设。",
      image: new URL("/og-sites.png", global.location.origin).href,
      url: entry.href,
      wxTimelineTitle: "开学冲冲冲！测测你的新学期隐藏人设",
      feedMediaTitle: "开学冲冲冲！校园节奏挑战",
      supportToFeed: 1
    }
  };
})(window);
