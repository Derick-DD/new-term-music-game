(function (global) {
  "use strict";

  var Activity = global.Activity || {};
  var config = {};

  function clone(value) {
    return JSON.parse(JSON.stringify(value == null ? null : value));
  }

  function getPath(path) {
    return String(path || "").split(".").filter(Boolean).reduce(function (value, key) {
      return value == null ? undefined : value[key];
    }, config);
  }

  Activity.configure = function (nextConfig) {
    config = clone(nextConfig || {});
    return Activity;
  };

  Activity.getConfig = function (path) {
    return clone(path ? getPath(path) : config);
  };

  Activity.requireConfig = function (path) {
    var value = getPath(path);
    if (value === undefined || value === null || value === "") {
      throw new Error("Missing activity configuration: " + path);
    }
    return clone(value);
  };

  Activity.capabilities = Activity.capabilities || {};
  Activity.registerCapability = function (name, api) {
    Activity.capabilities[name] = true;
    Activity[name] = api;
  };

  global.Activity = Activity;
})(window);
(function (Activity) {
  "use strict";

  var topBarInitialized = false;

  function warn(message, error) {
    if (!window.console || typeof window.console.warn !== "function") return;
    var reason = error && error.message ? ": " + error.message : "";
    window.console.warn("[Activity.webview] " + message + reason);
  }

  function isMusicClient() {
    return Boolean(window.Music && Music.browser && Music.browser.music);
  }

  function whenDomReady(action) {
    if (!window.document || document.readyState !== "loading") return Promise.resolve().then(action);
    return new Promise(function (resolve) {
      document.addEventListener("DOMContentLoaded", resolve, { once: true });
    }).then(action);
  }

  function fixTopBar(options) {
    options = options || {};
    if (options.enabled === false || !isMusicClient()) return Promise.resolve({ initialized: false, reason: "disabled-or-outside" });
    if (topBarInitialized) return Promise.resolve({ initialized: false, reason: "already-initialized" });
    return whenDomReady(function () {
      if (typeof window.fixTopBar !== "function") throw new Error("fixTopBar CDN is unavailable");
      var selectors = Array.isArray(options.selectors) && options.selectors.length
        ? options.selectors
        : [{ className: ".activity-page", navBar: false }];
      var existing = selectors.filter(function (item) {
        return item && item.className && document.querySelector(item.className);
      });
      if (!existing.length) return { initialized: false, reason: "target-not-found" };
      if (document.body && document.body.classList) document.body.classList.add("page_downright");
      window.fixTopBar(existing);
      topBarInitialized = true;
      return { initialized: true, selectors: existing };
    }).catch(function (error) {
      warn("通顶安全区适配失败，页面将继续运行", error);
      return { initialized: false, reason: "failed", error: error };
    });
  }

  function initOutsideLaunch() {
    return Promise.resolve({ initialized: false, reason: "disabled-by-configuration" });
  }

  function init(options) {
    options = options || Activity.getConfig("webview") || {};
    return Promise.all([
      fixTopBar(options.topBar || {}),
      initOutsideLaunch(options.outsideLaunch || {})
    ]).then(function (results) {
      return { topBar: results[0], outsideLaunch: results[1] };
    });
  }

  Activity.webview = {
    init: init,
    fixTopBar: fixTopBar,
    initOutsideLaunch: initOutsideLaunch
  };

  Promise.resolve().then(function () {
    return init(window.ACTIVITY_CONFIG && window.ACTIVITY_CONFIG.webview || {});
  }).catch(function (error) {
    warn("WebView 基础能力初始化失败，页面将继续运行", error);
  });
})(window.Activity);
(function (Activity) {
  "use strict";

  var player = null;

  function compactOptions(value) {
    return Object.keys(value || {}).reduce(function (result, key) {
      if (value[key] !== undefined && value[key] !== null && value[key] !== "") result[key] = value[key];
      return result;
    }, {});
  }

  function requirePlayer() {
    if (typeof window.QMPlayer !== "function") throw new Error("QMPlayer CDN is unavailable.");
    if (!player) player = new window.QMPlayer(compactOptions(Activity.getConfig("music.player") || {}));
    return player;
  }

  function playerPromise(callback) {
    try {
      var result = callback(requirePlayer());
      return result && typeof result.then === "function" ? result : Promise.resolve(result);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  function normalizePlayerSong(song) {
    if (typeof song === "number") {
      if (!isFinite(song) || song <= 0) throw new Error("Song id must be a positive number.");
      return song;
    }
    if (typeof song === "string") {
      if (!song.trim()) throw new Error("Song id or mid is required.");
      return /^\d+$/.test(song) ? Number(song) : song;
    }
    if (!song) throw new Error("Song id or mid is required.");
    if (song.id !== undefined && song.id !== null && song.id !== "") {
      var id = Number(song.id);
      if (!isFinite(id) || id <= 0) throw new Error("Song id must be a positive number.");
      return id;
    }
    if (song.mid) return String(song.mid);
    throw new Error("Song id or mid is required.");
  }

  Activity.registerCapability("music", {
    getConfigured: function (type) {
      var value = Activity.getConfig("music." + type);
      return Array.isArray(value) ? value : [];
    },
    play: function (songs, index, options) {
      try {
        var list = (Array.isArray(songs) ? songs : [songs]).map(normalizePlayerSong);
        if (!list.length) return Promise.reject(new Error("At least one song is required for playback."));
        var targetIndex = Number(index || 0);
        if (!isFinite(targetIndex) || targetIndex < 0 || targetIndex >= list.length) {
          return Promise.reject(new Error("Playback index is outside the song list."));
        }
        var playOptions = Object.assign({}, options || {});
        if (list.length > 1 || targetIndex) playOptions.index = targetIndex;
        return playerPromise(function (instance) {
          return instance.play(list.length === 1 ? list[0] : list, playOptions);
        });
      } catch (error) {
        return Promise.reject(error);
      }
    },
    pause: function () {
      return playerPromise(function (instance) { return instance.pause(); });
    },
    resume: function () {
      return playerPromise(function (instance) { return instance.play(); });
    },
    on: function (events, callback) {
      var instance = requirePlayer();
      instance.on(events, callback);
      return instance;
    },
    off: function (events, callback) {
      var instance = requirePlayer();
      if (typeof instance.off === "function") instance.off(events, callback);
      return instance;
    },
    getState: function () {
      return requirePlayer().state || "";
    }
  });
})(window.Activity);
(function (Activity) {
  "use strict";

  var externalMessage = "这不是 QQ 音乐链接，是否依然跳转？";

  function parseUrl(value) {
    var raw = String(value == null ? "" : value).trim();
    if (!raw) return { url: raw, kind: "invalid", qqMusic: false, allowed: false, reason: "empty" };
    if (/^qqmusic:\/\//i.test(raw)) {
      return { url: raw, kind: "scheme", protocol: "qqmusic:", qqMusic: true, allowed: true };
    }

    var parsed;
    try {
      parsed = new window.URL(raw, window.location && window.location.href || "https://y.qq.com/");
    } catch {
      return { url: raw, kind: "invalid", qqMusic: false, allowed: false, reason: "invalid-url" };
    }

    var protocol = String(parsed.protocol || "").toLowerCase();
    if (protocol !== "http:" && protocol !== "https:") {
      return { url: raw, kind: "unsupported", protocol: protocol, qqMusic: false, allowed: false, reason: "unsupported-protocol" };
    }
    var hostname = String(parsed.hostname || "").toLowerCase();
    var qqMusic = hostname === "y.qq.com" || hostname.slice(-9) === ".y.qq.com";
    return {
      url: parsed.href,
      kind: "web",
      protocol: protocol,
      hostname: hostname,
      qqMusic: qqMusic,
      allowed: true,
      needsConfirmation: !qqMusic
    };
  }

  function confirmExternal(options, inspection) {
    var confirm = options && options.confirm;
    if (typeof confirm !== "function") confirm = window.confirm;
    if (typeof confirm !== "function") return Promise.resolve(false);
    try {
      return Promise.resolve(confirm(options && options.message || externalMessage, inspection.url)).then(Boolean);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  function whenClientReady(action) {
    if (!window.Music || !Music.browser || !Music.browser.music || typeof Music.musicReady !== "function") {
      return Promise.resolve().then(action);
    }
    return new Promise(function (resolve, reject) {
      Music.musicReady(function (ready) {
        if (ready === false) {
          reject(new Error("QQ Music client bridge is unavailable."));
          return;
        }
        Promise.resolve().then(action).then(resolve, reject);
      });
    });
  }

  function openInspected(inspection) {
    if (inspection.kind === "scheme") {
      if (window.Music && typeof Music.openScheme === "function") Music.openScheme(inspection.url);
      else window.location.href = inspection.url;
      return Promise.resolve({ opened: true, method: window.Music && typeof Music.openScheme === "function" ? "openScheme" : "location", inspection: inspection });
    }

    if (window.Music && Music.browser && Music.browser.music && Music.client && typeof Music.client.open === "function") {
      return whenClientReady(function () {
        Music.client.open("ui", "openUrl", { url: inspection.url });
        return { opened: true, method: "openUrl", inspection: inspection };
      });
    }
    window.location.href = inspection.url;
    return Promise.resolve({ opened: true, method: "location", inspection: inspection });
  }

  Activity.navigation = {
    inspect: parseUrl,
    open: function (url, options) {
      var inspection = parseUrl(url);
      if (!inspection.allowed) {
        var error = new Error(inspection.reason === "unsupported-protocol" ? "Unsupported navigation protocol: " + inspection.protocol : "Invalid navigation URL.");
        error.code = "UNSAFE_NAVIGATION";
        error.inspection = inspection;
        return Promise.reject(error);
      }
      if (!inspection.needsConfirmation) return openInspected(inspection);
      return confirmExternal(options || {}, inspection).then(function (confirmed) {
        if (!confirmed) return { opened: false, reason: "cancelled", inspection: inspection };
        return openInspected(inspection);
      });
    }
  };
})(window.Activity);
(function (Activity) {
  "use strict";

  var listeners = [];
  var listening = false;
  var binding = false;

  function requireMusic() {
    if (!window.Music) throw new Error("Music browser CDN is unavailable.");
    return window.Music;
  }

  function emit(result) {
    listeners.slice().forEach(function (listener) {
      try { listener(result); } catch (error) {
        if (window.console && typeof console.error === "function") console.error("Activity.share listener failed", error);
      }
    });
  }

  function bindClientShare() {
    var music = requireMusic();
    if (listening || binding || !music.client || typeof music.client.on !== "function") return;
    var attach = function (ready) {
      binding = false;
      if (ready === false || listening) return;
      music.client.on("share", emit);
      listening = true;
    };
    if (music.browser && music.browser.music && typeof music.musicReady === "function") {
      binding = true;
      music.musicReady(attach);
    } else attach(true);
  }

  function whenClientReady(action) {
    var music = requireMusic();
    if (!music.browser || !music.browser.music || typeof music.musicReady !== "function") {
      return Promise.resolve().then(action);
    }
    return new Promise(function (resolve, reject) {
      music.musicReady(function (ready) {
        if (ready === false) {
          reject(new Error("QQ Music client bridge is unavailable."));
          return;
        }
        Promise.resolve().then(action).then(resolve, reject);
      });
    });
  }

  function paramsOf(options) {
    var conf = Object.assign({}, Activity.getConfig("sharing") || {}, options || {});
    var image = conf.img || conf.imgUrl || conf.image || "";
    var link = conf.link || conf.url || window.location.href;
    return {
      title: conf.title || "",
      desc: conf.desc || "",
      img: image,
      imgUrl: image,
      feedMediaCover: conf.feedMediaCover || image,
      link: link,
      wxTimelineTitle: conf.wxTimelineTitle || conf.title || "",
      feedMediaTitle: conf.feedMediaTitle || conf.title || "",
      supportToFeed: conf.supportToFeed === undefined ? 1 : Number(conf.supportToFeed)
    };
  }

  function callImage(image, options, callback) {
    var music = requireMusic();
    if (!music.client || typeof music.client.open !== "function") return Promise.reject(new Error("Music client image share API is unavailable."));
    if (!image) return Promise.reject(new Error("Share image data is required."));
    bindClientShare();
    var params = paramsOf(options);
    params.imgUrl = image;
    params.fileType = "image";
    params.previewMode = options && options.previewMode !== undefined ? Number(options.previewMode) : 1;
    params.sharetype = options && (options.sharetype || options.shareType) || "card";
    if (options && options.shareform) params.shareform = options.shareform;
    if (options && options.target) params.target = options.target;
    return whenClientReady(function () {
      return new Promise(function (resolve) {
        music.client.open("other", "callShareImg", params, function (result) {
          if (typeof callback === "function") callback(result);
          resolve(result);
        });
      });
    });
  }

  Activity.share = {
    callImage: callImage,
    getConfig: function () { return Activity.getConfig("sharing") || {}; },
    init: function (options, callback) {
      var music = requireMusic();
      if (!music.share || typeof music.share.init !== "function") throw new Error("Music share API is unavailable.");
      bindClientShare();
      var params = paramsOf(options);
      params.callback = function (result) {
        if (typeof callback === "function") callback(result);
      };
      music.share.init(params);
      return params;
    },
    call: function (options, callback) {
      var music = requireMusic();
      if (!music.client || typeof music.client.open !== "function") return Promise.reject(new Error("Music client share API is unavailable."));
      bindClientShare();
      var params = paramsOf(options);
      if (options && options.target) params.target = options.target;
      if (options && options.shareform) params.shareform = options.shareform;
      return whenClientReady(function () {
        return new Promise(function (resolve) {
          music.client.open("other", "callShareWeb", params, function (result) {
            if (typeof callback === "function") callback(result);
            resolve(result);
          });
        });
      });
    },
    on: function (callback) {
      if (typeof callback !== "function") throw new Error("Share callback must be a function.");
      if (listeners.indexOf(callback) < 0) listeners.push(callback);
      bindClientShare();
      return callback;
    },
    off: function (callback) {
      listeners = callback ? listeners.filter(function (listener) { return listener !== callback; }) : [];
    }
  };
})(window.Activity);
