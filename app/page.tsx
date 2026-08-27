"use client";

/* ImageGen assets need fluid CSS sizing inside the canvas-adjacent game UI. */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import treasureChart from "./data/congratulations-treasure.chart.json";

const GAME_WIDTH = 480;
const GAME_HEIGHT = 720;
const ROAD_SAFE_INSET = 8;
const ROAD_LEFT = ROAD_SAFE_INSET;
const ROAD_WIDTH = GAME_WIDTH - ROAD_SAFE_INSET * 2;
const LANE_WIDTH = ROAD_WIDTH / 5;
const ROAD_HORIZON_Y = 302;
const ROAD_VANISH_X = GAME_WIDTH / 2;
const PLAYER_Y = 584;
const ROAD_BOTTOM_DEPTH =
  (GAME_HEIGHT - ROAD_HORIZON_Y) / (PLAYER_Y - ROAD_HORIZON_Y);
const ENTITY_RENDER_SIZE = 68;
const STARTING_FANS = 0;
const TRAVEL_BEATS = 4;
const PERFECT_WINDOW = 65;
const GREAT_WINDOW = 155;
const MISS_WINDOW = 240;
const ENTITY_DESPAWN_AFTER_MS = 650;
const PEDESTRIAN_WARNING_BEATS = 8;
const PEDESTRIAN_EVENT_BEATS = 16;
const PEDESTRIAN_ITEM_CLEARANCE_BEATS = 4;
const PEDESTRIAN_DANGER_WINDOW_MS = 500;
const PEDESTRIAN_COLLISION_RADIUS = 56;
const CROSSWALK_BAR_COUNT = 10;
const CROSSWALK_SIDE_PADDING = 0.035;
const CROSSWALK_BAR_GAP = 0.028;
const HIT_INPUT_GUARD_MS = 70;
const POWERUP_DURATION_MS = 5_000;
const MAGNET_RADIUS = 185;
const MAGNET_SPAWN_ORDINALS = [36, 64] as const;
const SECOND_MAGNET_CHANCE = 0.25;
const VEHICLE_VISUAL_SCALE = 1.2;
const VEHICLE_EFFECT_CENTER_Y = -46 * VEHICLE_VISUAL_SCALE;
const MIN_OBSTACLE_BEAT_GAP = 3;
const JOYSTICK_FIRST_REPEAT_MS = 120;
const JOYSTICK_REPEAT_MS = 105;
const STADIUM_SCORE_THRESHOLD = 6_500;
const OBSTACLE_COLLISION_BEFORE = 36;
const OBSTACLE_COLLISION_AFTER = 40;
const TUTORIAL_TIMEOUT_MS = 9_000;
const TUTORIAL_OBSTACLE_SPAWN_BEAT = 1;
const TUTORIAL_OBSTACLE_TARGET_BEAT = 6;
const TUTORIAL_STAR_SPAWN_BEAT = 6;
const TUTORIAL_STAR_TARGET_BEAT = 10;
const TUTORIAL_COMPLETE_HOLD_MS = 620;
const SWIPE_MOVE_THRESHOLD_PX = 32;

function triggerHaptic(pattern: number | number[]) {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.vibrate !== "function"
  ) {
    return false;
  }

  try {
    navigator.vibrate(0);
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

function halfBeatDelayMs(beatTimesMs: number[], targetBeat: number) {
  const hitAt = beatTimesMs[targetBeat];
  const nextHitAt = beatTimesMs[targetBeat + 1];
  if (!Number.isFinite(hitAt) || !Number.isFinite(nextHitAt)) return 0;
  return Math.max(0, (nextHitAt - hitAt) / 2);
}

type GameStatus =
  "ready" | "playing" | "paused" | "lucky" | "finished" | "failed";
type TutorialPhase = "move" | "hit" | "complete";
type EntityType = "fan" | "obstacle" | "lucky" | "magnet" | "invincible";
type ObstacleType = "cone" | "pothole" | "barrier";
type ToastTone = "cyan" | "pink" | "gold" | "danger";
type ToneMode = "normal" | "thick" | "thin";
type ReadyPage = "home" | "rules";

type VehicleLevel = {
  level: number;
  name: string;
  primary: string;
  secondary: string;
  task: string;
  requirement?: {
    hits: number;
    perfect?: number;
    maxCombo?: number;
  };
};

type Entity = {
  id: number;
  type: EntityType;
  lane: number;
  y: number;
  targetBeat: number;
  spawnAt: number;
  hitAt: number;
  obstacle?: ObstacleType;
  tutorial?: boolean;
  handled: boolean;
};

type Pedestrian = {
  startAt: number;
  hitAt: number;
  endAt: number;
  direction: 1 | -1;
  crossingProgress: number;
  x: number;
  y: number;
};

type NoteJudgement = {
  quality: "PERFECT" | "GREAT" | "GOOD" | "MISS";
  detail: string;
  key: number;
};

type LuckyDialog =
  | { phase: "choice" }
  | {
      phase: "result";
      outcome: "double" | "half";
      before: number;
      after: number;
    };

type FailureSummary = {
  reason: "pedestrian-collision";
  fans: number;
  maxCombo: number;
  progress: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
};

type FloatText = {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
};

type ConcertTier = {
  name: string;
  place: string;
  coins: number;
  color: string;
  iconSrc: string;
};

type ShareCardData = {
  score: number;
  fans: number;
  maxCombo: number;
  venue: string;
  tierIconSrc: string;
};

type Track = {
  id: "congratulations-treasure";
  name: string;
  artist: string;
  english: string;
  description: string;
  tempoLabel: string;
  difficulty: string;
  color: string;
  audioSrc: string;
  mapTheme: "campus-season";
  mapLabel: string;
  totalBeats: number;
  grannyBeats: number[];
  melody: number[];
  lanePattern: number[];
  notePattern: number[];
  intensityPattern: number[];
  bpmAt: (beat: number) => number;
};

const VEHICLE_LEVELS: VehicleLevel[] = [
  {
    level: 1,
    name: "自行车",
    primary: "#23cfb2",
    secondary: "#f5a5c3",
    task: "收集 4 点知识 + PERFECT 1 次",
    requirement: { hits: 4, perfect: 1 },
  },
  {
    level: 2,
    name: "摩托车",
    primary: "#f47ead",
    secondary: "#23cfb2",
    task: "收集 12 点知识 + 最高连击 6",
    requirement: { hits: 12, maxCombo: 6 },
  },
  {
    level: 3,
    name: "小轿车",
    primary: "#45c8ed",
    secondary: "#f5a5c3",
    task: "收集 22 点知识 + PERFECT 7 次 + 最高连击 10",
    requirement: { hits: 22, perfect: 7, maxCombo: 10 },
  },
  {
    level: 4,
    name: "校车大巴",
    primary: "#45c8ed",
    secondary: "#f47ead",
    task: "已达最高等级",
  },
];

function getVehicle(level: number) {
  return VEHICLE_LEVELS[
    Math.max(0, Math.min(VEHICLE_LEVELS.length - 1, level - 1))
  ];
}

function isVehicleTaskComplete(
  vehicle: VehicleLevel,
  hits: number,
  perfect: number,
  maxCombo: number,
) {
  const requirement = vehicle.requirement;
  if (!requirement) return false;
  return (
    hits >= requirement.hits &&
    perfect >= (requirement.perfect ?? 0) &&
    maxCombo >= (requirement.maxCombo ?? 0)
  );
}

function getVehicleTaskProgress(
  vehicle: VehicleLevel,
  hits: number,
  perfect: number,
  maxCombo: number,
) {
  const requirement = vehicle.requirement;
  if (!requirement) return 100;
  const progressParts = [hits / requirement.hits];
  if (requirement.perfect) progressParts.push(perfect / requirement.perfect);
  if (requirement.maxCombo) progressParts.push(maxCombo / requirement.maxCombo);
  return Math.round(Math.min(1, Math.min(...progressParts)) * 100);
}

const PRECOMPUTED_CHART = treasureChart;
const AUDIO_SOURCE_API =
  process.env.NEXT_PUBLIC_TREASURE_AUDIO_API?.trim() ?? "";
const DIRECT_AUDIO_URL =
  process.env.NEXT_PUBLIC_TREASURE_AUDIO_URL?.trim() ?? "";
const GAME_TRACK: Track = {
  id: "congratulations-treasure",
  name: PRECOMPUTED_CHART.audio.title,
  artist: PRECOMPUTED_CHART.audio.artist,
  english: "CONGRATULATIONS, TREASURE FOUND",
  description: "开学季唯一主题曲 · 跟随节奏一路冲进校园",
  tempoLabel: "OPENING SEASON",
  difficulty: "NORMAL",
  color: "#23cfb2",
  audioSrc: PRECOMPUTED_CHART.audio.localSrc,
  mapTheme: "campus-season",
  mapLabel: "开学季校园",
  totalBeats: PRECOMPUTED_CHART.timing.beatTimesMs.length - 1,
  grannyBeats: PRECOMPUTED_CHART.gameplay.grannyBeats.slice(0, 1),
  melody: [261.63, 329.63, 392, 329.63, 293.66, 261.63, 220, 196],
  lanePattern: PRECOMPUTED_CHART.gameplay.lanePattern,
  notePattern: PRECOMPUTED_CHART.gameplay.notePattern,
  intensityPattern: PRECOMPUTED_CHART.gameplay.intensityPattern,
  bpmAt: () => PRECOMPUTED_CHART.timing.bpm,
};

const MAP_PALETTE = {
  sky: "#45c8ed",
  sidewalk: "#23cfb2",
  building: "#f5a5c3",
  road: "#7187b2",
  edgeLeft: "#23cfb2",
  edgeRight: "#f47ead",
  windowA: "#fff5e8",
  windowB: "#45c8ed",
};

const CAMPUS_ASSETS = {
  road: "/assets/campus-season/campus-road.png",
  bicycle: "/assets/campus-season/vehicle-bicycle.png",
  motorcycle: "/assets/campus-season/vehicle-motorcycle.png",
  car: "/assets/campus-season/vehicle-car.png",
  schoolBus: "/assets/campus-season/vehicle-school-bus.png",
  knowledgeStar: "/assets/campus-season/icons/knowledge-star.png",
  mysterySchoolbag: "/assets/campus-season/icons/mystery-schoolbag.png",
  magnet: "/assets/campus-season/icons/campus-magnet.png",
  lightning: "/assets/campus-season/icons/energy-lightning.png",
  cone: "/assets/campus-season/icons/obstacle-cone.png",
  pothole: "/assets/campus-season/icons/obstacle-pothole.png",
  barrier: "/assets/campus-season/icons/obstacle-barrier.png",
  grandma: "/assets/campus-season/icons/grandma-crossing.png",
} as const;

const UI_ICONS = {
  pencil: "/assets/campus-season/icons/pencil-mark.png",
  play: "/assets/campus-season/icons/play.png",
  pause: "/assets/campus-season/icons/pause.png",
  restart: "/assets/campus-season/icons/restart.png",
  close: "/assets/campus-season/icons/close.png",
  steer: "/assets/campus-season/icons/steer.png",
  crossing: "/assets/campus-season/icons/crossing-warning.png",
  star: "/assets/campus-season/icons/knowledge-star.png",
} as const;

const OUTCOME_ICONS = {
  slacker: "/assets/campus-season/icons/outcome-slacker-fish-crayon.png",
  scholar: "/assets/campus-season/icons/outcome-scholar-cheese.png",
  grinder: "/assets/campus-season/icons/outcome-grind-cat-roll.png",
  hidden: "/assets/campus-season/icons/outcome-hidden-dog-reader.png",
  genius: "/assets/campus-season/icons/outcome-genius-penguin.png",
} as const;

const SHARE_TARGET_URL =
  "https://y.qq.com/viber_pub/campus_gogogo/index.html";
const SHARE_QR_ASSET = "/assets/campus-season/campus-share-qr.svg";

const REQUIRED_IMAGE_URLS = Array.from(
  new Set([
    "/assets/campus-season/campus-hero.png",
    "/assets/ui/play-icon.png",
    "/assets/campus-season/icons/obstacle-books.png",
    "/assets/campus-season/icons/outcome-genius.png",
    "/assets/campus-season/icons/outcome-grind-king.png",
    "/assets/campus-season/icons/outcome-hidden-achiever.png",
    "/assets/campus-season/icons/outcome-scholar.png",
    "/assets/campus-season/icons/outcome-slacker-fish.png",
    SHARE_QR_ASSET,
    ...Object.values(CAMPUS_ASSETS),
    ...Object.values(UI_ICONS),
    ...Object.values(OUTCOME_ICONS),
  ]),
);

type CampusAsset = keyof typeof CAMPUS_ASSETS;

function drawContainedImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.min(
    width / image.naturalWidth,
    height / image.naturalHeight,
  );
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(
    image,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function drawFittedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  initialSize: number,
  minimumSize: number,
) {
  let size = initialSize;
  do {
    context.font = `900 ${size}px "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
    if (context.measureText(text).width <= maxWidth) break;
    size -= 4;
  } while (size > minimumSize);
  context.fillText(text, x, y, maxWidth);
}

function loadBrowserImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load image: ${src}`));
    image.src = src;
  });
}

async function createShareCardBlob(data: ShareCardData) {
  await document.fonts?.ready;
  const [brandIcon, tierIcon, shareQr] = await Promise.all([
    loadBrowserImage(UI_ICONS.star),
    loadBrowserImage(data.tierIconSrc),
    loadBrowserImage(SHARE_QR_ASSET),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1440;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const background = context.createLinearGradient(0, 0, 1080, 1440);
  background.addColorStop(0, "#45c8ed");
  background.addColorStop(0.56, "#d9fff4");
  background.addColorStop(1, "#fff5e8");
  context.fillStyle = background;
  context.fillRect(0, 0, 1080, 1440);

  const glow = context.createRadialGradient(540, 340, 30, 540, 340, 500);
  glow.addColorStop(0, "rgba(244,126,173,0.55)");
  glow.addColorStop(1, "rgba(244,126,173,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, 1080, 900);

  context.fillStyle = "#f47ead";
  context.fillRect(48, 48, 984, 12);
  context.fillStyle = "#23cfb2";
  context.fillRect(48, 1380, 984, 12);
  context.strokeStyle = "#17223a";
  context.lineWidth = 8;
  context.strokeRect(48, 48, 984, 1344);

  context.textAlign = "left";
  context.fillStyle = "#17223a";
  context.font = '800 30px "PingFang SC", "Microsoft YaHei", Arial, sans-serif';
  context.fillText("CAMPUS RESULT / OPENING SEASON", 92, 125);

  context.fillStyle = "#fff5e8";
  context.fillRect(92, 172, 96, 74);
  drawContainedImage(context, brandIcon, 100, 176, 80, 66);

  context.fillStyle = "#17223a";
  context.textAlign = "left";
  drawFittedText(context, "开学冲冲冲！", 218, 232, 760, 66, 42);

  context.fillStyle = "rgba(255,245,232,0.94)";
  context.fillRect(92, 280, 896, 620);
  context.strokeStyle = "#f47ead";
  context.lineWidth = 6;
  context.strokeRect(92, 280, 896, 620);
  drawContainedImage(context, tierIcon, 320, 300, 440, 440);
  context.textAlign = "center";
  context.fillStyle = "#52617a";
  context.font = '800 28px "PingFang SC", "Microsoft YaHei", Arial, sans-serif';
  context.fillText("本次解锁 / CAMPUS PERSONA", 540, 786);
  context.fillStyle = "#17223a";
  drawFittedText(context, data.venue, 540, 856, 760, 76, 48);

  context.textAlign = "left";
  context.fillStyle = "rgba(255,255,255,0.76)";
  context.fillRect(92, 928, 896, 182);
  context.strokeStyle = "#7187b2";
  context.lineWidth = 5;
  context.strokeRect(92, 928, 896, 182);
  context.fillStyle = "#e7518f";
  context.font = '800 28px "PingFang SC", "Microsoft YaHei", Arial, sans-serif';
  context.fillText("KNOWLEDGE SCORE", 124, 972);
  context.fillStyle = "#17223a";
  drawFittedText(context, String(data.score), 124, 1080, 820, 104, 82);
  context.fillStyle = "#f47ead";
  context.fillRect(124, 1090, 420, 10);

  context.fillStyle = "rgba(255,255,255,0.72)";
  context.fillRect(92, 1138, 560, 206);
  context.fillStyle = "#ffffff";
  context.fillRect(682, 1138, 306, 206);
  context.strokeStyle = "#7187b2";
  context.lineWidth = 5;
  context.strokeRect(92, 1138, 560, 206);
  context.strokeRect(682, 1138, 306, 206);
  context.fillStyle = "#52617a";
  context.font = '800 26px "PingFang SC", "Microsoft YaHei", Arial, sans-serif';
  context.fillText("知识 / 最高连击", 124, 1192);
  context.fillStyle = "#17223a";
  context.font = '900 58px "PingFang SC", "Microsoft YaHei", Arial, sans-serif';
  context.fillText(`${data.fans} / ×${data.maxCombo}`, 124, 1286);

  drawContainedImage(context, shareQr, 758, 1150, 154, 154);
  context.textAlign = "center";
  context.fillStyle = "#52617a";
  context.font = '700 20px "PingFang SC", "Microsoft YaHei", Arial, sans-serif';
  context.fillText("扫码进入活动", 835, 1329);
  context.fillText("这次开学，我的隐藏人设被发现了", 540, 1370);

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/png", 1);
  });
}

function downloadShareCard(blob: Blob, song: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = getShareCardFileName(song);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function getShareCardFileName(song: string) {
  const safeSong = song.replace(/[\\/:*?"<>|]/g, "-").slice(0, 36);
  return `开学冲冲冲-${safeSong || "校园成绩"}.png`;
}

function isMobileSaveTarget() {
  return (
    navigator.maxTouchPoints > 0 ||
    window.matchMedia?.("(pointer: coarse)").matches ||
    window.matchMedia?.("(max-width: 780px)").matches
  );
}

function laneCenter(lane: number) {
  return ROAD_LEFT + LANE_WIDTH * lane + LANE_WIDTH / 2;
}

function roadDepthFromY(y: number) {
  return Math.max(
    0,
    Math.min(
      ROAD_BOTTOM_DEPTH,
      (y - ROAD_HORIZON_Y) / (PLAYER_Y - ROAD_HORIZON_Y),
    ),
  );
}

function roadYAtDepth(depth: number) {
  return ROAD_HORIZON_Y + (PLAYER_Y - ROAD_HORIZON_Y) * depth;
}

function roadYFromProgress(progress: number) {
  const clamped = Math.max(0, Math.min(1.35, progress));
  const depth = Math.pow(clamped, 1.42);
  return ROAD_HORIZON_Y + (PLAYER_Y - ROAD_HORIZON_Y) * depth;
}

function laneXAtDepth(lane: number, depth: number) {
  return ROAD_VANISH_X + (laneCenter(lane) - ROAD_VANISH_X) * depth;
}

function laneBoundaryXAtDepth(boundary: number, depth: number) {
  const boundaryAtPlayer = ROAD_LEFT + boundary * LANE_WIDTH;
  return ROAD_VANISH_X + (boundaryAtPlayer - ROAD_VANISH_X) * depth;
}

function roadXAtFraction(fraction: number, depth: number) {
  const clamped = Math.max(0, Math.min(1, fraction));
  const xAtPlayer = ROAD_LEFT + ROAD_WIDTH * clamped;
  return ROAD_VANISH_X + (xAtPlayer - ROAD_VANISH_X) * depth;
}

function smoothstep(progress: number) {
  const clamped = Math.max(0, Math.min(1, progress));
  return clamped * clamped * (3 - 2 * clamped);
}

function pedestrianXAtDepth(
  direction: 1 | -1,
  crossingProgress: number,
  depth: number,
) {
  const left = laneBoundaryXAtDepth(0, depth);
  const right = laneBoundaryXAtDepth(5, depth);
  const spriteScale = 0.3 + Math.min(1, depth) * 0.7;
  const edgeInset = Math.min(
    25 * spriteScale,
    Math.max(0, (right - left) / 2),
  );
  const safeLeft = left + edgeInset;
  const safeRight = right - edgeInset;
  const easedProgress = smoothstep(crossingProgress);
  return direction === 1
    ? safeLeft + (safeRight - safeLeft) * easedProgress
    : safeRight + (safeLeft - safeRight) * easedProgress;
}

function clampLane(lane: number) {
  return Math.max(0, Math.min(4, lane));
}

function getConcertTier(fans: number, maxCombo = 0): ConcertTier {
  const concertScore = fans * maxCombo;
  if (concertScore >= STADIUM_SCORE_THRESHOLD) {
    return {
      name: "天才学神",
      place: "知识宇宙已被你一键点亮",
      coins: 1080,
      color: "#f47ead",
      iconSrc: OUTCOME_ICONS.genius,
    };
  }
  if (concertScore >= 4_500) {
    return {
      name: "隐形学霸",
      place: "表面松弛，实力早已藏不住",
      coins: 680,
      color: "#23cfb2",
      iconSrc: OUTCOME_ICONS.hidden,
    };
  }
  if (concertScore >= 2_800) {
    return {
      name: "卷王本王",
      place: "进度条和行动力同时拉满",
      coins: 420,
      color: "#45c8ed",
      iconSrc: OUTCOME_ICONS.grinder,
    };
  }
  if (concertScore >= 1_400) {
    return {
      name: "知识分子",
      place: "新的知识点已经稳稳接住",
      coins: 240,
      color: "#7187b2",
      iconSrc: OUTCOME_ICONS.scholar,
    };
  }
  return {
    name: "佛系咸鱼",
    place: "不慌不忙，也算顺利开学",
    coins: 100,
    color: "#f5a5c3",
    iconSrc: OUTCOME_ICONS.slacker,
  };
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const campusImagesRef = useRef<
    Partial<Record<CampusAsset, HTMLImageElement>>
  >({});
  const lastVehicleImageRef = useRef<HTMLImageElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const statusRef = useRef<GameStatus>("ready");
  const laneRef = useRef(2);
  const busXRef = useRef(laneCenter(2));
  const fansRef = useRef(STARTING_FANS);
  const comboRef = useRef(0);
  const maxComboRef = useRef(0);
  const beatRef = useRef(0);
  const nextBeatRef = useRef(0);
  const beatTimesRef = useRef<number[]>([
    ...PRECOMPUTED_CHART.timing.beatTimesMs,
  ]);
  const trackRef = useRef<Track>(GAME_TRACK);
  const startTimeRef = useRef(0);
  const fallbackElapsedRef = useRef(0);
  const lastTimeRef = useRef(0);
  const lastHudRef = useRef(0);
  const entityIdRef = useRef(0);
  const lastObstacleTargetBeatRef = useRef(-Infinity);
  const entitiesRef = useRef<Entity[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const floatTextRef = useRef<FloatText[]>([]);
  const pedestrianRef = useRef<Pedestrian | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const lowShelfRef = useRef<BiquadFilterNode | null>(null);
  const highShelfRef = useRef<BiquadFilterNode | null>(null);
  const songRef = useRef<HTMLAudioElement | null>(null);
  const mutedRef = useRef(false);
  const beatPulseRef = useRef(0);
  const shakeRef = useRef(0);
  const hitFlashRef = useRef(0);
  const collectFlashRef = useRef(0);
  const screenPunchRef = useRef(0);
  const invulnerableUntilRef = useRef(0);
  const shieldRef = useRef(false);
  const perfectCountRef = useRef(0);
  const successfulHitsRef = useRef(0);
  const vehicleLevelRef = useRef(1);
  const magnetUntilRef = useRef(-1);
  const magnetQuotaRef = useRef(1);
  const magnetSpawnedRef = useRef(0);
  const invincibleUntilRef = useRef(-1);
  const toneModeRef = useRef<ToneMode>("normal");
  const arrangementUntilRef = useRef(-1);
  const grannyWarnedBeatsRef = useRef<Set<number>>(new Set());
  const toastTimerRef = useRef<number | null>(null);
  const judgementTimerRef = useRef<number | null>(null);
  const lastHitInputAtRef = useRef(-Infinity);
  const joystickPointerRef = useRef<number | null>(null);
  const joystickDirectionRef = useRef<-1 | 0 | 1>(0);
  const joystickFrameRef = useRef<number | null>(null);
  const joystickNextMoveAtRef = useRef(0);
  const lastPerfectSoundAtRef = useRef(-Infinity);
  const tutorialActiveRef = useRef(false);
  const tutorialMovedRef = useRef(false);
  const tutorialHitRef = useRef(false);
  const tutorialFinishAtRef = useRef(-1);
  const tutorialSeenThisSessionRef = useRef(false);
  const swipeStartRef = useRef<{ pointerId: number; x: number } | null>(null);

  const [status, setStatus] = useState<GameStatus>("ready");
  const [readyPage, setReadyPage] = useState<ReadyPage>("home");
  const [songReady, setSongReady] = useState(false);
  const [songLoading, setSongLoading] = useState(false);
  const [songError, setSongError] = useState("");
  const [assetsReady, setAssetsReady] = useState(false);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [assetsProgress, setAssetsProgress] = useState(0);
  const [assetsError, setAssetsError] = useState("");
  const [assetsReloadKey, setAssetsReloadKey] = useState(0);
  const [fans, setFans] = useState(STARTING_FANS);
  const [maxCombo, setMaxCombo] = useState(0);
  const [successfulHits, setSuccessfulHits] = useState(0);
  const [vehicleLevel, setVehicleLevel] = useState(1);
  const [magnetRemaining, setMagnetRemaining] = useState(0);
  const [invincibleRemaining, setInvincibleRemaining] = useState(0);
  const [progress, setProgress] = useState(0);
  const [beatIndex, setBeatIndex] = useState(0);
  const [toneMode, setToneMode] = useState<ToneMode>("normal");
  const [muted, setMuted] = useState(false);
  const [shield, setShield] = useState(false);
  const [bestFans, setBestFans] = useState(0);
  const [bankCoins, setBankCoins] = useState(0);
  const [earnedCoins, setEarnedCoins] = useState(0);
  const [failureSummary, setFailureSummary] =
    useState<FailureSummary | null>(null);
  const [shareCardOpen, setShareCardOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [mobileSavePreviewUrl, setMobileSavePreviewUrl] = useState<
    string | null
  >(null);
  const [joystickOffset, setJoystickOffset] = useState(0);
  const [noteJudgement, setNoteJudgement] = useState<NoteJudgement | null>(
    null,
  );
  const [resultTier, setResultTier] = useState<ConcertTier>(
    getConcertTier(STARTING_FANS),
  );
  const [toast, setToast] = useState<{
    text: string;
    tone: ToastTone;
    key: number;
  } | null>(null);
  const [luckyDialog, setLuckyDialog] = useState<LuckyDialog | null>(null);
  const [tutorialPhase, setTutorialPhase] =
    useState<TutorialPhase | null>(null);
  const [tutorialMoved, setTutorialMoved] = useState(false);
  const [tutorialHit, setTutorialHit] = useState(false);
  const songTitle = GAME_TRACK.name;
  const currentVehicle = getVehicle(vehicleLevel);
  const currentVehicleName = currentVehicle.name;
  const selectedAssetThemeClass = "is-campus-season";
  const vehicleTaskProgress = getVehicleTaskProgress(
    currentVehicle,
    successfulHits,
    perfectCountRef.current,
    maxCombo,
  );
  const showToast = useCallback((text: string, tone: ToastTone) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast({ text, tone, key: Date.now() });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 820);
  }, []);

  const createCurrentShareCard = useCallback(
    () =>
      createShareCardBlob({
        score: fans * maxCombo,
        fans,
        maxCombo,
        venue: resultTier.name,
        tierIconSrc: resultTier.iconSrc,
      }),
    [fans, maxCombo, resultTier.iconSrc, resultTier.name],
  );

  useEffect(
    () => () => {
      if (mobileSavePreviewUrl) URL.revokeObjectURL(mobileSavePreviewUrl);
    },
    [mobileSavePreviewUrl],
  );

  const showMobileSavePreview = useCallback((blob: Blob) => {
    setMobileSavePreviewUrl(URL.createObjectURL(blob));
  }, []);

  const closeShareCard = useCallback(() => {
    setMobileSavePreviewUrl(null);
    setShareCardOpen(false);
  }, []);

  const saveShareCard = useCallback(async () => {
    setShareBusy(true);
    try {
      const blob = await createCurrentShareCard();
      if (!blob) throw new Error("Share card unavailable");

      if (isMobileSaveTarget()) {
        const file = new File([blob], getShareCardFileName(songTitle), {
          type: "image/png",
        });
        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({
              title: "开学冲冲冲！校园成绩",
              files: [file],
            });
            showToast("请在系统菜单中选择“存储图像”", "cyan");
            return;
          } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") {
              return;
            }
          }
        }

        showMobileSavePreview(blob);
        showToast("请长按图片，选择保存到照片", "gold");
        return;
      }

      downloadShareCard(blob, songTitle);
      showToast("成绩卡已保存，可以分享给好友啦", "cyan");
    } catch {
      showToast("成绩卡生成失败，请稍后重试", "danger");
    } finally {
      setShareBusy(false);
    }
  }, [createCurrentShareCard, showMobileSavePreview, showToast, songTitle]);

  const shareResult = useCallback(async () => {
    setShareBusy(true);
    try {
      const blob = await createCurrentShareCard();
      if (!blob) throw new Error("Share card unavailable");
      const file = new File([blob], "campus-season-result.png", {
        type: "image/png",
      });
      const score = fans * maxCombo;
      const shareText = `我在《${songTitle}》拿到 ${score} 分，解锁新学期人设「${resultTier.name}」！`;
      if (navigator.share) {
        const shareData: ShareData = {
          title: "开学冲冲冲！校园成绩",
          text: shareText,
        };
        if (navigator.canShare?.({ files: [file] })) {
          shareData.files = [file];
        }
        await navigator.share(shareData);
        showToast("分享面板已打开", "cyan");
      } else {
        if (isMobileSaveTarget()) {
          showMobileSavePreview(blob);
          showToast("请长按图片，选择保存到照片", "gold");
        } else {
          downloadShareCard(blob, songTitle);
          showToast("当前设备未能打开分享面板，已保存成绩卡", "gold");
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      showToast("分享失败，请尝试保存成绩卡", "danger");
    } finally {
      setShareBusy(false);
    }
  }, [
    createCurrentShareCard,
    fans,
    maxCombo,
    resultTier.name,
    showMobileSavePreview,
    showToast,
    songTitle,
  ]);

  const showJudgement = useCallback(
    (quality: NoteJudgement["quality"], detail: string) => {
      if (judgementTimerRef.current) {
        window.clearTimeout(judgementTimerRef.current);
      }
      setNoteJudgement({ quality, detail, key: Date.now() });
      judgementTimerRef.current = window.setTimeout(
        () => setNoteJudgement(null),
        560,
      );
    },
    [],
  );

  const addBurst = useCallback(
    (x: number, y: number, color: string, count = 10) => {
      for (let i = 0; i < count; i += 1) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
        const speed = 45 + Math.random() * 95;
        particlesRef.current.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.65,
          maxLife: 0.65,
          color,
          size: 3 + Math.random() * 5,
        });
      }
    },
    [],
  );

  const addFloatText = useCallback(
    (x: number, y: number, text: string, color: string) => {
      floatTextRef.current.push({
        x,
        y,
        text,
        color,
        life: 0.9,
        maxLife: 0.9,
      });
    },
    [],
  );

  const resetSongTone = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      const now = audio.currentTime;
      lowShelfRef.current?.gain.setTargetAtTime(0, now, 0.08);
      highShelfRef.current?.gain.setTargetAtTime(0, now, 0.08);
    }
    if (songRef.current) songRef.current.playbackRate = 1;
    toneModeRef.current = "normal";
    arrangementUntilRef.current = -1;
    setToneMode("normal");
  }, []);

  const checkVehicleUpgrade = useCallback(() => {
    const current = getVehicle(vehicleLevelRef.current);
    if (
      current.level >= VEHICLE_LEVELS.length ||
      !isVehicleTaskComplete(
        current,
        successfulHitsRef.current,
        perfectCountRef.current,
        maxComboRef.current,
      )
    ) {
      return false;
    }

    const next = getVehicle(current.level + 1);
    vehicleLevelRef.current = next.level;
    setVehicleLevel(next.level);
    setNoteJudgement(null);
    screenPunchRef.current = 1.8;
    collectFlashRef.current = 1.4;
    addBurst(busXRef.current, PLAYER_Y - 18, next.secondary, 46);
    addFloatText(
      busXRef.current,
      PLAYER_Y - 96,
      `RIDE LV.${next.level}  ${next.name}`,
      next.secondary,
    );
    showToast(`车辆升级！${next.name}`, "gold");
    navigator.vibrate?.([35, 25, 45, 25, 65]);
    return true;
  }, [addBurst, addFloatText, showToast]);

  const playFanHit = useCallback((targetBeat: number) => {
    const audio = audioRef.current;
    if (!audio || mutedRef.current) return;
    const now = audio.currentTime;
    const base =
      trackRef.current.melody[targetBeat % trackRef.current.melody.length];

    [base, base * 2].forEach((frequency, index) => {
      const sparkle = audio.createOscillator();
      const gain = audio.createGain();
      sparkle.type = index === 0 ? "square" : "sine";
      sparkle.frequency.setValueAtTime(frequency, now + index * 0.045);
      gain.gain.setValueAtTime(
        index === 0 ? 0.085 : 0.055,
        now + index * 0.045,
      );
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2 + index * 0.045);
      sparkle.connect(gain).connect(audio.destination);
      sparkle.start(now + index * 0.045);
      sparkle.stop(now + 0.22 + index * 0.045);
    });
  }, []);

  const playPerfectHit = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || mutedRef.current) return;

    const play = () => {
      if (mutedRef.current || audio.state !== "running") return;
      const inputAt = performance.now();
      if (inputAt - lastPerfectSoundAtRef.current < 70) return;
      lastPerfectSoundAtRef.current = inputAt;

      const now = audio.currentTime + 0.006;
      const sparkleBus = audio.createGain();
      const sparkleFilter = audio.createBiquadFilter();
      sparkleBus.gain.setValueAtTime(0.92, now);
      sparkleFilter.type = "highpass";
      sparkleFilter.frequency.setValueAtTime(520, now);
      sparkleBus.connect(sparkleFilter).connect(audio.destination);

      [
        {
          frequency: 740,
          peak: 0.1,
          delay: 0,
          type: "triangle" as OscillatorType,
        },
        {
          frequency: 1110,
          peak: 0.072,
          delay: 0.028,
          type: "sine" as OscillatorType,
        },
        {
          frequency: 1665,
          peak: 0.042,
          delay: 0.052,
          type: "sine" as OscillatorType,
        },
      ].forEach(({ frequency, peak, delay, type }) => {
        const sparkle = audio.createOscillator();
        const sparkleGain = audio.createGain();
        const startAt = now + delay;
        sparkle.type = type;
        sparkle.frequency.setValueAtTime(frequency, startAt);
        sparkle.frequency.exponentialRampToValueAtTime(
          frequency * 1.16,
          startAt + 0.105,
        );
        sparkleGain.gain.setValueAtTime(0.0001, startAt);
        sparkleGain.gain.linearRampToValueAtTime(peak, startAt + 0.008);
        sparkleGain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.17);
        sparkle.connect(sparkleGain).connect(sparkleBus);
        sparkle.start(startAt);
        sparkle.stop(startAt + 0.18);
      });
    };

    if (audio.state !== "running") {
      void audio
        .resume()
        .then(play)
        .catch(() => undefined);
      return;
    }
    play();
  }, []);

  const playObstacleImpact = useCallback((obstacle: ObstacleType) => {
    const audio = audioRef.current;
    if (!audio || audio.state !== "running" || mutedRef.current) return;

    const now = audio.currentTime + 0.004;
    const impact = audio.createOscillator();
    const impactGain = audio.createGain();
    const impactFilter = audio.createBiquadFilter();
    const startFrequency =
      obstacle === "barrier" ? 125 : obstacle === "pothole" ? 155 : 185;
    const peak = obstacle === "barrier" ? 0.075 : 0.055;

    impact.type = "triangle";
    impact.frequency.setValueAtTime(startFrequency, now);
    impact.frequency.exponentialRampToValueAtTime(52, now + 0.14);
    impactGain.gain.setValueAtTime(0.0001, now);
    impactGain.gain.linearRampToValueAtTime(peak, now + 0.006);
    impactGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
    impactFilter.type = "lowpass";
    impactFilter.frequency.setValueAtTime(460, now);
    impact.connect(impactGain).connect(impactFilter).connect(audio.destination);
    impact.start(now);
    impact.stop(now + 0.16);
  }, []);

  const loadFixedSong = useCallback(async () => {
    setSongLoading(true);
    setSongReady(false);
    setSongError("");

    songRef.current?.pause();
    if (audioRef.current) {
      await audioRef.current.close();
      audioRef.current = null;
    }
    mediaSourceRef.current = null;
    lowShelfRef.current = null;
    highShelfRef.current = null;

    let sourceUrl = DIRECT_AUDIO_URL || GAME_TRACK.audioSrc;
    let remoteFallbackUsed = false;
    if (AUDIO_SOURCE_API) {
      try {
        const response = await fetch(AUDIO_SOURCE_API, { cache: "no-store" });
        if (!response.ok) throw new Error("线上歌曲接口不可用");
        const payload = (await response.json()) as {
          url?: string;
          audioId?: string;
          chartVersion?: string;
          audioSha256?: string;
        };
        if (!payload.url) throw new Error("线上歌曲接口未返回 URL");
        if (
          payload.audioId !== PRECOMPUTED_CHART.audio.id ||
          payload.chartVersion !== PRECOMPUTED_CHART.chartVersion ||
          payload.audioSha256 !== PRECOMPUTED_CHART.audio.sha256
        ) {
          throw new Error("线上主题曲版本不适配本次活动");
        }
        sourceUrl = payload.url;
      } catch {
        sourceUrl = GAME_TRACK.audioSrc;
        remoteFallbackUsed = true;
      }
    }

    try {
      const localUrl = new URL(GAME_TRACK.audioSrc, window.location.href).href;
      const prepareSong = (url: string) =>
        new Promise<HTMLAudioElement>((resolve, reject) => {
          const song = new Audio();
          const cleanup = () => {
            song.removeEventListener("loadedmetadata", handleReady);
            song.removeEventListener("canplay", handleReady);
            song.removeEventListener("error", handleError);
          };
          const handleReady = () => {
            cleanup();
            const durationMs = Math.round(song.duration * 1000);
            if (
              Number.isFinite(durationMs) &&
              Math.abs(durationMs - PRECOMPUTED_CHART.audio.durationMs) > 750
            ) {
              reject(new Error("主题曲版本与本次活动不匹配"));
              return;
            }
            resolve(song);
          };
          const handleError = () => {
            cleanup();
            reject(new Error("音频文件不可用"));
          };
          song.preload = "auto";
          song.muted = mutedRef.current;
          song.playbackRate = 1;
          song.addEventListener("loadedmetadata", handleReady);
          song.addEventListener("canplay", handleReady);
          song.addEventListener("error", handleError);
          song.src = new URL(url, window.location.href).href;
          song.load();
        });

      const requestedUrl = new URL(sourceUrl, window.location.href).href;
      let song: HTMLAudioElement;
      try {
        song = await prepareSong(requestedUrl);
      } catch (error) {
        if (requestedUrl === localUrl) throw error;
        remoteFallbackUsed = true;
        song = await prepareSong(localUrl);
      }
      songRef.current = song;
      trackRef.current = GAME_TRACK;
      beatTimesRef.current = [...PRECOMPUTED_CHART.timing.beatTimesMs];
      setSongReady(true);
      showToast(
        remoteFallbackUsed
          ? "线上主题曲暂不可用 · 已切换本地主题曲"
          : "主题曲准备完成 · 可以出发啦",
        remoteFallbackUsed ? "gold" : "cyan",
      );
    } catch (error) {
      songRef.current = null;
      setSongReady(false);
      setSongError(
        error instanceof Error ? error.message : "歌曲加载失败，请刷新后重试",
      );
    } finally {
      setSongLoading(false);
    }
  }, [showToast]);

  const spawnBeat = useCallback((beat: number) => {
    const track = trackRef.current;
    if (beat >= track.totalBeats - TRAVEL_BEATS) return;

    const targetBeat = beat + TRAVEL_BEATS;
    const patternLane =
      track.lanePattern[targetBeat % track.lanePattern.length];
    const isPedestrianClearance = track.grannyBeats.some(
      (pedestrianBeat) =>
        Math.abs(targetBeat - pedestrianBeat) <=
        PEDESTRIAN_ITEM_CLEARANCE_BEATS,
    );
    const safeLane = patternLane;
    const noteLevel =
      track.notePattern[targetBeat % track.notePattern.length] ?? 0;
    const intensity =
      track.intensityPattern[targetBeat % track.intensityPattern.length] ?? 0;
    const weakNoteOrdinal = track.notePattern
      .slice(0, targetBeat + 1)
      .reduce((total, level) => total + (level === 1 ? 1 : 0), 0);
    const shouldSpawnKnowledge =
      noteLevel === 2 ||
      (noteLevel === 1 &&
        (weakNoteOrdinal % 2 === 0 || weakNoteOrdinal % 7 === 0));
    if (!shouldSpawnKnowledge || isPedestrianClearance) return;
    const spawnY = ROAD_HORIZON_Y;
    const spawnAt = beatTimesRef.current[beat];
    const hitAt = beatTimesRef.current[targetBeat];
    const powerupTrailDelayMs = halfBeatDelayMs(
      beatTimesRef.current,
      targetBeat,
    );
    const activeNoteOrdinal = track.notePattern
      .slice(0, targetBeat + 1)
      .reduce((total, level) => total + (level === 2 ? 1 : 0), 0);

    const isMagnetSpawnSlot = MAGNET_SPAWN_ORDINALS.some(
      (ordinal) => ordinal === activeNoteOrdinal,
    );
    const bonusType: EntityType | null =
      noteLevel === 2 &&
      isMagnetSpawnSlot &&
      magnetSpawnedRef.current < magnetQuotaRef.current
        ? "magnet"
        : noteLevel === 2 && activeNoteOrdinal > 10 && activeNoteOrdinal % 28 === 20
          ? "invincible"
          : noteLevel === 2 && [19, 57].includes(activeNoteOrdinal)
            ? "lucky"
            : null;
    entitiesRef.current.push({
      id: entityIdRef.current++,
      type: "fan",
      lane: safeLane,
      y: spawnY,
      targetBeat,
      spawnAt,
      hitAt,
      handled: false,
    });
    if (bonusType) {
      entitiesRef.current.push({
        id: entityIdRef.current++,
        type: bonusType,
        lane: safeLane,
        y: spawnY,
        targetBeat,
        spawnAt: spawnAt + powerupTrailDelayMs,
        hitAt: hitAt + powerupTrailDelayMs,
        handled: false,
      });
      if (bonusType === "magnet") magnetSpawnedRef.current += 1;
    }

    if (beat < 2 || noteLevel !== 2) return;
    if (
      targetBeat - lastObstacleTargetBeatRef.current <
      MIN_OBSTACLE_BEAT_GAP
    ) {
      return;
    }
    lastObstacleTargetBeatRef.current = targetBeat;
    const obstacleCount =
      beat > 12 && noteLevel === 2 && intensity > 0.68 ? 2 : 1;
    const used = new Set<number>([safeLane]);
    for (let i = 0; i < obstacleCount; i += 1) {
      let obstacleLane = (beat * 2 + i * 3) % 5;
      while (used.has(obstacleLane)) {
        obstacleLane = (obstacleLane + 1) % 5;
      }
      used.add(obstacleLane);
      const obstacleTypes: ObstacleType[] = ["cone", "pothole", "barrier"];
      entitiesRef.current.push({
        id: entityIdRef.current++,
        type: "obstacle",
        obstacle: obstacleTypes[(beat + i) % obstacleTypes.length],
        lane: obstacleLane,
        y: spawnY - i * 8,
        targetBeat,
        spawnAt,
        hitAt,
        handled: false,
      });
    }
  }, []);

  const triggerDamageVariation = useCallback(() => {
    const nextTone: ToneMode =
      toneModeRef.current === "thick"
        ? "thin"
        : toneModeRef.current === "thin"
          ? "thick"
          : beatRef.current % 2 === 0
            ? "thick"
            : "thin";
    toneModeRef.current = nextTone;
    arrangementUntilRef.current = beatRef.current + 8;
    setToneMode(nextTone);
    if (songRef.current) {
      // Tone filters change colour only; playbackRate stays fixed so the beat
      // grid and the original song tempo never drift apart.
      songRef.current.playbackRate = 1;
    }

    const audio = audioRef.current;
    if (audio) {
      const now = audio.currentTime;
      lowShelfRef.current?.gain.setTargetAtTime(
        nextTone === "thick" ? 11 : -8,
        now,
        0.055,
      );
      highShelfRef.current?.gain.setTargetAtTime(
        nextTone === "thick" ? -9 : 11,
        now,
        0.055,
      );
    }

    if (!audio || mutedRef.current) return;
    const now = audio.currentTime;
    const bend = audio.createOscillator();
    const bendGain = audio.createGain();
    bend.type = "sawtooth";
    bend.frequency.setValueAtTime(190, now);
    bend.frequency.exponentialRampToValueAtTime(72, now + 0.25);
    bendGain.gain.setValueAtTime(0.09, now);
    bendGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    bend.connect(bendGain).connect(audio.destination);
    bend.start(now);
    bend.stop(now + 0.3);
  }, []);

  const drawGame = useCallback(
    (ctx: CanvasRenderingContext2D, elapsed: number) => {
      const pulse = beatPulseRef.current;
      const visualSpeed = 180 + GAME_TRACK.bpmAt(beatRef.current) * 1.2;
      const roadFlow = ((elapsed / 1_000) * (visualSpeed / 240)) % 1;
      const shakeX = shakeRef.current > 0 ? (Math.random() - 0.5) * 12 : 0;
      const shakeY = shakeRef.current > 0 ? (Math.random() - 0.5) * 8 : 0;
      const images = campusImagesRef.current;

      ctx.save();
      ctx.translate(shakeX, shakeY);
      if (screenPunchRef.current > 0) {
        const scale = 1 + screenPunchRef.current * 0.014;
        ctx.translate(GAME_WIDTH / 2, GAME_HEIGHT / 2);
        ctx.scale(scale, scale);
        ctx.translate(-GAME_WIDTH / 2, -GAME_HEIGHT / 2);
      }

      ctx.clearRect(-16, -16, GAME_WIDTH + 32, GAME_HEIGHT + 32);
      ctx.fillStyle = MAP_PALETTE.sky;
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      if (images.road?.complete && images.road.naturalWidth) {
        ctx.drawImage(images.road, 0, 0, GAME_WIDTH, GAME_HEIGHT);

        // The source illustration has one baked-in center dash. Clone nearby
        // road texture over it so the game owns the complete five-lane grid.
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(237, 316);
        ctx.lineTo(243, 316);
        ctx.lineTo(260, GAME_HEIGHT);
        ctx.lineTo(220, GAME_HEIGHT);
        ctx.closePath();
        ctx.clip();
        const roadDashTextureShear = -29 / 404;
        const roadDashTextureOffset = -3 - roadDashTextureShear * 316;
        ctx.transform(
          1,
          0,
          roadDashTextureShear,
          1,
          roadDashTextureOffset,
          0,
        );
        ctx.drawImage(images.road, 0, 0, GAME_WIDTH, GAME_HEIGHT);
        ctx.restore();
      }

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(ROAD_VANISH_X, ROAD_HORIZON_Y);
      ctx.lineTo(laneBoundaryXAtDepth(5, ROAD_BOTTOM_DEPTH), GAME_HEIGHT);
      ctx.lineTo(laneBoundaryXAtDepth(0, ROAD_BOTTOM_DEPTH), GAME_HEIGHT);
      ctx.closePath();
      ctx.fillStyle = "rgba(113, 135, 178, 0.08)";
      ctx.fill();
      ctx.restore();

      ctx.lineCap = "round";
      for (const boundary of [0, 5]) {
        ctx.beginPath();
        ctx.moveTo(ROAD_VANISH_X, ROAD_HORIZON_Y);
        ctx.lineTo(
          laneBoundaryXAtDepth(boundary, ROAD_BOTTOM_DEPTH),
          GAME_HEIGHT,
        );
        ctx.strokeStyle =
          boundary === 0
            ? "rgba(35, 207, 178, 0.62)"
            : "rgba(244, 126, 173, 0.62)";
        ctx.lineWidth = 2.2;
        ctx.stroke();
      }

      for (let boundary = 1; boundary < 5; boundary += 1) {
        for (let marker = 0; marker < 7; marker += 1) {
          const phase = (marker / 7 + roadFlow) % 1;
          const endPhase = Math.min(1, phase + 0.045 + phase * 0.055);
          const startDepth = Math.pow(phase, 1.45) * ROAD_BOTTOM_DEPTH;
          const endDepth = Math.pow(endPhase, 1.45) * ROAD_BOTTOM_DEPTH;
          ctx.beginPath();
          ctx.moveTo(
            laneBoundaryXAtDepth(boundary, startDepth),
            roadYAtDepth(startDepth),
          );
          ctx.lineTo(
            laneBoundaryXAtDepth(boundary, endDepth),
            roadYAtDepth(endDepth),
          );
          ctx.strokeStyle = `rgba(255, 250, 239, ${Math.min(0.86, 0.48 + startDepth * 0.26)})`;
          ctx.lineWidth = 1.2 + phase * 2.2;
          ctx.stroke();
        }
      }
      ctx.lineCap = "butt";

      const pedestrian = pedestrianRef.current;
      if (pedestrian) {
        ctx.save();
        const pedestrianDepth = roadDepthFromY(pedestrian.y);
        const crosswalkHalfDepth = 0.035 + Math.min(1, pedestrianDepth) * 0.075;
        const crosswalkFarDepth = Math.max(
          0,
          pedestrianDepth - crosswalkHalfDepth,
        );
        const crosswalkNearDepth = Math.min(
          ROAD_BOTTOM_DEPTH,
          pedestrianDepth + crosswalkHalfDepth,
        );

        ctx.beginPath();
        ctx.moveTo(
          laneBoundaryXAtDepth(0, crosswalkFarDepth),
          roadYAtDepth(crosswalkFarDepth),
        );
        ctx.lineTo(
          laneBoundaryXAtDepth(5, crosswalkFarDepth),
          roadYAtDepth(crosswalkFarDepth),
        );
        ctx.lineTo(
          laneBoundaryXAtDepth(5, crosswalkNearDepth),
          roadYAtDepth(crosswalkNearDepth),
        );
        ctx.lineTo(
          laneBoundaryXAtDepth(0, crosswalkNearDepth),
          roadYAtDepth(crosswalkNearDepth),
        );
        ctx.closePath();
        ctx.fillStyle = "rgba(26, 38, 59, 0.12)";
        ctx.fill();

        const crosswalkBarWidth =
          (1 -
            CROSSWALK_SIDE_PADDING * 2 -
            CROSSWALK_BAR_GAP * (CROSSWALK_BAR_COUNT - 1)) /
          CROSSWALK_BAR_COUNT;
        for (let bar = 0; bar < CROSSWALK_BAR_COUNT; bar += 1) {
          const barStart =
            CROSSWALK_SIDE_PADDING +
            bar * (crosswalkBarWidth + CROSSWALK_BAR_GAP);
          const barEnd = barStart + crosswalkBarWidth;
          ctx.beginPath();
          ctx.moveTo(
            roadXAtFraction(barStart, crosswalkFarDepth),
            roadYAtDepth(crosswalkFarDepth),
          );
          ctx.lineTo(
            roadXAtFraction(barEnd, crosswalkFarDepth),
            roadYAtDepth(crosswalkFarDepth),
          );
          ctx.lineTo(
            roadXAtFraction(barEnd, crosswalkNearDepth),
            roadYAtDepth(crosswalkNearDepth),
          );
          ctx.lineTo(
            roadXAtFraction(barStart, crosswalkNearDepth),
            roadYAtDepth(crosswalkNearDepth),
          );
          ctx.closePath();
          ctx.fillStyle = "rgba(255, 253, 242, 0.96)";
          ctx.fill();
        }

        if (images.grandma?.complete && images.grandma.naturalWidth) {
          const pedestrianScale =
            0.3 + Math.min(1, pedestrianDepth) * 0.7;
          const pedestrianWidth = 50 * pedestrianScale;
          const pedestrianHeight = 92 * pedestrianScale;
          ctx.translate(Math.round(pedestrian.x), pedestrian.y);
          if (pedestrian.direction === -1) ctx.scale(-1, 1);
          ctx.drawImage(
            images.grandma,
            141,
            46,
            229,
            420,
            -pedestrianWidth / 2,
            -pedestrianHeight,
            pedestrianWidth,
            pedestrianHeight,
          );
        }
        ctx.restore();
      }

      const visibleEntities = [...entitiesRef.current].sort((a, b) => a.y - b.y);
      for (const entity of visibleEntities) {
        const depth = roadDepthFromY(entity.y);
        const x = laneXAtDepth(entity.lane, depth);
        const spriteSize =
          ENTITY_RENDER_SIZE * (0.34 + Math.min(1, depth) * 0.66);
        const spriteTop = -spriteSize;
        const drawRoadSprite = (image: HTMLImageElement) =>
          drawContainedImage(
            ctx,
            image,
            -spriteSize / 2,
            spriteTop,
            spriteSize,
            spriteSize,
          );
        ctx.save();
        ctx.translate(Math.round(x), Math.round(entity.y));
        if (entity.tutorial && entity.type === "obstacle") {
          ctx.beginPath();
          ctx.arc(0, -spriteSize / 2, spriteSize * 0.62 + pulse * 3, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(244, 126, 173, 0.16)";
          ctx.fill();
          ctx.strokeStyle = "rgba(255, 216, 77, 0.96)";
          ctx.lineWidth = Math.max(2, spriteSize * 0.055);
          ctx.setLineDash([6, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if (entity.type !== "obstacle") {
          const haloColor =
            entity.type === "lucky"
              ? "244, 126, 173"
              : entity.type === "magnet"
                ? "35, 207, 178"
                : entity.type === "invincible"
                  ? "255, 216, 77"
                  : "69, 200, 237";
          ctx.beginPath();
          ctx.arc(0, -spriteSize / 2, spriteSize * 0.5 + pulse * 2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${haloColor}, 0.2)`;
          ctx.fill();
          ctx.strokeStyle = `rgba(${haloColor}, 0.95)`;
          ctx.lineWidth = Math.max(2, spriteSize * 0.055);
          ctx.stroke();
        }

        if (entity.type === "fan") {
          const timingDistance = Math.abs(entity.hitAt - elapsed);
          const isTutorialRingVisible =
            entity.tutorial &&
            elapsed >= entity.spawnAt &&
            elapsed <= entity.hitAt + MISS_WINDOW;
          if (timingDistance < 260 || isTutorialRingVisible) {
            const tutorialTravelRemaining = Math.max(
              0,
              Math.min(
                1,
                (entity.hitAt - elapsed) /
                  Math.max(1, entity.hitAt - entity.spawnAt),
              ),
            );
            const ringScale = entity.tutorial
              ? 1 + tutorialTravelRemaining * 1.15
              : 1 + timingDistance / 520;
            ctx.strokeStyle =
              timingDistance < 110 ? "#ffd84d" : "rgba(69, 200, 237, 0.86)";
            ctx.lineWidth = timingDistance < 110 ? 5 : entity.tutorial ? 4 : 3;
            ctx.beginPath();
            ctx.arc(
              0,
              -spriteSize / 2,
              spriteSize * 0.46 * ringScale,
              0,
              Math.PI * 2,
            );
            ctx.stroke();
          }
          if (images.knowledgeStar?.complete && images.knowledgeStar.naturalWidth) {
            drawRoadSprite(images.knowledgeStar);
          }
          if (entity.tutorial && timingDistance < 330) {
            ctx.fillStyle = "rgba(255, 216, 77, 0.96)";
            ctx.strokeStyle = "#17223a";
            ctx.lineWidth = 2;
            ctx.fillRect(-39, 8, 78, 24);
            ctx.strokeRect(-39, 8, 78, 24);
            ctx.fillStyle = "#17223a";
            ctx.font =
              '900 12px "PingFang SC", "Microsoft YaHei", Arial, sans-serif';
            ctx.textAlign = "center";
            ctx.fillText("按 HIT", 0, 24);
          }
        } else if (
          entity.type === "lucky" &&
          images.mysterySchoolbag?.complete &&
          images.mysterySchoolbag.naturalWidth
        ) {
          drawRoadSprite(images.mysterySchoolbag);
        } else if (
          entity.type === "magnet" &&
          images.magnet?.complete &&
          images.magnet.naturalWidth
        ) {
          drawRoadSprite(images.magnet);
        } else if (
          entity.type === "invincible" &&
          images.lightning?.complete &&
          images.lightning.naturalWidth
        ) {
          drawRoadSprite(images.lightning);
        } else if (
          entity.obstacle === "cone" &&
          images.cone?.complete &&
          images.cone.naturalWidth
        ) {
          drawRoadSprite(images.cone);
        } else if (
          entity.obstacle === "pothole" &&
          images.pothole?.complete &&
          images.pothole.naturalWidth
        ) {
          drawRoadSprite(images.pothole);
        } else if (
          entity.obstacle === "barrier" &&
          images.barrier?.complete &&
          images.barrier.naturalWidth
        ) {
          drawRoadSprite(images.barrier);
        }
        ctx.restore();
      }

      if (hitFlashRef.current > 0) {
        ctx.fillStyle = `rgba(244, 126, 173, ${hitFlashRef.current * 0.36})`;
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      }
      if (collectFlashRef.current > 0) {
        ctx.fillStyle = `rgba(69, 200, 237, ${collectFlashRef.current * 0.16})`;
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      }

      for (const particle of particlesRef.current) {
        ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
        ctx.fillStyle = particle.color;
        ctx.fillRect(
          Math.round(particle.x),
          Math.round(particle.y),
          Math.ceil(particle.size),
          Math.ceil(particle.size),
        );
      }
      ctx.globalAlpha = 1;

      const busX = busXRef.current;
      const busY = PLAYER_Y;
      const vehicle = getVehicle(vehicleLevelRef.current);
      const busScale =
        VEHICLE_VISUAL_SCALE * (1 + (vehicle.level - 1) * 0.015);
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.setLineDash([]);
      ctx.translate(Math.round(busX), Math.round(busY));
      if (elapsed < magnetUntilRef.current) {
        ctx.save();
        ctx.strokeStyle = `rgba(69, 200, 237, ${0.4 + pulse * 0.3})`;
        ctx.lineWidth = 3;
        ctx.setLineDash([9, 7]);
        ctx.beginPath();
        ctx.arc(
          0,
          VEHICLE_EFFECT_CENTER_Y,
          MAGNET_RADIUS + pulse * 5,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
        ctx.restore();
      }
      if (elapsed < invincibleUntilRef.current) {
        ctx.save();
        ["#fff5e8", "#ffd84d", "#f47ead"].forEach((color, index) => {
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.9 - index * 0.16;
          ctx.lineWidth = 5 - index;
          ctx.beginPath();
          ctx.arc(
            0,
            VEHICLE_EFFECT_CENTER_Y,
            VEHICLE_VISUAL_SCALE * (48 + index * 9 + pulse * 5),
            0,
            Math.PI * 2,
          );
          ctx.stroke();
        });
        ctx.restore();
      }
      if (shieldRef.current) {
        ctx.save();
        ctx.strokeStyle = `rgba(69, 200, 237, ${0.58 + pulse * 0.32})`;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(
          0,
          VEHICLE_EFFECT_CENTER_Y,
          VEHICLE_VISUAL_SCALE * (48 + pulse * 4),
          0,
          Math.PI * 2,
        );
        ctx.stroke();
        ctx.restore();
      }
      ctx.scale(busScale, busScale);
      const requestedVehicleImage =
        vehicle.level === 1
          ? images.bicycle
          : vehicle.level === 2
            ? images.motorcycle
            : vehicle.level === 3
              ? images.car
              : images.schoolBus;
      if (
        requestedVehicleImage?.complete &&
        requestedVehicleImage.naturalWidth
      ) {
        lastVehicleImageRef.current = requestedVehicleImage;
      }
      const vehicleImage =
        requestedVehicleImage?.complete && requestedVehicleImage.naturalWidth
          ? requestedVehicleImage
          : lastVehicleImageRef.current;
      if (vehicleImage) {
        const bounds = { x: -50, y: -96, width: 100, height: 100 };
        drawContainedImage(
          ctx,
          vehicleImage,
          bounds.x,
          bounds.y,
          bounds.width,
          bounds.height,
        );
      }
      ctx.restore();

      if (pedestrian) {
        const warningWidth = 214;
        const warningX = (GAME_WIDTH - warningWidth) / 2;
        const warningY = ROAD_HORIZON_Y + 18;
        ctx.fillStyle = "rgba(255, 216, 77, 0.96)";
        ctx.strokeStyle = "#17223a";
        ctx.lineWidth = 2;
        ctx.fillRect(warningX, warningY, warningWidth, 27);
        ctx.strokeRect(warningX, warningY, warningWidth, 27);
        ctx.fillStyle = "#17223a";
        ctx.font = '800 13px "PingFang SC", "Microsoft YaHei", Arial, sans-serif';
        ctx.textAlign = "center";
        ctx.fillText("有行人经过，小心", GAME_WIDTH / 2, warningY + 18);
      }

      ctx.textAlign = "center";
      ctx.font = "bold 18px monospace";
      for (const item of floatTextRef.current) {
        ctx.globalAlpha = Math.max(0, item.life / item.maxLife);
        ctx.fillStyle = "#17223a";
        ctx.fillText(item.text, item.x + 2, item.y + 2);
        ctx.fillStyle = item.color;
        ctx.fillText(item.text, item.x, item.y);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    },
    [],
  );

  const stopJoystick = useCallback(() => {
    if (joystickFrameRef.current !== null) {
      window.cancelAnimationFrame(joystickFrameRef.current);
      joystickFrameRef.current = null;
    }
    joystickPointerRef.current = null;
    joystickDirectionRef.current = 0;
    joystickNextMoveAtRef.current = 0;
    setJoystickOffset(0);
  }, []);

  const endTutorial = useCallback(() => {
    if (!tutorialActiveRef.current) return;
    tutorialActiveRef.current = false;
    tutorialFinishAtRef.current = -1;
    tutorialSeenThisSessionRef.current = true;
    entitiesRef.current = entitiesRef.current.filter(
      (entity) => !entity.tutorial,
    );
    setTutorialPhase(null);
  }, []);

  const completeTutorialIfReady = useCallback((elapsed: number) => {
    if (
      !tutorialActiveRef.current ||
      !tutorialMovedRef.current ||
      !tutorialHitRef.current ||
      tutorialFinishAtRef.current >= 0
    ) {
      return;
    }
    tutorialFinishAtRef.current = elapsed + TUTORIAL_COMPLETE_HOLD_MS;
    setTutorialPhase("complete");
  }, []);

  const finishGame = useCallback(() => {
    if (statusRef.current !== "playing") return;
    statusRef.current = "finished";
    setStatus("finished");
    if (animationRef.current) {
      window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    stopJoystick();
    setFailureSummary(null);
    setShareCardOpen(false);
    setProgress(100);

    const tier = getConcertTier(fansRef.current, maxComboRef.current);
    const coins = tier.coins + maxComboRef.current * 3;
    setEarnedCoins(coins);
    setResultTier(tier);
    setFans(fansRef.current);
    setMaxCombo(maxComboRef.current);

    const previousCoins = Number(
      window.localStorage.getItem("fan-bus-coins") || 0,
    );
    const previousBest = Number(
      window.localStorage.getItem("fan-bus-best") || 0,
    );
    const nextCoins = previousCoins + coins;
    const nextBest = Math.max(previousBest, fansRef.current);
    window.localStorage.setItem("fan-bus-coins", String(nextCoins));
    window.localStorage.setItem("fan-bus-best", String(nextBest));
    setBankCoins(nextCoins);
    setBestFans(nextBest);

    addBurst(GAME_WIDTH / 2, PLAYER_Y - 120, tier.color, 38);
    if (songRef.current) {
      songRef.current.pause();
    }
    magnetUntilRef.current = -1;
    invincibleUntilRef.current = -1;
    setMagnetRemaining(0);
    setInvincibleRemaining(0);
    resetSongTone();
  }, [addBurst, resetSongTone, stopJoystick]);

  const failGame = useCallback(() => {
    if (statusRef.current !== "playing") return;
    const totalDuration =
      beatTimesRef.current[trackRef.current.totalBeats] ??
      PRECOMPUTED_CHART.audio.durationMs;
    const failureProgress = Math.min(
      100,
      Math.max(0, (fallbackElapsedRef.current / totalDuration) * 100),
    );

    statusRef.current = "failed";
    setStatus("failed");
    if (animationRef.current) {
      window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    stopJoystick();
    setFailureSummary({
      reason: "pedestrian-collision",
      fans: fansRef.current,
      maxCombo: maxComboRef.current,
      progress: failureProgress,
    });
    setEarnedCoins(0);
    setFans(fansRef.current);
    setMaxCombo(maxComboRef.current);
    setShareCardOpen(false);
    setProgress(failureProgress);
    setNoteJudgement(null);
    setLuckyDialog(null);
    shakeRef.current = 0.7;
    hitFlashRef.current = 1;
    pedestrianRef.current = null;
    navigator.vibrate?.([110, 55, 150]);
    addBurst(busXRef.current, PLAYER_Y - 8, "#ffe66d", 34);
    if (songRef.current) {
      songRef.current.pause();
    }
    magnetUntilRef.current = -1;
    invincibleUntilRef.current = -1;
    setMagnetRemaining(0);
    setInvincibleRemaining(0);
    resetSongTone();

    const audio = audioRef.current;
    if (audio && !mutedRef.current) {
      const now = audio.currentTime;
      const brake = audio.createOscillator();
      const brakeGain = audio.createGain();
      brake.type = "sawtooth";
      brake.frequency.setValueAtTime(620, now);
      brake.frequency.exponentialRampToValueAtTime(55, now + 0.42);
      brakeGain.gain.setValueAtTime(0.12, now);
      brakeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.44);
      brake.connect(brakeGain).connect(audio.destination);
      brake.start(now);
      brake.stop(now + 0.46);
    }
  }, [addBurst, resetSongTone, stopJoystick]);

  const gameLoop = useCallback(
    function gameLoopFrame(now: number) {
      if (statusRef.current !== "playing") return;
      const delta = Math.min(
        0.035,
        Math.max(0, (now - lastTimeRef.current) / 1000),
      );
      lastTimeRef.current = now;
      const elapsed =
        songRef.current && !songRef.current.paused
          ? songRef.current.currentTime * 1000
          : now - startTimeRef.current;
      fallbackElapsedRef.current = elapsed;
      const track = trackRef.current;
      const beatTimes = beatTimesRef.current;

      if (
        tutorialActiveRef.current &&
        (elapsed >= TUTORIAL_TIMEOUT_MS ||
          (tutorialFinishAtRef.current >= 0 &&
            elapsed >= tutorialFinishAtRef.current))
      ) {
        endTutorial();
      }

      while (
        nextBeatRef.current < track.totalBeats &&
        elapsed >= beatTimes[nextBeatRef.current]
      ) {
        const beat = nextBeatRef.current;
        beatRef.current = beat;
        beatPulseRef.current = 1;
        if (!tutorialActiveRef.current) spawnBeat(beat);

        const pedestrianWarningIndex = tutorialActiveRef.current
          ? -1
          : track.grannyBeats.findIndex(
              (targetBeat) =>
                beat === targetBeat - PEDESTRIAN_WARNING_BEATS &&
                !grannyWarnedBeatsRef.current.has(targetBeat),
            );
        if (pedestrianWarningIndex >= 0) {
          const pedestrianBeat = track.grannyBeats[pedestrianWarningIndex];
          grannyWarnedBeatsRef.current.add(pedestrianBeat);
          const direction = pedestrianWarningIndex === 0 ? 1 : -1;
          pedestrianRef.current = {
            startAt: beatTimes[beat],
            hitAt: beatTimes[pedestrianBeat],
            endAt:
              beatTimes[
                Math.min(
                  pedestrianBeat +
                    (PEDESTRIAN_EVENT_BEATS - PEDESTRIAN_WARNING_BEATS),
                  beatTimes.length - 1,
                )
              ],
            direction,
            crossingProgress: 0,
            x: pedestrianXAtDepth(direction, 0, 0),
            y: ROAD_HORIZON_Y,
          };
        }
        if (
          arrangementUntilRef.current > 0 &&
          beat >= arrangementUntilRef.current
        ) {
          resetSongTone();
          showToast("伴奏音色恢复 · 节奏始终不变", "cyan");
        }

        nextBeatRef.current += 1;
        setBeatIndex(beat);
      }

      busXRef.current +=
        (laneCenter(laneRef.current) - busXRef.current) *
        Math.min(1, delta * 14);

      if (magnetUntilRef.current > 0 && elapsed >= magnetUntilRef.current) {
        magnetUntilRef.current = -1;
        setMagnetRemaining(0);
        showToast("磁铁效果结束", "cyan");
      }
      if (
        invincibleUntilRef.current > 0 &&
        elapsed >= invincibleUntilRef.current
      ) {
        invincibleUntilRef.current = -1;
        setInvincibleRemaining(0);
        showToast("无敌模式结束", "gold");
      }

      const nextEntities: Entity[] = [];
      for (const currentEntity of entitiesRef.current) {
        const travelProgress =
          (elapsed - currentEntity.spawnAt) /
          Math.max(1, currentEntity.hitAt - currentEntity.spawnAt);
        const entity: Entity = {
          ...currentEntity,
          y: roadYFromProgress(travelProgress),
        };

        if (entity.tutorial) {
          if (entity.type === "fan") {
            entity.lane = laneRef.current;
            currentEntity.lane = laneRef.current;
            if (entity.handled) continue;
            if (elapsed > entity.hitAt + MISS_WINDOW) {
              const nextTargetBeat = Math.min(
                track.totalBeats - 1,
                Math.max(entity.targetBeat + 2, nextBeatRef.current + 2),
              );
              const nextSpawnBeat = Math.max(
                0,
                Math.min(nextTargetBeat - 3, beatTimes.length - 1),
              );
              entity.targetBeat = nextTargetBeat;
              entity.spawnAt = Math.max(elapsed, beatTimes[nextSpawnBeat]);
              entity.hitAt = beatTimes[nextTargetBeat];
              entity.y = ROAD_HORIZON_Y;
            }
          }
          if (
            !entity.handled &&
            elapsed <= entity.hitAt + ENTITY_DESPAWN_AFTER_MS
          ) {
            nextEntities.push(entity);
          }
          continue;
        }

        if (entity.type === "fan") {
          const magnetDistance = Math.hypot(
            laneXAtDepth(entity.lane, roadDepthFromY(entity.y)) -
              busXRef.current,
            entity.y - PLAYER_Y,
          );
          if (
            !entity.handled &&
            elapsed < magnetUntilRef.current &&
            magnetDistance <= MAGNET_RADIUS
          ) {
            entity.handled = true;
            currentEntity.handled = true;
            comboRef.current += 1;
            maxComboRef.current = Math.max(
              maxComboRef.current,
              comboRef.current,
            );
            perfectCountRef.current += 1;
            successfulHitsRef.current += 1;
            setMaxCombo(maxComboRef.current);
            setSuccessfulHits(successfulHitsRef.current);
            const upgraded = checkVehicleUpgrade();
            fansRef.current += 1;
            setFans(fansRef.current);
            if (!upgraded) {
              showJudgement(
                "PERFECT",
                `MAGNET PERFECT · +1 知识 · ×${comboRef.current}`,
              );
            }
            const collectedX = laneXAtDepth(
              entity.lane,
              roadDepthFromY(entity.y),
            );
            addBurst(collectedX, entity.y, "#ffe66d", 24);
            addFloatText(
              collectedX,
              entity.y - 18,
              "PERFECT +1",
              "#ffe66d",
            );
            playPerfectHit();
            beatPulseRef.current = 1.45;
            collectFlashRef.current = 1;
            screenPunchRef.current = 0.75;
            triggerHaptic([14, 10, 20]);
            if (perfectCountRef.current % 8 === 0 && !shieldRef.current) {
              shieldRef.current = true;
              setShield(true);
              showToast("8 次 PERFECT！获得校园护盾", "gold");
            }
            continue;
          }
          if (!entity.handled && elapsed > entity.hitAt + MISS_WINDOW) {
            entity.handled = true;
            comboRef.current = 0;
            showJudgement("MISS", "节拍漏击 · COMBO BREAK");
            addFloatText(
              laneXAtDepth(entity.lane, roadDepthFromY(entity.y)),
              PLAYER_Y - 54,
              "MISS",
              "#ff526f",
            );
            hitFlashRef.current = 0.32;
          }
          if (
            !entity.handled &&
            elapsed <= entity.hitAt + ENTITY_DESPAWN_AFTER_MS
          ) {
            nextEntities.push(entity);
          }
          continue;
        }

        const colliding =
          !entity.handled &&
          entity.lane === laneRef.current &&
          entity.y > PLAYER_Y - OBSTACLE_COLLISION_BEFORE &&
          entity.y < PLAYER_Y + OBSTACLE_COLLISION_AFTER;

        if (!colliding) {
          if (
            !entity.handled &&
            elapsed <= entity.hitAt + ENTITY_DESPAWN_AFTER_MS
          ) {
            nextEntities.push(entity);
          }
          continue;
        }

        const x = laneXAtDepth(entity.lane, roadDepthFromY(entity.y));
        if (entity.type === "lucky") {
          entity.handled = true;
          currentEntity.handled = true;
          entitiesRef.current = entitiesRef.current.filter(
            (item) => item.id !== entity.id,
          );
          stopJoystick();
          statusRef.current = "lucky";
          setStatus("lucky");
          setLuckyDialog({ phase: "choice" });
          setNoteJudgement(null);
          songRef.current?.pause();
          void audioRef.current?.suspend();
          animationRef.current = null;
          return;
        } else if (entity.type === "magnet") {
          entity.handled = true;
          currentEntity.handled = true;
          magnetUntilRef.current = elapsed + POWERUP_DURATION_MS;
          setMagnetRemaining(POWERUP_DURATION_MS);
          collectFlashRef.current = 1.3;
          addBurst(x, PLAYER_Y - 10, "#72f1ff", 30);
          addFloatText(x, PLAYER_Y - 66, "磁铁 5 秒", "#72f1ff");
          showToast("获得磁铁！5 秒内附近知识自动 PERFECT", "cyan");
          navigator.vibrate?.([24, 15, 32]);
        } else if (entity.type === "invincible") {
          entity.handled = true;
          currentEntity.handled = true;
          invincibleUntilRef.current = elapsed + POWERUP_DURATION_MS;
          setInvincibleRemaining(POWERUP_DURATION_MS);
          collectFlashRef.current = 1.3;
          screenPunchRef.current = 1.1;
          addBurst(x, PLAYER_Y - 10, "#ffe66d", 34);
          addFloatText(x, PLAYER_Y - 66, "无敌 5 秒", "#ffe66d");
          showToast("元气闪电！5 秒内无视所有障碍", "gold");
          navigator.vibrate?.([30, 16, 45]);
        } else {
          entity.handled = true;
          if (elapsed < invincibleUntilRef.current) {
            addBurst(x, PLAYER_Y, "#ffe66d", 18);
            addFloatText(x, PLAYER_Y - 58, "无敌穿越!", "#ffe66d");
            screenPunchRef.current = 0.45;
            navigator.vibrate?.(16);
            continue;
          }
          if (now < invulnerableUntilRef.current) continue;
          invulnerableUntilRef.current = now + 720;
          const baseLoss =
            entity.obstacle === "barrier"
              ? 10
              : entity.obstacle === "pothole"
                ? 7
                : 4;
          const loss = shieldRef.current ? Math.ceil(baseLoss / 2) : baseLoss;
          if (shieldRef.current) {
            shieldRef.current = false;
            setShield(false);
            addFloatText(x, PLAYER_Y - 82, "护盾减伤", "#72f1ff");
          }
          const actualLoss = Math.min(fansRef.current, loss);
          fansRef.current -= actualLoss;
          comboRef.current = 0;
          setFans(fansRef.current);
          shakeRef.current = 0.34;
          hitFlashRef.current = 1;
          triggerHaptic(
            entity.obstacle === "barrier"
              ? [85, 35, 120]
              : entity.obstacle === "pothole"
                ? [65, 30, 95]
                : [45, 24, 70],
          );
          playObstacleImpact(entity.obstacle ?? "cone");
          triggerDamageVariation();
          addBurst(x, PLAYER_Y, "#ff375f", 17);
          addFloatText(x, PLAYER_Y - 58, `-${actualLoss} 知识`, "#ff526f");
          showToast(
            `知识 -${actualLoss} · 音色变${toneModeRef.current === "thick" ? "厚" : "细"} 8 拍`,
            "danger",
          );
        }
      }

      entitiesRef.current = nextEntities;

      const pedestrian = pedestrianRef.current;
      if (pedestrian) {
        const approachProgress = Math.max(
          0,
          Math.min(
            1,
            (elapsed - pedestrian.startAt) /
              Math.max(1, pedestrian.hitAt - pedestrian.startAt),
          ),
        );
        const departureProgress = Math.max(
          0,
          Math.min(
            1.1,
            (elapsed - pedestrian.hitAt) /
              Math.max(1, pedestrian.endAt - pedestrian.hitAt),
          ),
        );
        const pedestrianY =
          elapsed <= pedestrian.hitAt
            ? roadYFromProgress(approachProgress)
            : PLAYER_Y +
              (GAME_HEIGHT + 48 - PLAYER_Y) * departureProgress;
        const crossingProgress = Math.max(
          0,
          Math.min(
            1,
            (elapsed - pedestrian.startAt) /
              Math.max(1, pedestrian.endAt - pedestrian.startAt),
          ),
        );
        const pedestrianX = pedestrianXAtDepth(
          pedestrian.direction,
          crossingProgress,
          roadDepthFromY(pedestrianY),
        );
        pedestrianRef.current = {
          ...pedestrian,
          crossingProgress,
          x: pedestrianX,
          y: pedestrianY,
        };

        if (
          Math.abs(elapsed - pedestrian.hitAt) <=
            PEDESTRIAN_DANGER_WINDOW_MS &&
          Math.abs(pedestrianY - PLAYER_Y) < 56 &&
          Math.abs(pedestrianX - busXRef.current) <
            PEDESTRIAN_COLLISION_RADIUS
        ) {
          failGame();
          return;
        }
        if (pedestrianY >= GAME_HEIGHT || elapsed > pedestrian.endAt) {
          pedestrianRef.current = null;
        }
      }

      particlesRef.current = particlesRef.current
        .map((particle) => ({
          ...particle,
          x: particle.x + particle.vx * delta,
          y: particle.y + particle.vy * delta,
          vy: particle.vy + 115 * delta,
          life: particle.life - delta,
        }))
        .filter((item) => item.life > 0);

      floatTextRef.current = floatTextRef.current
        .map((item) => ({
          ...item,
          y: item.y - 38 * delta,
          life: item.life - delta,
        }))
        .filter((item) => item.life > 0);

      beatPulseRef.current = Math.max(0, beatPulseRef.current - delta * 4.6);
      shakeRef.current = Math.max(0, shakeRef.current - delta);
      hitFlashRef.current = Math.max(0, hitFlashRef.current - delta * 3.4);
      collectFlashRef.current = Math.max(
        0,
        collectFlashRef.current - delta * 5.8,
      );
      screenPunchRef.current = Math.max(0, screenPunchRef.current - delta * 7);

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (ctx) drawGame(ctx, elapsed);

      if (elapsed - lastHudRef.current > 100) {
        lastHudRef.current = elapsed;
        setMagnetRemaining(Math.max(0, magnetUntilRef.current - elapsed));
        setInvincibleRemaining(
          Math.max(0, invincibleUntilRef.current - elapsed),
        );
        setProgress(
          Math.min(100, (elapsed / beatTimes[track.totalBeats]) * 100),
        );
      }

      if (
        elapsed >= beatTimes[track.totalBeats] ||
        (songRef.current?.ended ?? false)
      ) {
        finishGame();
        return;
      }

      animationRef.current = window.requestAnimationFrame(gameLoopFrame);
    },
    [
      addBurst,
      addFloatText,
      checkVehicleUpgrade,
      drawGame,
      endTutorial,
      failGame,
      finishGame,
      playObstacleImpact,
      playPerfectHit,
      resetSongTone,
      showJudgement,
      showToast,
      spawnBeat,
      stopJoystick,
      triggerDamageVariation,
    ],
  );

  const hitNote = useCallback(() => {
    if (statusRef.current !== "playing") return;
    const inputAt = performance.now();
    if (inputAt - lastHitInputAtRef.current < HIT_INPUT_GUARD_MS) return;
    lastHitInputAtRef.current = inputAt;
    const elapsed =
      songRef.current && !songRef.current.paused
        ? songRef.current.currentTime * 1000
        : performance.now() - startTimeRef.current;

    if (tutorialActiveRef.current) {
      const tutorialCandidate = entitiesRef.current
        .filter(
          (entity) =>
            entity.tutorial &&
            entity.type === "fan" &&
            !entity.handled &&
            Math.abs(elapsed - entity.hitAt) <= MISS_WINDOW,
        )
        .sort(
          (first, second) =>
            Math.abs(elapsed - first.hitAt) - Math.abs(elapsed - second.hitAt),
        )[0];

      if (!tutorialCandidate) {
        showToast("等圆环收紧到星星时，再按 HIT", "gold");
        triggerHaptic(10);
        return;
      }

      tutorialCandidate.handled = true;
      tutorialHitRef.current = true;
      setTutorialHit(true);
      if (!tutorialMovedRef.current) setTutorialPhase("move");
      showJudgement("PERFECT", "练习成功 · 本次不计分");
      const x = laneCenter(laneRef.current);
      addBurst(x, PLAYER_Y - 22, "#ffe66d", 26);
      addFloatText(x, PLAYER_Y - 64, "节拍命中!", "#ffe66d");
      beatPulseRef.current = 1.65;
      collectFlashRef.current = 1;
      screenPunchRef.current = 0.8;
      playPerfectHit();
      triggerHaptic([18, 16, 28]);
      completeTutorialIfReady(elapsed);
      return;
    }

    const candidate = entitiesRef.current
      .filter(
        (entity) =>
          !entity.tutorial &&
          entity.type === "fan" &&
          !entity.handled &&
          entity.lane === laneRef.current &&
          Math.abs(elapsed - entity.hitAt) <= MISS_WINDOW,
      )
      .sort(
        (first, second) =>
          Math.abs(elapsed - first.hitAt) - Math.abs(elapsed - second.hitAt),
      )[0];

    if (!candidate) {
      if (elapsed < magnetUntilRef.current) {
        // The magnet already judges a fan when that entity is actually
        // absorbed. Empty HIT presses must not create extra PERFECT feedback.
        return;
      }
      comboRef.current = 0;
      showJudgement("MISS", "不在节拍点或车道错误");
      addFloatText(busXRef.current, PLAYER_Y - 72, "MISS", "#ff526f");
      hitFlashRef.current = 0.34;
      navigator.vibrate?.(12);
      return;
    }

    candidate.handled = true;
    const timingError = Math.abs(elapsed - candidate.hitAt);
    const quality: NoteJudgement["quality"] =
      timingError <= PERFECT_WINDOW
        ? "PERFECT"
        : timingError <= GREAT_WINDOW
          ? "GREAT"
          : "GOOD";
    comboRef.current += 1;
    maxComboRef.current = Math.max(maxComboRef.current, comboRef.current);
    if (quality === "PERFECT") perfectCountRef.current += 1;
    successfulHitsRef.current += 1;
    setSuccessfulHits(successfulHitsRef.current);
    const upgraded = checkVehicleUpgrade();
    fansRef.current += 1;
    setFans(fansRef.current);
    setMaxCombo(maxComboRef.current);
    if (!upgraded) {
      showJudgement(
        quality,
        `JUST HIT · +1 知识 · ×${comboRef.current}`,
      );
    }
    if (quality === "PERFECT") {
      playPerfectHit();
    } else {
      playFanHit(candidate.targetBeat);
    }

    const x = laneCenter(candidate.lane);
    addBurst(x, PLAYER_Y - 22, "#72f1ff", 28);
    if (quality === "PERFECT") addBurst(x, PLAYER_Y - 22, "#ffe66d", 20);
    addFloatText(
      x,
      PLAYER_Y - 64,
      quality === "PERFECT" ? "收到了! +1" : "+1 知识",
      quality === "PERFECT" ? "#ffe66d" : "#ffffff",
    );
    beatPulseRef.current = 1.65;
    collectFlashRef.current = 1;
    screenPunchRef.current = quality === "PERFECT" ? 1.2 : 0.72;
    triggerHaptic(quality === "PERFECT" ? [18, 16, 28] : 22);

    if (
      quality === "PERFECT" &&
      perfectCountRef.current % 8 === 0 &&
      !shieldRef.current
    ) {
      shieldRef.current = true;
      setShield(true);
      showToast("8 次 PERFECT！获得校园护盾", "gold");
    }
  }, [
    addBurst,
    addFloatText,
    checkVehicleUpgrade,
    completeTutorialIfReady,
    playFanHit,
    playPerfectHit,
    showJudgement,
    showToast,
  ]);

  const startGame = useCallback(async () => {
    if (!assetsReady) {
      showToast("图片资源仍在加载，请稍候", "pink");
      return;
    }
    const song = songRef.current;
    if (!songReady || !song) {
      showToast("歌曲仍在准备中，请稍候", "pink");
      return;
    }
    const shouldRunTutorial = !tutorialSeenThisSessionRef.current;
    triggerHaptic(1);
    stopJoystick();
    if (animationRef.current) {
      window.cancelAnimationFrame(animationRef.current);
    }

    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!audioRef.current || audioRef.current.state === "closed") {
      audioRef.current = AudioContextClass ? new AudioContextClass() : null;
      mediaSourceRef.current = null;
      lowShelfRef.current = null;
      highShelfRef.current = null;
    }
    const audio = audioRef.current;
    const songOrigin = new URL(song.src, window.location.href).origin;
    const isCrossOriginSong = songOrigin !== window.location.origin;
    if (audio && !mediaSourceRef.current && !isCrossOriginSong) {
      const mediaSource = audio.createMediaElementSource(song);
      const lowShelf = audio.createBiquadFilter();
      const highShelf = audio.createBiquadFilter();
      lowShelf.type = "lowshelf";
      lowShelf.frequency.value = 320;
      lowShelf.gain.value = 0;
      highShelf.type = "highshelf";
      highShelf.frequency.value = 1900;
      highShelf.gain.value = 0;
      mediaSource
        .connect(lowShelf)
        .connect(highShelf)
        .connect(audio.destination);
      mediaSourceRef.current = mediaSource;
      lowShelfRef.current = lowShelf;
      highShelfRef.current = highShelf;
    }

    trackRef.current = GAME_TRACK;
    beatTimesRef.current = [...PRECOMPUTED_CHART.timing.beatTimesMs];
    statusRef.current = "playing";
    setStatus("playing");
    setFailureSummary(null);
    laneRef.current = 2;
    busXRef.current = laneCenter(2);
    vehicleLevelRef.current = 1;
    fansRef.current = STARTING_FANS;
    comboRef.current = 0;
    maxComboRef.current = 0;
    beatRef.current = 0;
    nextBeatRef.current = 0;
    entityIdRef.current = 0;
    lastObstacleTargetBeatRef.current = -Infinity;
    tutorialActiveRef.current = shouldRunTutorial;
    tutorialMovedRef.current = false;
    tutorialHitRef.current = false;
    tutorialFinishAtRef.current = -1;
    entitiesRef.current = shouldRunTutorial
      ? [
          {
            id: entityIdRef.current++,
            type: "obstacle",
            obstacle: "cone",
            lane: 2,
            y: ROAD_HORIZON_Y,
            targetBeat: TUTORIAL_OBSTACLE_TARGET_BEAT,
            spawnAt:
              beatTimesRef.current[TUTORIAL_OBSTACLE_SPAWN_BEAT] ?? 500,
            hitAt:
              beatTimesRef.current[TUTORIAL_OBSTACLE_TARGET_BEAT] ?? 3_000,
            tutorial: true,
            handled: false,
          },
          {
            id: entityIdRef.current++,
            type: "fan",
            lane: 2,
            y: ROAD_HORIZON_Y,
            targetBeat: TUTORIAL_STAR_TARGET_BEAT,
            spawnAt:
              beatTimesRef.current[TUTORIAL_STAR_SPAWN_BEAT] ?? 3_000,
            hitAt:
              beatTimesRef.current[TUTORIAL_STAR_TARGET_BEAT] ?? 5_000,
            tutorial: true,
            handled: false,
          },
        ]
      : [];
    particlesRef.current = [];
    floatTextRef.current = [];
    pedestrianRef.current = null;
    shieldRef.current = false;
    perfectCountRef.current = 0;
    successfulHitsRef.current = 0;
    magnetUntilRef.current = -1;
    magnetQuotaRef.current =
      Math.random() < SECOND_MAGNET_CHANCE ? 2 : 1;
    magnetSpawnedRef.current = 0;
    invincibleUntilRef.current = -1;
    grannyWarnedBeatsRef.current.clear();
    invulnerableUntilRef.current = 0;
    lastHitInputAtRef.current = -Infinity;
    beatPulseRef.current = 0;
    shakeRef.current = 0;
    hitFlashRef.current = 0;
    collectFlashRef.current = 0;
    screenPunchRef.current = 0;
    fallbackElapsedRef.current = 0;
    setFans(STARTING_FANS);
    setVehicleLevel(1);
    setMaxCombo(0);
    setSuccessfulHits(0);
    setMagnetRemaining(0);
    setInvincibleRemaining(0);
    setProgress(0);
    setShield(false);
    setToast(null);
    setNoteJudgement(null);
    setLuckyDialog(null);
    setShareCardOpen(false);
    setShareBusy(false);
    setTutorialPhase(shouldRunTutorial ? "move" : null);
    setTutorialMoved(false);
    setTutorialHit(false);
    resetSongTone();

    song.pause();
    song.currentTime = 0;
    song.playbackRate = 1;
    song.muted = mutedRef.current;
    const resumePromise = audio?.resume() ?? Promise.resolve();
    const playPromise = song.play();
    try {
      await Promise.all([resumePromise, playPromise]);
    } catch {
      song.pause();
      song.muted = true;
      mutedRef.current = true;
      setMuted(true);
      setSongError("主题曲暂时无法播放，已自动切换到静音节奏模式");
      showToast("主题曲暂时无法播放 · 已启用静音节奏模式", "gold");
    }
    if (statusRef.current !== "playing") return;
    const now = performance.now();
    startTimeRef.current = now;
    lastTimeRef.current = now;
    lastHudRef.current = 0;
    animationRef.current = window.requestAnimationFrame(gameLoop);
  }, [
    assetsReady,
    gameLoop,
    resetSongTone,
    showToast,
    songReady,
    stopJoystick,
  ]);

  const pauseGame = useCallback(() => {
    if (statusRef.current !== "playing") return;
    statusRef.current = "paused";
    setStatus("paused");
    stopJoystick();
    if (animationRef.current) {
      window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    songRef.current?.pause();
    void audioRef.current?.suspend();
    setNoteJudgement(null);
  }, [stopJoystick]);

  const resumeGame = useCallback(async () => {
    if (statusRef.current !== "paused" || !songRef.current) return;
    const song = songRef.current;
    statusRef.current = "playing";
    setStatus("playing");
    const resumePromise = audioRef.current?.resume() ?? Promise.resolve();
    const playPromise = song.play();
    try {
      await Promise.all([resumePromise, playPromise]);
    } catch {
      song.pause();
      song.muted = true;
      mutedRef.current = true;
      setMuted(true);
      showToast("主题曲暂时无法继续 · 已启用静音节奏模式", "gold");
    }
    if (statusRef.current !== "playing") return;
    const now = performance.now();
    startTimeRef.current = now - fallbackElapsedRef.current;
    lastTimeRef.current = now;
    animationRef.current = window.requestAnimationFrame(gameLoop);
  }, [gameLoop, showToast]);

  const openLuckyBag = useCallback(() => {
    if (
      statusRef.current !== "lucky" ||
      !luckyDialog ||
      luckyDialog.phase !== "choice"
    ) {
      return;
    }

    const before = fansRef.current;
    const doubled = Math.random() < 0.55;
    if (doubled) {
      fansRef.current = before * 2;
      addFloatText(
        busXRef.current,
        PLAYER_Y - 64,
        "知识 ×2!",
        "#ffe66d",
      );
      addBurst(busXRef.current, PLAYER_Y - 10, "#ffe66d", 28);
      collectFlashRef.current = 1.4;
      screenPunchRef.current = 1.1;
      setLuckyDialog({
        phase: "result",
        outcome: "double",
        before,
        after: fansRef.current,
      });
      navigator.vibrate?.([24, 18, 38]);
    } else {
      fansRef.current = Math.max(1, Math.floor(before / 2));
      comboRef.current = 0;
      addFloatText(busXRef.current, PLAYER_Y - 64, "知识 ÷2", "#ff7ac8");
      addBurst(busXRef.current, PLAYER_Y - 10, "#ff7ac8", 22);
      hitFlashRef.current = 0.7;
      shakeRef.current = 0.22;
      setLuckyDialog({
        phase: "result",
        outcome: "half",
        before,
        after: fansRef.current,
      });
      navigator.vibrate?.([45, 25, 45]);
    }
    setFans(fansRef.current);
  }, [addBurst, addFloatText, luckyDialog]);

  const continueLuckyGame = useCallback(async () => {
    if (statusRef.current !== "lucky" || !songRef.current) return;
    const song = songRef.current;
    statusRef.current = "playing";
    setStatus("playing");
    setLuckyDialog(null);
    const resumePromise = audioRef.current?.resume() ?? Promise.resolve();
    const playPromise = song.play();
    try {
      await Promise.all([resumePromise, playPromise]);
    } catch {
      song.pause();
      song.muted = true;
      mutedRef.current = true;
      setMuted(true);
      showToast("主题曲暂时无法继续 · 已启用静音节奏模式", "gold");
    }
    if (statusRef.current !== "playing") return;
    const now = performance.now();
    startTimeRef.current = now - fallbackElapsedRef.current;
    lastTimeRef.current = now;
    animationRef.current = window.requestAnimationFrame(gameLoop);
  }, [gameLoop, showToast]);

  const move = useCallback(
    (direction: -1 | 1) => {
      if (statusRef.current !== "playing") return;
      const nextLane = clampLane(laneRef.current + direction);
      if (nextLane === laneRef.current) return;
      laneRef.current = nextLane;
      addBurst(laneCenter(nextLane), PLAYER_Y + 32, "#72f1ff", 4);
      if (tutorialActiveRef.current && !tutorialMovedRef.current) {
        tutorialMovedRef.current = true;
        setTutorialMoved(true);
        if (!tutorialHitRef.current) setTutorialPhase("hit");
        completeTutorialIfReady(fallbackElapsedRef.current);
      }
    },
    [addBurst, completeTutorialIfReady],
  );

  const steerWithJoystick = useCallback(
    (direction: -1 | 0 | 1) => {
      if (
        direction === joystickDirectionRef.current ||
        statusRef.current !== "playing"
      ) {
        return;
      }
      if (joystickFrameRef.current !== null) {
        window.cancelAnimationFrame(joystickFrameRef.current);
        joystickFrameRef.current = null;
      }
      joystickDirectionRef.current = direction;
      if (direction === 0) return;

      move(direction);
      joystickNextMoveAtRef.current =
        performance.now() + JOYSTICK_FIRST_REPEAT_MS;

      const continueSteering = (now: number) => {
        if (
          joystickDirectionRef.current !== direction ||
          joystickPointerRef.current === null ||
          statusRef.current !== "playing"
        ) {
          joystickFrameRef.current = null;
          return;
        }
        if (now >= joystickNextMoveAtRef.current) {
          move(direction);
          joystickNextMoveAtRef.current = now + JOYSTICK_REPEAT_MS;
        }
        joystickFrameRef.current =
          window.requestAnimationFrame(continueSteering);
      };
      joystickFrameRef.current =
        window.requestAnimationFrame(continueSteering);
    },
    [move],
  );

  const updateJoystick = useCallback(
    (clientX: number, target: HTMLElement) => {
      const bounds = target.getBoundingClientRect();
      const rawOffset = clientX - (bounds.left + bounds.width / 2);
      const maxTravel = Math.max(36, (bounds.width - 64) / 2 - 7);
      const deadZone = Math.max(12, maxTravel * 0.24);
      const nextOffset = Math.max(-maxTravel, Math.min(maxTravel, rawOffset));
      setJoystickOffset(nextOffset);
      steerWithJoystick(
        nextOffset < -deadZone ? -1 : nextOffset > deadZone ? 1 : 0,
      );
    },
    [steerWithJoystick],
  );

  const returnToStart = useCallback(() => {
    if (animationRef.current) {
      window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (songRef.current) {
      songRef.current.pause();
      songRef.current.currentTime = 0;
    }
    resetSongTone();
    statusRef.current = "ready";
    setStatus("ready");
    setReadyPage("home");
    laneRef.current = 2;
    busXRef.current = laneCenter(2);
    vehicleLevelRef.current = 1;
    fansRef.current = STARTING_FANS;
    comboRef.current = 0;
    maxComboRef.current = 0;
    successfulHitsRef.current = 0;
    perfectCountRef.current = 0;
    lastHitInputAtRef.current = -Infinity;
    shieldRef.current = false;
    magnetUntilRef.current = -1;
    magnetQuotaRef.current = 1;
    magnetSpawnedRef.current = 0;
    invincibleUntilRef.current = -1;
    setVehicleLevel(1);
    setFans(STARTING_FANS);
    setMaxCombo(0);
    setSuccessfulHits(0);
    setMagnetRemaining(0);
    setInvincibleRemaining(0);
    setShield(false);
    setProgress(0);
    setToast(null);
    setNoteJudgement(null);
    setLuckyDialog(null);
    setShareCardOpen(false);
    setShareBusy(false);
    setFailureSummary(null);
    tutorialActiveRef.current = false;
    tutorialMovedRef.current = false;
    tutorialHitRef.current = false;
    tutorialFinishAtRef.current = -1;
    setTutorialPhase(null);
    setTutorialMoved(false);
    setTutorialHit(false);
    swipeStartRef.current = null;
    entitiesRef.current = [];
    lastObstacleTargetBeatRef.current = -Infinity;
    pedestrianRef.current = null;
    stopJoystick();
  }, [resetSongTone, stopJoystick]);

  const toggleMute = useCallback(() => {
    mutedRef.current = !mutedRef.current;
    if (songRef.current) songRef.current.muted = mutedRef.current;
    setMuted(mutedRef.current);
  }, []);

  useEffect(() => {
    void loadFixedSong();
  }, [loadFixedSong]);

  useEffect(() => {
    const savedBest = Number(window.localStorage.getItem("fan-bus-best") || 0);
    const savedCoins = Number(
      window.localStorage.getItem("fan-bus-coins") || 0,
    );
    window.localStorage.removeItem("fan-bus-vehicle-level");
    const savedScoreTimer = window.setTimeout(() => {
      setBestFans(savedBest);
      setBankCoins(savedCoins);
      vehicleLevelRef.current = 1;
      setVehicleLevel(1);
    }, 0);

    const keydown = (event: KeyboardEvent) => {
      if (
        [
          "ArrowLeft",
          "ArrowRight",
          " ",
          "a",
          "A",
          "d",
          "D",
          "p",
          "P",
          "Escape",
        ].includes(event.key)
      ) {
        event.preventDefault();
      }
      const isPauseKey =
        event.key === "p" || event.key === "P" || event.key === "Escape";
      if (event.repeat && (event.key === " " || isPauseKey)) return;
      if (isPauseKey && statusRef.current === "playing") {
        pauseGame();
      } else if (isPauseKey && statusRef.current === "paused") {
        void resumeGame();
      } else if (
        event.key === "ArrowLeft" ||
        event.key === "a" ||
        event.key === "A"
      ) {
        move(-1);
      } else if (
        event.key === "ArrowRight" ||
        event.key === "d" ||
        event.key === "D"
      ) {
        move(1);
      } else if (event.key === "m" || event.key === "M") {
        toggleMute();
      } else if (event.key === " " && statusRef.current === "playing") {
        hitNote();
      } else if (
        event.key === " " &&
        ["ready", "finished", "failed"].includes(statusRef.current)
      ) {
        void startGame();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => {
      window.clearTimeout(savedScoreTimer);
      window.removeEventListener("keydown", keydown);
    };
  }, [hitNote, move, pauseGame, resumeGame, startGame, toggleMute]);

  useEffect(() => {
    let cancelled = false;
    let completed = 0;
    setAssetsReady(false);
    setAssetsLoading(true);
    setAssetsProgress(0);
    setAssetsError("");

    Promise.all(
      REQUIRED_IMAGE_URLS.map((src) =>
        loadBrowserImage(src).then((image) => {
          completed += 1;
          if (!cancelled) {
            setAssetsProgress(
              Math.round((completed / REQUIRED_IMAGE_URLS.length) * 100),
            );
          }
          return image;
        }),
      ),
    )
      .then((loadedImages) => {
        if (cancelled) return;
        const imagesByUrl = new Map(
          REQUIRED_IMAGE_URLS.map((src, index) => [src, loadedImages[index]]),
        );
        for (const [key, src] of Object.entries(CAMPUS_ASSETS) as Array<
          [CampusAsset, string]
        >) {
          const image = imagesByUrl.get(src);
          if (image) campusImagesRef.current[key] = image;
        }
        setAssetsProgress(100);
        setAssetsReady(true);
        setAssetsLoading(false);
        const context = canvasRef.current?.getContext("2d");
        if (context && statusRef.current !== "playing") drawGame(context, 0);
      })
      .catch((error) => {
        if (cancelled) return;
        setAssetsReady(false);
        setAssetsLoading(false);
        setAssetsError(
          error instanceof Error
            ? error.message
            : "图片资源加载失败，请重新加载",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [assetsReloadKey, drawGame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx) drawGame(ctx, 0);
    return () => {
      if (animationRef.current) {
        window.cancelAnimationFrame(animationRef.current);
      }
      if (audioRef.current) {
        void audioRef.current.close();
        audioRef.current = null;
      }
      mediaSourceRef.current = null;
      lowShelfRef.current = null;
      highShelfRef.current = null;
      if (songRef.current) {
        songRef.current.pause();
        songRef.current = null;
      }
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
      if (judgementTimerRef.current) {
        window.clearTimeout(judgementTimerRef.current);
      }
      stopJoystick();
    };
  }, [drawGame, stopJoystick]);

  useEffect(() => {
    if (status !== "playing") stopJoystick();
  }, [status, stopJoystick]);

  const isHomePage = status === "ready" && readyPage === "home";
  const isRulesPage = status === "ready" && readyPage === "rules";

  return (
    <main
      className={`arcade-page ${isHomePage ? "is-home-page" : ""} ${
        isRulesPage ? "is-rules-page" : ""
      }`}
    >
      <div className="sky-grid" aria-hidden="true" />
      {isHomePage ? (
        <section className="home-screen" aria-labelledby="home-title">
          <div className="home-glow home-glow-pink" aria-hidden="true" />
          <div className="home-glow home-glow-cyan" aria-hidden="true" />

          <header className="home-nav">
            <div className="home-mark" aria-label="开学冲冲冲">
              <img src={UI_ICONS.pencil} alt="" aria-hidden="true" />
              <div>
                <small>BACK TO SCHOOL</small>
                <strong>RHYTHM RUSH</strong>
              </div>
            </div>
            <div className="home-records" aria-label="游戏记录">
              <span>
                <small>BEST</small>
                <strong>{bestFans}</strong> 知识
              </span>
              <i aria-hidden="true" />
              <span>
                <small>BANK</small>
                <strong>{bankCoins}</strong> 活力币
              </span>
              <button
                className={`home-sound-button ${muted ? "is-muted" : ""}`}
                onClick={toggleMute}
                aria-label={muted ? "打开声音" : "关闭声音"}
                aria-pressed={!muted}
              >
                {muted ? "SOUND OFF" : "SOUND ON"}
              </button>
            </div>
          </header>

          <div className="home-hero">
            <div className="home-copy">
              <p className="home-eyebrow">
                <span>OPENING SEASON</span>
                <i aria-hidden="true" />
                踩准节拍，有用的知识+1+1+1
              </p>
              <h1 id="home-title">
                <span>开学季</span>
                <strong>冲冲冲！</strong>
              </h1>
              <p className="home-lead">
                跟着歌曲节拍收集知识，解锁你的新学期隐藏人设
              </p>
              <div className="home-actions">
                <button
                  className="home-start-button"
                  onClick={() => {
                    if (assetsError) {
                      setAssetsReloadKey((value) => value + 1);
                      return;
                    }
                    if (!assetsReady) return;
                    if (songReady) void startGame();
                    else void loadFixedSong();
                  }}
                  disabled={assetsLoading || songLoading}
                  autoFocus
                >
                  <span>
                    {assetsLoading
                      ? `资源加载中 ${assetsProgress}%`
                      : assetsError
                        ? "重新加载资源"
                        : songLoading
                      ? "音乐加载中…"
                      : songReady
                        ? "走进校园"
                        : "重新加载音乐"}
                  </span>
                  <img
                    className="home-play-icon"
                    src={UI_ICONS.play}
                    alt=""
                    aria-hidden="true"
                  />
                </button>
                <button
                  className="home-rules-button"
                  onClick={() => setReadyPage("rules")}
                >
                  查看玩法
                </button>
              </div>
              {assetsError && (
                <p className="home-song-status">{assetsError}</p>
              )}
              {songError && <p className="home-song-status">{songError}</p>}
              <p className="home-key-hint">
                <kbd>SPACE</kbd>
                <span>也可快速开始</span>
              </p>
            </div>

            <div className="home-visual" aria-hidden="true">
              <div className="home-art">
                <span className="home-live-badge">
                  <i />
                  CAMPUS OPEN
                </span>
                <div className="home-art-stats">
                  <span>
                    <small>MISSION</small>
                    收集沿途知识
                  </span>
                  <b>→</b>
                  <span>
                    <small>DESTINATION</small>
                    解锁隐藏学霸称号
                  </span>
                </div>
              </div>
              <div className="home-track-card">
                <div>
                  <small>FEATURED TRACK</small>
                  <strong>恭喜你发现了宝藏</strong>
                  <em>TF家族 · 开学季主题曲</em>
                </div>
                <span className="home-equalizer">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            </div>
          </div>

          <footer className="home-footer">
            <span>← → / A D 换道</span>
            <i />
            <span>SPACE 击打节拍</span>
            <i />
            <span>礼让行人 · 安全到校</span>
          </footer>
        </section>
      ) : (
        <>
      <header className="topbar">
        <div className="brand">
          <span className="brand-kicker">
            <small>CAMPUS RUSH</small>
            <strong>
              开学季<i>GO</i>
            </strong>
          </span>
          <span className="brand-title">
            <span>开学季</span>
            <em>冲冲冲！</em>
          </span>
        </div>
        <div className="meta-strip" aria-label="游戏记录">
          <span>
            <small>BEST</small>
            {bestFans} 知识
          </span>
          <span>
            <small>ENERGY</small>
            <b className="coin-dot">●</b> {bankCoins}
          </span>
          <button
            className={`sound-button ${muted ? "is-muted" : ""}`}
            onClick={toggleMute}
            aria-label={muted ? "打开声音" : "关闭声音"}
          >
            {muted ? "SOUND OFF" : "SOUND ON"}
          </button>
        </div>
      </header>

      <section className="game-layout">
        <div className="game-cabinet">
          <div className="cabinet-top">
            <div>
              <span className="live-dot" />
              {status === "playing" || status === "paused" || status === "lucky"
                ? "游戏BGM《恭喜你发现了宝藏》——TF家族"
                : readyPage === "rules"
                  ? "查看玩法"
                  : "READY TO GO"}
            </div>
            <div className="cabinet-tools">
              <button
                className={`pause-toggle ${status === "paused" ? "is-paused" : ""}`}
                onClick={() =>
                  status === "paused" ? void resumeGame() : pauseGame()
                }
                disabled={status !== "playing" && status !== "paused"}
                aria-label={status === "paused" ? "继续游戏" : "暂停游戏"}
                aria-pressed={status === "paused"}
              >
                <img
                  src={status === "paused" ? UI_ICONS.play : UI_ICONS.pause}
                  alt=""
                  aria-hidden="true"
                />
                {status === "paused" ? "CONTINUE" : "PAUSE"}
              </button>
              <div className="bpm-bars" aria-hidden="true">
                {[0, 1, 2, 3].map((bar) => (
                  <i
                    key={bar}
                    className={
                      beatIndex % 4 === bar && status === "playing"
                        ? "active"
                        : ""
                    }
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="hud">
            <div className="hud-block">
              <span>知识</span>
              <strong className="fans-count">
                {String(fans).padStart(3, "0")}
              </strong>
            </div>
            <div className="hud-block combo-block">
              <span>最高连击</span>
              <strong>×{maxCombo}</strong>
            </div>
            <div className="vehicle-run-card" aria-label="当前车辆升级任务">
              <div className="vehicle-level-badge">
                <small>RIDE</small>
                <strong>LV.{currentVehicle.level}</strong>
              </div>
              <div className="vehicle-task-copy">
                <strong>
                  {currentVehicleName}
                </strong>
                <small>{currentVehicle.task}</small>
              </div>
              <div
                className="vehicle-task-meter"
                aria-label={`升级任务进度 ${vehicleTaskProgress}%`}
              >
                <span style={{ width: `${vehicleTaskProgress}%` }} />
                <b>
                  {currentVehicle.requirement ? `${vehicleTaskProgress}%` : "MAX"}
                </b>
              </div>
            </div>
            <div
              className={`music-state ${toneMode !== "normal" ? `is-variation is-${toneMode}` : ""}`}
            >
              <strong>跟随节拍</strong>
              <span>
                {status === "lucky"
                  ? "锦囊选择中"
                  : status === "paused"
                    ? "已暂停"
                    : toneMode !== "normal"
                      ? `${toneMode === "thick" ? "厚" : "细"}音色中`
                      : shield
                        ? "护盾已就绪"
                        : "按 HIT 收集"}
              </span>
            </div>
          </div>

          <div
            className="progress-track"
            aria-label={`校园进度 ${Math.round(progress)}%`}
          >
            <span style={{ width: `${progress}%` }} />
          </div>

          <div className="game-screen">
            <canvas
              ref={canvasRef}
              className={
                selectedAssetThemeClass ? "is-handdrawn-theme" : undefined
              }
              width={GAME_WIDTH}
              height={GAME_HEIGHT}
              aria-label="五车道节奏躲避游戏画面"
              aria-describedby={tutorialPhase ? "tutorial-instruction" : undefined}
              onPointerDown={(event) => {
                if (statusRef.current !== "playing") return;
                swipeStartRef.current = {
                  pointerId: event.pointerId,
                  x: event.clientX,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerUp={(event) => {
                const swipeStart = swipeStartRef.current;
                swipeStartRef.current = null;
                if (!swipeStart || swipeStart.pointerId !== event.pointerId) {
                  return;
                }
                const distance = event.clientX - swipeStart.x;
                if (Math.abs(distance) >= SWIPE_MOVE_THRESHOLD_PX) {
                  event.preventDefault();
                  move(distance < 0 ? -1 : 1);
                }
              }}
              onPointerCancel={() => {
                swipeStartRef.current = null;
              }}
            />

            {(magnetRemaining > 0 || invincibleRemaining > 0) && (
              <div className="powerup-hud" aria-live="polite">
                {magnetRemaining > 0 && (
                  <div className="powerup-chip is-magnet">
                    <img src={CAMPUS_ASSETS.magnet} alt="" aria-hidden="true" />
                    <span>
                      <small>校园磁铁</small>
                      <strong>{(magnetRemaining / 1000).toFixed(1)}s</strong>
                    </span>
                    <b>
                      <i
                        style={{
                          width: `${Math.min(
                            100,
                            (magnetRemaining / POWERUP_DURATION_MS) * 100,
                          )}%`,
                        }}
                      />
                    </b>
                  </div>
                )}
                {invincibleRemaining > 0 && (
                  <div className="powerup-chip is-invincible">
                    <img
                      src={CAMPUS_ASSETS.lightning}
                      alt=""
                      aria-hidden="true"
                    />
                    <span>
                      <small>元气闪电</small>
                      <strong>
                        {(invincibleRemaining / 1000).toFixed(1)}s
                      </strong>
                    </span>
                    <b>
                      <i
                        style={{
                          width: `${Math.min(
                            100,
                            (invincibleRemaining / POWERUP_DURATION_MS) * 100,
                          )}%`,
                        }}
                      />
                    </b>
                  </div>
                )}
              </div>
            )}

            {toast && (
              <div
                key={`toast-${toast.key}`}
                className={`game-toast tone-${toast.tone}`}
              >
                {toast.text}
              </div>
            )}

            {noteJudgement && (
              <div
                key={`judgement-${noteJudgement.key}`}
                className={`note-judgement quality-${noteJudgement.quality.toLowerCase()}`}
                aria-live="polite"
              >
                <strong>{noteJudgement.quality}</strong>
                <span>{noteJudgement.detail}</span>
              </div>
            )}

            {status === "playing" && tutorialPhase && (
              <div
                className={`tutorial-guide is-${tutorialPhase}`}
                aria-live="polite"
              >
                <div className="tutorial-guide-top">
                  <div>
                    <small>NEW PLAYER GUIDE / 练习不计分</small>
                    <strong>请先完成新手操作</strong>
                  </div>
                  <button type="button" onClick={endTutorial}>
                    跳过
                  </button>
                </div>

                <div className="tutorial-coach-card" id="tutorial-instruction">
                  <span aria-hidden="true">
                    {tutorialPhase === "move"
                      ? "← →"
                      : tutorialPhase === "hit"
                        ? "HIT"
                        : "✓"}
                  </span>
                  <div>
                    <small>
                      {tutorialPhase === "move"
                        ? "STEP 1 / 躲避"
                        : tutorialPhase === "hit"
                          ? "STEP 2 / 收集"
                          : "READY"}
                    </small>
                    <strong>
                      {tutorialPhase === "move"
                        ? "按住下方摇杆并向左右拖动，持续移动小车躲开障碍"
                        : tutorialPhase === "hit"
                          ? "星星圆环重合时，立即按右下角 HIT"
                          : "开始！"}
                    </strong>
                  </div>
                </div>

                <div className="tutorial-step-status" aria-label="新手练习进度">
                  <span className={tutorialMoved ? "is-done" : "is-current"}>
                    <i>{tutorialMoved ? "✓" : "1"}</i>
                    左右移动
                  </span>
                  <b aria-hidden="true" />
                  <span
                    className={
                      tutorialHit
                        ? "is-done"
                        : tutorialMoved
                          ? "is-current"
                          : ""
                    }
                  >
                    <i>{tutorialHit ? "✓" : "2"}</i>
                    合拍 HIT
                  </span>
                </div>
                <p>完成高亮操作后才会进入正式挑战</p>
              </div>
            )}

            {status === "ready" && readyPage === "rules" && (
              <div className="game-overlay rules-overlay">
                <p className="overlay-kicker">
                  FIRST DAY / CAMPUS CALL
                </p>
                <img
                  className="rules-logo"
                  src={UI_ICONS.pencil}
                  alt=""
                  aria-hidden="true"
                />
                <h1 className="story-title">
                  <span>查看玩法</span>
                </h1>
                <p className="rules-lead">
                  跟着歌曲节拍收集知识，左右换道躲开障碍，安全抵达校园。
                </p>
                <div className="rules-grid story-route" aria-label="校园路线">
                  <div>
                    <b>01</b>
                    <span>
                      <strong>升级开学载具</strong>
                      从0开始收集知识，自行车也可以升级成校车
                    </span>
                  </div>
                  <div>
                    <b>02</b>
                    <span>
                      <strong>疯狂汲取知识</strong>
                      跟着歌曲节拍按<em>HIT</em>，命中1次知识+1
                    </span>
                  </div>
                  <div>
                    <b>03</b>
                    <span>
                      <strong>解锁隐藏人设</strong>
                      知识数量x最高连击次数=你的新学期人设
                    </span>
                  </div>
                </div>
                <div className="story-mission">
                  <strong>安全提示</strong>
                  <small>看到斑马线提示请提前换道，礼让正在过马路的行人。</small>
                </div>
                <button
                  className="primary-button rules-start-button"
                  onClick={() =>
                    songReady ? void startGame() : void loadFixedSong()
                  }
                  disabled={songLoading}
                >
                  <img src={UI_ICONS.play} alt="" aria-hidden="true" />
                  {songLoading ? "音乐加载中…" : "开始游戏"}
                </button>
              </div>
            )}

            {status === "paused" && (
              <div className="game-overlay pause-overlay">
                <p className="overlay-kicker">CAMPUS PAUSED</p>
                <img
                  className="pause-icon"
                  src={UI_ICONS.pause}
                  alt=""
                  aria-hidden="true"
                />
                <h2>校园旅程暂停</h2>
                <p>
                  主题曲和校园旅程已暂停。
                  <br />
                  继续后从当前位置接着出发。
                </p>
                <div className="result-actions pause-actions">
                  <button
                    className="primary-button"
                    onClick={() => void resumeGame()}
                  >
                    <img src={UI_ICONS.play} alt="" aria-hidden="true" />
                    继续游戏
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => void startGame()}
                  >
                    <img src={UI_ICONS.restart} alt="" aria-hidden="true" />
                    重新开局
                  </button>
                  <button
                    className="secondary-button"
                    onClick={returnToStart}
                  >
                    返回首页
                  </button>
                </div>
                <small className="pause-hint">P / ESC 继续</small>
              </div>
            )}

            {status === "lucky" && luckyDialog && (
              <div
                className={`game-overlay lucky-overlay ${
                  luckyDialog.phase === "result"
                    ? `is-${luckyDialog.outcome}`
                    : ""
                }`}
                role="dialog"
                aria-modal="true"
                aria-live="assertive"
                aria-label={
                  luckyDialog.phase === "choice"
                    ? "是否开启锦囊"
                    : "锦囊开启结果"
                }
              >
                <p className="overlay-kicker">
                  {luckyDialog.phase === "choice"
                    ? "MYSTERY BAG"
                    : "MYSTERY REVEALED"}
                </p>
                <img
                  className="lucky-dialog-icon"
                  src={CAMPUS_ASSETS.mysterySchoolbag}
                  alt=""
                  aria-hidden="true"
                />

                {luckyDialog.phase === "choice" ? (
                  <>
                    <h2>是否开启锦囊？</h2>
                    <p className="lucky-dialog-copy">
                      开启后可能让知识翻倍，也可能直接减少一半。
                      <br />
                      不开启则不会改变当前知识数量。
                    </p>
                    <div className="lucky-risk-row" aria-label="锦囊可能结果">
                      <div className="lucky-risk-card is-good">
                        <small>GOOD LUCK</small>
                        <strong>
                          <i>↑</i>
                          <span>知识</span>
                          <b>×2</b>
                        </strong>
                        <em>知识数量直接翻倍，不设上限</em>
                      </div>
                      <div className="lucky-risk-random" aria-hidden="true">
                        <b>?</b>
                        <small>随机</small>
                      </div>
                      <div className="lucky-risk-card is-risk">
                        <small>RISK</small>
                        <strong>
                          <i>↓</i>
                          <span>知识</span>
                          <b>÷2</b>
                        </strong>
                        <em>知识减半并中断连击</em>
                      </div>
                    </div>
                    <div className="result-actions lucky-actions">
                      <button className="primary-button" onClick={openLuckyBag}>
                        开启锦囊
                      </button>
                      <button
                        className="secondary-button"
                        onClick={() => void continueLuckyGame()}
                      >
                        暂不开启
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h2>
                      {luckyDialog.outcome === "double"
                        ? "好运翻倍！"
                        : "锦囊反转…"}
                    </h2>
                    <p className="lucky-result-label">
                      {luckyDialog.outcome === "double"
                        ? "知识数量成功翻倍"
                        : "知识数量减少一半，连击已中断"}
                    </p>
                    <div className="lucky-result-numbers">
                      <span>{luckyDialog.before}</span>
                      <i>→</i>
                      <strong>{luckyDialog.after}</strong>
                    </div>
                    <button
                      className="primary-button"
                      onClick={() => void continueLuckyGame()}
                    >
                      确认并继续
                    </button>
                  </>
                )}
              </div>
            )}

            {status === "finished" && (
              <div className="game-overlay result-overlay">
                <p className="overlay-kicker">CAMPUS COMPLETE</p>
                <img
                  className="stage-icon"
                  src={resultTier.iconSrc}
                  alt=""
                  aria-hidden="true"
                />
                <p className="result-label">本次开学人设</p>
                <h2>{resultTier.name}</h2>
                <p className="result-place">
                  {songTitle} · {resultTier.place}
                </p>
                <div className="result-stats">
                  <div>
                    <small>知识</small>
                    <strong>{fans}</strong>
                  </div>
                  <div>
                    <small>最高连击</small>
                    <strong>×{maxCombo}</strong>
                  </div>
                  <div>
                    <small>活力币</small>
                    <strong className="gold-text">+{earnedCoins}</strong>
                  </div>
                </div>
                <p className="concert-score">
                  校园积分 <strong>{fans}</strong> 知识 ×{" "}
                  <strong>{maxCombo}</strong> 连击 = <b>{fans * maxCombo}</b>
                </p>
                <p className="coin-formula">
                  称号奖励 {resultTier.coins} + 合拍奖励 {maxCombo * 3}
                </p>
                <button
                  className="share-result-button"
                  onClick={() => setShareCardOpen(true)}
                >
                  <img src={UI_ICONS.star} alt="" aria-hidden="true" />
                  <strong>分享开学人设</strong>
                  <small>分享歌曲、得分与新学期人设</small>
                </button>
                <div className="result-actions">
                  <button
                    className="primary-button"
                    onClick={() => void startGame()}
                  >
                    <img src={UI_ICONS.restart} alt="" aria-hidden="true" />
                    再跑一场
                  </button>
                  <button
                    className="secondary-button"
                    onClick={returnToStart}
                  >
                    返回首页
                  </button>
                </div>

                {shareCardOpen && (
                  <div
                    className="share-card-backdrop"
                    role="dialog"
                    aria-modal="true"
                    aria-label="开学人设分享卡"
                    onPointerDown={(event) => {
                      if (event.target === event.currentTarget && !shareBusy) {
                        closeShareCard();
                      }
                    }}
                  >
                    <section className="share-card-shell">
                      <button
                        className="share-card-close"
                        onClick={closeShareCard}
                        aria-label="关闭成绩卡"
                        disabled={shareBusy}
                      >
                        <img src={UI_ICONS.close} alt="" aria-hidden="true" />
                      </button>
                      <article className="share-result-card">
                        <div className="share-card-topline">
                          CAMPUS RESULT <i />
                        </div>
                        <div className="share-card-brand">
                          <img src={UI_ICONS.star} alt="" aria-hidden="true" />
                          <div>
                            <small>BACK TO SCHOOL RHYTHM RUSH</small>
                            <strong>开学冲冲冲！</strong>
                          </div>
                        </div>
                        <div className="share-card-venue">
                          <img
                            src={resultTier.iconSrc}
                            alt=""
                            aria-hidden="true"
                          />
                          <div>
                            <small>本次解锁</small>
                            <strong>{resultTier.name}</strong>
                          </div>
                        </div>
                        <div className="share-card-score">
                          <small>KNOWLEDGE SCORE</small>
                          <strong>{fans * maxCombo}</strong>
                          <i />
                        </div>
                        <div className="share-card-summary">
                          <div className="share-card-achievement">
                            <small>知识 / 最高连击</small>
                            <strong>{fans} / ×{maxCombo}</strong>
                          </div>
                          <a
                            className="share-card-qr"
                            href={SHARE_TARGET_URL}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="扫描二维码或点击打开 QQ 音乐活动"
                          >
                            <img
                              src={SHARE_QR_ASSET}
                              alt="QQ 音乐开学冲冲冲活动二维码"
                            />
                            <small>扫码进入活动</small>
                          </a>
                        </div>
                        <p>这次开学，我的隐藏人设被发现了。</p>
                      </article>
                      <div className="share-card-actions">
                        <button
                          className="primary-button"
                          onClick={() => void shareResult()}
                          disabled={shareBusy}
                        >
                          {shareBusy ? "生成中…" : "分享给好友"}
                        </button>
                        <button
                          className="secondary-button"
                          onClick={() => void saveShareCard()}
                          disabled={shareBusy}
                        >
                          保存图片
                        </button>
                      </div>
                      {mobileSavePreviewUrl && (
                        <div
                          className="mobile-save-preview"
                          role="dialog"
                          aria-modal="true"
                          aria-label="长按保存成绩卡"
                          onPointerDown={(event) => {
                            if (event.target === event.currentTarget) {
                              setMobileSavePreviewUrl(null);
                            }
                          }}
                        >
                          <section>
                            <button
                              className="mobile-save-preview-close"
                              onClick={() => setMobileSavePreviewUrl(null)}
                              aria-label="关闭图片预览"
                            >
                              <img
                                src={UI_ICONS.close}
                                alt=""
                                aria-hidden="true"
                              />
                            </button>
                            <p>
                              <strong>长按下方图片</strong>
                              ，选择“存储到照片”或“保存图片”
                            </p>
                            <img
                              className="mobile-save-preview-image"
                              src={mobileSavePreviewUrl}
                              alt={`开学冲冲冲成绩卡：${resultTier.name}，${fans * maxCombo} 分`}
                            />
                          </section>
                        </div>
                      )}
                    </section>
                  </div>
                )}
              </div>
            )}

            {status === "failed" && (
              <div className="game-overlay failed-overlay">
                <p className="overlay-kicker">SAFETY FIRST</p>
                <img
                  className="failure-sign"
                  src={UI_ICONS.crossing}
                  alt=""
                  aria-hidden="true"
                />
                <p className="result-label">检测到行人</p>
                <h2>安全挑战未完成</h2>
                <p className="failure-copy">
                  {failureSummary?.reason === "pedestrian-collision"
                    ? "载具已紧急刹车，优先保护正在过马路的老奶奶。"
                    : "校园道路出现了突发情况，本次挑战已结束。"}
                  <br />
                  成绩已在这里结算，本次不获得活力币。
                </p>
                <div className="failure-ticket">
                  <span>本次知识</span>
                  <strong>{failureSummary?.fans ?? fans}</strong>
                  <small>
                    最高连击 ×{failureSummary?.maxCombo ?? maxCombo} · 进度{" "}
                    {Math.round(failureSummary?.progress ?? progress)}% · 活力币
                    +0
                  </small>
                </div>
                <div className="result-actions">
                  <button
                    className="primary-button"
                    onClick={() => void startGame()}
                  >
                    <img src={UI_ICONS.restart} alt="" aria-hidden="true" />
                    重新挑战
                  </button>
                  <button
                    className="secondary-button"
                    onClick={returnToStart}
                  >
                    返回首页
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="mobile-controls">
            <div
              className={`joystick-control ${status !== "playing" ? "is-disabled" : ""} ${tutorialPhase === "move" ? "is-tutorial-focus" : ""}`}
              aria-label="左右换道摇杆"
            >
              <div
                className="joystick-base"
                role="slider"
                tabIndex={status === "playing" ? 0 : -1}
                aria-label="拖动摇杆左右换道"
                aria-valuemin={-1}
                aria-valuemax={1}
                aria-valuenow={joystickDirectionRef.current}
                aria-disabled={status !== "playing"}
                onPointerDown={(event) => {
                  if (statusRef.current !== "playing") return;
                  event.preventDefault();
                  joystickPointerRef.current = event.pointerId;
                  event.currentTarget.focus({ preventScroll: true });
                  event.currentTarget.setPointerCapture(event.pointerId);
                  updateJoystick(event.clientX, event.currentTarget);
                }}
                onPointerMove={(event) => {
                  if (joystickPointerRef.current !== event.pointerId) return;
                  event.preventDefault();
                  const samples = event.nativeEvent.getCoalescedEvents?.() ?? [];
                  const latest = samples.at(-1);
                  updateJoystick(
                    latest?.clientX ?? event.clientX,
                    event.currentTarget,
                  );
                }}
                onPointerUp={(event) => {
                  if (joystickPointerRef.current === event.pointerId) {
                    event.preventDefault();
                    stopJoystick();
                  }
                }}
                onPointerCancel={stopJoystick}
                onLostPointerCapture={stopJoystick}
              >
                <span className="joystick-track" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                <b
                  className="joystick-knob"
                  style={{ transform: `translateX(${joystickOffset}px)` }}
                  aria-hidden="true"
                >
                  <img
                    className="steer-glyph"
                    src={UI_ICONS.steer}
                    alt=""
                  />
                </b>
              </div>
              <small>DRAG TO STEER</small>
            </div>
            <button
              className={`hit-button ${tutorialPhase === "hit" ? "is-tutorial-focus" : ""}`}
              onPointerDown={(event) => {
                event.preventDefault();
                hitNote();
              }}
              aria-label="击打当前节拍"
              disabled={status !== "playing"}
            >
              <span>HIT</span>
              <small>SPACE</small>
            </button>
          </div>
        </div>
      </section>

      <footer>
        <span>换道也要踩点</span>
        <i />
        <span>祝你开学一路升级</span>
      </footer>
        </>
      )}
    </main>
  );
}
