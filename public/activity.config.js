(function (global) {
  "use strict";

  global.ACTIVITY_CONFIG = {
    webview: {
      topBar: {
        enabled: true,
        selectors: [{ className: ".activity-page", navBar: false }]
      },
      outsideLaunch: {
        enabled: false
      }
    },
    music: {
      songs: [
        {
          id: 380208811,
          name: "恭喜你发现了宝藏",
          singerName: "TF家族"
        }
      ],
      player: {}
    },
    sharing: {
      title: "开学冲冲冲！校园节奏挑战",
      desc: "跟着歌曲节拍收集知识，解锁你的新学期隐藏人设。",
      image: new URL("./og.png", global.location.href).href,
      url: "https://y.qq.com/viber_pub/campus_gogogo/index.html?_hidehd=1&_miniplayer=1",
      wxTimelineTitle: "开学冲冲冲！测测你的新学期隐藏人设",
      feedMediaTitle: "开学冲冲冲！校园节奏挑战",
      supportToFeed: 1
    }
  };
})(window);
