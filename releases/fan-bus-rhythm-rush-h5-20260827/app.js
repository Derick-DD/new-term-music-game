(function () {
  "use strict";

  Activity.configure(window.ACTIVITY_CONFIG);

  var GAME_WIDTH = 480;
  var GAME_HEIGHT = 720;
  var ROAD_LEFT = 8;
  var ROAD_WIDTH = GAME_WIDTH - 16;
  var LANE_WIDTH = ROAD_WIDTH / 5;
  var ROAD_HORIZON_Y = 302;
  var ROAD_VANISH_X = GAME_WIDTH / 2;
  var PLAYER_Y = 584;
  var TRAVEL_BEATS = 4;
  var PERFECT_WINDOW = 65;
  var GREAT_WINDOW = 155;
  var MISS_WINDOW = 240;
  var POWERUP_DURATION = 5000;
  var PEDESTRIAN_WARNING_BEATS = 8;
  var PEDESTRIAN_EVENT_BEATS = 16;
  var PEDESTRIAN_DANGER_WINDOW = 500;
  var HIT_GUARD = 70;
  var TOTAL_TUTORIAL_MS = 9000;
  var MAGNET_RADIUS = 185;
  var SONG_ID = 380208811;
  var JOYSTICK_FIRST_REPEAT_MS = 120;
  var JOYSTICK_REPEAT_MS = 105;
  var PLAYBACK_CONFIRM_TIMEOUT_MS = 8000;

  var ASSETS = {
    road: "./assets/campus-season/campus-road.png",
    bicycle: "./assets/campus-season/vehicle-bicycle.png",
    motorcycle: "./assets/campus-season/vehicle-motorcycle.png",
    car: "./assets/campus-season/vehicle-car.png",
    schoolBus: "./assets/campus-season/vehicle-school-bus.png",
    fan: "./assets/campus-season/icons/knowledge-star.png",
    lucky: "./assets/campus-season/icons/mystery-schoolbag.png",
    magnet: "./assets/campus-season/icons/campus-magnet.png",
    invincible: "./assets/campus-season/icons/energy-lightning.png",
    cone: "./assets/campus-season/icons/obstacle-cone.png",
    pothole: "./assets/campus-season/icons/obstacle-pothole.png",
    barrier: "./assets/campus-season/icons/obstacle-barrier.png",
    pedestrian: "./assets/campus-season/icons/grandma-crossing.png"
  };

  var OUTCOMES = [
    {
      min: 6500,
      name: "天才学神",
      place: "知识宇宙已被你一键点亮",
      coins: 1080,
      color: "#f47ead",
      icon: "./assets/campus-season/icons/outcome-genius-penguin.png"
    },
    {
      min: 4500,
      name: "隐形学霸",
      place: "表面松弛，实力早已藏不住",
      coins: 680,
      color: "#23cfb2",
      icon: "./assets/campus-season/icons/outcome-hidden-dog-reader.png"
    },
    {
      min: 2800,
      name: "卷王本王",
      place: "进度条和行动力同时拉满",
      coins: 420,
      color: "#45c8ed",
      icon: "./assets/campus-season/icons/outcome-grind-cat-roll.png"
    },
    {
      min: 1400,
      name: "知识分子",
      place: "新的知识点已经稳稳接住",
      coins: 240,
      color: "#7187b2",
      icon: "./assets/campus-season/icons/outcome-scholar-cheese.png"
    },
    {
      min: 0,
      name: "佛系咸鱼",
      place: "不慌不忙，也算顺利开学",
      coins: 100,
      color: "#f5a5c3",
      icon: "./assets/campus-season/icons/outcome-slacker-fish-crayon.png"
    }
  ];

  var VEHICLES = [
    { level: 1, name: "自行车", asset: "bicycle", hits: 4, perfect: 1, combo: 0, task: "收集 4 点知识 + PERFECT 1 次" },
    { level: 2, name: "摩托车", asset: "motorcycle", hits: 12, perfect: 0, combo: 6, task: "收集 12 点知识 + 最高连击 6" },
    { level: 3, name: "小轿车", asset: "car", hits: 22, perfect: 7, combo: 10, task: "收集 22 点知识 + PERFECT 7 次 + 最高连击 10" },
    { level: 4, name: "校车大巴", asset: "schoolBus", hits: 0, perfect: 0, combo: 0, task: "已达最高等级" }
  ];

  var elements = {};
  var images = {};
  var chart = null;
  var song = null;
  var animationFrame = 0;
  var toastTimer = 0;
  var judgementTimer = 0;
  var lastShareBase64 = "";
  var swipeStart = null;
  var assetsReady = false;
  var resourcesPromise = null;
  var joystickPointer = null;
  var joystickDirection = 0;
  var joystickFrame = 0;
  var joystickNextMoveAt = 0;

  var state = {
    status: "ready",
    soundOn: true,
    lane: 2,
    busX: laneCenter(2),
    fans: 0,
    combo: 0,
    maxCombo: 0,
    perfect: 0,
    successfulHits: 0,
    vehicleLevel: 1,
    shield: false,
    beat: 0,
    nextBeat: 0,
    activeOrdinal: 0,
    weakOrdinal: 0,
    lastObstacleBeat: -100,
    elapsedBase: 0,
    clockStartedAt: 0,
    progress: 0,
    entities: [],
    particles: [],
    floatTexts: [],
    pedestrian: null,
    warnedPedestrian: false,
    magnetUntil: -1,
    invincibleUntil: -1,
    invulnerableUntil: -1,
    magnetQuota: 1,
    magnetSpawned: 0,
    toneMode: "normal",
    toneUntilBeat: -1,
    tutorialActive: false,
    tutorialMoved: false,
    tutorialHit: false,
    tutorialFinished: false,
    lastInputAt: -1000,
    lastHudAt: -1000,
    shareTier: OUTCOMES[OUTCOMES.length - 1],
    debugSilent: false
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function bindElements() {
    [
      "home-view", "game-view", "home-best", "home-coins", "home-sound",
      "game-sound", "player-name", "music-ready-state", "start-button",
      "start-kicker", "start-label", "home-song-status", "rules-button", "rules-modal",
      "rules-start", "pause-button", "game-status-label", "game-best", "game-coins",
      "beat-bars", "fans-count", "combo-count", "ride-level", "ride-name",
      "ride-task", "ride-progress", "ride-percent", "tone-state",
      "journey-progress", "game-screen", "game-canvas", "powerup-hud",
      "toast", "judgement", "tutorial", "skip-tutorial", "tutorial-symbol",
      "tutorial-step", "tutorial-copy", "pause-overlay", "resume-button",
      "restart-from-pause", "home-from-pause", "lucky-overlay", "lucky-title",
      "lucky-copy", "lucky-risk", "lucky-result", "lucky-before",
      "lucky-after", "open-lucky", "skip-lucky", "result-overlay",
      "result-icon", "result-title", "result-place", "result-fans",
      "result-combo", "result-coins", "result-score", "share-button",
      "replay-button", "home-from-result", "fail-overlay", "fail-fans",
      "fail-detail", "retry-button", "home-from-fail", "share-preview",
      "close-share-preview", "share-preview-image", "invoke-image-share",
      "joystick-control", "joystick-knob", "hit-button", "tutorial-move-state",
      "tutorial-hit-state"
    ].forEach(function (id) {
      elements[id] = byId(id);
    });
  }

  function report(type, key, data) {
    try {
      if (Activity.report && typeof Activity.report[type] === "function") {
        Activity.report[type](key, data || {});
      }
    } catch (error) {
      console.warn("Report skipped", type, key, error);
    }
  }

  function safeStorageGet(key, fallback) {
    try {
      var value = window.localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  }

  function safeStorageSet(key, value) {
    try {
      window.localStorage.setItem(key, String(value));
    } catch (error) {
      console.warn("Local storage unavailable", error);
    }
  }

  function safeSessionGet(key) {
    try {
      return window.sessionStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function safeSessionSet(key, value) {
    try {
      window.sessionStorage.setItem(key, value);
    } catch (error) {
      console.warn("Session storage unavailable", error);
    }
  }

  function vibrate(pattern) {
    try {
      if (window.navigator.vibrate) window.navigator.vibrate(pattern);
    } catch (error) {
      return false;
    }
    return true;
  }

  function laneCenter(lane) {
    return ROAD_LEFT + LANE_WIDTH * lane + LANE_WIDTH / 2;
  }

  function clampLane(lane) {
    return Math.max(0, Math.min(4, lane));
  }

  function roadDepthFromY(y) {
    return Math.max(0, Math.min(1.48, (y - ROAD_HORIZON_Y) / (PLAYER_Y - ROAD_HORIZON_Y)));
  }

  function roadYFromProgress(progress) {
    var clamped = Math.max(0, Math.min(1.35, progress));
    return ROAD_HORIZON_Y + (PLAYER_Y - ROAD_HORIZON_Y) * Math.pow(clamped, 1.42);
  }

  function laneXAtDepth(lane, depth) {
    return ROAD_VANISH_X + (laneCenter(lane) - ROAD_VANISH_X) * depth;
  }

  function boundaryXAtDepth(boundary, depth) {
    var x = ROAD_LEFT + boundary * LANE_WIDTH;
    return ROAD_VANISH_X + (x - ROAD_VANISH_X) * depth;
  }

  function smoothstep(value) {
    var x = Math.max(0, Math.min(1, value));
    return x * x * (3 - 2 * x);
  }

  function currentElapsed() {
    if (state.status === "playing") {
      return state.elapsedBase + performance.now() - state.clockStartedAt;
    }
    return state.elapsedBase;
  }

  function isLocalDebug() {
    var host = window.location.hostname;
    var debug = new URLSearchParams(window.location.search).get("debug") === "1";
    return debug && (host === "127.0.0.1" || host === "localhost" || host === "::1");
  }

  function setGameStatus(nextStatus) {
    state.status = nextStatus;
    if (nextStatus !== "playing") stopJoystick();
    if (elements["game-view"]) elements["game-view"].setAttribute("data-game-status", nextStatus);
  }

  function startClock() {
    state.clockStartedAt = performance.now();
  }

  function stopClock() {
    if (state.status === "playing") {
      state.elapsedBase = currentElapsed();
    }
  }

  function showToast(message, tone) {
    window.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.className = "game-toast tone-" + (tone || "cyan");
    toastTimer = window.setTimeout(function () {
      elements.toast.classList.add("is-hidden");
    }, 2400);
  }

  function showJudgement(quality, detail) {
    window.clearTimeout(judgementTimer);
    elements.judgement.querySelector("strong").textContent = quality;
    elements.judgement.querySelector("span").textContent = detail;
    elements.judgement.className = "note-judgement quality-" + quality.toLowerCase();
    judgementTimer = window.setTimeout(function () {
      elements.judgement.classList.add("is-hidden");
    }, 560);
  }

  function setMusicUi() {
    var label = state.soundOn ? "SOUND ON" : "SOUND OFF";
    [elements["home-sound"], elements["game-sound"]].forEach(function (button) {
      button.textContent = label;
      button.classList.toggle("is-muted", !state.soundOn);
      button.setAttribute("aria-pressed", state.soundOn ? "false" : "true");
      button.setAttribute("aria-label", state.soundOn ? "关闭声音" : "打开声音");
    });
  }

  function showView(name) {
    elements["home-view"].classList.toggle("is-hidden", name !== "home");
    elements["game-view"].classList.toggle("is-hidden", name !== "game");
    elements.app = elements.app || byId("app");
    elements.app.classList.toggle("is-home-page", name === "home");
    if (name === "home") elements.app.classList.remove("is-rules-page");
  }

  function hideAllOverlays() {
    ["pause-overlay", "lucky-overlay", "result-overlay", "fail-overlay", "share-preview"].forEach(function (id) {
      elements[id].classList.add("is-hidden");
    });
  }

  function setStartLoading(loading, error, message) {
    var waiting = loading || !chart || !assetsReady;
    elements["start-button"].disabled = !error && waiting;
    elements["rules-start"].disabled = !error && waiting;
    elements["start-kicker"].textContent = error ? "RETRY" : waiting ? "CONNECTING" : "READY";
    elements["start-label"].textContent = error ? "重新加载资源" : waiting ? "资源加载中…" : "走进校园";
    elements["music-ready-state"].textContent = error ? "RETRY" : waiting ? "LOADING" : "ONLINE";
    elements["music-ready-state"].classList.toggle("is-error", Boolean(error));
    elements["home-song-status"].textContent = error ? (message || "资源或 QQ 音乐在线播放暂不可用，请重试") : "";
    elements["home-song-status"].classList.toggle("is-hidden", !error);
  }

  function loadImages() {
    var urls = [
      "./assets/campus-season/campus-hero.png",
      "./assets/ui/play-icon.png",
      "./assets/campus-season/icons/obstacle-books.png",
      "./assets/campus-season/icons/outcome-genius.png",
      "./assets/campus-season/icons/outcome-grind-king.png",
      "./assets/campus-season/icons/outcome-hidden-achiever.png",
      "./assets/campus-season/icons/outcome-scholar.png",
      "./assets/campus-season/icons/outcome-slacker-fish.png"
    ];
    Object.keys(ASSETS).forEach(function (key) { urls.push(ASSETS[key]); });
    OUTCOMES.forEach(function (outcome) { urls.push(outcome.icon); });
    document.querySelectorAll("img[src]").forEach(function (element) {
      urls.push(element.getAttribute("src"));
    });
    urls = urls.filter(function (url, index, list) { return url && list.indexOf(url) === index; });

    return Promise.all(urls.map(function (src) {
      return new Promise(function (resolve, reject) {
        var image = new Image();
        image.decoding = "async";
        image.onload = function () { resolve({ src: src, image: image }); };
        image.onerror = function () { reject(new Error("图片资源加载失败：" + src)); };
        image.src = src;
      });
    })).then(function (loaded) {
      loaded.forEach(function (item) {
        Object.keys(ASSETS).forEach(function (key) {
          if (ASSETS[key] === item.src) images[key] = item.image;
        });
      });
      assetsReady = true;
      drawIdleScene();
    });
  }

  function loadChart() {
    return fetch("./assets/game-chart.json", { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("谱面资源加载失败");
        return response.json();
      })
      .then(function (data) {
        if (!data.timing || !Array.isArray(data.timing.beatTimesMs) || !data.gameplay) {
          throw new Error("谱面格式不兼容");
        }
        chart = data;
        return data;
      });
  }

  function prepareResources() {
    if (resourcesPromise) return resourcesPromise;
    assetsReady = false;
    setStartLoading(true, false);
    resourcesPromise = Promise.all([loadImages(), loadChart()])
      .then(function () {
        setStartLoading(false, false);
        return true;
      })
      .catch(function (error) {
        console.error(error);
        setStartLoading(false, true, error && error.message);
        return false;
      })
      .then(function (result) {
        resourcesPromise = null;
        return result;
      });
    return resourcesPromise;
  }

  function updateHomeRecords() {
    var best = safeStorageGet("fan-bus-best", "0");
    var coins = safeStorageGet("fan-bus-coins", "0");
    elements["home-best"].textContent = best;
    elements["home-coins"].textContent = coins;
    elements["game-best"].textContent = best;
    elements["game-coins"].textContent = coins;
    elements["player-name"].value = safeStorageGet("fan-bus-player-name", "新同学") || "新同学";
  }

  function currentVehicle() {
    return VEHICLES[Math.max(0, Math.min(VEHICLES.length - 1, state.vehicleLevel - 1))];
  }

  function vehicleProgress(vehicle) {
    if (vehicle.level === 4) return 100;
    var parts = [state.successfulHits / vehicle.hits];
    if (vehicle.perfect) parts.push(state.perfect / vehicle.perfect);
    if (vehicle.combo) parts.push(state.maxCombo / vehicle.combo);
    return Math.round(Math.min(1, Math.min.apply(Math, parts)) * 100);
  }

  function checkVehicleUpgrade() {
    var vehicle = currentVehicle();
    if (vehicle.level === 4) return false;
    if (
      state.successfulHits < vehicle.hits ||
      state.perfect < vehicle.perfect ||
      state.maxCombo < vehicle.combo
    ) {
      return false;
    }
    state.vehicleLevel += 1;
    var next = currentVehicle();
    addBurst(state.busX, PLAYER_Y - 20, "#ffe66d", 34);
    addFloat(state.busX, PLAYER_Y - 95, "RIDE LV." + next.level + " " + next.name, "#ffe66d");
    showToast("车辆升级！" + next.name, "gold");
    vibrate([35, 25, 45, 25, 65]);
    return true;
  }

  function updateHud(force) {
    var elapsed = currentElapsed();
    if (!force && elapsed - state.lastHudAt < 80) return;
    state.lastHudAt = elapsed;
    elements["fans-count"].textContent = String(state.fans).padStart(3, "0");
    elements["combo-count"].textContent = state.maxCombo;
    var vehicle = currentVehicle();
    var rideProgress = vehicleProgress(vehicle);
    elements["ride-level"].textContent = "LV." + vehicle.level;
    elements["ride-name"].textContent = vehicle.name;
    elements["ride-task"].textContent = vehicle.task;
    elements["ride-progress"].style.width = rideProgress + "%";
    elements["ride-percent"].textContent = vehicle.level === 4 ? "MAX" : rideProgress + "%";
    var duration = chart ? chart.timing.beatTimesMs[chart.timing.beatTimesMs.length - 1] : 1;
    state.progress = Math.max(0, Math.min(100, elapsed / duration * 100));
    elements["journey-progress"].style.width = state.progress + "%";
    if (state.toneMode === "normal") {
      elements["tone-state"].innerHTML = "<strong>跟随节拍</strong><span>按 HIT 收集</span>";
    } else {
      elements["tone-state"].innerHTML = "<strong>受击反馈</strong><span>" + (state.toneMode === "thick" ? "厚" : "细") + "音色视觉中</span>";
    }
    updatePowerupHud(elapsed);
  }

  function updatePowerupHud(elapsed) {
    var chips = [];
    var magnetRemaining = Math.max(0, state.magnetUntil - elapsed);
    var invincibleRemaining = Math.max(0, state.invincibleUntil - elapsed);
    if (magnetRemaining > 0) {
      chips.push(
        '<div class="powerup-chip"><img src="' + ASSETS.magnet + '" alt=""><span><small>校园磁铁</small><strong>' +
        (magnetRemaining / 1000).toFixed(1) + "s</strong></span></div>"
      );
    }
    if (invincibleRemaining > 0) {
      chips.push(
        '<div class="powerup-chip is-invincible"><img src="' + ASSETS.invincible + '" alt=""><span><small>元气闪电</small><strong>' +
        (invincibleRemaining / 1000).toFixed(1) + "s</strong></span></div>"
      );
    }
    elements["powerup-hud"].innerHTML = chips.join("");
  }

  function resetGameState() {
    setGameStatus("playing");
    state.lane = 2;
    state.busX = laneCenter(2);
    state.fans = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.perfect = 0;
    state.successfulHits = 0;
    state.vehicleLevel = 1;
    state.shield = false;
    state.beat = 0;
    state.nextBeat = 0;
    state.activeOrdinal = 0;
    state.weakOrdinal = 0;
    state.lastObstacleBeat = -100;
    state.elapsedBase = 0;
    state.clockStartedAt = performance.now();
    state.progress = 0;
    state.entities = [];
    state.particles = [];
    state.floatTexts = [];
    state.pedestrian = null;
    state.warnedPedestrian = false;
    state.magnetUntil = -1;
    state.invincibleUntil = -1;
    state.invulnerableUntil = -1;
    state.magnetQuota = Math.random() < .25 ? 2 : 1;
    state.magnetSpawned = 0;
    state.toneMode = "normal";
    state.toneUntilBeat = -1;
    state.tutorialActive = !safeSessionGet("fan-bus-tutorial-seen");
    state.tutorialMoved = false;
    state.tutorialHit = false;
    state.tutorialFinished = false;
    state.lastInputAt = -1000;
    state.lastHudAt = -1000;
    state.shareTier = OUTCOMES[OUTCOMES.length - 1];
    state.debugSilent = false;
    hideAllOverlays();
    elements.tutorial.classList.toggle("is-hidden", !state.tutorialActive);
    updateTutorialUi();
    updateHud(true);
  }

  function updateTutorialUi() {
    if (!state.tutorialActive) {
      elements.tutorial.classList.add("is-hidden");
      return;
    }
    if (!state.tutorialMoved) {
      elements.tutorial.className = "tutorial-guide is-move";
      elements["tutorial-symbol"].textContent = "← →";
      elements["tutorial-step"].textContent = "STEP 1 / 躲避";
      elements["tutorial-copy"].textContent = "按住下方摇杆并向左右拖动，持续移动小车躲开障碍";
    } else if (!state.tutorialHit) {
      elements.tutorial.className = "tutorial-guide is-hit";
      elements["tutorial-symbol"].textContent = "HIT";
      elements["tutorial-step"].textContent = "STEP 2 / 收集";
      elements["tutorial-copy"].textContent = "星星圆环重合时，立即按右下角 HIT";
    } else {
      elements.tutorial.className = "tutorial-guide is-complete";
      elements["tutorial-symbol"].textContent = "✓";
      elements["tutorial-step"].textContent = "READY";
      elements["tutorial-copy"].textContent = "校准完成，正式出发！";
      if (!state.tutorialFinished) {
        state.tutorialFinished = true;
        window.setTimeout(endTutorial, 620);
      }
    }
    elements["tutorial-move-state"].className = state.tutorialMoved ? "is-done" : "is-current";
    elements["tutorial-move-state"].querySelector("i").textContent = state.tutorialMoved ? "✓" : "1";
    elements["tutorial-hit-state"].className = state.tutorialHit ? "is-done" : state.tutorialMoved ? "is-current" : "";
    elements["tutorial-hit-state"].querySelector("i").textContent = state.tutorialHit ? "✓" : "2";
  }

  function endTutorial() {
    if (!state.tutorialActive) return;
    state.tutorialActive = false;
    safeSessionSet("fan-bus-tutorial-seen", "1");
    elements.tutorial.classList.add("is-hidden");
    showToast("练习完成 · 正式计分开始", "cyan");
  }

  function addBurst(x, y, color, count) {
    for (var index = 0; index < count; index += 1) {
      var angle = Math.PI * 2 * index / count + Math.random() * .4;
      var speed = 45 + Math.random() * 95;
      state.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: .65,
        maxLife: .65,
        color: color,
        size: 3 + Math.random() * 5
      });
    }
  }

  function addFloat(x, y, text, color) {
    state.floatTexts.push({ x: x, y: y, text: text, color: color, life: .9, maxLife: .9 });
  }

  function spawnBeat(beat) {
    var times = chart.timing.beatTimesMs;
    var totalBeats = times.length - 1;
    if (beat >= totalBeats - TRAVEL_BEATS) return;
    var targetBeat = beat + TRAVEL_BEATS;
    var lanes = chart.gameplay.lanePattern;
    var notes = chart.gameplay.notePattern;
    var intensities = chart.gameplay.intensityPattern;
    var lane = lanes[targetBeat % lanes.length];
    var noteLevel = notes[targetBeat % notes.length] || 0;
    var intensity = intensities[targetBeat % intensities.length] || 0;
    var pedestrianBeat = (chart.gameplay.grannyBeats || [])[0];
    if (pedestrianBeat && Math.abs(targetBeat - pedestrianBeat) <= 4) return;
    if (noteLevel === 1) state.weakOrdinal += 1;
    if (noteLevel === 2) state.activeOrdinal += 1;
    var shouldSpawn = noteLevel === 2 || (noteLevel === 1 && (state.weakOrdinal % 2 === 0 || state.weakOrdinal % 7 === 0));
    if (!shouldSpawn) return;

    var spawnAt = times[beat];
    var hitAt = times[targetBeat];
    state.entities.push(makeEntity("fan", lane, targetBeat, spawnAt, hitAt));

    var bonus = "";
    if (noteLevel === 2 && [36, 64].indexOf(state.activeOrdinal) >= 0 && state.magnetSpawned < state.magnetQuota) {
      bonus = "magnet";
      state.magnetSpawned += 1;
    } else if (noteLevel === 2 && state.activeOrdinal > 10 && state.activeOrdinal % 28 === 20) {
      bonus = "invincible";
    } else if (noteLevel === 2 && [19, 57].indexOf(state.activeOrdinal) >= 0) {
      bonus = "lucky";
    }
    if (bonus) {
      var halfBeat = targetBeat + 1 < times.length ? (times[targetBeat + 1] - hitAt) / 2 : 0;
      state.entities.push(makeEntity(bonus, lane, targetBeat, spawnAt + halfBeat, hitAt + halfBeat));
    }

    if (beat < 2 || noteLevel !== 2 || targetBeat - state.lastObstacleBeat < 3) return;
    state.lastObstacleBeat = targetBeat;
    var obstacleCount = beat > 12 && intensity > .68 ? 2 : 1;
    var used = {};
    used[lane] = true;
    var types = ["cone", "pothole", "barrier"];
    for (var item = 0; item < obstacleCount; item += 1) {
      var obstacleLane = (beat * 2 + item * 3) % 5;
      while (used[obstacleLane]) obstacleLane = (obstacleLane + 1) % 5;
      used[obstacleLane] = true;
      var obstacle = makeEntity("obstacle", obstacleLane, targetBeat, spawnAt, hitAt);
      obstacle.obstacle = types[(beat + item) % types.length];
      state.entities.push(obstacle);
    }
  }

  function makeEntity(type, lane, targetBeat, spawnAt, hitAt) {
    return {
      id: Date.now() + Math.random(),
      type: type,
      lane: lane,
      targetBeat: targetBeat,
      spawnAt: spawnAt,
      hitAt: hitAt,
      y: ROAD_HORIZON_Y,
      handled: false,
      obstacle: ""
    };
  }

  function collectFan(entity, quality, source) {
    entity.handled = true;
    state.combo += 1;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
    state.successfulHits += 1;
    state.fans += 1;
    if (quality === "PERFECT") state.perfect += 1;
    var upgraded = checkVehicleUpgrade();
    var x = laneXAtDepth(entity.lane, roadDepthFromY(entity.y));
    addBurst(x, entity.y, quality === "PERFECT" ? "#ffe66d" : "#72f1ff", quality === "PERFECT" ? 22 : 14);
    addFloat(x, entity.y - 18, quality + " +1", quality === "PERFECT" ? "#ffe66d" : "#72f1ff");
    if (!upgraded) showJudgement(quality, source + " · +1 知识 · ×" + state.combo);
    if (quality === "PERFECT" && state.perfect % 8 === 0 && !state.shield) {
      state.shield = true;
      showToast("8 次 PERFECT！获得校园护盾", "gold");
    }
    vibrate(quality === "PERFECT" ? [14, 10, 20] : 12);
  }

  function applyObstacle(entity, now, elapsed) {
    if (elapsed < state.invincibleUntil) {
      addBurst(state.busX, PLAYER_Y, "#ffe66d", 18);
      addFloat(state.busX, PLAYER_Y - 58, "无敌穿越!", "#ffe66d");
      return;
    }
    if (now < state.invulnerableUntil) return;
    state.invulnerableUntil = now + 720;
    var baseLoss = entity.obstacle === "barrier" ? 10 : entity.obstacle === "pothole" ? 7 : 4;
    var loss = state.shield ? Math.ceil(baseLoss / 2) : baseLoss;
    if (state.shield) {
      state.shield = false;
      addFloat(state.busX, PLAYER_Y - 82, "护盾减伤", "#72f1ff");
    }
    var actualLoss = Math.min(state.fans, loss);
    state.fans -= actualLoss;
    state.combo = 0;
    state.toneMode = state.toneMode === "thick" ? "thin" : "thick";
    state.toneUntilBeat = state.beat + 8;
    addBurst(state.busX, PLAYER_Y, "#ff526f", 17);
    addFloat(state.busX, PLAYER_Y - 58, "-" + actualLoss + " 知识", "#ff526f");
    showToast("知识 -" + actualLoss + " · " + (state.toneMode === "thick" ? "厚" : "细") + "音色视觉 8 拍", "danger");
    vibrate(entity.obstacle === "barrier" ? [85, 35, 120] : [45, 24, 70]);
  }

  function enterLucky() {
    stopClock();
    setGameStatus("lucky");
    elements["lucky-overlay"].classList.remove("is-hidden");
    elements["lucky-title"].textContent = "是否开启锦囊？";
    elements["lucky-copy"].textContent = "可能让知识翻倍，也可能减少一半；暂不开启则保持不变。";
    elements["lucky-risk"].classList.remove("is-hidden");
    elements["lucky-result"].classList.add("is-hidden");
    elements["open-lucky"].textContent = "开启锦囊";
    elements["skip-lucky"].textContent = "暂不开启";
    elements["skip-lucky"].classList.remove("is-hidden");
    if (!state.debugSilent) Activity.music.pause().catch(function () {});
  }

  function createPedestrian(targetBeat) {
    var times = chart.timing.beatTimesMs;
    var startBeat = Math.max(0, targetBeat - PEDESTRIAN_WARNING_BEATS);
    var endBeat = Math.min(times.length - 1, targetBeat + PEDESTRIAN_EVENT_BEATS - PEDESTRIAN_WARNING_BEATS);
    state.pedestrian = {
      startAt: times[startBeat],
      hitAt: times[targetBeat],
      endAt: times[endBeat],
      x: ROAD_LEFT,
      y: ROAD_HORIZON_Y,
      direction: 1
    };
    showToast("前方斑马线 · 请提前避让行人", "gold");
  }

  function updatePedestrian(elapsed) {
    var pedestrian = state.pedestrian;
    if (!pedestrian) return false;
    var approach = Math.max(0, Math.min(1, (elapsed - pedestrian.startAt) / Math.max(1, pedestrian.hitAt - pedestrian.startAt)));
    var departure = Math.max(0, Math.min(1.1, (elapsed - pedestrian.hitAt) / Math.max(1, pedestrian.endAt - pedestrian.hitAt)));
    var y = elapsed <= pedestrian.hitAt ? roadYFromProgress(approach) : PLAYER_Y + (GAME_HEIGHT + 48 - PLAYER_Y) * departure;
    var crossing = Math.max(0, Math.min(1, (elapsed - pedestrian.startAt) / Math.max(1, pedestrian.endAt - pedestrian.startAt)));
    var depth = roadDepthFromY(y);
    var left = boundaryXAtDepth(0, depth);
    var right = boundaryXAtDepth(5, depth);
    var x = left + (right - left) * smoothstep(crossing);
    pedestrian.x = x;
    pedestrian.y = y;
    if (
      Math.abs(elapsed - pedestrian.hitAt) <= PEDESTRIAN_DANGER_WINDOW &&
      Math.abs(y - PLAYER_Y) < 56 &&
      Math.abs(x - state.busX) < 56
    ) {
      failGame();
      return true;
    }
    if (elapsed > pedestrian.endAt || y > GAME_HEIGHT + 20) state.pedestrian = null;
    return false;
  }

  function updateParticles(delta) {
    state.particles = state.particles.filter(function (particle) {
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vy += 115 * delta;
      particle.life -= delta;
      return particle.life > 0;
    });
    state.floatTexts = state.floatTexts.filter(function (item) {
      item.y -= 38 * delta;
      item.life -= delta;
      return item.life > 0;
    });
  }

  function gameLoop(now) {
    if (state.status !== "playing") return;
    var elapsed = currentElapsed();
    var times = chart.timing.beatTimesMs;
    var totalBeats = times.length - 1;
    var delta = Math.min(.035, Math.max(.001, (now - (state.lastFrameAt || now)) / 1000));
    state.lastFrameAt = now;

    if (state.tutorialActive && elapsed >= TOTAL_TUTORIAL_MS) endTutorial();

    while (state.nextBeat < totalBeats && elapsed >= times[state.nextBeat]) {
      state.beat = state.nextBeat;
      if (!state.tutorialActive) spawnBeat(state.nextBeat);
      var grannyBeat = (chart.gameplay.grannyBeats || [])[0];
      if (!state.tutorialActive && grannyBeat && !state.warnedPedestrian && state.nextBeat === grannyBeat - PEDESTRIAN_WARNING_BEATS) {
        state.warnedPedestrian = true;
        createPedestrian(grannyBeat);
      }
      if (state.toneUntilBeat > 0 && state.beat >= state.toneUntilBeat) {
        state.toneMode = "normal";
        state.toneUntilBeat = -1;
        showToast("受击视觉恢复 · 歌曲节拍始终不变", "cyan");
      }
      updateBeatBars(state.beat);
      state.nextBeat += 1;
    }

    state.busX += (laneCenter(state.lane) - state.busX) * Math.min(1, delta * 14);
    if (state.magnetUntil > 0 && elapsed >= state.magnetUntil) {
      state.magnetUntil = -1;
      showToast("磁铁效果结束", "cyan");
    }
    if (state.invincibleUntil > 0 && elapsed >= state.invincibleUntil) {
      state.invincibleUntil = -1;
      showToast("无敌模式结束", "gold");
    }

    var nextEntities = [];
    for (var index = 0; index < state.entities.length; index += 1) {
      var entity = state.entities[index];
      var travel = (elapsed - entity.spawnAt) / Math.max(1, entity.hitAt - entity.spawnAt);
      entity.y = roadYFromProgress(travel);

      if (entity.type === "fan") {
        var fanX = laneXAtDepth(entity.lane, roadDepthFromY(entity.y));
        var magnetDistance = Math.hypot(fanX - state.busX, entity.y - PLAYER_Y);
        if (!entity.handled && elapsed < state.magnetUntil && magnetDistance <= MAGNET_RADIUS) {
          collectFan(entity, "PERFECT", "MAGNET PERFECT");
          continue;
        }
        if (!entity.handled && elapsed > entity.hitAt + MISS_WINDOW) {
          entity.handled = true;
          state.combo = 0;
          showJudgement("MISS", "节拍漏击 · COMBO BREAK");
          addFloat(fanX, PLAYER_Y - 54, "MISS", "#ff526f");
        }
        if (!entity.handled && elapsed <= entity.hitAt + 650) nextEntities.push(entity);
        continue;
      }

      var colliding = !entity.handled && entity.lane === state.lane && entity.y > PLAYER_Y - 36 && entity.y < PLAYER_Y + 40;
      if (!colliding) {
        if (!entity.handled && elapsed <= entity.hitAt + 650) nextEntities.push(entity);
        continue;
      }
      entity.handled = true;
      if (entity.type === "lucky") {
        state.entities = nextEntities.concat(state.entities.slice(index + 1));
        enterLucky();
        drawGame(elapsed);
        return;
      }
      if (entity.type === "magnet") {
        state.magnetUntil = elapsed + POWERUP_DURATION;
        addBurst(state.busX, PLAYER_Y, "#72f1ff", 28);
        addFloat(state.busX, PLAYER_Y - 68, "磁铁 5 秒", "#72f1ff");
        showToast("获得磁铁！附近知识自动 PERFECT", "cyan");
        vibrate([24, 15, 32]);
        continue;
      }
      if (entity.type === "invincible") {
        state.invincibleUntil = elapsed + POWERUP_DURATION;
        addBurst(state.busX, PLAYER_Y, "#ffe66d", 32);
        addFloat(state.busX, PLAYER_Y - 68, "无敌 5 秒", "#ffe66d");
        showToast("元气闪电！5 秒内无视障碍", "gold");
        vibrate([30, 16, 45]);
        continue;
      }
      applyObstacle(entity, now, elapsed);
    }
    state.entities = nextEntities;

    if (updatePedestrian(elapsed)) return;
    updateParticles(delta);
    updateHud(false);
    drawGame(elapsed);

    if (elapsed >= times[totalBeats]) {
      finishGame();
      return;
    }
    animationFrame = window.requestAnimationFrame(gameLoop);
  }

  function updateBeatBars(beat) {
    var bars = elements["beat-bars"].querySelectorAll("i");
    for (var index = 0; index < bars.length; index += 1) {
      bars[index].classList.toggle("is-active", beat % 4 === index);
    }
  }

  function drawContained(context, image, x, y, width, height) {
    if (!image || !image.complete || !image.naturalWidth) return false;
    var scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
    var drawWidth = image.naturalWidth * scale;
    var drawHeight = image.naturalHeight * scale;
    context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
    return true;
  }

  function drawIdleScene() {
    if (!elements["game-canvas"]) return;
    drawGame(0);
  }

  function drawGame(elapsed) {
    var canvas = elements["game-canvas"];
    var context = canvas.getContext("2d");
    context.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    context.fillStyle = "#45c8ed";
    context.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    if (images.road && images.road.complete && images.road.naturalWidth) {
      context.drawImage(images.road, 0, 0, GAME_WIDTH, GAME_HEIGHT);
    } else {
      context.fillStyle = "#7187b2";
      context.beginPath();
      context.moveTo(ROAD_VANISH_X - 65, ROAD_HORIZON_Y);
      context.lineTo(ROAD_VANISH_X + 65, ROAD_HORIZON_Y);
      context.lineTo(GAME_WIDTH, GAME_HEIGHT);
      context.lineTo(0, GAME_HEIGHT);
      context.closePath();
      context.fill();
    }

    context.save();
    context.strokeStyle = "rgba(255,255,255,.48)";
    context.lineWidth = 3;
    context.setLineDash([14, 16]);
    for (var boundary = 1; boundary < 5; boundary += 1) {
      context.beginPath();
      context.moveTo(ROAD_VANISH_X, ROAD_HORIZON_Y);
      context.lineTo(ROAD_LEFT + boundary * LANE_WIDTH, GAME_HEIGHT);
      context.stroke();
    }
    context.setLineDash([]);
    context.restore();

    if (state.pedestrian) {
      var crossDepth = Math.max(.35, roadDepthFromY(state.pedestrian.y));
      context.save();
      context.globalAlpha = .82;
      for (var stripe = 0; stripe < 8; stripe += 1) {
        var stripeY = PLAYER_Y - 58 + stripe * 15;
        var depth = roadDepthFromY(stripeY);
        var left = boundaryXAtDepth(0, depth);
        var right = boundaryXAtDepth(5, depth);
        context.fillStyle = stripe % 2 ? "rgba(255,255,255,.25)" : "rgba(255,255,255,.78)";
        context.fillRect(left, stripeY, right - left, 7 + crossDepth * 2);
      }
      context.restore();
    }

    state.entities.forEach(function (entity) {
      if (entity.handled || entity.y < ROAD_HORIZON_Y - 20) return;
      var depth = roadDepthFromY(entity.y);
      var x = laneXAtDepth(entity.lane, depth);
      var size = 30 + Math.min(1.2, Math.max(0, depth)) * 50;
      var assetKey = entity.type === "obstacle" ? entity.obstacle : entity.type;
      if (entity.type === "fan") {
        var timing = Math.abs(entity.hitAt - elapsed);
        var ring = size * (1.18 + Math.min(1, timing / 700));
        context.strokeStyle = timing <= GREAT_WINDOW ? "#ffe66d" : "rgba(255,255,255,.55)";
        context.lineWidth = timing <= PERFECT_WINDOW ? 6 : 3;
        context.beginPath();
        context.arc(x, entity.y, ring / 2, 0, Math.PI * 2);
        context.stroke();
      }
      if (!drawContained(context, images[assetKey], x - size / 2, entity.y - size / 2, size, size)) {
        context.fillStyle = entity.type === "fan" ? "#ffe66d" : "#ff526f";
        context.beginPath();
        context.arc(x, entity.y, size / 3, 0, Math.PI * 2);
        context.fill();
      }
    });

    if (state.pedestrian) {
      drawContained(context, images.pedestrian, state.pedestrian.x - 40, state.pedestrian.y - 70, 80, 80);
      if (elapsed < state.pedestrian.hitAt) {
        context.fillStyle = "rgba(9,8,35,.9)";
        context.fillRect(74, 345, 332, 42);
        context.strokeStyle = "#ffe66d";
        context.strokeRect(74, 345, 332, 42);
        context.fillStyle = "#ffe66d";
        context.font = '900 18px "PingFang SC", sans-serif';
        context.textAlign = "center";
        context.fillText("前方斑马线 · 礼让行人", GAME_WIDTH / 2, 373);
      }
    }

    if (state.magnetUntil > elapsed) {
      context.strokeStyle = "rgba(114,241,255,.75)";
      context.lineWidth = 5;
      context.beginPath();
      context.arc(state.busX, PLAYER_Y, 95 + Math.sin(elapsed / 120) * 12, 0, Math.PI * 2);
      context.stroke();
    }
    if (state.invincibleUntil > elapsed || state.shield) {
      context.strokeStyle = state.invincibleUntil > elapsed ? "#ffe66d" : "#72f1ff";
      context.lineWidth = 7;
      context.beginPath();
      context.arc(state.busX, PLAYER_Y - 8, 54, 0, Math.PI * 2);
      context.stroke();
    }

    var vehicle = currentVehicle();
    var vehicleImage = images[vehicle.asset];
    if (!drawContained(context, vehicleImage, state.busX - 58, PLAYER_Y - 82, 116, 116)) {
      context.fillStyle = "#f47ead";
      context.fillRect(state.busX - 34, PLAYER_Y - 58, 68, 80);
    }

    state.particles.forEach(function (particle) {
      context.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      context.fillStyle = particle.color;
      context.fillRect(particle.x, particle.y, particle.size, particle.size);
    });
    state.floatTexts.forEach(function (item) {
      context.globalAlpha = Math.max(0, item.life / item.maxLife);
      context.fillStyle = item.color;
      context.font = '900 19px "PingFang SC", sans-serif';
      context.textAlign = "center";
      context.fillText(item.text, item.x, item.y);
    });
    context.globalAlpha = 1;
  }

  function move(direction, source) {
    if (state.status !== "playing") return;
    var nextLane = clampLane(state.lane + direction);
    if (nextLane === state.lane) return;
    state.lane = nextLane;
    if (state.tutorialActive) {
      state.tutorialMoved = true;
      updateTutorialUi();
    }
    vibrate(12);
    report("click", "move", { direction: direction < 0 ? "left" : "right", source: source || "button" });
  }

  function hitNote(source) {
    if (state.status !== "playing") return;
    var now = performance.now();
    if (now - state.lastInputAt < HIT_GUARD) return;
    state.lastInputAt = now;
    if (state.tutorialActive) {
      state.tutorialHit = true;
      updateTutorialUi();
      showJudgement("GOOD", "校准成功 · 正式成绩不受影响");
      return;
    }
    var elapsed = currentElapsed();
    var candidates = state.entities.filter(function (entity) {
      return entity.type === "fan" && !entity.handled && entity.lane === state.lane && Math.abs(elapsed - entity.hitAt) <= MISS_WINDOW;
    }).sort(function (a, b) {
      return Math.abs(elapsed - a.hitAt) - Math.abs(elapsed - b.hitAt);
    });
    if (!candidates.length) {
      state.combo = 0;
      showJudgement("MISS", "空拍 · COMBO BREAK");
      report("click", "hit", { quality: "miss", source: source || "button" });
      return;
    }
    var candidate = candidates[0];
    var timing = Math.abs(elapsed - candidate.hitAt);
    var quality = timing <= PERFECT_WINDOW ? "PERFECT" : timing <= GREAT_WINDOW ? "GREAT" : "GOOD";
    collectFan(candidate, quality, Math.round(elapsed - candidate.hitAt) + "ms");
    state.entities = state.entities.filter(function (entity) { return entity !== candidate; });
    report("click", "hit", { quality: quality.toLowerCase(), timing_ms: Math.round(elapsed - candidate.hitAt), source: source || "button" });
  }

  function ensureVipPlaybackAccess() {
    if (!Activity.user) return Promise.resolve(null);
    var loginPromise;
    if (Activity.user.isLogin()) {
      loginPromise = Promise.resolve();
    } else {
      loginPromise = Activity.user.requireLogin({ noConfirm: false, forceLogin: true })
        .catch(function (error) {
          error.code = "LOGIN_REQUIRED";
          throw error;
        });
    }
    return loginPromise.then(function () {
      return Activity.user.queryProfile()
        .then(function (profile) {
          if (!profile.isVip && !profile.isSuperVip) {
            var error = new Error("该主题曲需要 QQ 音乐 VIP 播放权限，请使用已开通会员的账号重试。");
            error.code = "VIP_REQUIRED";
            throw error;
          }
          return profile;
        })
        .catch(function (error) {
          if (error && error.code === "VIP_REQUIRED") throw error;
          console.warn("会员状态查询失败，将交由 QMPlayer 校验实际播放权限", error);
          showToast("会员状态暂不可确认 · 正在验证实际播放权限", "gold");
          return null;
        });
    });
  }

  function playAndConfirm(songToPlay) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = 0;
      function cleanup() {
        window.clearTimeout(timer);
        Activity.music.off("play", handlePlay);
        Activity.music.off("error", handleError);
      }
      function complete(callback, value) {
        if (settled) return;
        settled = true;
        cleanup();
        callback(value);
      }
      function handlePlay(event) { complete(resolve, event || { type: "play" }); }
      function handleError(event) {
        var detail = event && (event.message || event.error || event.code);
        complete(reject, new Error("QMPlayer 播放失败" + (detail ? "：" + detail : "")));
      }
      Activity.music.on("play", handlePlay);
      Activity.music.on("error", handleError);
      timer = window.setTimeout(function () {
        complete(reject, new Error("QMPlayer 未在规定时间内确认播放，可能是账号无会员版权或客户端播放受限。"));
      }, PLAYBACK_CONFIRM_TIMEOUT_MS);
      Activity.music.play(songToPlay, 0).catch(function (error) {
        complete(reject, error);
      });
    });
  }

  function startGame() {
    if (!chart || !assetsReady) {
      prepareResources();
      return;
    }
    if (!state.debugSilent && (state.status === "playing" || state.status === "paused" || state.status === "lucky")) {
      Activity.music.pause().catch(function () {});
    }
    safeStorageSet("fan-bus-player-name", elements["player-name"].value.trim() || "新同学");
    setStartLoading(true, false);
    elements["start-label"].textContent = "检查会员与播放权限…";
    elements["music-ready-state"].textContent = "VERIFYING";
    song = Activity.music.getConfigured("songs")[0] || { id: SONG_ID };
    ensureVipPlaybackAccess()
      .then(function () { return playAndConfirm(song); })
      .then(function () {
        state.soundOn = true;
        setMusicUi();
        resetGameState();
        state.debugSilent = false;
        showView("game");
        elements.app.classList.remove("is-rules-page");
        elements["rules-modal"].classList.add("is-hidden");
        elements["game-status-label"].textContent = "游戏BGM《恭喜你发现了宝藏》——TF家族";
        setStartLoading(false, false);
        report("click", "gameStart", { content_id: String(SONG_ID), content_type: "song" });
        window.cancelAnimationFrame(animationFrame);
        state.lastFrameAt = performance.now();
        animationFrame = window.requestAnimationFrame(gameLoop);
      })
      .catch(function (error) {
        console.error(error);
        if (isLocalDebug()) {
          resetGameState();
          state.debugSilent = true;
          state.soundOn = false;
          setMusicUi();
          showView("game");
          elements.app.classList.remove("is-rules-page");
          elements["rules-modal"].classList.add("is-hidden");
          elements["game-status-label"].textContent = "LOCAL DEBUG · 无声谱面模拟（线上强制 QMPlayer）";
          setStartLoading(false, false);
          showToast("本地 CDN 不可用 · 已进入无声交互模拟", "gold");
          window.cancelAnimationFrame(animationFrame);
          state.lastFrameAt = performance.now();
          animationFrame = window.requestAnimationFrame(gameLoop);
          return;
        }
        var message = error && error.message ? error.message : "QMPlayer unavailable";
        setStartLoading(false, true, message);
        window.alert("QQ音乐在线主题曲暂时无法播放。活动不会使用本地 MP3 绕过会员或版权限制，请确认登录账号具备播放权限后重试。\n\n" + message);
      });
  }

  function pauseGame(source) {
    if (state.status !== "playing") return;
    stopClock();
    setGameStatus("paused");
    window.cancelAnimationFrame(animationFrame);
    elements["pause-overlay"].classList.remove("is-hidden");
    elements["game-status-label"].textContent = source === "sound" ? "声音关闭 · 节拍同步暂停" : "游戏已暂停";
    if (!state.debugSilent) {
      Activity.music.pause().catch(function (error) {
        showToast(error.message || "主题曲暂停失败", "danger");
      });
    }
    report("click", "gamePause", { source: source || "button", elapsed_ms: Math.round(state.elapsedBase) });
  }

  function resumeGame() {
    if (state.status !== "paused") return;
    elements["resume-button"].disabled = true;
    var resumePromise = state.debugSilent ? Promise.resolve() : Activity.music.resume();
    resumePromise
      .then(function () {
        setGameStatus("playing");
        state.soundOn = !state.debugSilent;
        setMusicUi();
        startClock();
        state.lastFrameAt = performance.now();
        elements["pause-overlay"].classList.add("is-hidden");
        elements["resume-button"].disabled = false;
        elements["game-status-label"].textContent = state.debugSilent
          ? "LOCAL DEBUG · 无声谱面模拟（线上强制 QMPlayer）"
          : "游戏BGM《恭喜你发现了宝藏》——TF家族";
        report("click", "gameResume", { elapsed_ms: Math.round(state.elapsedBase) });
        animationFrame = window.requestAnimationFrame(gameLoop);
      })
      .catch(function (error) {
        elements["resume-button"].disabled = false;
        showToast(error.message || "主题曲继续失败", "danger");
      });
  }

  function toggleSound(source) {
    state.soundOn = !state.soundOn;
    setMusicUi();
    report("click", "soundToggle", { enabled: state.soundOn ? 1 : 0, source: source });
    if (source === "home") return;
    if (!state.soundOn && state.status === "playing") {
      pauseGame("sound");
    } else if (state.soundOn && state.status === "paused") {
      resumeGame();
    }
  }

  function restartGame(source) {
    report("click", "gameRestart", { source: source });
    hideAllOverlays();
    startGame();
  }

  function returnHome() {
    window.cancelAnimationFrame(animationFrame);
    if (state.status === "playing") stopClock();
    setGameStatus("ready");
    if (!state.debugSilent) Activity.music.pause().catch(function () {});
    hideAllOverlays();
    elements.tutorial.classList.add("is-hidden");
    showView("home");
    updateHomeRecords();
    drawIdleScene();
  }

  function openLuckyBag() {
    if (state.status !== "lucky") return;
    var before = state.fans;
    var doubled = Math.random() >= .5;
    state.fans = doubled ? before * 2 : Math.floor(before / 2);
    if (!doubled) state.combo = 0;
    elements["lucky-title"].textContent = doubled ? "好运翻倍！" : "锦囊反转…";
    elements["lucky-copy"].textContent = doubled ? "知识数量成功翻倍" : "知识数量减少一半，连击已中断";
    elements["lucky-before"].textContent = before;
    elements["lucky-after"].textContent = state.fans;
    elements["lucky-risk"].classList.add("is-hidden");
    elements["lucky-result"].classList.remove("is-hidden");
    elements["open-lucky"].textContent = "确认并继续";
    elements["open-lucky"].onclick = continueLuckyGame;
    elements["skip-lucky"].classList.add("is-hidden");
    report("click", "luckyOpen", { outcome: doubled ? "double" : "half", before: before, after: state.fans });
    vibrate(doubled ? [25, 20, 45] : [70, 30, 90]);
    updateHud(true);
  }

  function continueLuckyGame() {
    if (state.status !== "lucky") return;
    elements["open-lucky"].onclick = openLuckyBag;
    var luckyResumePromise = state.debugSilent ? Promise.resolve() : Activity.music.resume();
    luckyResumePromise
      .then(function () {
        setGameStatus("playing");
        startClock();
        state.lastFrameAt = performance.now();
        elements["lucky-overlay"].classList.add("is-hidden");
        animationFrame = window.requestAnimationFrame(gameLoop);
      })
      .catch(function (error) {
        showToast(error.message || "主题曲继续失败", "danger");
      });
  }

  function getOutcome() {
    var score = state.fans * state.maxCombo;
    for (var index = 0; index < OUTCOMES.length; index += 1) {
      if (score >= OUTCOMES[index].min) return OUTCOMES[index];
    }
    return OUTCOMES[OUTCOMES.length - 1];
  }

  function finishGame() {
    if (state.status !== "playing") return;
    stopClock();
    setGameStatus("finished");
    window.cancelAnimationFrame(animationFrame);
    if (!state.debugSilent) Activity.music.pause().catch(function () {});
    state.progress = 100;
    elements["journey-progress"].style.width = "100%";
    var tier = getOutcome();
    state.shareTier = tier;
    var earnedCoins = tier.coins + state.maxCombo * 3;
    var previousCoins = Number(safeStorageGet("fan-bus-coins", "0")) || 0;
    var previousBest = Number(safeStorageGet("fan-bus-best", "0")) || 0;
    safeStorageSet("fan-bus-coins", previousCoins + earnedCoins);
    safeStorageSet("fan-bus-best", Math.max(previousBest, state.fans));
    elements["result-icon"].src = tier.icon;
    elements["result-title"].textContent = tier.name;
    elements["result-place"].textContent = "《恭喜你发现了宝藏》 · " + tier.place;
    elements["result-fans"].textContent = state.fans;
    elements["result-combo"].textContent = state.maxCombo;
    elements["result-coins"].textContent = earnedCoins;
    elements["result-score"].textContent = state.fans * state.maxCombo;
    elements["result-overlay"].classList.remove("is-hidden");
    report("exposure", "gameFinish", { fans: state.fans, max_combo: state.maxCombo, score: state.fans * state.maxCombo, tier: tier.name });
  }

  function failGame() {
    if (state.status !== "playing") return;
    stopClock();
    setGameStatus("failed");
    window.cancelAnimationFrame(animationFrame);
    if (!state.debugSilent) Activity.music.pause().catch(function () {});
    var total = chart.timing.beatTimesMs[chart.timing.beatTimesMs.length - 1];
    state.progress = Math.min(100, state.elapsedBase / total * 100);
    elements["fail-fans"].textContent = state.fans;
    elements["fail-detail"].textContent = "最高连击 ×" + state.maxCombo + " · 进度 " + Math.round(state.progress) + "% · 活力币 +0";
    elements["fail-overlay"].classList.remove("is-hidden");
    vibrate([110, 55, 150]);
    report("exposure", "gameFail", { reason: "pedestrian_collision", fans: state.fans, max_combo: state.maxCombo, progress: Math.round(state.progress) });
  }

  function buildPoster() {
    var playerName = elements["player-name"].value.trim() || "新同学";
    var tier = state.shareTier;
    var score = state.fans * state.maxCombo;
    return {
      background: "#45c8ed",
      layers: [
        { type: "rect", x: 30, y: 30, width: 690, height: 1140, color: "#fff5e8", stroke: "#17223a", lineWidth: 8, radius: 18 },
        { type: "rect", x: 30, y: 30, width: 690, height: 18, color: "#f47ead" },
        { type: "text", text: "CAMPUS RESULT / OPENING SEASON", x: 70, y: 105, fontSize: 24, fontWeight: "700", fontFamily: "PingFang SC, sans-serif", color: "#17223a" },
        { type: "text", text: "开学冲冲冲！", x: 70, y: 190, fontSize: 58, fontWeight: "900", fontFamily: "PingFang SC, sans-serif", color: "#17223a" },
        { type: "image", src: tier.icon, x: 185, y: 225, width: 380, height: 380, fit: "contain" },
        { type: "text", text: playerName + " 解锁新学期人设", x: 375, y: 655, align: "center", maxWidth: 620, fontSize: 27, fontWeight: "700", fontFamily: "PingFang SC, sans-serif", color: "#52617a" },
        { type: "text", text: tier.name, x: 375, y: 730, align: "center", maxWidth: 620, fontSize: 62, fontWeight: "900", fontFamily: "PingFang SC, sans-serif", color: "#17223a" },
        { type: "rect", x: 70, y: 780, width: 610, height: 165, color: "#ffffff", stroke: "#7187b2", lineWidth: 4, radius: 16 },
        { type: "text", text: "KNOWLEDGE SCORE", x: 100, y: 830, fontSize: 23, fontWeight: "700", fontFamily: "PingFang SC, sans-serif", color: "#e7518f" },
        { type: "text", text: String(score), x: 100, y: 920, maxWidth: 540, fontSize: 76, fontWeight: "900", fontFamily: "PingFang SC, sans-serif", color: "#17223a" },
        { type: "text", text: "知识 " + state.fans + "  /  最高连击 ×" + state.maxCombo, x: 375, y: 1018, align: "center", maxWidth: 620, fontSize: 32, fontWeight: "800", fontFamily: "PingFang SC, sans-serif", color: "#17223a" },
        { type: "text", text: "BGM《恭喜你发现了宝藏》· TF家族", x: 375, y: 1080, align: "center", maxWidth: 620, fontSize: 23, fontWeight: "700", fontFamily: "PingFang SC, sans-serif", color: "#52617a" },
        { type: "text", text: "这次开学，我的隐藏人设被发现了", x: 375, y: 1130, align: "center", maxWidth: 620, fontSize: 22, fontWeight: "700", fontFamily: "PingFang SC, sans-serif", color: "#52617a" }
      ]
    };
  }

  function openSharePreview() {
    elements["share-button"].disabled = true;
    report("click", "shareOpen", { tier: state.shareTier.name, score: state.fans * state.maxCombo });
    Activity.share.drawCanvas(buildPoster())
      .then(function (base64) {
        lastShareBase64 = base64;
        elements["share-preview-image"].src = base64;
        elements["share-preview"].classList.remove("is-hidden");
        elements["share-button"].disabled = false;
      })
      .catch(function (error) {
        elements["share-button"].disabled = false;
        showToast(error.message || "成绩卡生成失败", "danger");
      });
  }

  function invokeImageShare() {
    if (!lastShareBase64) return;
    elements["invoke-image-share"].disabled = true;
    Activity.share.callImage(lastShareBase64, {
      title: "开学冲冲冲！校园成绩",
      previewMode: 1,
      shareform: "campus_rush.result"
    }).then(function () {
      elements["invoke-image-share"].disabled = false;
      showToast("QQ音乐分享面板已打开", "cyan");
    }).catch(function (error) {
      elements["invoke-image-share"].disabled = false;
      showToast(error.message || "分享面板打开失败", "danger");
    });
  }

  function setupMusicEvents() {
    try {
      Activity.music.on("play", function (event) {
        var current = event && event.song ? event.song : song || {};
        report("play", "songPlayback", {
          action_type: "0",
          content_id: String(current.id || current.songid || SONG_ID),
          content_type: "song"
        });
      });
      Activity.music.on("pause", function () {
        report("play", "songPause", { action_type: "1", content_id: String(SONG_ID), content_type: "song" });
      });
      Activity.music.on("ended", function () {
        if (state.status === "playing") finishGame();
      });
      Activity.music.on("error", function (event) {
        console.error("QMPlayer error", event);
        if (state.status === "playing") pauseGame("player_error");
        showToast("在线主题曲播放异常，请重试", "danger");
      });
    } catch (error) {
      console.warn("QMPlayer event binding deferred", error);
    }
  }

  function setupSharing() {
    try {
      Activity["share"].init({}, function (result) {
        console.log("Share initialized", result);
      });
      Activity.share.on(function (result) {
        var target = result && result.data ? result.data.target : "unknown";
        report("share", "share", { share_type: String(target), score: state.fans * state.maxCombo, tier: state.shareTier.name });
      });
    } catch (error) {
      console.warn("Share initialization unavailable", error);
    }
  }

  function stopJoystick() {
    if (joystickFrame) window.cancelAnimationFrame(joystickFrame);
    joystickFrame = 0;
    joystickPointer = null;
    joystickDirection = 0;
    joystickNextMoveAt = 0;
    if (elements["joystick-knob"]) elements["joystick-knob"].style.transform = "translateX(0)";
    if (elements["joystick-control"]) elements["joystick-control"].setAttribute("aria-valuenow", "0");
  }

  function steerContinuously(direction) {
    if (direction === joystickDirection || state.status !== "playing") return;
    if (joystickFrame) window.cancelAnimationFrame(joystickFrame);
    joystickFrame = 0;
    joystickDirection = direction;
    if (!direction) return;
    move(direction, "joystick");
    joystickNextMoveAt = performance.now() + JOYSTICK_FIRST_REPEAT_MS;
    function continueSteering(now) {
      if (joystickPointer === null || joystickDirection !== direction || state.status !== "playing") {
        joystickFrame = 0;
        return;
      }
      if (now >= joystickNextMoveAt) {
        move(direction, "joystick");
        joystickNextMoveAt = now + JOYSTICK_REPEAT_MS;
      }
      joystickFrame = window.requestAnimationFrame(continueSteering);
    }
    joystickFrame = window.requestAnimationFrame(continueSteering);
  }

  function updateJoystick(clientX) {
    var rect = elements["joystick-control"].getBoundingClientRect();
    var rawOffset = clientX - (rect.left + rect.width / 2);
    var maxTravel = Math.max(24, (rect.width - 64) / 2 - 7);
    var deadZone = Math.max(12, maxTravel * 0.24);
    var offset = Math.max(-maxTravel, Math.min(maxTravel, rawOffset));
    var direction = offset < -deadZone ? -1 : offset > deadZone ? 1 : 0;
    elements["joystick-knob"].style.transform = "translateX(" + offset + "px)";
    elements["joystick-control"].setAttribute("aria-valuenow", String(direction));
    steerContinuously(direction);
  }

  function bindEvents() {
    elements["start-button"].addEventListener("click", startGame);
    elements["rules-start"].addEventListener("click", startGame);
    elements["rules-button"].addEventListener("click", function () {
      showView("game");
      elements.app.classList.add("is-rules-page");
      elements["rules-modal"].classList.remove("is-hidden");
      elements["game-status-label"].textContent = "查看玩法";
      report("click", "rulesOpen", {});
    });
    elements["home-sound"].addEventListener("click", function () { toggleSound("home"); });
    elements["game-sound"].addEventListener("click", function () { toggleSound("game"); });
    elements["pause-button"].addEventListener("click", function () {
      if (state.status === "paused") resumeGame();
      else pauseGame("button");
    });
    elements["resume-button"].addEventListener("click", resumeGame);
    elements["restart-from-pause"].addEventListener("click", function () { restartGame("pause_overlay"); });
    elements["home-from-pause"].addEventListener("click", returnHome);
    elements["joystick-control"].addEventListener("pointerdown", function (event) {
      if (state.status !== "playing") return;
      event.preventDefault();
      joystickPointer = event.pointerId;
      elements["joystick-control"].focus({ preventScroll: true });
      elements["joystick-control"].setPointerCapture(event.pointerId);
      updateJoystick(event.clientX);
    });
    elements["joystick-control"].addEventListener("pointermove", function (event) {
      if (joystickPointer !== event.pointerId) return;
      event.preventDefault();
      var samples = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];
      var latest = samples.length ? samples[samples.length - 1] : event;
      updateJoystick(latest.clientX);
    });
    elements["joystick-control"].addEventListener("pointerup", function (event) {
      if (joystickPointer !== event.pointerId) return;
      event.preventDefault();
      stopJoystick();
    });
    elements["joystick-control"].addEventListener("pointercancel", stopJoystick);
    elements["joystick-control"].addEventListener("lostpointercapture", stopJoystick);
    elements["hit-button"].addEventListener("pointerdown", function (event) { event.preventDefault(); hitNote("button"); });
    elements["skip-tutorial"].addEventListener("click", endTutorial);
    elements["open-lucky"].addEventListener("click", openLuckyBag);
    elements["skip-lucky"].addEventListener("click", continueLuckyGame);
    elements["replay-button"].addEventListener("click", function () { restartGame("result"); });
    elements["retry-button"].addEventListener("click", function () { restartGame("failure"); });
    elements["home-from-result"].addEventListener("click", returnHome);
    elements["home-from-fail"].addEventListener("click", returnHome);
    elements["share-button"].addEventListener("click", openSharePreview);
    elements["close-share-preview"].addEventListener("click", function () { elements["share-preview"].classList.add("is-hidden"); });
    elements["invoke-image-share"].addEventListener("click", invokeImageShare);
    elements["player-name"].addEventListener("change", function () {
      safeStorageSet("fan-bus-player-name", elements["player-name"].value.trim() || "新同学");
    });

    elements["game-screen"].addEventListener("pointerdown", function (event) {
      if (state.status !== "playing") return;
      swipeStart = { id: event.pointerId, x: event.clientX };
      elements["game-screen"].setPointerCapture(event.pointerId);
    });
    elements["game-screen"].addEventListener("pointerup", function (event) {
      if (!swipeStart || swipeStart.id !== event.pointerId) return;
      var distance = event.clientX - swipeStart.x;
      swipeStart = null;
      if (Math.abs(distance) >= 32) move(distance < 0 ? -1 : 1, "swipe");
    });
    elements["game-screen"].addEventListener("pointercancel", function () { swipeStart = null; });

    window.addEventListener("keydown", function (event) {
      if (["INPUT", "TEXTAREA"].indexOf(document.activeElement.tagName) >= 0) return;
      var key = event.key.toLowerCase();
      if (key === "arrowleft" || key === "a") { event.preventDefault(); move(-1, "keyboard"); }
      if (key === "arrowright" || key === "d") { event.preventDefault(); move(1, "keyboard"); }
      if (key === " ") { event.preventDefault(); hitNote("keyboard"); }
      if (key === "p" || key === "escape") {
        event.preventDefault();
        if (state.status === "playing") pauseGame("keyboard");
        else if (state.status === "paused") resumeGame();
      }
      if (key === "m") { event.preventDefault(); toggleSound("keyboard"); }
    });

    document.addEventListener("visibilitychange", function () {
      if (document.hidden && state.status === "playing") pauseGame("visibility");
    });
  }

  function initialize() {
    bindElements();
    updateHomeRecords();
    setMusicUi();
    bindEvents();
    setupMusicEvents();
    setupSharing();
    try {
      Activity.report.page();
      report("exposure", "homeExposure", { content_id: String(SONG_ID), content_type: "song" });
    } catch (error) {
      console.warn("Page report unavailable", error);
    }
    prepareResources();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }
})();
