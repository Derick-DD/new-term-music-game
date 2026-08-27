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

(function (global) {
  "use strict";

  var Activity = global.Activity;
  var FONT_ENDPOINT = "https://i2.y.qq.com/music_node_server/fontmin";
  var pending = {};

  function createError(code, message) {
    var error = new Error(message);
    error.code = code;
    return error;
  }

  function definition(name) {
    var fontName = String(name || "").trim();
    if (!fontName) throw createError("INVALID_FONT_NAME", "Font configuration name is required.");
    var configured = (Activity.getConfig("fonts") || {})[fontName];
    var options = typeof configured === "string" ? { key: configured } : configured;
    if (!options || !String(options.key || "").trim()) {
      throw createError("MISSING_FONT_KEY", "Missing activity configuration: fonts." + fontName + ".key");
    }
    return {
      key: String(options.key).trim(),
      fontFamily: String(options.fontFamily || fontName).trim(),
      fontName: String(options.fontName || fontName).trim(),
    };
  }

  function buildUrl(font, text) {
    var encodedText = encodeURIComponent(String(text == null ? "" : text)).replace(/[()']/g, "");
    return FONT_ENDPOINT
      + "?font=" + encodeURIComponent(font.fontFamily)
      + "&text=" + encodedText
      + "&ver=1&id=" + encodeURIComponent(font.key);
  }

  function loadFont(name, text) {
    var font = definition(name);
    var content = String(text == null ? "" : text);
    if (!content) return Promise.resolve({ fontFamily: font.fontName, loaded: false, reason: "empty-text" });
    if (typeof global.FontFace !== "function" || !global.document || !global.document.fonts) {
      return Promise.reject(createError("FONT_FACE_UNAVAILABLE", "This browser does not support dynamic font loading."));
    }
    var url = buildUrl(font, content);
    var cacheKey = font.key + "\n" + font.fontFamily + "\n" + font.fontName + "\n" + content;
    if (!pending[cacheKey]) {
      var face = new global.FontFace(font.fontName, "url(" + url + ")");
      pending[cacheKey] = face.load().then(function (loadedFace) {
        global.document.fonts.add(loadedFace);
        return { fontFamily: font.fontName, loaded: true, url: url };
      }).catch(function (error) {
        delete pending[cacheKey];
        throw error;
      });
    }
    return pending[cacheKey];
  }

  function applyFont(element, name, text) {
    if (!element || !element.style) return Promise.reject(createError("INVALID_FONT_ELEMENT", "A styled DOM element is required."));
    return loadFont(name, text).then(function (result) {
      element.style.fontFamily = result.fontFamily;
      return result;
    });
  }

  Activity.registerCapability("fonts", {
    applyFont: applyFont,
    loadFont: loadFont,
  });
})(window);

(function (Activity) {
  "use strict";

  function hasDebugFlag() {
    return /(?:^|[?&])debug=1(?:&|$)/.test(window.location.search);
  }

  function snapshot() {
    var music = window.Music || {};
    var hostname = window.location.hostname || "";
    var isQQMusicOrigin = hostname === "y.qq.com" || hostname.slice(-9) === ".y.qq.com";
    var isDevPreviewPath = isQQMusicOrigin && /^\/vibe_h5_dev(?:\/|$)/.test(window.location.pathname);
    var isDevProxyPath = hostname === "y.qq.com" && isDevPreviewPath;
    var isFastestDevPreview = hostname === "fastest.y.qq.com" && isDevPreviewPath;
    var query = new URLSearchParams(window.location.search || "");
    var tdeMatch = (window.location.search || "").match(/(?:^|[?&])_tde_id=([^&]*)/);
    var tdeId = tdeMatch ? decodeURIComponent(tdeMatch[1]) : "";
    var isLocalPreviewOrigin = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
      || /^10\./.test(hostname) || /^192\.168\./.test(hostname) || /^172\.(?:1[6-9]|2\d|3[01])\./.test(hostname);
    var mode = isFastestDevPreview ? "dev-fastest-preview" : (isDevProxyPath ? "dev-yqq-proxy" : (isQQMusicOrigin ? "deployed-yqq" : (isLocalPreviewOrigin ? "local-preview" : "online-preview")));
    return {
      origin: window.location.origin,
      pathname: window.location.pathname,
      mode: mode,
      isQQMusicOrigin: isQQMusicOrigin,
      isDevPreviewPath: isDevPreviewPath,
      isDevProxyPath: isDevProxyPath,
      isFastestDevPreview: isFastestDevPreview,
      tdeId: tdeId,
      hasExpectedTdeId: !isFastestDevPreview || tdeId === "73860",
      hidesWebViewHeader: query.get("_hidehd") === "1",
      hidesMiniPlayer: query.get("_miniplayer") === "1",
      isLocalPreviewOrigin: isLocalPreviewOrigin,
      userAgent: window.navigator.userAgent,
      isQQMusic: Boolean(music.browser && music.browser.music),
      appVersion: music.browser && music.browser.appVer || "",
      os: music.os || {},
      capabilities: Object.keys(Activity.capabilities || {}),
      globals: {
        Music: Boolean(window.Music),
        QMPlayer: typeof window.QMPlayer === "function",
        QMV: typeof window.QMV === "function",
        QmfeUnityReport: Boolean(window.QmfeUnityReport),
        CryptoJS: Boolean(window.CryptoJS),
        getSecuritySign: typeof window.getSecuritySign === "function",
        TMEunisdk: Boolean(window.TMEunisdk)
      },
      verification: {
        layoutAndStaticAssets: "available",
        clientBridge: music.browser && music.browser.music ? "available" : "requires-qqmusic-webview",
        loginCookiesAndCgiWrites: isQQMusicOrigin ? "verify-now" : "requires-deployed-yqq",
        advertisingTokensAndRewards: isQQMusicOrigin ? "verify-with-test-config" : "requires-deployed-yqq"
      }
    };
  }

  function mount() {
    if (!hasDebugFlag() || !document.body) return;
    var button = document.createElement("button");
    var panel = document.createElement("pre");
    var state = snapshot();
    var notice = document.createElement("div");
    button.type = "button";
    button.textContent = "ACT DEBUG";
    button.style.cssText = "position:fixed;right:8px;bottom:8px;z-index:2147483647;padding:6px 8px;background:#111;color:#fff;border:0;border-radius:4px;font-size:12px";
    panel.style.cssText = "display:none;position:fixed;left:8px;right:8px;bottom:44px;z-index:2147483647;max-height:55vh;overflow:auto;margin:0;padding:10px;background:rgba(0,0,0,.88);color:#8df58d;font:12px/1.5 monospace;white-space:pre-wrap";
    notice.style.cssText = "position:fixed;left:8px;right:8px;top:8px;z-index:2147483647;padding:8px 10px;background:#fff3cd;color:#664d03;border:1px solid #ffecb5;border-radius:4px;font:12px/1.5 sans-serif";
    notice.textContent = state.isFastestDevPreview && (!state.hidesWebViewHeader || !state.hidesMiniPlayer)
      ? "当前 dev 预览地址缺少默认 _hidehd=1 或 _miniplayer=1，请使用发布脚本返回的 previewUrl。"
      : state.isFastestDevPreview && !state.hasExpectedTdeId
      ? "当前 fastest dev 预览地址缺少 _tde_id=73860，请使用发布脚本返回的 previewUrl。"
      : state.isFastestDevPreview
      ? "当前为 QQ 音乐活动 dev 真机预览入口：可验证登录态和端内能力，正式任务、广告和发奖仍使用测试配置。"
      : state.isDevProxyPath
      ? "当前为 y.qq.com dev 代理路径，不是运营和真机使用的最终预览入口；请改用 fastest previewUrl。"
      : state.isQQMusicOrigin
      ? "当前为已部署 QQ 音乐域名，请使用测试配置验证登录、CGI、广告和奖励。"
      : (state.isLocalPreviewOrigin
        ? "当前为本地降级预览：可检查页面、配置和基础端内能力；登录、CGI 写入、广告 token 与发奖仍需正式环境验收。"
        : "当前为线上预览：可检查页面、配置和基础端内能力；非 y.qq.com 域名下的登录、CGI 写入、广告 token 与发奖仍需正式环境验收。");
    button.onclick = function () {
      panel.textContent = JSON.stringify(snapshot(), null, 2);
      panel.style.display = panel.style.display === "none" ? "block" : "none";
    };
    document.body.appendChild(panel);
    document.body.appendChild(button);
    document.body.appendChild(notice);
    console.info("Activity debug snapshot", state);
  }

  Activity.debug = { snapshot: snapshot, mount: mount };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})(window.Activity);
(function (Activity) {
  "use strict";

  function responseData(response, index, label) {
    var item = response["req_" + index];
    if (!item || Number(item.code) !== 0) {
      throw new Error(label + " failed: " + (item && item.code !== undefined ? item.code : "missing response"));
    }
    return item.data || {};
  }

  Activity.registerCapability("user", {
    getRequirements: function () {
      return Activity.getConfig("user") || {};
    },
    isLogin: function () {
      return Boolean(window.Music && Music.user && Music.user.isLogin());
    },
    getUin: function () {
      return this.isLogin() ? String(Music.user.getUin() || "") : "";
    },
    queryProfile: function () {
      if (!this.isLogin()) return Promise.reject(new Error("Login is required."));
      if (typeof Music.uajaxAsync !== "function") return Promise.reject(new Error("Music CGI CDN is unavailable."));
      var uin = this.getUin();
      var requests = [
        { module: "userInfo.BaseUserInfoServer", method: "get_user_baseinfo_v2", param: { vec_uin: [uin] } },
        { module: "userInfo.VipQueryServer", method: "SRFVipQuery_V2", param: { uin_list: [uin] } },
        { module: "music.lvz.VipIconUiShowSvr", method: "GetVipIconUiV2", param: { PID: 12 } }
      ];
      return Music.uajaxAsync({ comm: {} }, requests).then(function (result) {
        var response = result && result.res || {};
        var baseData = responseData(response, 0, "User profile query");
        var vipData = responseData(response, 1, "User membership query");
        var iconData = responseData(response, 2, "User membership icon query");
        var userMap = baseData.map_userinfo || {};
        var base = userMap[uin] || userMap[Object.keys(userMap)[0]] || {};
        var vipMap = vipData.infoMap || {};
        var vip = vipMap[uin] || {};
        var iconList = iconData.UserInfoUI && iconData.UserInfoUI.iconlist || [];
        return {
          uin: uin,
          nickname: base.nick || uin,
          avatar: base.headurl || "",
          isVip: vip.iSuperVip === 1 || vip.iVipFlag === 1 || vip.iYearFlag === 1,
          isSuperVip: vip.HugeVip === 1,
          vip: vip,
          iconUrl: iconList[0] && iconList[0].srcUrl || ""
        };
      });
    },
    requireLogin: function (options) {
      if (this.isLogin()) return Promise.resolve({ loggedIn: true, uin: this.getUin() });
      if (!window.Music || !Music.user || typeof Music.user.login !== "function") {
        return Promise.reject(new Error("Music user CDN is unavailable."));
      }
      return new Promise(function (resolve, reject) {
        Music.user.login(Object.assign({}, options || {}, {
          cb: function (result) {
            if (Music.user.isLogin()) resolve({ loggedIn: true, uin: String(Music.user.getUin() || ""), result: result });
            else reject(new Error("Login was not completed."));
          }
        }));
      });
    }
  });
})(window.Activity);

(function (Activity) {
  "use strict";
  var DEFAULT_FQM_ID = "1cc50c37-85ad-4110-bc0c-0f41e99a23b6";
  var instance = null;

  function constructorOf() {
    var exported = window.QmfeUnityReport;
    var Constructor = exported && (exported.default || exported);
    if (typeof Constructor !== "function") throw new Error("Unity Report CDN is unavailable.");
    return Constructor;
  }

  function config() {
    return Activity.getConfig("reporting") || {};
  }

  function getInstance() {
    if (instance) return instance;
    var conf = config();
    var options = {};
    if (conf.pageName) options.virtualUrl = conf.pageName;
    options.com = { c_fqm_id: String(conf.pageId || DEFAULT_FQM_ID) };
    var Constructor = constructorOf();
    instance = new Constructor(options);
    return instance;
  }

  function elementId(key) {
    var ids = config().elementIds || {};
    var value = ids[key];
    if (!value) throw new Error("Missing reporting.elementIds." + key);
    return value;
  }

  function normalizePayload(key, data) {
    var payload = Object.assign({}, data || {});
    if (key) payload.element_id = elementId(key);
    if (payload.ext && typeof payload.ext !== "string") payload.ext = JSON.stringify(payload.ext);
    return payload;
  }

  Activity.report = {
    reset: function () { instance = null; },
    page: function (data) {
      return getInstance().reportExposure(normalizePayload("", data));
    },
    exposure: function (key, data) {
      return getInstance().reportExposure(normalizePayload(key, data));
    },
    click: function (key, data) {
      return getInstance().reportClick(normalizePayload(key, data));
    },
    share: function (key, data) {
      return getInstance().reportShare(normalizePayload(key, data));
    },
    play: function (key, data) {
      return getInstance().reportPlay(normalizePayload(key, data));
    },
    getShareParams: function () {
      return getInstance().getShareParam();
    }
  };
})(window.Activity);

(function (Activity) {
  "use strict";

  var topBarInitialized = false;
  var outsideLaunchInitialized = false;
  var outsideLaunchInstance = null;

  function warn(message, error) {
    if (!window.console || typeof window.console.warn !== "function") return;
    var reason = error && error.message ? ": " + error.message : "";
    window.console.warn("[Activity.webview] " + message + reason);
  }

  function isMusicClient() {
    return Boolean(window.Music && Music.browser && Music.browser.music);
  }

  function isLocalhost() {
    var hostname = String(window.location && window.location.hostname || "").toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  }

  function hasDebugFlag() {
    var search = String(window.location && window.location.search || "");
    return /(?:^|[?&])debug(?:=1|=true)?(?:&|$)/i.test(search);
  }

  function whenDomReady(action) {
    if (!window.document || document.readyState !== "loading") return Promise.resolve().then(action);
    return new Promise(function (resolve) {
      document.addEventListener("DOMContentLoaded", resolve, { once: true });
    }).then(action);
  }

  function resolvePageName(options) {
    if (options.pagename) return String(options.pagename);
    var reporting = Activity.getConfig("reporting") || {};
    if (reporting.pageName) return String(reporting.pageName);
    var segments = String(window.location && window.location.pathname || "").split("/").filter(Boolean);
    return segments.length > 1 ? segments[segments.length - 2] : "activity_h5";
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

  function initOutsideLaunch(options) {
    options = options || {};
    if (options.enabled === false || isMusicClient()) return Promise.resolve({ initialized: false, reason: "disabled-or-in-client" });
    if (options.disableOnLocalhost !== false && isLocalhost()) return Promise.resolve({ initialized: false, reason: "localhost" });
    if (options.disableInDebug !== false && hasDebugFlag()) return Promise.resolve({ initialized: false, reason: "debug" });
    if (outsideLaunchInitialized) return Promise.resolve({ initialized: false, reason: "already-initialized", instance: outsideLaunchInstance });
    return whenDomReady(function () {
      if (typeof window.QMPlugin !== "function") throw new Error("QMPlugin CDN is unavailable");
      var type = options.type == null ? 44 : Number(options.type);
      if (!Number.isFinite(type) || type < 0) throw new Error("outsideLaunch.type must be a non-negative number");
      outsideLaunchInstance = new window.QMPlugin({
        pagename: resolvePageName(options),
        type: type,
        showBannerIfEmpty: options.showBannerIfEmpty !== false
      });
      outsideLaunchInitialized = true;
      return { initialized: true, instance: outsideLaunchInstance };
    }).catch(function (error) {
      warn("端外拉起 QQ 音乐能力初始化失败，页面将继续运行", error);
      return { initialized: false, reason: "failed", error: error };
    });
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
    } catch (error) {
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

(function (global) {
  "use strict";

  var Activity = global.Activity;

  function createError(code, message) {
    var error = new Error(message);
    error.code = code;
    return error;
  }

  function positive(value, fallback, name) {
    var number = value === undefined ? fallback : Number(value);
    if (!Number.isFinite(number) || number <= 0) throw createError("INVALID_CANVAS_VALUE", name + " must be positive.");
    return number;
  }

  function roundedPath(ctx, x, y, width, height, radius) {
    var r = Math.max(0, Math.min(Number(radius || 0), width / 2, height / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      if (!src) return reject(createError("MISSING_CANVAS_IMAGE", "Canvas image src is required."));
      var image = new global.Image();
      if (/^(?:https?:)?\/\//.test(src)) image.crossOrigin = "anonymous";
      image.onload = function () { resolve(image); };
      image.onerror = function () { reject(createError("CANVAS_IMAGE_LOAD_FAILED", "Unable to load canvas image: " + src)); };
      image.src = src;
    });
  }

  function drawRect(ctx, layer) {
    var width = positive(layer.width, 0, "rect.width");
    var height = positive(layer.height, 0, "rect.height");
    ctx.save();
    roundedPath(ctx, Number(layer.x || 0), Number(layer.y || 0), width, height, layer.radius || 0);
    ctx.fillStyle = layer.color || layer.fill || "transparent";
    ctx.fill();
    if (layer.stroke) {
      ctx.strokeStyle = layer.stroke;
      ctx.lineWidth = Number(layer.lineWidth || 1);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawImage(ctx, layer) {
    return loadImage(layer.src).then(function (image) {
      var x = Number(layer.x || 0);
      var y = Number(layer.y || 0);
      var width = positive(layer.width, image.naturalWidth || image.width, "image.width");
      var height = positive(layer.height, image.naturalHeight || image.height, "image.height");
      var sourceWidth = image.naturalWidth || image.width;
      var sourceHeight = image.naturalHeight || image.height;
      var fit = layer.fit || "cover";
      var dx = x;
      var dy = y;
      var dw = width;
      var dh = height;
      var sx = 0;
      var sy = 0;
      var sw = sourceWidth;
      var sh = sourceHeight;
      if (fit === "cover") {
        var sourceRatio = sourceWidth / sourceHeight;
        var targetRatio = width / height;
        if (sourceRatio > targetRatio) {
          sw = sourceHeight * targetRatio;
          sx = (sourceWidth - sw) / 2;
        } else {
          sh = sourceWidth / targetRatio;
          sy = (sourceHeight - sh) / 2;
        }
      } else if (fit === "contain") {
        var scale = Math.min(width / sourceWidth, height / sourceHeight);
        dw = sourceWidth * scale;
        dh = sourceHeight * scale;
        dx = x + (width - dw) / 2;
        dy = y + (height - dh) / 2;
      } else if (fit !== "fill") {
        throw createError("INVALID_CANVAS_IMAGE_FIT", "Canvas image fit must be cover, contain or fill.");
      }
      ctx.save();
      if (layer.radius) {
        roundedPath(ctx, x, y, width, height, layer.radius);
        ctx.clip();
      }
      if (fit === "cover") ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
      else ctx.drawImage(image, dx, dy, dw, dh);
      ctx.restore();
    });
  }

  function splitLines(ctx, text, maxWidth) {
    var lines = [];
    String(text == null ? "" : text).split(/\n/).forEach(function (paragraph) {
      if (!maxWidth) {
        lines.push(paragraph);
        return;
      }
      var current = "";
      Array.from(paragraph).forEach(function (character) {
        var next = current + character;
        if (current && ctx.measureText(next).width > maxWidth) {
          lines.push(current);
          current = character;
        } else current = next;
      });
      lines.push(current);
    });
    return lines;
  }

  function ellipsize(ctx, text, maxWidth) {
    if (!maxWidth || ctx.measureText(text).width <= maxWidth) return text;
    var value = text;
    while (value && ctx.measureText(value + "…").width > maxWidth) value = value.slice(0, -1);
    return value + "…";
  }

  function drawText(ctx, layer) {
    var fontSize = positive(layer.fontSize, 32, "text.fontSize");
    var lineHeight = positive(layer.lineHeight, Math.round(fontSize * 1.4), "text.lineHeight");
    var family = layer.fontFamily || "-apple-system, BlinkMacSystemFont, sans-serif";
    ctx.save();
    ctx.font = layer.font || [layer.fontStyle || "normal", layer.fontWeight || "400", fontSize + "px", family].join(" ");
    ctx.fillStyle = layer.color || "#000";
    ctx.textAlign = layer.align || "left";
    ctx.textBaseline = "top";
    var maxWidth = layer.maxWidth ? positive(layer.maxWidth, 0, "text.maxWidth") : 0;
    var lines = splitLines(ctx, layer.text, maxWidth);
    var maxLines = layer.maxLines ? Math.floor(positive(layer.maxLines, 0, "text.maxLines")) : lines.length;
    var visible = lines.slice(0, maxLines);
    if (lines.length > maxLines && visible.length) visible[visible.length - 1] = ellipsize(ctx, visible[visible.length - 1], maxWidth ? Math.max(0, maxWidth - ctx.measureText("…").width) : 0) + "…";
    visible.forEach(function (line, index) {
      if (layer.stroke) {
        ctx.strokeStyle = layer.stroke;
        ctx.lineWidth = Number(layer.lineWidth || 1);
        ctx.strokeText(line, Number(layer.x || 0), Number(layer.y || 0) + index * lineHeight, maxWidth || undefined);
      }
      ctx.fillText(line, Number(layer.x || 0), Number(layer.y || 0) + index * lineHeight, maxWidth || undefined);
    });
    ctx.restore();
  }

  function drawLayer(ctx, layer) {
    if (!layer || layer.hidden) return Promise.resolve();
    if (layer.type === "rect") {
      drawRect(ctx, layer);
      return Promise.resolve();
    }
    if (layer.type === "text") {
      drawText(ctx, layer);
      return Promise.resolve();
    }
    if (layer.type === "image") return drawImage(ctx, layer);
    return Promise.reject(createError("UNSUPPORTED_CANVAS_LAYER", "Unsupported canvas layer type: " + (layer.type || "")));
  }

  function drawCanvas(options) {
    var configured = Activity.getConfig("sharing.canvas") || {};
    var spec = Object.assign({}, configured, options || {});
    var width = positive(spec.width, 750, "canvas.width");
    var height = positive(spec.height, 1200, "canvas.height");
    var canvas = global.document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext("2d");
    if (!ctx) return Promise.reject(createError("CANVAS_UNAVAILABLE", "Canvas 2D context is unavailable."));
    if (spec.background) {
      ctx.fillStyle = spec.background;
      ctx.fillRect(0, 0, width, height);
    } else ctx.clearRect(0, 0, width, height);
    var sequence = Promise.resolve();
    (spec.layers || []).forEach(function (layer) {
      sequence = sequence.then(function () { return drawLayer(ctx, layer); });
    });
    return sequence.then(function () {
      try {
        return canvas.toDataURL(spec.type || "image/jpeg", spec.quality === undefined ? 0.9 : Number(spec.quality));
      } catch (cause) {
        var error = createError("CANVAS_EXPORT_FAILED", "Canvas export failed; check image CORS permissions.");
        error.cause = cause;
        throw error;
      }
    });
  }

  function drawAndShare(canvasOptions, shareOptions, callback) {
    return drawCanvas(canvasOptions).then(function (image) {
      return Activity.share.callImage(image, shareOptions, callback).then(function (result) {
        return { mode: "image", image: image, result: result };
      });
    }).catch(function (error) {
      return Activity.share.call(shareOptions, callback).then(function (result) {
        return { mode: "link", imageError: { code: error.code || "", message: error.message }, result: result };
      });
    });
  }

  Activity.share.drawCanvas = drawCanvas;
  Activity.share.drawAndShare = drawAndShare;
})(window);

(function (Activity) {
  "use strict";
  var favoriteDirectoryId = 201;
  var player = null;

  function requireMusic() {
    if (!window.Music) throw new Error("Music browser CDN is unavailable.");
    return window.Music;
  }

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

  function requireClient() {
    var music = requireMusic();
    if (!music.browser || !music.browser.music || !music.client || typeof music.client.open !== "function") {
      throw new Error("This operation requires a QQ Music WebView.");
    }
    return music;
  }

  function openClient(namespace, method, params) {
    var music = requireClient();
    return new Promise(function (resolve, reject) {
      music.client.open(namespace, method, params || {}, function (result) {
        if (result && Number(result.code) !== 0) reject(new Error(method + " failed: " + result.code));
        else resolve(result || { code: 0 });
      });
    });
  }

  function requireLogin() {
    var music = requireMusic();
    if (music.user && typeof music.user.isLogin === "function" && music.user.isLogin()) {
      return Promise.resolve(String(typeof music.user.getUin === "function" ? music.user.getUin() || "" : ""));
    }
    if (!music.user || typeof music.user.login !== "function" || typeof music.user.isLogin !== "function") {
      return Promise.reject(new Error("Login is required."));
    }
    return new Promise(function (resolve, reject) {
      music.user.login({
        noConfirm: true,
        forceLogin: true,
        cb: function () {
          if (music.user.isLogin()) resolve(String(typeof music.user.getUin === "function" ? music.user.getUin() || "" : ""));
          else reject(new Error("Login was not completed."));
        }
      });
    });
  }

  function normalizePlayerSong(song) {
    if (typeof song === "number") {
      if (!isFinite(song) || song <= 0) throw new Error("Song id must be a positive number.");
      return song;
    }
    if (typeof song === "string") {
      if (!song.trim()) throw new Error("Song id, mid or URL is required.");
      if (/^\d+$/.test(song) && Number(song) <= 0) throw new Error("Song id must be a positive number.");
      return song;
    }
    if (!song) throw new Error("Song id, mid or URL is required.");
    if (song.id !== undefined && song.id !== null && song.id !== "") {
      var id = Number(song.id);
      if (!isFinite(id) || id <= 0) throw new Error("Song id must be a positive number.");
      return id;
    }
    if (song.mid) return String(song.mid);
    if (song.url || song.src) return String(song.url || song.src);
    throw new Error("Song id, mid or URL is required.");
  }

  function normalizeDownloadSong(song) {
    if (typeof song === "number" || /^\d+$/.test(String(song || ""))) {
      if (Number(song) <= 0) throw new Error("Song id must be a positive number.");
      return { songid: Number(song) };
    }
    if (!song || (!song.id && !song.mid)) throw new Error("Song id or mid is required.");
    var type = Number(song.type || 0);
    if (!isFinite(type)) throw new Error("Song type must be numeric.");
    var normalized = { type: type };
    if (song.id) {
      var id = Number(song.id);
      if (!isFinite(id) || id <= 0) throw new Error("Song id must be a positive number.");
      normalized.songid = id;
    }
    if (song.mid) normalized.songmid = String(song.mid);
    return normalized;
  }

  function cgi(requests, comm) {
    var music = requireMusic();
    if (typeof music.uajaxAsync !== "function") return Promise.reject(new Error("Music CGI API is unavailable."));
    return music.uajaxAsync({ comm: comm || {} }, requests).then(function (result) { return result && result.res || {}; });
  }

  function responseData(response, index, label) {
    var result = response["req_" + index];
    if (!result || Number(result.code) !== 0) {
      throw new Error((label || "Music detail query") + " failed: " + (result && result.code !== undefined ? result.code : "missing response"));
    }
    return result.data || {};
  }

  function positiveIds(values, label) {
    var list = Array.isArray(values) ? values : [values];
    if (!list.length) throw new Error((label || "IDs") + " are required.");
    return list.map(function (value) {
      var id = Number(value);
      if (!isFinite(id) || id <= 0) throw new Error((label || "ID") + " must contain positive numbers.");
      return id;
    });
  }

  function stringIds(values, label) {
    var list = Array.isArray(values) ? values : [values];
    if (!list.length) throw new Error((label || "IDs") + " are required.");
    return list.map(function (value) {
      var id = String(value == null ? "" : value).trim();
      if (!id) throw new Error((label || "ID") + " must contain non-empty strings.");
      return id;
    });
  }

  function queryInBatches(values, size, query) {
    var batches = [];
    for (var index = 0; index < values.length; index += size) batches.push(values.slice(index, index + size));
    return batches.reduce(function (promise, batch) {
      return promise.then(function (all) {
        return query(batch).then(function (items) { return all.concat(items || []); });
      });
    }, Promise.resolve([]));
  }

  Activity.registerCapability("music", {
    getConfigured: function (type) {
      var value = Activity.getConfig("music." + type);
      return Array.isArray(value) ? value : [];
    },
    getSongCover: function (albumMid, size) {
      return albumMid ? "https://y.qq.com/music/photo_new/T002R" + (size || 300) + "x" + (size || 300) + "M000" + albumMid + ".jpg?max_age=2592000" : "";
    },
    getSingerCover: function (singerMid, size) {
      return singerMid ? "https://y.qq.com/music/photo_new/T001R" + (size || 300) + "x" + (size || 300) + "M000" + singerMid + ".jpg?max_age=2592000" : "";
    },
    getTracksById: function (songIds) {
      try {
        var ids = positiveIds(songIds, "Song IDs");
        return queryInBatches(ids, 20, function (batch) {
          return cgi([{
            module: "music.trackInfo.UniformRuleCtrl",
            method: "GetTrackInfo",
            param: { types: batch.map(function () { return 0; }), ids: batch }
          }], { mesh_devops: "DevopsBase" }).then(function (response) {
            return responseData(response, 0, "Track query").tracks || [];
          });
        });
      } catch (error) {
        return Promise.reject(error);
      }
    },
    getTracksByMid: function (songMids) {
      try {
        var mids = stringIds(songMids, "Song MIDs");
        return queryInBatches(mids, 20, function (batch) {
          return cgi([{
            module: "music.trackInfo.UniformRuleCtrl",
            method: "GetTrackInfo",
            param: { types: batch.map(function () { return 0; }), mids: batch }
          }], { mesh_devops: "DevopsBase" }).then(function (response) {
            return responseData(response, 0, "Track query").tracks || [];
          });
        });
      } catch (error) {
        return Promise.reject(error);
      }
    },
    getSingerDetails: function (singerMids) {
      try {
        var mids = stringIds(singerMids, "Singer MIDs");
        return queryInBatches(mids, 20, function (batch) {
          return cgi([{
            module: "music.musichallSinger.SingerInfoInter",
            method: "GetSingerDetail",
            param: { singer_mids: batch, pic: 1, ex_singer: 0, wiki_singer: 0, group_singer: 0, photos: 0 }
          }], { mesh_devops: "DevopsBase" }).then(function (response) {
            return responseData(response, 0, "Singer detail query").singer_list || [];
          });
        });
      } catch (error) {
        return Promise.reject(error);
      }
    },
    getAlbumDetails: function (albumMids) {
      try {
        var mids = stringIds(albumMids, "Album MIDs");
        return queryInBatches(mids, 20, function (batch) {
          var requests = batch.map(function (mid) {
            return { module: "music.musichallAlbum.AlbumInfoServer", method: "GetAlbumDetail", param: { albumMid: mid } };
          });
          return cgi(requests).then(function (response) {
            return requests.map(function (_, index) { return responseData(response, index, "Album detail query"); });
          });
        });
      } catch (error) {
        return Promise.reject(error);
      }
    },
    getAlbumSongs: function (albumId, options) {
      var id = Number(albumId);
      if (!isFinite(id) || id <= 0) return Promise.reject(new Error("Album ID must be a positive number."));
      var opts = options || {};
      var begin = opts.begin === undefined ? 0 : Number(opts.begin);
      var num = opts.num === undefined ? 80 : Number(opts.num);
      var order = opts.order === undefined ? 2 : Number(opts.order);
      if (!isFinite(begin) || begin < 0 || !isFinite(num) || num <= 0 || !isFinite(order)) {
        return Promise.reject(new Error("Album song query options are invalid."));
      }
      return cgi([{
        module: "music.musichallAlbum.AlbumSongList",
        method: "GetAlbumSongList",
        param: { albumID: id, begin: begin, num: num, order: order }
      }], { mesh_devops: "DevopsBase" }).then(function (response) {
        return (responseData(response, 0, "Album song query").songList || []).map(function (item) { return item.songInfo || item; });
      });
    },
    getPlaylistDetails: function (playlistIds) {
      try {
        var ids = positiveIds(playlistIds, "Playlist IDs");
        return queryInBatches(ids, 20, function (batch) {
          return cgi([{
            module: "music.playlist.UniformUgcPlRead",
            method: "get_playlist_rawinfo",
            param: { v_tid: batch, basic_opt: true, songlist_opt: true, play_opt: true }
          }]).then(function (response) {
            return [responseData(response, 0, "Playlist detail query").m_playlist || {}];
          });
        }).then(function (maps) {
          return maps.reduce(function (all, item) { return Object.assign(all, item); }, {});
        });
      } catch (error) {
        return Promise.reject(error);
      }
    },
    getVideoInfo: function (vids, requiredFields) {
      try {
        var videoIds = stringIds(vids, "Video VIDs");
        var required = Array.isArray(requiredFields) && requiredFields.length ? requiredFields.map(String) : ["code", "vid", "type", "sid", "cover_pic", "name", "playcnt"];
        return cgi([{
          module: "music.video.VideoData",
          method: "get_video_info_batch",
          param: { vidlist: videoIds, required: required }
        }]).then(function (response) {
          return responseData(response, 0, "Video info query");
        });
      } catch (error) {
        return Promise.reject(error);
      }
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
    },
    resetPlayer: function () {
      if (player) {
        if (typeof player.pause === "function") player.pause();
        if (typeof player.destroy === "function") player.destroy();
      }
      player = null;
    },
    download: function (song) {
      try {
        var normalized = normalizeDownloadSong(song);
        if (!normalized.songid) return Promise.reject(new Error("Song id is required for download."));
        return openClient("media", "downloadSong", { song: [normalized] });
      } catch (error) {
        return Promise.reject(error);
      }
    },
    getFavorites: function () {
      return requireLogin().then(function (uin) {
        return cgi([{ module: "music.musicasset.PlaylistDetailRead", method: "GetSonglistByDirId", param: { uin: uin, v_dirId: [favoriteDirectoryId] } }]);
      }).then(function (response) {
        if (!response.req_0 || Number(response.req_0.code) !== 0) throw new Error("Unable to read favorite songs.");
        var songlist = response.req_0.data && response.req_0.data.m_songlist || {};
        var songs = songlist[favoriteDirectoryId] && songlist[favoriteDirectoryId].v_songinfo || [];
        var map = {};
        songs.forEach(function (song) { map[String(song.songId)] = true; });
        return map;
      });
    },
    setFavorite: function (songId, favorite) {
      var id = Number(songId);
      if (!id) return Promise.reject(new Error("Song id is required for favorite operations."));
      return requireLogin().then(function () {
        return cgi([{
          module: "music.musicasset.PlaylistDetailWrite",
          method: favorite ? "AddSonglist" : "DelSonglist",
          param: { dirId: favoriteDirectoryId, v_songInfo: [{ songId: id }] }
        }]);
      }).then(function (response) {
        var result = response.req_0 || {};
        var retCode = result.data && result.data.retCode;
        if (Number(result.code) !== 0 || (retCode !== undefined && Number(retCode) !== 0)) {
          throw new Error("Favorite operation failed: " + (Number(result.code) || retCode));
        }
        return { favorite: Boolean(favorite), songId: id, data: result.data };
      });
    },
    toggleFavorite: function (songId) {
      var self = this;
      return self.getFavorites().then(function (favorites) {
        return self.setFavorite(songId, !favorites[String(songId)]);
      });
    }
  });
})(window.Activity);
