"use client";

/* ImageGen assets need fluid CSS sizing inside the canvas-adjacent game UI. */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import treasureChart from "./data/congratulations-treasure.chart.json";

const GAME_WIDTH = 480;
const GAME_HEIGHT = 720;
const ROAD_LEFT = 42;
const ROAD_WIDTH = 396;
const LANE_WIDTH = ROAD_WIDTH / 5;
const ROAD_HORIZON_Y = 302;
const ROAD_VANISH_X = GAME_WIDTH / 2;
const PLAYER_Y = 584;
const ENTITY_RENDER_SIZE = 68;
const STARTING_FANS = 0;
const TRAVEL_BEATS = 4;
const MISS_WINDOW = 190;
const HIT_INPUT_GUARD_MS = 70;
const POWERUP_DURATION_MS = 5_000;
const MAGNET_RADIUS = 185;
const MIN_OBSTACLE_BEAT_GAP = 3;
const JOYSTICK_FIRST_REPEAT_MS = 280;
const JOYSTICK_REPEAT_MS = 220;
const STADIUM_SCORE_THRESHOLD = 6_500;
const OBSTACLE_COLLISION_BEFORE = 36;
const OBSTACLE_COLLISION_AFTER = 40;

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
type EntityType = "fan" | "obstacle" | "lucky" | "magnet" | "invincible";
type ObstacleType = "cone" | "pothole" | "barrier";
type ToastTone = "cyan" | "pink" | "gold" | "danger";
type ToneMode = "normal" | "thick" | "thin";
type ReadyPage = "home" | "rules" | "start";

type VehicleLevel = {
  level: number;
  name: string;
  capacity: number;
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
  handled: boolean;
  wobble: number;
};

type Pedestrian = {
  startAt: number;
  hitAt: number;
  endAt: number;
  direction: 1 | -1;
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
      capacity: number;
      capped: boolean;
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

type LeaderboardEntry = {
  id: number;
  playerId: string;
  name: string;
  songKey: string;
  fans: number;
  maxCombo: number;
  score: number;
  concert: string;
  song: string;
  createdAt: number;
  rank: number;
};

type ShareCardData = {
  nickname: string;
  song: string;
  score: number;
  rank: number | null;
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
  grannyBeats: [number, number];
  melody: number[];
  lanePattern: number[];
  notePattern: number[];
  intensityPattern: number[];
  bpmAt: (beat: number) => number;
};

const VEHICLE_LEVELS: VehicleLevel[] = [
  {
    level: 1,
    name: "校园自行车",
    capacity: 30,
    primary: "#23cfb2",
    secondary: "#f5a5c3",
    task: "收集 4 颗知识星 + PERFECT 1 次",
    requirement: { hits: 4, perfect: 1 },
  },
  {
    level: 2,
    name: "元气摩托车",
    capacity: 55,
    primary: "#f47ead",
    secondary: "#23cfb2",
    task: "收集 12 颗知识星 + 最高连击 6",
    requirement: { hits: 12, maxCombo: 6 },
  },
  {
    level: 3,
    name: "校园小轿车",
    capacity: 85,
    primary: "#45c8ed",
    secondary: "#f5a5c3",
    task: "收集 22 颗知识星 + PERFECT 7 次 + 最高连击 10",
    requirement: { hits: 22, perfect: 7, maxCombo: 10 },
  },
  {
    level: 4,
    name: "开学校车大巴",
    capacity: 120,
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
const LEADERBOARD_SONG_KEY = `track:${PRECOMPUTED_CHART.audio.id}:${PRECOMPUTED_CHART.chartVersion}`;

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
  grannyBeats: PRECOMPUTED_CHART.gameplay.grannyBeats as [number, number],
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
  slacker: "/assets/campus-season/icons/outcome-slacker-fish.png",
  scholar: "/assets/campus-season/icons/outcome-scholar.png",
  grinder: "/assets/campus-season/icons/outcome-grind-king.png",
  hidden: "/assets/campus-season/icons/outcome-hidden-achiever.png",
  genius: "/assets/campus-season/icons/outcome-genius.png",
} as const;

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
    context.font = `900 ${size}px "Arial Black", "PingFang SC", sans-serif`;
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
  const [brandIcon, tierIcon] = await Promise.all([
    loadBrowserImage(UI_ICONS.star),
    loadBrowserImage(data.tierIconSrc),
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

  context.globalAlpha = 0.14;
  context.strokeStyle = "#17223a";
  context.lineWidth = 3;
  for (let x = 36; x < 1080; x += 72) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, 1440);
    context.stroke();
  }
  for (let y = 36; y < 1440; y += 72) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(1080, y);
    context.stroke();
  }
  context.globalAlpha = 1;

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
  context.font = '900 30px "Courier New", monospace';
  context.fillText("CAMPUS RESULT / OPENING SEASON", 92, 125);

  context.fillStyle = "#fff5e8";
  context.fillRect(92, 172, 96, 74);
  drawContainedImage(context, brandIcon, 100, 176, 80, 66);

  context.fillStyle = "#17223a";
  context.textAlign = "left";
  drawFittedText(context, "开学冲冲冲！", 218, 232, 760, 66, 42);

  context.fillStyle = "rgba(255,245,232,0.94)";
  context.fillRect(92, 310, 896, 310);
  context.strokeStyle = "#f47ead";
  context.lineWidth = 6;
  context.strokeRect(92, 310, 896, 310);
  context.fillStyle = "#52617a";
  context.font = '900 28px "Courier New", monospace';
  context.fillText("STUDENT", 132, 374);
  context.fillStyle = "#17223a";
  drawFittedText(context, data.nickname, 132, 466, 816, 88, 54);
  context.fillStyle = "#159b8b";
  context.font = '900 28px "Courier New", monospace';
  context.fillText("TODAY'S TRACK", 132, 535);
  context.fillStyle = "#e7518f";
  drawFittedText(context, `《${data.song}》`, 132, 588, 816, 46, 28);

  context.fillStyle = "#e7518f";
  context.font = '900 34px "Courier New", monospace';
  context.fillText("KNOWLEDGE SCORE", 92, 720);
  context.fillStyle = "#17223a";
  drawFittedText(context, String(data.score), 92, 930, 896, 210, 150);
  context.fillStyle = "#f47ead";
  context.fillRect(92, 970, 560, 14);

  context.fillStyle = "rgba(255,255,255,0.72)";
  context.fillRect(92, 1040, 426, 170);
  context.fillRect(562, 1040, 426, 170);
  context.strokeStyle = "#7187b2";
  context.lineWidth = 5;
  context.strokeRect(92, 1040, 426, 170);
  context.strokeRect(562, 1040, 426, 170);
  context.fillStyle = "#52617a";
  context.font = '900 26px "Courier New", monospace';
  context.fillText("CAMPUS RANK", 124, 1092);
  context.fillText("STARS / MAX COMBO", 594, 1092);
  context.fillStyle = "#159b8b";
  context.font = '900 66px "Arial Black", sans-serif';
  context.fillText(data.rank ? `#${data.rank}` : "--", 124, 1173);
  context.fillStyle = "#17223a";
  context.font = '900 48px "Arial Black", sans-serif';
  context.fillText(`${data.fans} / ×${data.maxCombo}`, 594, 1168);

  drawContainedImage(context, tierIcon, 92, 1234, 72, 72);
  context.fillStyle = "#17223a";
  context.font = '900 34px "PingFang SC", sans-serif';
  context.fillText(data.venue, 184, 1288);
  context.fillStyle = "#52617a";
  context.font = '900 24px "Courier New", monospace';
  context.fillText("这次开学，我的隐藏人设被发现了", 184, 1332);

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/png", 1);
  });
}

function downloadShareCard(blob: Blob, song: string) {
  const safeSong = song.replace(/[\\/:*?"<>|]/g, "-").slice(0, 36);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `开学冲冲冲-${safeSong || "校园成绩"}.png`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function laneCenter(lane: number) {
  return ROAD_LEFT + LANE_WIDTH * lane + LANE_WIDTH / 2;
}

function roadDepthFromY(y: number) {
  return Math.max(
    0,
    Math.min(1.35, (y - ROAD_HORIZON_Y) / (PLAYER_Y - ROAD_HORIZON_Y)),
  );
}

function roadYFromProgress(progress: number) {
  const clamped = Math.max(0, Math.min(1.35, progress));
  const depth = Math.pow(clamped, 1.42);
  return ROAD_HORIZON_Y + (PLAYER_Y - ROAD_HORIZON_Y) * depth;
}

function laneXAtDepth(lane: number, depth: number) {
  return ROAD_VANISH_X + (laneCenter(lane) - ROAD_VANISH_X) * depth;
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
  const busBounceRef = useRef(0);
  const screenPunchRef = useRef(0);
  const invulnerableUntilRef = useRef(0);
  const shieldRef = useRef(false);
  const perfectCountRef = useRef(0);
  const successfulHitsRef = useRef(0);
  const vehicleLevelRef = useRef(1);
  const magnetUntilRef = useRef(-1);
  const invincibleUntilRef = useRef(-1);
  const toneModeRef = useRef<ToneMode>("normal");
  const arrangementUntilRef = useRef(-1);
  const grannyWarnedBeatsRef = useRef<Set<number>>(new Set());
  const toastTimerRef = useRef<number | null>(null);
  const judgementTimerRef = useRef<number | null>(null);
  const lastHitInputAtRef = useRef(-Infinity);
  const playerNameRef = useRef("");
  const playerIdRef = useRef("");
  const joystickPointerRef = useRef<number | null>(null);
  const joystickDirectionRef = useRef<-1 | 0 | 1>(0);
  const joystickRepeatRef = useRef<number | null>(null);
  const lastPerfectSoundAtRef = useRef(-Infinity);

  const [status, setStatus] = useState<GameStatus>("ready");
  const [readyPage, setReadyPage] = useState<ReadyPage>("home");
  const [playerName, setPlayerName] = useState("");
  const [songReady, setSongReady] = useState(false);
  const [songLoading, setSongLoading] = useState(false);
  const [songError, setSongError] = useState("");
  const [fans, setFans] = useState(STARTING_FANS);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [successfulHits, setSuccessfulHits] = useState(0);
  const [vehicleLevel, setVehicleLevel] = useState(1);
  const [magnetRemaining, setMagnetRemaining] = useState(0);
  const [invincibleRemaining, setInvincibleRemaining] = useState(0);
  const [progress, setProgress] = useState(0);
  const [beatIndex, setBeatIndex] = useState(0);
  const [currentBpm, setCurrentBpm] = useState(GAME_TRACK.bpmAt(0));
  const [toneMode, setToneMode] = useState<ToneMode>("normal");
  const [muted, setMuted] = useState(false);
  const [shield, setShield] = useState(false);
  const [bestFans, setBestFans] = useState(0);
  const [bankCoins, setBankCoins] = useState(0);
  const [earnedCoins, setEarnedCoins] = useState(0);
  const [failureSummary, setFailureSummary] =
    useState<FailureSummary | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [currentRankEntryId, setCurrentRankEntryId] = useState<string | null>(
    null,
  );
  const [leaderboardSyncing, setLeaderboardSyncing] = useState(false);
  const [shareCardOpen, setShareCardOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
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
  const songTitle = GAME_TRACK.name;
  const leaderboardSongKey = LEADERBOARD_SONG_KEY;
  const currentVehicle = getVehicle(vehicleLevel);
  const currentVehicleName = currentVehicle.name;
  const selectedAssetThemeClass = "is-campus-season";
  const currentLeaderboardEntry = currentRankEntryId
    ? leaderboard.find((entry) => entry.playerId === currentRankEntryId)
    : undefined;
  const vehicleTaskProgress = getVehicleTaskProgress(
    currentVehicle,
    successfulHits,
    perfectCountRef.current,
    maxCombo,
  );
  const leaderboardPanel = (
    <section className="leaderboard-panel" aria-label="玩家排行榜">
      <div className="leaderboard-heading">
        <span>《{songTitle}》排行榜</span>
        <small>SONG TOP 8</small>
      </div>
      {leaderboard.length > 0 ? (
        <div className="leaderboard-list">
          {leaderboard.map((entry, index) => (
            <div
              className={
                entry.playerId === currentRankEntryId ? "is-current" : undefined
              }
              key={entry.id}
            >
              <b>{String(entry.rank || index + 1).padStart(2, "0")}</b>
              <span>
                <strong>{entry.name}</strong>
                <small>
                  {entry.concert} · {entry.fans} 知识星
                </small>
              </span>
              <em>{entry.score} PTS</em>
              <i>×{entry.maxCombo}</i>
            </div>
          ))}
        </div>
      ) : (
        <p className="leaderboard-empty">
          这首歌还没有成绩，来留下第一份开学答卷吧。
        </p>
      )}
    </section>
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
        nickname: playerName.trim() || "校园新生",
        song: songTitle,
        score: fans * maxCombo,
        rank: currentLeaderboardEntry?.rank ?? null,
        fans,
        maxCombo,
        venue: resultTier.name,
        tierIconSrc: resultTier.iconSrc,
      }),
    [
      currentLeaderboardEntry?.rank,
      fans,
      maxCombo,
      playerName,
      resultTier.iconSrc,
      resultTier.name,
      songTitle,
    ],
  );

  const saveShareCard = useCallback(async () => {
    setShareBusy(true);
    try {
      const blob = await createCurrentShareCard();
      if (!blob) throw new Error("Share card unavailable");
      downloadShareCard(blob, songTitle);
      showToast("成绩卡已保存，可以分享给好友啦", "cyan");
    } catch {
      showToast("成绩卡生成失败，请稍后重试", "danger");
    } finally {
      setShareBusy(false);
    }
  }, [createCurrentShareCard, showToast, songTitle]);

  const shareResult = useCallback(async () => {
    setShareBusy(true);
    try {
      const blob = await createCurrentShareCard();
      if (!blob) throw new Error("Share card unavailable");
      const file = new File([blob], "campus-season-result.png", {
        type: "image/png",
      });
      const score = fans * maxCombo;
      const shareText = `${playerName.trim() || "校园新生"}在《${songTitle}》拿到 ${score} 分，解锁称号「${resultTier.name}」，校园榜第 ${currentLeaderboardEntry?.rank ?? "--"} 名！`;
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
        downloadShareCard(blob, songTitle);
        showToast("当前设备未能打开分享面板，已保存成绩卡", "gold");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      showToast("分享失败，请尝试保存成绩卡", "danger");
    } finally {
      setShareBusy(false);
    }
  }, [
    createCurrentShareCard,
    currentLeaderboardEntry?.rank,
    fans,
    maxCombo,
    playerName,
    resultTier.name,
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
    busBounceRef.current = 1.35;
    addBurst(busXRef.current, PLAYER_Y - 18, next.secondary, 46);
    addFloatText(
      busXRef.current,
      PLAYER_Y - 96,
      `BUS LV.${next.level}  容量 ${next.capacity}`,
      next.secondary,
    );
    showToast(`车辆升级！${next.name} · 容量 ${next.capacity}`, "gold");
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
      setCurrentBpm(PRECOMPUTED_CHART.timing.bpm);
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
    const safeLane = track.lanePattern[targetBeat % track.lanePattern.length];
    const noteLevel =
      track.notePattern[targetBeat % track.notePattern.length] ?? 0;
    const intensity =
      track.intensityPattern[targetBeat % track.intensityPattern.length] ?? 0;
    if (noteLevel !== 2) return;
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

    const bonusType: EntityType | null =
      activeNoteOrdinal > 10 && activeNoteOrdinal % 28 === 8
        ? "magnet"
        : activeNoteOrdinal > 10 && activeNoteOrdinal % 28 === 20
          ? "invincible"
          : activeNoteOrdinal > 8 && activeNoteOrdinal % 19 === 0
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
      wobble: Math.random() * Math.PI,
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
        wobble: Math.random() * Math.PI,
      });
    }

    if (beat < 2) return;
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
        wobble: Math.random() * Math.PI,
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
        const coverScale = Math.max(
          GAME_WIDTH / images.road.naturalWidth,
          GAME_HEIGHT / images.road.naturalHeight,
        );
        const width = images.road.naturalWidth * coverScale;
        const height = images.road.naturalHeight * coverScale;
        ctx.drawImage(
          images.road,
          (GAME_WIDTH - width) / 2,
          (GAME_HEIGHT - height) / 2,
          width,
          height,
        );
      }

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(ROAD_VANISH_X, ROAD_HORIZON_Y);
      ctx.lineTo(ROAD_LEFT + ROAD_WIDTH + 30, GAME_HEIGHT + 20);
      ctx.lineTo(ROAD_LEFT - 30, GAME_HEIGHT + 20);
      ctx.closePath();
      ctx.fillStyle = "rgba(113, 135, 178, 0.08)";
      ctx.fill();
      ctx.restore();

      const boundaryXAtDepth = (boundary: number, depth: number) =>
        ROAD_VANISH_X +
        (ROAD_LEFT + boundary * LANE_WIDTH - ROAD_VANISH_X) * depth;
      const roadYAtDepth = (depth: number) =>
        ROAD_HORIZON_Y + (GAME_HEIGHT - ROAD_HORIZON_Y) * depth;

      ctx.lineCap = "round";
      for (let boundary = 0; boundary <= 5; boundary += 1) {
        ctx.beginPath();
        ctx.moveTo(ROAD_VANISH_X, ROAD_HORIZON_Y);
        ctx.lineTo(boundaryXAtDepth(boundary, 1), GAME_HEIGHT);
        ctx.strokeStyle =
          boundary === 0
            ? "rgba(35, 207, 178, 0.68)"
            : boundary === 5
              ? "rgba(244, 126, 173, 0.68)"
              : "rgba(255, 245, 232, 0.3)";
        ctx.lineWidth = boundary === 0 || boundary === 5 ? 3 : 1.2;
        ctx.stroke();
      }

      for (let boundary = 1; boundary < 5; boundary += 1) {
        for (let marker = 0; marker < 7; marker += 1) {
          const phase = (marker / 7 + roadFlow) % 1;
          const startDepth = Math.pow(phase, 1.45);
          const endDepth = Math.min(1, startDepth + 0.045 + startDepth * 0.055);
          ctx.beginPath();
          ctx.moveTo(
            boundaryXAtDepth(boundary, startDepth),
            roadYAtDepth(startDepth),
          );
          ctx.lineTo(
            boundaryXAtDepth(boundary, endDepth),
            roadYAtDepth(endDepth),
          );
          ctx.strokeStyle = `rgba(255, 245, 232, ${0.3 + startDepth * 0.42})`;
          ctx.lineWidth = 1 + startDepth * 3;
          ctx.stroke();
        }
      }
      ctx.lineCap = "butt";

      ctx.fillStyle = `rgba(255, 216, 77, ${0.12 + pulse * 0.12})`;
      ctx.fillRect(ROAD_LEFT + 10, PLAYER_Y - 4, ROAD_WIDTH - 20, 8);
      for (let lane = 0; lane < 5; lane += 1) {
        ctx.beginPath();
        ctx.ellipse(
          laneCenter(lane),
          PLAYER_Y,
          22 + pulse * 2,
          7 + pulse,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fillStyle = "rgba(255, 245, 232, 0.2)";
        ctx.fill();
      }

      const pedestrian = pedestrianRef.current;
      if (pedestrian) {
        ctx.fillStyle = "rgba(255, 245, 232, 0.72)";
        for (let stripe = 0; stripe < 5; stripe += 1) {
          ctx.fillRect(
            ROAD_LEFT + 12,
            pedestrian.y - 49 + stripe * 19,
            ROAD_WIDTH - 24,
            8,
          );
        }
        ctx.fillStyle = "rgba(255, 216, 77, 0.13)";
        ctx.fillRect(ROAD_LEFT + 7, pedestrian.y - 48, ROAD_WIDTH - 14, 96);
        if (images.grandma?.complete && images.grandma.naturalWidth) {
          ctx.save();
          ctx.translate(Math.round(pedestrian.x), pedestrian.y);
          if (pedestrian.direction === -1) ctx.scale(-1, 1);
          ctx.beginPath();
          ctx.ellipse(0, 3, 23, 7, 0, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(23, 34, 58, 0.2)";
          ctx.fill();
          drawContainedImage(ctx, images.grandma, -32, -89, 64, 89);
          ctx.restore();
        }
      }

      const visibleEntities = [...entitiesRef.current].sort((a, b) => a.y - b.y);
      for (const entity of visibleEntities) {
        const depth = roadDepthFromY(entity.y);
        const x = laneXAtDepth(entity.lane, depth);
        const spriteSize =
          ENTITY_RENDER_SIZE * (0.34 + Math.min(1, depth) * 0.66);
        const wobble =
          Math.sin(elapsed / 220 + entity.wobble) * Math.min(1.2, depth) * 1.25;
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
        ctx.translate(Math.round(x + wobble), Math.round(entity.y));
        ctx.beginPath();
        ctx.ellipse(
          0,
          2,
          spriteSize * 0.34,
          spriteSize * 0.11,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fillStyle = `rgba(23, 34, 58, ${0.08 + Math.min(1, depth) * 0.16})`;
        ctx.fill();

        if (entity.type === "fan") {
          const timingDistance = Math.abs(entity.hitAt - elapsed);
          if (timingDistance < 260) {
            const ringScale = 1 + timingDistance / 520;
            ctx.strokeStyle =
              timingDistance < 110 ? "#ffd84d" : "rgba(69, 200, 237, 0.86)";
            ctx.lineWidth = timingDistance < 110 ? 5 : 3;
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
            ctx.shadowColor = "#fff5e8";
            ctx.shadowBlur = 5 + depth * 7;
            drawRoadSprite(images.knowledgeStar);
            ctx.shadowBlur = 0;
          }
        } else if (
          entity.type === "lucky" &&
          images.mysterySchoolbag?.complete &&
          images.mysterySchoolbag.naturalWidth
        ) {
          ctx.shadowColor = "#f47ead";
          ctx.shadowBlur = 6 + depth * 6 + pulse * 2;
          drawRoadSprite(images.mysterySchoolbag);
          ctx.shadowBlur = 0;
        } else if (
          entity.type === "magnet" &&
          images.magnet?.complete &&
          images.magnet.naturalWidth
        ) {
          ctx.shadowColor = "#23cfb2";
          ctx.shadowBlur = 6 + depth * 6 + pulse * 2;
          drawRoadSprite(images.magnet);
          ctx.shadowBlur = 0;
        } else if (
          entity.type === "invincible" &&
          images.lightning?.complete &&
          images.lightning.naturalWidth
        ) {
          ctx.shadowColor = "#ffd84d";
          ctx.shadowBlur = 6 + depth * 6 + pulse * 2;
          drawRoadSprite(images.lightning);
          ctx.shadowBlur = 0;
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

      const busX = busXRef.current;
      const busY = PLAYER_Y - busBounceRef.current * 18;
      const vehicle = getVehicle(vehicleLevelRef.current);
      const busScale = 1 + (vehicle.level - 1) * 0.015;
      ctx.save();
      ctx.translate(Math.round(busX), Math.round(busY));
      if (elapsed < magnetUntilRef.current) {
        ctx.strokeStyle = `rgba(69, 200, 237, ${0.4 + pulse * 0.3})`;
        ctx.lineWidth = 3;
        ctx.setLineDash([9, 7]);
        ctx.beginPath();
        ctx.arc(0, 0, MAGNET_RADIUS + pulse * 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (elapsed < invincibleUntilRef.current) {
        ["#fff5e8", "#ffd84d", "#f47ead"].forEach((color, index) => {
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.9 - index * 0.16;
          ctx.lineWidth = 5 - index;
          ctx.beginPath();
          ctx.arc(0, 0, 48 + index * 9 + pulse * 5, 0, Math.PI * 2);
          ctx.stroke();
        });
        ctx.globalAlpha = 1;
      }
      ctx.scale(busScale, busScale);
      ctx.fillStyle = "rgba(23, 34, 58, 0.3)";
      ctx.fillRect(-27, 45, 54, 12);
      if (shieldRef.current) {
        ctx.strokeStyle = `rgba(69, 200, 237, ${0.58 + pulse * 0.32})`;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(0, 4, 48 + pulse * 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      const vehicleImage =
        vehicle.level === 1
          ? images.bicycle
          : vehicle.level === 2
            ? images.motorcycle
            : vehicle.level === 3
              ? images.car
              : images.schoolBus;
      if (vehicleImage?.complete && vehicleImage.naturalWidth) {
        const bounds =
          vehicle.level === 1
            ? { x: -35, y: -64, width: 70, height: 126 }
            : vehicle.level === 2
              ? { x: -40, y: -65, width: 80, height: 128 }
              : vehicle.level === 3
                ? { x: -41, y: -59, width: 82, height: 118 }
                : { x: -42, y: -63, width: 84, height: 126 };
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

      if (hitFlashRef.current > 0) {
        ctx.fillStyle = `rgba(244, 126, 173, ${hitFlashRef.current * 0.36})`;
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      }
      if (collectFlashRef.current > 0) {
        ctx.fillStyle = `rgba(69, 200, 237, ${collectFlashRef.current * 0.16})`;
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      }
      ctx.restore();
    },
    [],
  );

  const stopJoystick = useCallback(() => {
    if (joystickRepeatRef.current !== null) {
      window.clearInterval(joystickRepeatRef.current);
      joystickRepeatRef.current = null;
    }
    joystickPointerRef.current = null;
    joystickDirectionRef.current = 0;
    setJoystickOffset(0);
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
    setCombo(comboRef.current);
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

    const playerId = playerIdRef.current;
    if (playerId) {
      setLeaderboardSyncing(true);
      setCurrentRankEntryId(playerId);
      void fetch("/api/leaderboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          playerId,
          name: playerNameRef.current.trim() || "校园新生",
          fans: fansRef.current,
          maxCombo: maxComboRef.current,
          song: trackRef.current.name,
          songKey: LEADERBOARD_SONG_KEY,
        }),
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Leaderboard sync failed");
          const payload = (await response.json()) as {
            leaderboard?: LeaderboardEntry[];
          };
          setLeaderboardSyncing(false);
          if (payload.leaderboard) {
            setLeaderboard(payload.leaderboard);
            showToast(
              `已计入《${trackRef.current.name}》榜 · ${fansRef.current * maxComboRef.current} 分`,
              "gold",
            );
          }
        })
        .catch(() => {
          setLeaderboardSyncing(false);
          showToast("歌曲排行榜同步失败，请稍后重试", "danger");
        });
    } else {
      setLeaderboardSyncing(false);
    }

    addBurst(GAME_WIDTH / 2, PLAYER_Y - 120, tier.color, 38);
    if (songRef.current) {
      songRef.current.pause();
    }
    magnetUntilRef.current = -1;
    invincibleUntilRef.current = -1;
    setMagnetRemaining(0);
    setInvincibleRemaining(0);
    resetSongTone();
  }, [addBurst, resetSongTone, showToast, stopJoystick]);

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
    setCombo(comboRef.current);
    setMaxCombo(maxComboRef.current);
    setCurrentRankEntryId(null);
    setLeaderboardSyncing(false);
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

      while (
        nextBeatRef.current < track.totalBeats &&
        elapsed >= beatTimes[nextBeatRef.current]
      ) {
        const beat = nextBeatRef.current;
        beatRef.current = beat;
        beatPulseRef.current = 1;
        setCurrentBpm(track.bpmAt(beat));
        spawnBeat(beat);

        const pedestrianWarningIndex = track.grannyBeats.findIndex(
          (targetBeat) =>
            beat === targetBeat - 4 &&
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
              beatTimes[Math.min(pedestrianBeat + 4, beatTimes.length - 1)],
            direction,
            x: direction === 1 ? ROAD_LEFT - 24 : ROAD_LEFT + ROAD_WIDTH + 24,
            y: PLAYER_Y - 4,
          };
          showToast(
            pedestrianWarningIndex === 0
              ? "注意！4 拍后第一位行人抵达中间车道"
              : "再次注意！4 拍后第二位行人从另一侧通过",
            "gold",
          );
        }
        const pedestrianDangerIndex = track.grannyBeats.indexOf(beat);
        if (pedestrianDangerIndex >= 0) {
          showToast(
            pedestrianDangerIndex === 0
              ? "危险！第一位行人到达，离开中间车道"
              : "危险！第二位行人到达，再次避让",
            "danger",
          );
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
            setCombo(comboRef.current);
            setMaxCombo(maxComboRef.current);
            setSuccessfulHits(successfulHitsRef.current);
            const upgraded = checkVehicleUpgrade();
            const capacity = getVehicle(vehicleLevelRef.current).capacity;
            const fanGained = fansRef.current < capacity;
            fansRef.current = Math.min(capacity, fansRef.current + 1);
            setFans(fansRef.current);
            if (!upgraded) {
              showJudgement(
                "PERFECT",
                fanGained
                  ? `MAGNET PERFECT · +1 FAN · ×${comboRef.current}`
                  : `MAGNET PERFECT · BUS FULL ${capacity} · ×${comboRef.current}`,
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
              fanGained ? "PERFECT +1" : `PERFECT · 满载 ${capacity}`,
              "#ffe66d",
            );
            playPerfectHit();
            beatPulseRef.current = 1.45;
            collectFlashRef.current = 1;
            busBounceRef.current = 0.8;
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
            setCombo(0);
            showJudgement("MISS", "节拍漏击 · COMBO BREAK");
            addFloatText(
              laneXAtDepth(entity.lane, roadDepthFromY(entity.y)),
              PLAYER_Y - 54,
              "MISS",
              "#ff526f",
            );
            hitFlashRef.current = 0.32;
          }
          if (!entity.handled && entity.y < GAME_HEIGHT + 90) {
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
          if (!entity.handled && entity.y < GAME_HEIGHT + 90) {
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
          busBounceRef.current = 1.15;
          addBurst(x, PLAYER_Y - 10, "#72f1ff", 30);
          addFloatText(x, PLAYER_Y - 66, "磁铁 5 秒", "#72f1ff");
          showToast("获得磁铁！5 秒内附近知识星自动 PERFECT", "cyan");
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
          setCombo(0);
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
          addFloatText(x, PLAYER_Y - 58, `-${actualLoss} 知识星`, "#ff526f");
          showToast(
            `掉粉 -${actualLoss} · 音色变${toneModeRef.current === "thick" ? "厚" : "细"} 8 拍`,
            "danger",
          );
        }
      }

      entitiesRef.current = nextEntities;

      const pedestrian = pedestrianRef.current;
      if (pedestrian) {
        const crossingProgress =
          (elapsed - pedestrian.startAt) /
          Math.max(1, pedestrian.endAt - pedestrian.startAt);
        const fromX =
          pedestrian.direction === 1
            ? ROAD_LEFT - 24
            : ROAD_LEFT + ROAD_WIDTH + 24;
        const toX =
          pedestrian.direction === 1
            ? ROAD_LEFT + ROAD_WIDTH + 24
            : ROAD_LEFT - 24;
        const pedestrianX = fromX + (toX - fromX) * crossingProgress;
        const pedestrianY = PLAYER_Y - 4;
        pedestrianRef.current = {
          ...pedestrian,
          x: pedestrianX,
          y: pedestrianY,
        };

        if (
          crossingProgress >= 0 &&
          crossingProgress <= 1 &&
          Math.abs(pedestrianY - PLAYER_Y) < 48 &&
          Math.abs(pedestrianX - busXRef.current) < 36
        ) {
          failGame();
          return;
        }
        if (crossingProgress > 1.05) {
          pedestrianRef.current = null;
          showToast("行人已安全通过", "cyan");
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
      busBounceRef.current = Math.max(0, busBounceRef.current - delta * 5.2);
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
    const candidate = entitiesRef.current
      .filter(
        (entity) =>
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
      setCombo(0);
      showJudgement("MISS", "不在节拍点或车道错误");
      addFloatText(busXRef.current, PLAYER_Y - 72, "MISS", "#ff526f");
      hitFlashRef.current = 0.34;
      navigator.vibrate?.(12);
      return;
    }

    candidate.handled = true;
    const timingError = Math.abs(elapsed - candidate.hitAt);
    const quality: NoteJudgement["quality"] =
      timingError <= 55 ? "PERFECT" : timingError <= 110 ? "GREAT" : "GOOD";
    comboRef.current += 1;
    maxComboRef.current = Math.max(maxComboRef.current, comboRef.current);
    if (quality === "PERFECT") perfectCountRef.current += 1;
    successfulHitsRef.current += 1;
    setSuccessfulHits(successfulHitsRef.current);
    const upgraded = checkVehicleUpgrade();
    const capacity = getVehicle(vehicleLevelRef.current).capacity;
    const fanGained = fansRef.current < capacity;
    fansRef.current = Math.min(capacity, fansRef.current + 1);
    setFans(fansRef.current);
    setCombo(comboRef.current);
    setMaxCombo(maxComboRef.current);
    if (!upgraded) {
      showJudgement(
        quality,
        fanGained
          ? `JUST HIT · +1 FAN · ×${comboRef.current}`
          : `JUST HIT · BUS FULL ${capacity} · ×${comboRef.current}`,
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
      fanGained
        ? quality === "PERFECT"
          ? "收到了! +1"
          : "+1 STAR"
        : `满载 ${capacity}`,
      quality === "PERFECT" ? "#ffe66d" : "#ffffff",
    );
    beatPulseRef.current = 1.65;
    collectFlashRef.current = 1;
    busBounceRef.current = 1;
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
    playFanHit,
    playPerfectHit,
    showJudgement,
    showToast,
  ]);

  const startGame = useCallback(async () => {
    const song = songRef.current;
    if (!playerNameRef.current.trim()) {
      showToast("请先填写排行榜昵称", "pink");
      return;
    }
    if (!songReady || !song) {
      showToast("歌曲仍在准备中，请稍候", "pink");
      return;
    }
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
    entitiesRef.current = [];
    particlesRef.current = [];
    floatTextRef.current = [];
    pedestrianRef.current = null;
    shieldRef.current = false;
    perfectCountRef.current = 0;
    successfulHitsRef.current = 0;
    magnetUntilRef.current = -1;
    invincibleUntilRef.current = -1;
    grannyWarnedBeatsRef.current.clear();
    invulnerableUntilRef.current = 0;
    lastHitInputAtRef.current = -Infinity;
    beatPulseRef.current = 0;
    shakeRef.current = 0;
    hitFlashRef.current = 0;
    collectFlashRef.current = 0;
    busBounceRef.current = 0;
    screenPunchRef.current = 0;
    fallbackElapsedRef.current = 0;
    setFans(STARTING_FANS);
    setVehicleLevel(1);
    setCombo(0);
    setMaxCombo(0);
    setSuccessfulHits(0);
    setMagnetRemaining(0);
    setInvincibleRemaining(0);
    setProgress(0);
    setShield(false);
    setCurrentBpm(PRECOMPUTED_CHART.timing.bpm);
    setToast(null);
    setNoteJudgement(null);
    setLuckyDialog(null);
    setCurrentRankEntryId(null);
    setLeaderboardSyncing(false);
    setShareCardOpen(false);
    setShareBusy(false);
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
  }, [gameLoop, resetSongTone, showToast, songReady, stopJoystick]);

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
    const capacity = getVehicle(vehicleLevelRef.current).capacity;
    const doubled = Math.random() < 0.55;
    if (doubled) {
      const doubledFans = before * 2;
      fansRef.current = Math.min(capacity, doubledFans);
      addFloatText(
        busXRef.current,
        PLAYER_Y - 64,
        doubledFans > capacity ? `翻倍！上限 ${capacity}` : "知识星 ×2!",
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
        capacity,
        capped: doubledFans > capacity,
      });
      navigator.vibrate?.([24, 18, 38]);
    } else {
      fansRef.current = Math.max(1, Math.floor(before / 2));
      comboRef.current = 0;
      setCombo(0);
      addFloatText(busXRef.current, PLAYER_Y - 64, "知识星 ÷2", "#ff7ac8");
      addBurst(busXRef.current, PLAYER_Y - 10, "#ff7ac8", 22);
      hitFlashRef.current = 0.7;
      shakeRef.current = 0.22;
      setLuckyDialog({
        phase: "result",
        outcome: "half",
        before,
        after: fansRef.current,
        capacity,
        capped: false,
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
    },
    [addBurst],
  );

  const steerWithJoystick = useCallback(
    (direction: -1 | 0 | 1) => {
      if (
        direction === joystickDirectionRef.current ||
        statusRef.current !== "playing"
      ) {
        return;
      }
      if (joystickRepeatRef.current !== null) {
        window.clearInterval(joystickRepeatRef.current);
        joystickRepeatRef.current = null;
      }
      joystickDirectionRef.current = direction;
      if (direction === 0) return;
      move(direction);
      joystickRepeatRef.current = window.setTimeout(() => {
        move(direction);
        joystickRepeatRef.current = window.setInterval(() => {
          move(direction);
        }, JOYSTICK_REPEAT_MS);
      }, JOYSTICK_FIRST_REPEAT_MS);
    },
    [move],
  );

  const updateJoystick = useCallback(
    (clientX: number, target: HTMLElement) => {
      const bounds = target.getBoundingClientRect();
      const rawOffset = clientX - (bounds.left + bounds.width / 2);
      const maxTravel = Math.max(36, (bounds.width - 64) / 2 - 7);
      const deadZone = Math.max(20, maxTravel * 0.38);
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
    setReadyPage("start");
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
    invincibleUntilRef.current = -1;
    setVehicleLevel(1);
    setFans(STARTING_FANS);
    setCombo(0);
    setMaxCombo(0);
    setSuccessfulHits(0);
    setMagnetRemaining(0);
    setInvincibleRemaining(0);
    setShield(false);
    setProgress(0);
    setToast(null);
    setNoteJudgement(null);
    setLuckyDialog(null);
    setCurrentRankEntryId(null);
    setLeaderboardSyncing(false);
    setShareCardOpen(false);
    setShareBusy(false);
    setFailureSummary(null);
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
    let cancelled = false;
    setCurrentRankEntryId(null);
    void fetch(
      `/api/leaderboard?songKey=${encodeURIComponent(leaderboardSongKey)}`,
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Leaderboard load failed");
        const payload = (await response.json()) as {
          leaderboard?: LeaderboardEntry[];
        };
        if (!cancelled && payload.leaderboard) {
          setLeaderboard(payload.leaderboard);
        }
      })
      .catch(() => {
        if (!cancelled) setLeaderboard([]);
      });

    return () => {
      cancelled = true;
    };
  }, [leaderboardSongKey]);

  useEffect(() => {
    const savedBest = Number(window.localStorage.getItem("fan-bus-best") || 0);
    const savedCoins = Number(
      window.localStorage.getItem("fan-bus-coins") || 0,
    );
    const storedPlayerName =
      window.localStorage.getItem("fan-bus-player-name") || "";
    const savedPlayerName = ["巡演玩家", "校园新生"].includes(storedPlayerName)
      ? ""
      : storedPlayerName;
    let savedPlayerId = window.localStorage.getItem("fan-bus-player-id");
    if (!savedPlayerId) {
      savedPlayerId =
        typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      window.localStorage.setItem("fan-bus-player-id", savedPlayerId);
    }
    playerIdRef.current = savedPlayerId;
    window.localStorage.removeItem("fan-bus-vehicle-level");
    const savedScoreTimer = window.setTimeout(() => {
      setBestFans(savedBest);
      setBankCoins(savedCoins);
      playerNameRef.current = savedPlayerName;
      setPlayerName(savedPlayerName);
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
        if (
          statusRef.current === "ready" &&
          (readyPage === "home" || readyPage === "rules")
        ) {
          setReadyPage("start");
        } else {
          void startGame();
        }
      }
    };
    window.addEventListener("keydown", keydown);
    return () => {
      window.clearTimeout(savedScoreTimer);
      window.removeEventListener("keydown", keydown);
    };
  }, [hitNote, move, pauseGame, readyPage, resumeGame, startGame, toggleMute]);

  useEffect(() => {
    (Object.entries(CAMPUS_ASSETS) as Array<[CampusAsset, string]>).forEach(
      ([key, src]) => {
        const image = new Image();
        image.src = src;
        image.onload = () => {
          campusImagesRef.current[key] = image;
          const context = canvasRef.current?.getContext("2d");
          if (context && statusRef.current !== "playing") drawGame(context, 0);
        };
      },
    );
  }, [drawGame]);

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

  return (
    <main className={`arcade-page ${isHomePage ? "is-home-page" : ""}`}>
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
                <strong>{bestFans}</strong> 知识星
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
                踩准节拍，发现校园宝藏
              </p>
              <h1 id="home-title">
                <span>开学季</span>
                <strong>冲冲冲！</strong>
              </h1>
              <p className="home-lead">
                从自行车一路升级到校车大巴，踩准强拍收集知识星，
                穿过蓝绿粉校园，解锁你的隐藏开学人设。
              </p>
              <div className="home-tags" aria-label="游戏特色">
                <span>
                  <b>01</b> 首校园主题曲
                </span>
                <span>
                  <b>04</b> 级载具进化
                </span>
                <span>
                  <b>TOP 8</b> 歌曲排行榜
                </span>
              </div>
              <div className="home-actions">
                <button
                  className="home-start-button"
                  onClick={() => setReadyPage("start")}
                  autoFocus
                >
                  <span>走进校园</span>
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
                    收集沿途知识星
                  </span>
                  <b>→</b>
                  <span>
                    <small>DESTINATION</small>
                    解锁隐藏学霸称号
                  </span>
                </div>
              </div>
              <div className="home-track-card">
                <span className="home-track-number">01</span>
                <div>
                  <small>FEATURED TRACK</small>
                  <strong>恭喜你发现了宝藏</strong>
                  <em>TF家族 · 开学季主题曲 01:26</em>
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
              {status === "playing" || status === "paused" || status === "lucky"
                ? currentBpm
                : songReady
                  ? PRECOMPUTED_CHART.timing.bpm
                  : "--"}
              <i>BPM</i>
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
            {bestFans} 知识星
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
                ? songTitle
                : readyPage === "rules"
                  ? `校园路线 · ${GAME_TRACK.name}`
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
              <span>STARS / CAP</span>
              <strong className="fans-count">
                {String(fans).padStart(3, "0")}
                <small>/{currentVehicle.capacity}</small>
              </strong>
            </div>
            <div className="hud-block combo-block">
              <span>BEAT COMBO</span>
              <strong>×{combo}</strong>
            </div>
            <div className="vehicle-run-card" aria-label="当前车辆升级任务">
              <div className="vehicle-level-badge">
                <small>RIDE</small>
                <strong>LV.{currentVehicle.level}</strong>
              </div>
              <div className="vehicle-task-copy">
                <strong>
                  {currentVehicleName}
                  <span>上限 {currentVehicle.capacity}</span>
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
              <strong>{songReady ? currentBpm : "--"} BPM</strong>
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
                  <span>开学季</span>
                  <em>冲冲冲！</em>
                </h1>
                <p className="rules-lead">
                  开学第一天，从一辆校园自行车出发。
                  踩准节拍收集沿路知识星，躲开障碍并
                  <strong>安全抵达校园</strong>！
                </p>
                <div className="rules-grid story-route" aria-label="校园路线">
                  <div>
                    <b>01</b>
                    <span>
                      <strong>自行车出发</strong>
                      知识星从 0 开始，沿校园道路左右换道寻找宝藏。
                    </span>
                  </div>
                  <div>
                    <b>02</b>
                    <span>
                      <strong>收集知识星</strong>
                      知识星到达黄色判定线时按 <em>HIT</em>；每次命中
                      都会增加 1 颗知识星。
                    </span>
                  </div>
                  <div>
                    <b>03</b>
                    <span>
                      <strong>升级校园载具</strong>
                      从自行车、摩托车、小轿车一路升级到校车大巴。
                    </span>
                  </div>
                </div>
                <div className="story-mission">
                  <span>FIRST DAY GOAL</span>
                  <strong>解锁你的隐藏开学人设</strong>
                  <small>校园安全第一，遇到过马路的老奶奶必须礼让。</small>
                </div>
                <button
                  className="primary-button rules-start-button"
                  onClick={() => setReadyPage("start")}
                >
                  <img src={UI_ICONS.play} alt="" aria-hidden="true" />
                  准备开学 · 前往出发页
                </button>
              </div>
            )}

            {status === "ready" && readyPage === "start" && (
              <div className="game-overlay intro-overlay single-track-overlay">
                <div className="song-select-title">
                  <p className="overlay-kicker">READY TO GO</p>
                  <h1>准备出发</h1>
                  <span>跟随唯一主题曲，收集知识星并安全抵达校园</span>
                </div>

                <article className="single-song-card" aria-label="本次主题曲">
                  <div className="single-song-art" aria-hidden="true">
                    <img src={UI_ICONS.play} alt="" />
                  </div>
                  <div className="single-song-copy">
                    <small>OPENING SEASON TRACK</small>
                    <strong>{GAME_TRACK.name}</strong>
                    <span>{GAME_TRACK.artist} · 完整版 01:26</span>
                  </div>
                  <div className="single-song-badges" aria-label="歌曲信息">
                    <b>{PRECOMPUTED_CHART.timing.bpm} BPM</b>
                    <em>开学季主题曲</em>
                  </div>
                </article>

                <aside className="chart-ready-note" role="note">
                  <img src={UI_ICONS.star} alt="" aria-hidden="true" />
                  <div>
                    <strong>音乐和校园路线都准备好了</strong>
                    <small>
                      跟随强拍收集知识星和惊喜道具，避开路锥、维修坑洼与隔离路障，
                      礼让行人并一路升级到校车大巴。
                    </small>
                  </div>
                </aside>

                {songError && <p className="song-error">{songError}</p>}
                <label className="song-player-name-field">
                  <span>
                    <small>PLAYER NAME</small>
                    <strong>排行榜昵称</strong>
                  </span>
                  <input
                    value={playerName}
                    maxLength={10}
                    onChange={(event) => {
                      const nextName = event.target.value;
                      playerNameRef.current = nextName;
                      setPlayerName(nextName);
                      window.localStorage.setItem(
                        "fan-bus-player-name",
                        nextName,
                      );
                    }}
                    placeholder="请输入校园昵称后出发"
                    aria-label="排行榜昵称"
                  />
                  <em>成绩将以此昵称进入全局排行榜</em>
                </label>
                <div className="result-actions song-start-actions">
                  <button
                    className="primary-button"
                    onClick={() => void startGame()}
                    disabled={!songReady || songLoading || !playerName.trim()}
                  >
                    <img src={UI_ICONS.play} alt="" aria-hidden="true" />
                    {!playerName.trim()
                      ? "请填写排行榜昵称"
                      : songLoading
                        ? "正在载入主题曲…"
                        : songReady
                          ? `用《${songTitle}》出发`
                          : "主题曲加载失败"}
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => setReadyPage("rules")}
                  >
                    查看玩法
                  </button>
                </div>
                <p className="control-hint">
                  ← → / A D 换道 · SPACE 击打 · P / ESC 暂停
                </p>
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
                    返回准备页
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
                      开启后可能让知识星翻倍，也可能直接减少一半。
                      <br />
                      不开启则不会改变当前知识星数量。
                    </p>
                    <div className="lucky-risk-row" aria-label="锦囊可能结果">
                      <div className="lucky-risk-card is-good">
                        <small>GOOD LUCK</small>
                        <strong>
                          <i>↑</i>
                          <span>知识星</span>
                          <b>×2</b>
                        </strong>
                        <em>最高到当前载具收集上限</em>
                      </div>
                      <div className="lucky-risk-random" aria-hidden="true">
                        <b>?</b>
                        <small>随机</small>
                      </div>
                      <div className="lucky-risk-card is-risk">
                        <small>RISK</small>
                        <strong>
                          <i>↓</i>
                          <span>知识星</span>
                          <b>÷2</b>
                        </strong>
                        <em>知识星减半并中断连击</em>
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
                        ? luckyDialog.capped
                          ? `知识星翻倍成功，达到 ${luckyDialog.capacity} 颗上限`
                          : "知识星数量成功翻倍"
                        : "知识星数量减少一半，连击已中断"}
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
                <h2 style={{ color: resultTier.color }}>{resultTier.name}</h2>
                <p className="result-place">
                  {songTitle} · {resultTier.place}
                </p>
                <div className="result-stats">
                  <div>
                    <small>知识星</small>
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
                  校园积分 <strong>{fans}</strong> 知识星 ×{" "}
                  <strong>{maxCombo}</strong> 连击 = <b>{fans * maxCombo}</b>
                </p>
                <p className="coin-formula">
                  称号奖励 {resultTier.coins} + 合拍奖励 {maxCombo * 3}
                </p>
                {leaderboardPanel}
                <button
                  className="share-result-button"
                  onClick={() => setShareCardOpen(true)}
                >
                  <img src={UI_ICONS.star} alt="" aria-hidden="true" />
                  <strong>分享开学人设</strong>
                  <small>
                    {leaderboardSyncing
                      ? "排行榜同步中…"
                      : "分享昵称、歌曲、得分与排名"}
                  </small>
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
                    返回准备页
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
                        setShareCardOpen(false);
                      }
                    }}
                  >
                    <section className="share-card-shell">
                      <button
                        className="share-card-close"
                        onClick={() => setShareCardOpen(false)}
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
                        <div className="share-card-player">
                          <small>STUDENT / 校园新生</small>
                          <strong>{playerName.trim() || "校园新生"}</strong>
                          <span title={songTitle}>《{songTitle}》</span>
                        </div>
                        <div className="share-card-score">
                          <small>KNOWLEDGE SCORE</small>
                          <strong>{fans * maxCombo}</strong>
                          <i />
                        </div>
                        <div className="share-card-rank">
                          <div>
                            <small>CAMPUS RANK</small>
                            <strong>
                              {currentLeaderboardEntry?.rank
                                ? `第 ${currentLeaderboardEntry.rank} 名`
                                : leaderboardSyncing
                                  ? "同步中…"
                                  : "暂未上榜"}
                            </strong>
                          </div>
                          <div>
                            <small>STARS / COMBO</small>
                            <strong>
                              {fans} / ×{maxCombo}
                            </strong>
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
                        <p>这次开学，我的隐藏人设被发现了。</p>
                      </article>
                      <div className="share-card-actions">
                        <button
                          className="primary-button"
                          onClick={() => void shareResult()}
                          disabled={shareBusy || leaderboardSyncing}
                        >
                          {leaderboardSyncing
                            ? "等待排名…"
                            : shareBusy
                              ? "生成中…"
                              : "分享给好友"}
                        </button>
                        <button
                          className="secondary-button"
                          onClick={() => void saveShareCard()}
                          disabled={shareBusy || leaderboardSyncing}
                        >
                          保存图片
                        </button>
                      </div>
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
                  <span>本次知识星</span>
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
                    返回准备页
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="mobile-controls">
            <div
              className={`joystick-control ${status !== "playing" ? "is-disabled" : ""}`}
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
                  event.currentTarget.setPointerCapture(event.pointerId);
                  updateJoystick(event.clientX, event.currentTarget);
                }}
                onPointerMove={(event) => {
                  if (joystickPointerRef.current !== event.pointerId) return;
                  event.preventDefault();
                  updateJoystick(event.clientX, event.currentTarget);
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
              className="hit-button"
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
