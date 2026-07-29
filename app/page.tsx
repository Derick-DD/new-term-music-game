"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const GAME_WIDTH = 480;
const GAME_HEIGHT = 720;
const ROAD_LEFT = 42;
const ROAD_WIDTH = 396;
const LANE_WIDTH = ROAD_WIDTH / 5;
const PLAYER_Y = 584;
const STARTING_FANS = 12;
const TRAVEL_BEATS = 4;

type GameStatus = "ready" | "playing" | "finished" | "failed";
type EntityType = "fan" | "obstacle" | "lucky";
type ObstacleType = "cone" | "speaker" | "barrier";
type ToastTone = "cyan" | "pink" | "gold" | "danger";
type TrackId = "neon-highway" | "starlight-sprint" | "encore-heartbeat";

type Entity = {
  id: number;
  type: EntityType;
  lane: number;
  y: number;
  spawnAt: number;
  hitAt: number;
  obstacle?: ObstacleType;
  handled: boolean;
  wobble: number;
};

type Pedestrian = {
  startAt: number;
  endAt: number;
  direction: 1 | -1;
  x: number;
  y: number;
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
  icon: string;
};

type Track = {
  id: TrackId;
  name: string;
  english: string;
  description: string;
  tempoLabel: string;
  difficulty: string;
  color: string;
  totalBeats: number;
  grannyBeat: number;
  melody: number[];
  lanePattern: number[];
  bpmAt: (beat: number) => number;
};

const TRACKS: Track[] = [
  {
    id: "neon-highway",
    name: "霓虹公路",
    english: "NEON HIGHWAY",
    description: "稳定四拍，后半段提速",
    tempoLabel: "112 → 124 BPM",
    difficulty: "EASY",
    color: "#72f1ff",
    totalBeats: 64,
    grannyBeat: 38,
    melody: [261.63, 329.63, 392, 523.25, 440, 392, 329.63, 293.66],
    lanePattern: [
      2, 2, 3, 3, 4, 4, 3, 2, 1, 1, 0, 0, 1, 2, 3, 3,
      2, 1, 0, 1, 2, 3, 4, 3, 2, 2, 1, 0, 1, 2, 3, 3,
    ],
    bpmAt: (beat) => (beat < 32 ? 112 : 124),
  },
  {
    id: "starlight-sprint",
    name: "星光冲刺",
    english: "STARLIGHT SPRINT",
    description: "每 16 拍加速，路线更活跃",
    tempoLabel: "104 → 148 BPM",
    difficulty: "HARD",
    color: "#ff4fa3",
    totalBeats: 64,
    grannyBeat: 42,
    melody: [329.63, 392, 493.88, 659.25, 587.33, 493.88, 440, 392],
    lanePattern: [
      2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 1, 2, 3,
      4, 3, 2, 1, 2, 3, 4, 3, 2, 1, 0, 1, 0, 1, 2, 3,
    ],
    bpmAt: (beat) =>
      beat < 16 ? 104 : beat < 32 ? 116 : beat < 48 ? 132 : 148,
  },
  {
    id: "encore-heartbeat",
    name: "返场心跳",
    english: "ENCORE HEARTBEAT",
    description: "中段降速，随后强力返场",
    tempoLabel: "128 → 96 → 136 BPM",
    difficulty: "EXPERT",
    color: "#ffe66d",
    totalBeats: 68,
    grannyBeat: 46,
    melody: [220, 277.18, 329.63, 440, 415.3, 329.63, 277.18, 246.94],
    lanePattern: [
      2, 1, 2, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 2, 3,
      4, 4, 3, 2, 1, 1, 2, 3, 2, 2, 1, 0, 1, 2, 3, 3,
    ],
    bpmAt: (beat) => (beat < 24 ? 128 : beat < 40 ? 96 : 136),
  },
];

function getTrack(id: TrackId) {
  return TRACKS.find((track) => track.id === id) ?? TRACKS[0];
}

function getBeatTimes(track: Track) {
  const times = [0];
  for (let beat = 0; beat < track.totalBeats + TRAVEL_BEATS + 2; beat += 1) {
    times.push(times[times.length - 1] + 60_000 / track.bpmAt(beat));
  }
  return times;
}

function getNearestBeat(elapsed: number, beatTimes: number[]) {
  let low = 0;
  let high = beatTimes.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (beatTimes[middle] < elapsed) low = middle + 1;
    else high = middle;
  }
  const next = low;
  const previous = Math.max(0, next - 1);
  return Math.abs(beatTimes[next] - elapsed) <
    Math.abs(beatTimes[previous] - elapsed)
    ? next
    : previous;
}

function laneCenter(lane: number) {
  return ROAD_LEFT + LANE_WIDTH * lane + LANE_WIDTH / 2;
}

function clampLane(lane: number) {
  return Math.max(0, Math.min(4, lane));
}

function getConcertTier(fans: number): ConcertTier {
  if (fans >= 80) {
    return {
      name: "星河体育场",
      place: "五万人全景演唱会",
      coins: 880,
      color: "#ffe66d",
      icon: "✦",
    };
  }
  if (fans >= 55) {
    return {
      name: "霓虹体育馆",
      place: "万人应援演唱会",
      coins: 560,
      color: "#72f1ff",
      icon: "★",
    };
  }
  if (fans >= 35) {
    return {
      name: "城市剧场",
      place: "千人专场",
      coins: 320,
      color: "#ff7ac8",
      icon: "♪",
    };
  }
  if (fans >= 20) {
    return {
      name: "星光 Livehouse",
      place: "百人见面会",
      coins: 180,
      color: "#bca7ff",
      icon: "♫",
    };
  }
  return {
    name: "街角快闪",
    place: "小型惊喜舞台",
    coins: 80,
    color: "#a8ff78",
    icon: "♬",
  };
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const statusRef = useRef<GameStatus>("ready");
  const laneRef = useRef(2);
  const busXRef = useRef(laneCenter(2));
  const fansRef = useRef(STARTING_FANS);
  const comboRef = useRef(0);
  const maxComboRef = useRef(0);
  const beatRef = useRef(0);
  const nextBeatRef = useRef(0);
  const beatTimesRef = useRef<number[]>(getBeatTimes(TRACKS[0]));
  const trackRef = useRef<Track>(TRACKS[0]);
  const startTimeRef = useRef(0);
  const lastTimeRef = useRef(0);
  const lastHudRef = useRef(0);
  const entityIdRef = useRef(0);
  const entitiesRef = useRef<Entity[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const floatTextRef = useRef<FloatText[]>([]);
  const pedestrianRef = useRef<Pedestrian | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const mutedRef = useRef(false);
  const beatPulseRef = useRef(0);
  const shakeRef = useRef(0);
  const hitFlashRef = useRef(0);
  const invulnerableUntilRef = useRef(0);
  const lastMoveBeatRef = useRef(-1);
  const shieldRef = useRef(false);
  const perfectCountRef = useRef(0);
  const arrangementShiftRef = useRef(0);
  const arrangementUntilRef = useRef(-1);
  const grannyWarnedRef = useRef(false);
  const toastTimerRef = useRef<number | null>(null);

  const [status, setStatus] = useState<GameStatus>("ready");
  const [selectedTrackId, setSelectedTrackId] =
    useState<TrackId>("neon-highway");
  const [fans, setFans] = useState(STARTING_FANS);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [progress, setProgress] = useState(0);
  const [beatIndex, setBeatIndex] = useState(0);
  const [currentBpm, setCurrentBpm] = useState(TRACKS[0].bpmAt(0));
  const [arrangement, setArrangement] = useState<"normal" | "variation">(
    "normal",
  );
  const [muted, setMuted] = useState(false);
  const [shield, setShield] = useState(false);
  const [bestFans, setBestFans] = useState(0);
  const [bankCoins, setBankCoins] = useState(0);
  const [earnedCoins, setEarnedCoins] = useState(0);
  const [resultTier, setResultTier] = useState<ConcertTier>(
    getConcertTier(STARTING_FANS),
  );
  const [toast, setToast] = useState<{
    text: string;
    tone: ToastTone;
    key: number;
  } | null>(null);
  const selectedTrack = getTrack(selectedTrackId);

  const showToast = useCallback((text: string, tone: ToastTone) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast({ text, tone, key: Date.now() });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 820);
  }, []);

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

  const playBeat = useCallback((beat: number) => {
    const audio = audioRef.current;
    if (!audio || mutedRef.current) return;

    const track = trackRef.current;
    const isVariation = beat < arrangementUntilRef.current;
    const pitchRatio = 2 ** ((isVariation ? arrangementShiftRef.current : 0) / 12);
    const beatSeconds = 60 / track.bpmAt(beat);
    const now = audio.currentTime;
    const kick = audio.createOscillator();
    const kickGain = audio.createGain();
    kick.type = "sine";
    kick.frequency.setValueAtTime(isVariation ? 92 : 120, now);
    kick.frequency.exponentialRampToValueAtTime(isVariation ? 38 : 48, now + 0.13);
    kickGain.gain.setValueAtTime(isVariation ? 0.42 : 0.34, now);
    kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    kick.connect(kickGain).connect(audio.destination);
    kick.start(now);
    kick.stop(now + 0.18);

    const note = audio.createOscillator();
    const noteGain = audio.createGain();
    note.type = isVariation ? "sawtooth" : beat % 4 === 0 ? "square" : "triangle";
    note.frequency.setValueAtTime(
      track.melody[beat % track.melody.length] * pitchRatio,
      now,
    );
    note.detune.setValueAtTime(isVariation && beat % 2 ? -18 : 0, now);
    noteGain.gain.setValueAtTime(
      isVariation ? 0.055 : beat % 2 === 0 ? 0.075 : 0.045,
      now,
    );
    noteGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    note.connect(noteGain).connect(audio.destination);
    note.start(now);
    note.stop(now + 0.17);

    if (beat % 2 === 0) {
      const bass = audio.createOscillator();
      const bassGain = audio.createGain();
      bass.type = isVariation ? "square" : "triangle";
      bass.frequency.setValueAtTime(
        (track.melody[(beat + 4) % track.melody.length] / 4) * pitchRatio,
        now,
      );
      bassGain.gain.setValueAtTime(0.07, now);
      bassGain.gain.exponentialRampToValueAtTime(0.001, now + beatSeconds * 0.72);
      bass.connect(bassGain).connect(audio.destination);
      bass.start(now);
      bass.stop(now + beatSeconds * 0.75);
    }

    if (beat % 4 === 2) {
      const snareBuffer = audio.createBuffer(
        1,
        Math.floor(audio.sampleRate * 0.11),
        audio.sampleRate,
      );
      const data = snareBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      }
      const snare = audio.createBufferSource();
      const snareGain = audio.createGain();
      snare.buffer = snareBuffer;
      snareGain.gain.setValueAtTime(0.1, now);
      snareGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
      snare.connect(snareGain).connect(audio.destination);
      snare.start(now);
    }

    if (isVariation) {
      const echo = audio.createOscillator();
      const echoGain = audio.createGain();
      const echoStart = now + beatSeconds * 0.5;
      echo.type = "square";
      echo.frequency.setValueAtTime(
        track.melody[(beat + 3) % track.melody.length] * pitchRatio,
        echoStart,
      );
      echoGain.gain.setValueAtTime(0.038, echoStart);
      echoGain.gain.exponentialRampToValueAtTime(0.001, echoStart + 0.1);
      echo.connect(echoGain).connect(audio.destination);
      echo.start(echoStart);
      echo.stop(echoStart + 0.12);
    }
  }, []);

  const spawnBeat = useCallback((beat: number) => {
    const track = trackRef.current;
    if (beat >= track.totalBeats - TRAVEL_BEATS) return;

    const safeLane = track.lanePattern[beat % track.lanePattern.length];
    const spawnY = -70;
    const spawnAt = beatTimesRef.current[beat];
    const hitAt = beatTimesRef.current[beat + TRAVEL_BEATS];

    if (beat > 0) {
      if (beat % 16 === 15) {
        entitiesRef.current.push({
          id: entityIdRef.current++,
          type: "lucky",
          lane: safeLane,
          y: spawnY,
          spawnAt,
          hitAt,
          handled: false,
          wobble: Math.random() * Math.PI,
        });
      } else {
        entitiesRef.current.push({
          id: entityIdRef.current++,
          type: "fan",
          lane: safeLane,
          y: spawnY,
          spawnAt,
          hitAt,
          handled: false,
          wobble: Math.random() * Math.PI,
        });
      }
    }

    if (beat < 2) return;
    const obstacleCount = beat > 12 && beat % 4 === 0 ? 2 : 1;
    const used = new Set<number>([safeLane]);
    for (let i = 0; i < obstacleCount; i += 1) {
      let obstacleLane = (beat * 2 + i * 3) % 5;
      while (used.has(obstacleLane)) {
        obstacleLane = (obstacleLane + 1) % 5;
      }
      used.add(obstacleLane);
      const obstacleTypes: ObstacleType[] = ["cone", "speaker", "barrier"];
      entitiesRef.current.push({
        id: entityIdRef.current++,
        type: "obstacle",
        obstacle: obstacleTypes[(beat + i) % obstacleTypes.length],
        lane: obstacleLane,
        y: spawnY - i * 8,
        spawnAt,
        hitAt,
        handled: false,
        wobble: Math.random() * Math.PI,
      });
    }
  }, []);

  const triggerDamageVariation = useCallback(() => {
    arrangementShiftRef.current = beatRef.current % 2 === 0 ? -3 : 2;
    arrangementUntilRef.current = beatRef.current + 8;
    setArrangement("variation");

    const audio = audioRef.current;
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
      const visualSpeed = 180 + trackRef.current.bpmAt(beatRef.current) * 1.2;
      const roadOffset = ((elapsed / 1000) * visualSpeed) % 92;
      const shakeX = shakeRef.current > 0 ? (Math.random() - 0.5) * 12 : 0;
      const shakeY = shakeRef.current > 0 ? (Math.random() - 0.5) * 8 : 0;

      ctx.save();
      ctx.translate(shakeX, shakeY);
      ctx.clearRect(-16, -16, GAME_WIDTH + 32, GAME_HEIGHT + 32);
      ctx.fillStyle = "#090823";
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

      // Pixel city and sidewalks.
      ctx.fillStyle = pulse > 0 ? "#1d174f" : "#15113b";
      ctx.fillRect(0, 0, ROAD_LEFT, GAME_HEIGHT);
      ctx.fillRect(ROAD_LEFT + ROAD_WIDTH, 0, GAME_WIDTH - ROAD_LEFT - ROAD_WIDTH, GAME_HEIGHT);
      for (let y = -92 + roadOffset; y < GAME_HEIGHT + 92; y += 92) {
        ctx.fillStyle = "#272054";
        ctx.fillRect(5, y, 31, 78);
        ctx.fillRect(444, y, 31, 78);
        ctx.fillStyle = y % 184 < 10 ? "#ff4faf" : "#5ff6ff";
        ctx.fillRect(10, y + 12, 10, 15);
        ctx.fillRect(459, y + 36, 10, 15);
        ctx.fillStyle = "#ffe66d";
        ctx.fillRect(24, y + 45, 6, 12);
        ctx.fillRect(447, y + 9, 6, 12);
      }

      // Neon road.
      ctx.fillStyle = "#111129";
      ctx.fillRect(ROAD_LEFT, 0, ROAD_WIDTH, GAME_HEIGHT);
      ctx.fillStyle = "#2a245b";
      ctx.fillRect(ROAD_LEFT, 0, 5, GAME_HEIGHT);
      ctx.fillRect(ROAD_LEFT + ROAD_WIDTH - 5, 0, 5, GAME_HEIGHT);
      ctx.fillStyle = `rgba(114, 241, 255, ${0.22 + pulse * 0.5})`;
      ctx.fillRect(ROAD_LEFT + 5, 0, 2, GAME_HEIGHT);
      ctx.fillStyle = `rgba(255, 77, 166, ${0.22 + pulse * 0.5})`;
      ctx.fillRect(ROAD_LEFT + ROAD_WIDTH - 7, 0, 2, GAME_HEIGHT);

      for (let lane = 1; lane < 5; lane += 1) {
        const x = ROAD_LEFT + lane * LANE_WIDTH;
        for (let y = -60 + roadOffset; y < GAME_HEIGHT; y += 92) {
          ctx.fillStyle = `rgba(225, 231, 255, ${0.18 + pulse * 0.14})`;
          ctx.fillRect(Math.round(x - 2), Math.round(y), 4, 45);
        }
      }

      // Beat hit line.
      ctx.fillStyle = `rgba(255, 230, 109, ${0.06 + pulse * 0.22})`;
      ctx.fillRect(ROAD_LEFT + 7, PLAYER_Y - 4, ROAD_WIDTH - 14, 8);
      ctx.fillStyle = `rgba(255, 255, 255, ${pulse * 0.65})`;
      for (let lane = 0; lane < 5; lane += 1) {
        ctx.fillRect(laneCenter(lane) - 18, PLAYER_Y - 6, 36, 3);
      }

      // Speed lines.
      ctx.fillStyle = "rgba(114, 241, 255, 0.22)";
      for (let i = 0; i < 8; i += 1) {
        const x = ROAD_LEFT + 18 + ((i * 83 + beatRef.current * 17) % (ROAD_WIDTH - 36));
        const y = (roadOffset * 2 + i * 113) % GAME_HEIGHT;
        ctx.fillRect(x, y, 2, 18 + (i % 3) * 8);
      }

      // Pedestrian crossing event.
      const pedestrian = pedestrianRef.current;
      if (pedestrian) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.62)";
        for (let x = ROAD_LEFT + 10; x < ROAD_LEFT + ROAD_WIDTH - 10; x += 34) {
          ctx.fillRect(x, pedestrian.y - 42, 21, 8);
          ctx.fillRect(x, pedestrian.y + 36, 21, 8);
        }
        ctx.fillStyle = "rgba(255, 230, 109, 0.12)";
        ctx.fillRect(ROAD_LEFT + 7, pedestrian.y - 48, ROAD_WIDTH - 14, 96);

        ctx.save();
        ctx.translate(Math.round(pedestrian.x), pedestrian.y);
        if (pedestrian.direction === -1) ctx.scale(-1, 1);
        ctx.fillStyle = "#d9d3f5";
        ctx.fillRect(-10, -27, 18, 19);
        ctx.fillStyle = "#f2d0b4";
        ctx.fillRect(-8, -18, 15, 15);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(-5, -17, 4, 4);
        ctx.fillStyle = "#a178ff";
        ctx.fillRect(-12, -6, 23, 27);
        ctx.fillStyle = "#6944c4";
        ctx.fillRect(-16, 13, 31, 11);
        ctx.fillStyle = "#f2d0b4";
        ctx.fillRect(10, -2, 7, 18);
        ctx.fillStyle = "#ffe66d";
        ctx.fillRect(15, 8, 4, 32);
        ctx.fillStyle = "#332757";
        ctx.fillRect(-10, 24, 7, 11);
        ctx.fillRect(6, 24, 7, 11);
        ctx.restore();
      }

      // Entities.
      for (const entity of entitiesRef.current) {
        const x = laneCenter(entity.lane);
        const wobble = Math.sin(elapsed / 160 + entity.wobble) * 3;
        ctx.save();
        ctx.translate(Math.round(x + wobble), Math.round(entity.y));

        if (entity.type === "fan") {
          ctx.shadowColor = "#72f1ff";
          ctx.shadowBlur = 13;
          ctx.fillStyle = "#72f1ff";
          ctx.fillRect(-6, -21, 12, 26);
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(-3, -18, 6, 18);
          ctx.shadowBlur = 0;
          ctx.fillStyle = "#ff4fa3";
          ctx.fillRect(-8, 5, 16, 9);
          ctx.fillStyle = "#ffe66d";
          ctx.fillRect(-4, 8, 8, 3);
          ctx.fillStyle = "rgba(114, 241, 255, 0.25)";
          ctx.fillRect(-13, -26, 26, 35);
        } else if (entity.type === "lucky") {
          ctx.shadowColor = "#ffe66d";
          ctx.shadowBlur = 15;
          ctx.fillStyle = "#8c5bff";
          ctx.fillRect(-18, -17, 36, 34);
          ctx.fillStyle = "#c9a9ff";
          ctx.fillRect(-12, -22, 24, 7);
          ctx.fillStyle = "#ffe66d";
          ctx.fillRect(-4, -9, 8, 14);
          ctx.fillRect(-4, 8, 8, 5);
          ctx.shadowBlur = 0;
          ctx.strokeStyle = "#fff2a8";
          ctx.lineWidth = 3;
          ctx.strokeRect(-18, -17, 36, 34);
        } else if (entity.obstacle === "cone") {
          ctx.fillStyle = "rgba(255, 86, 94, 0.2)";
          ctx.fillRect(-23, -22, 46, 44);
          ctx.fillStyle = "#ff6b4a";
          ctx.beginPath();
          ctx.moveTo(0, -23);
          ctx.lineTo(18, 16);
          ctx.lineTo(-18, 16);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "#fff4d8";
          ctx.fillRect(-11, -1, 22, 7);
          ctx.fillStyle = "#ff9d4d";
          ctx.fillRect(-24, 16, 48, 8);
        } else if (entity.obstacle === "speaker") {
          ctx.fillStyle = "#35284e";
          ctx.fillRect(-24, -29, 48, 58);
          ctx.strokeStyle = "#ff4fa3";
          ctx.lineWidth = 3;
          ctx.strokeRect(-24, -29, 48, 58);
          ctx.fillStyle = "#0c0c1c";
          ctx.beginPath();
          ctx.arc(0, 11, 13, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#72f1ff";
          ctx.beginPath();
          ctx.arc(0, 11, 6 + pulse * 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#ffe66d";
          ctx.fillRect(-5, -19, 10, 10);
        } else {
          ctx.fillStyle = "#f7f1ff";
          ctx.fillRect(-31, -20, 62, 12);
          ctx.fillRect(-31, 4, 62, 12);
          ctx.fillStyle = "#ff526f";
          for (let i = -28; i < 29; i += 20) {
            ctx.fillRect(i, -20, 10, 12);
            ctx.fillRect(i + 10, 4, 10, 12);
          }
          ctx.fillStyle = "#f5a623";
          ctx.fillRect(-25, 16, 8, 14);
          ctx.fillRect(17, 16, 8, 14);
        }
        ctx.restore();
      }

      // Bus shadow and body.
      const busX = busXRef.current;
      ctx.save();
      ctx.translate(Math.round(busX), PLAYER_Y);
      ctx.fillStyle = "rgba(0,0,0,0.38)";
      ctx.fillRect(-31, 45, 62, 16);
      if (shieldRef.current) {
        ctx.strokeStyle = `rgba(114, 241, 255, ${0.55 + pulse * 0.35})`;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(0, 4, 48 + pulse * 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = "#121225";
      ctx.fillRect(-37, -37, 9, 24);
      ctx.fillRect(28, -37, 9, 24);
      ctx.fillRect(-37, 21, 9, 24);
      ctx.fillRect(28, 21, 9, 24);
      ctx.fillStyle = "#ff4fa3";
      ctx.fillRect(-31, -52, 62, 105);
      ctx.fillStyle = "#ff78bf";
      ctx.fillRect(-25, -46, 50, 92);
      ctx.fillStyle = "#2c225e";
      ctx.fillRect(-21, -38, 42, 29);
      ctx.fillStyle = "#72f1ff";
      ctx.fillRect(-17, -34, 14, 18);
      ctx.fillRect(3, -34, 14, 18);
      ctx.fillStyle = "#ffd5aa";
      ctx.fillRect(-13, -29, 6, 7);
      ctx.fillRect(7, -29, 6, 7);
      ctx.fillStyle = "#201740";
      ctx.fillRect(-12, -27, 2, 2);
      ctx.fillRect(8, -27, 2, 2);
      ctx.fillStyle = "#ffe66d";
      ctx.font = "bold 23px monospace";
      ctx.textAlign = "center";
      ctx.fillText("★", 0, 24);
      ctx.fillStyle = "#fff7bd";
      ctx.fillRect(-22, 40, 14, 7);
      ctx.fillRect(8, 40, 14, 7);
      ctx.fillStyle = "#ff285f";
      ctx.fillRect(-20, -50, 12, 5);
      ctx.fillRect(8, -50, 12, 5);
      ctx.restore();

      // Particles and score text.
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
        ctx.fillStyle = "#0b0920";
        ctx.fillText(item.text, item.x + 2, item.y + 2);
        ctx.fillStyle = item.color;
        ctx.fillText(item.text, item.x, item.y);
      }
      ctx.globalAlpha = 1;

      if (hitFlashRef.current > 0) {
        ctx.fillStyle = `rgba(255, 40, 95, ${hitFlashRef.current * 0.38})`;
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      }
      ctx.restore();
    },
    [],
  );

  const finishGame = useCallback(() => {
    if (statusRef.current !== "playing") return;
    statusRef.current = "finished";
    setStatus("finished");
    setProgress(100);

    const tier = getConcertTier(fansRef.current);
    const coins = tier.coins + maxComboRef.current * 3;
    setEarnedCoins(coins);
    setResultTier(tier);
    setFans(fansRef.current);
    setCombo(comboRef.current);
    setMaxCombo(maxComboRef.current);

    const previousCoins = Number(window.localStorage.getItem("fan-bus-coins") || 0);
    const previousBest = Number(window.localStorage.getItem("fan-bus-best") || 0);
    const nextCoins = previousCoins + coins;
    const nextBest = Math.max(previousBest, fansRef.current);
    window.localStorage.setItem("fan-bus-coins", String(nextCoins));
    window.localStorage.setItem("fan-bus-best", String(nextBest));
    setBankCoins(nextCoins);
    setBestFans(nextBest);

    addBurst(GAME_WIDTH / 2, PLAYER_Y - 120, tier.color, 38);
    if (audioRef.current) {
      void audioRef.current.close();
      audioRef.current = null;
    }
  }, [addBurst]);

  const failGame = useCallback(() => {
    if (statusRef.current !== "playing") return;
    statusRef.current = "failed";
    setStatus("failed");
    setEarnedCoins(0);
    setProgress(100);
    shakeRef.current = 0.7;
    hitFlashRef.current = 1;
    addBurst(busXRef.current, PLAYER_Y - 8, "#ffe66d", 34);

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
    window.setTimeout(() => {
      if (audioRef.current) {
        void audioRef.current.close();
        audioRef.current = null;
      }
    }, 500);
  }, [addBurst]);

  const gameLoop = useCallback(
    (now: number) => {
      if (statusRef.current !== "playing") return;
      const delta = Math.min(0.035, Math.max(0, (now - lastTimeRef.current) / 1000));
      lastTimeRef.current = now;
      const elapsed = now - startTimeRef.current;
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
        playBeat(beat);
        spawnBeat(beat);

        if (beat === track.grannyBeat - 4 && !grannyWarnedRef.current) {
          grannyWarnedRef.current = true;
          showToast("注意！前方有人过马路", "gold");
        }
        if (beat === track.grannyBeat) {
          pedestrianRef.current = {
            startAt: beatTimes[beat],
            endAt: beatTimes[Math.min(beat + 10, beatTimes.length - 1)],
            direction: track.id === "starlight-sprint" ? -1 : 1,
            x: track.id === "starlight-sprint" ? ROAD_LEFT + ROAD_WIDTH + 24 : ROAD_LEFT - 24,
            y: PLAYER_Y - 6,
          };
          showToast("行人正在通过 · 立即避让", "danger");
        }
        if (
          arrangementUntilRef.current > 0 &&
          beat >= arrangementUntilRef.current
        ) {
          arrangementUntilRef.current = -1;
          arrangementShiftRef.current = 0;
          setArrangement("normal");
          showToast("伴奏恢复原调", "cyan");
        }

        nextBeatRef.current += 1;
        setBeatIndex(beat);
      }

      busXRef.current +=
        (laneCenter(laneRef.current) - busXRef.current) * Math.min(1, delta * 14);

      for (const entity of entitiesRef.current) {
        const travelProgress =
          (elapsed - entity.spawnAt) / Math.max(1, entity.hitAt - entity.spawnAt);
        entity.y = -70 + (PLAYER_Y + 70) * travelProgress;
        const colliding =
          !entity.handled &&
          entity.lane === laneRef.current &&
          entity.y > PLAYER_Y - 48 &&
          entity.y < PLAYER_Y + 52;

        if (!colliding) continue;

        const x = laneCenter(entity.lane);
        if (entity.type === "fan") {
          entity.handled = true;
          fansRef.current += 1;
          setFans(fansRef.current);
          addBurst(x, PLAYER_Y - 22, "#72f1ff", 9);
          addFloatText(x, PLAYER_Y - 55, "+1 粉丝", "#72f1ff");
          showToast("应援棒 +1 粉丝", "cyan");
        } else if (entity.type === "lucky") {
          entity.handled = true;
          const doubled = Math.random() < 0.55;
          if (doubled) {
            fansRef.current *= 2;
            addFloatText(x, PLAYER_Y - 58, "粉丝 ×2!", "#ffe66d");
            showToast("欧气爆棚！粉丝翻倍", "gold");
            addBurst(x, PLAYER_Y - 10, "#ffe66d", 22);
          } else {
            fansRef.current = Math.max(1, Math.floor(fansRef.current / 2));
            comboRef.current = 0;
            setCombo(0);
            addFloatText(x, PLAYER_Y - 58, "粉丝 ÷2", "#ff7ac8");
            showToast("锦囊反转…粉丝减半", "pink");
            addBurst(x, PLAYER_Y - 10, "#ff7ac8", 18);
          }
          setFans(fansRef.current);
        } else {
          entity.handled = true;
          if (now < invulnerableUntilRef.current) continue;
          invulnerableUntilRef.current = now + 720;
          const baseLoss =
            entity.obstacle === "barrier"
              ? 10
              : entity.obstacle === "speaker"
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
          triggerDamageVariation();
          addBurst(x, PLAYER_Y, "#ff375f", 17);
          addFloatText(x, PLAYER_Y - 58, `-${actualLoss} 粉丝`, "#ff526f");
          showToast(`掉粉 -${actualLoss} · 伴奏变调 8 拍`, "danger");
        }
      }

      entitiesRef.current = entitiesRef.current.filter(
        (entity) => !entity.handled && entity.y < GAME_HEIGHT + 90,
      );

      const pedestrian = pedestrianRef.current;
      if (pedestrian) {
        const crossingProgress =
          (elapsed - pedestrian.startAt) /
          Math.max(1, pedestrian.endAt - pedestrian.startAt);
        const fromX =
          pedestrian.direction === 1 ? ROAD_LEFT - 24 : ROAD_LEFT + ROAD_WIDTH + 24;
        const toX =
          pedestrian.direction === 1 ? ROAD_LEFT + ROAD_WIDTH + 24 : ROAD_LEFT - 24;
        pedestrian.x = fromX + (toX - fromX) * crossingProgress;

        if (
          crossingProgress >= 0 &&
          crossingProgress <= 1 &&
          Math.abs(pedestrian.x - busXRef.current) < 36
        ) {
          failGame();
          return;
        }
        if (crossingProgress > 1.05) {
          pedestrianRef.current = null;
          showToast("行人已安全通过", "cyan");
        }
      }

      for (const particle of particlesRef.current) {
        particle.x += particle.vx * delta;
        particle.y += particle.vy * delta;
        particle.vy += 115 * delta;
        particle.life -= delta;
      }
      particlesRef.current = particlesRef.current.filter((item) => item.life > 0);

      for (const item of floatTextRef.current) {
        item.y -= 38 * delta;
        item.life -= delta;
      }
      floatTextRef.current = floatTextRef.current.filter((item) => item.life > 0);

      beatPulseRef.current = Math.max(0, beatPulseRef.current - delta * 4.6);
      shakeRef.current = Math.max(0, shakeRef.current - delta);
      hitFlashRef.current = Math.max(0, hitFlashRef.current - delta * 3.4);

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (ctx) drawGame(ctx, elapsed);

      if (elapsed - lastHudRef.current > 100) {
        lastHudRef.current = elapsed;
        setProgress(
          Math.min(100, (elapsed / beatTimes[track.totalBeats]) * 100),
        );
      }

      if (elapsed >= beatTimes[track.totalBeats]) {
        finishGame();
        return;
      }

      animationRef.current = window.requestAnimationFrame(gameLoop);
    },
    [
      addBurst,
      addFloatText,
      drawGame,
      failGame,
      finishGame,
      playBeat,
      showToast,
      spawnBeat,
      triggerDamageVariation,
    ],
  );

  const startGame = useCallback(() => {
    if (animationRef.current) {
      window.cancelAnimationFrame(animationRef.current);
    }
    if (audioRef.current) {
      void audioRef.current.close();
    }

    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    audioRef.current = AudioContextClass ? new AudioContextClass() : null;

    trackRef.current = selectedTrack;
    beatTimesRef.current = getBeatTimes(selectedTrack);
    window.localStorage.setItem("fan-bus-track", selectedTrack.id);
    statusRef.current = "playing";
    setStatus("playing");
    laneRef.current = 2;
    busXRef.current = laneCenter(2);
    fansRef.current = STARTING_FANS;
    comboRef.current = 0;
    maxComboRef.current = 0;
    beatRef.current = 0;
    nextBeatRef.current = 0;
    entityIdRef.current = 0;
    entitiesRef.current = [];
    particlesRef.current = [];
    floatTextRef.current = [];
    pedestrianRef.current = null;
    shieldRef.current = false;
    perfectCountRef.current = 0;
    lastMoveBeatRef.current = -1;
    arrangementShiftRef.current = 0;
    arrangementUntilRef.current = -1;
    grannyWarnedRef.current = false;
    invulnerableUntilRef.current = 0;
    beatPulseRef.current = 0;
    shakeRef.current = 0;
    hitFlashRef.current = 0;
    setFans(STARTING_FANS);
    setCombo(0);
    setMaxCombo(0);
    setProgress(0);
    setShield(false);
    setCurrentBpm(selectedTrack.bpmAt(0));
    setArrangement("normal");
    setToast(null);

    const now = performance.now();
    startTimeRef.current = now;
    lastTimeRef.current = now;
    lastHudRef.current = 0;
    animationRef.current = window.requestAnimationFrame(gameLoop);
  }, [gameLoop, selectedTrack]);

  const move = useCallback(
    (direction: -1 | 1) => {
      if (statusRef.current !== "playing") return;
      const nextLane = clampLane(laneRef.current + direction);
      if (nextLane === laneRef.current) return;
      laneRef.current = nextLane;

      const elapsed = performance.now() - startTimeRef.current;
      const nearestBeat = getNearestBeat(elapsed, beatTimesRef.current);
      const distance = Math.abs(elapsed - beatTimesRef.current[nearestBeat]);
      const localBeatMs = 60_000 / trackRef.current.bpmAt(nearestBeat);
      const perfectWindow = Math.min(125, localBeatMs * 0.25);
      const goodWindow = Math.min(220, localBeatMs * 0.43);
      if (nearestBeat === lastMoveBeatRef.current) return;
      lastMoveBeatRef.current = nearestBeat;

      if (distance <= perfectWindow) {
        comboRef.current += 1;
        maxComboRef.current = Math.max(maxComboRef.current, comboRef.current);
        perfectCountRef.current += 1;
        setCombo(comboRef.current);
        setMaxCombo(maxComboRef.current);
        addBurst(laneCenter(nextLane), PLAYER_Y + 26, "#ffe66d", 7);
        addFloatText(
          laneCenter(nextLane),
          PLAYER_Y - 66,
          "PERFECT!",
          "#ffe66d",
        );
        if (perfectCountRef.current % 8 === 0 && !shieldRef.current) {
          shieldRef.current = true;
          setShield(true);
          showToast("8 次合拍！获得应援护盾", "gold");
        }
      } else if (distance <= goodWindow) {
        addFloatText(laneCenter(nextLane), PLAYER_Y - 66, "GOOD", "#72f1ff");
      } else {
        comboRef.current = 0;
        setCombo(0);
        addFloatText(laneCenter(nextLane), PLAYER_Y - 66, "MISS", "#ff7ac8");
      }
    },
    [addBurst, addFloatText, showToast],
  );

  const toggleMute = useCallback(() => {
    mutedRef.current = !mutedRef.current;
    setMuted(mutedRef.current);
  }, []);

  useEffect(() => {
    const savedBest = Number(window.localStorage.getItem("fan-bus-best") || 0);
    const savedCoins = Number(window.localStorage.getItem("fan-bus-coins") || 0);
    const savedTrack = window.localStorage.getItem("fan-bus-track") as TrackId | null;
    setBestFans(savedBest);
    setBankCoins(savedCoins);
    if (savedTrack && TRACKS.some((track) => track.id === savedTrack)) {
      setSelectedTrackId(savedTrack);
    }

    const keydown = (event: KeyboardEvent) => {
      if (["ArrowLeft", "ArrowRight", " ", "a", "A", "d", "D"].includes(event.key)) {
        event.preventDefault();
      }
      if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") {
        move(-1);
      } else if (
        event.key === "ArrowRight" ||
        event.key === "d" ||
        event.key === "D"
      ) {
        move(1);
      } else if (event.key === "m" || event.key === "M") {
        toggleMute();
      } else if (event.key === " " && statusRef.current !== "playing") {
        startGame();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [move, startGame, toggleMute]);

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
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, [drawGame]);

  return (
    <main className="arcade-page">
      <div className="sky-grid" aria-hidden="true" />
      <header className="topbar">
        <div className="brand">
          <span className="brand-kicker">
            PIXEL TOUR / {status === "playing" ? currentBpm : selectedTrack.bpmAt(0)} BPM
          </span>
          <span className="brand-title">应援巴士</span>
        </div>
        <div className="meta-strip" aria-label="游戏记录">
          <span>
            <small>BEST</small>
            {bestFans} 粉丝
          </span>
          <span>
            <small>BANK</small>
            <b className="coin-dot">●</b> {bankCoins}
          </span>
          <button
            className="sound-button"
            onClick={toggleMute}
            aria-label={muted ? "打开声音" : "关闭声音"}
          >
            {muted ? "SOUND OFF" : "SOUND ON"}
          </button>
        </div>
      </header>

      <section className="game-layout">
        <aside className="side-panel mission-panel" aria-label="巡演任务">
          <span className="panel-number">01</span>
          <p className="eyebrow">TONIGHT&apos;S MISSION</p>
          <h2>载着明星，奔赴下一场演唱会</h2>
          <div className="pixel-rule" />
          <ul>
            <li><i className="legend fan-stick" />应援棒：粉丝 +1</li>
            <li><i className="legend warning" />障碍物：掉粉并触发变调</li>
            <li><i className="legend lucky-bag">?</i>锦囊：×2 或 ÷2</li>
            <li><i className="legend pedestrian-icon">♿</i>行人：立即避让</li>
          </ul>
          <p className="tip-copy">
            应援棒会沿每首歌的节拍路线出现；节奏加速或转折时，路线也会随之换道。
          </p>
        </aside>

        <div className="game-cabinet">
          <div className="cabinet-top">
            <div>
              <span className="live-dot" />
              {status === "playing" ? selectedTrack.english : "SELECT A TRACK"}
            </div>
            <div className="bpm-bars" aria-hidden="true">
              {[0, 1, 2, 3].map((bar) => (
                <i
                  key={bar}
                  className={beatIndex % 4 === bar && status === "playing" ? "active" : ""}
                />
              ))}
            </div>
          </div>

          <div className="hud">
            <div className="hud-block">
              <span>FANS</span>
              <strong>{String(fans).padStart(3, "0")}</strong>
            </div>
            <div className="hud-block combo-block">
              <span>BEAT COMBO</span>
              <strong>×{combo}</strong>
            </div>
            <div
              className={`music-state ${arrangement === "variation" ? "is-variation" : ""}`}
            >
              <strong>{currentBpm} BPM</strong>
              <span>
                {arrangement === "variation"
                  ? "伴奏变调中"
                  : shield
                    ? "护盾减伤 READY"
                    : "跟拍换道"}
              </span>
            </div>
          </div>

          <div className="progress-track" aria-label={`巡演进度 ${Math.round(progress)}%`}>
            <span style={{ width: `${progress}%` }} />
          </div>

          <div className="game-screen">
            <canvas
              ref={canvasRef}
              width={GAME_WIDTH}
              height={GAME_HEIGHT}
              aria-label="五车道节奏躲避游戏画面"
            />

            {toast && (
              <div key={toast.key} className={`game-toast tone-${toast.tone}`}>
                {toast.text}
              </div>
            )}

            {status === "ready" && (
              <div className="game-overlay intro-overlay">
                <p className="overlay-kicker">CHOOSE YOUR SONG</p>
                <h1>
                  <span>应援</span>
                  <span>巴士</span>
                </h1>
                <p className="english-title">RHYTHM RUSH</p>
                <div className="track-picker" aria-label="选择歌曲">
                  {TRACKS.map((track) => (
                    <button
                      key={track.id}
                      className={selectedTrackId === track.id ? "is-selected" : ""}
                      style={
                        selectedTrackId === track.id
                          ? { borderColor: track.color, color: track.color }
                          : undefined
                      }
                      onClick={() => setSelectedTrackId(track.id)}
                      aria-pressed={selectedTrackId === track.id}
                    >
                      <span>
                        <b>{track.name}</b>
                        <small>{track.description}</small>
                      </span>
                      <em>{track.tempoLabel}</em>
                      <i>{track.difficulty}</i>
                    </button>
                  ))}
                </div>
                <p className="intro-copy">
                  应援棒就是音符轨迹：听到节拍变化，<br />
                  立刻左右换道追上它！
                </p>
                <button className="primary-button" onClick={startGame}>
                  <span>▶</span> 播放并发车
                </button>
                <p className="control-hint">← → / A D / 下方按钮</p>
              </div>
            )}

            {status === "finished" && (
              <div className="game-overlay result-overlay">
                <p className="overlay-kicker">TOUR COMPLETE</p>
                <div className="stage-icon" style={{ color: resultTier.color }}>
                  {resultTier.icon}
                </div>
                <p className="result-label">今晚成功解锁</p>
                <h2 style={{ color: resultTier.color }}>{resultTier.name}</h2>
                <p className="result-place">
                  {selectedTrack.name} · {resultTier.place}
                </p>
                <div className="result-stats">
                  <div>
                    <small>到场粉丝</small>
                    <strong>{fans}</strong>
                  </div>
                  <div>
                    <small>最高连击</small>
                    <strong>×{maxCombo}</strong>
                  </div>
                  <div>
                    <small>演出金币</small>
                    <strong className="gold-text">+{earnedCoins}</strong>
                  </div>
                </div>
                <p className="coin-formula">
                  场馆奖励 {resultTier.coins} + 合拍奖励 {maxCombo * 3}
                </p>
                <button className="primary-button" onClick={startGame}>
                  再跑一场
                </button>
              </div>
            )}

            {status === "failed" && (
              <div className="game-overlay failed-overlay">
                <p className="overlay-kicker">EMERGENCY STOP</p>
                <div className="failure-sign">!</div>
                <p className="result-label">检测到行人</p>
                <h2>演出取消</h2>
                <p className="failure-copy">
                  大巴紧急刹车保护过马路的老奶奶。<br />
                  本次不获得演出金币，请重新挑战。
                </p>
                <div className="failure-ticket">
                  <span>FINAL FANS</span>
                  <strong>{fans}</strong>
                  <small>COINS +0</small>
                </div>
                <button className="primary-button" onClick={startGame}>
                  重新发车
                </button>
              </div>
            )}
          </div>

          <div className="mobile-controls">
            <button
              onPointerDown={() => move(-1)}
              aria-label="向左换道"
              disabled={status !== "playing"}
            >
              <span>←</span>
              LEFT
            </button>
            <div className="beat-orb" aria-hidden="true">
              <i className={status === "playing" ? "is-playing" : ""} />
              BEAT
            </div>
            <button
              onPointerDown={() => move(1)}
              aria-label="向右换道"
              disabled={status !== "playing"}
            >
              <span>→</span>
              RIGHT
            </button>
          </div>
        </div>

        <aside className="side-panel schedule-panel" aria-label="演唱会等级">
          <span className="panel-number">02</span>
          <p className="eyebrow">VENUE LADDER</p>
          <h2>粉丝越多，舞台越大</h2>
          <div className="venue-list">
            {[
              ["080+", "星河体育场", "880"],
              ["055+", "霓虹体育馆", "560"],
              ["035+", "城市剧场", "320"],
              ["020+", "Livehouse", "180"],
              ["000+", "街角快闪", "80"],
            ].map(([count, name, coins], index) => (
              <div className="venue-row" key={name}>
                <span className="venue-rank">0{index + 1}</span>
                <span>
                  <small>{count} FANS</small>
                  {name}
                </span>
                <b>● {coins}</b>
              </div>
            ))}
          </div>
          <div className="now-playing">
            <span>NOW PLAYING</span>
            <strong>{selectedTrack.english}</strong>
            <small>
              {status === "playing" ? currentBpm : selectedTrack.bpmAt(0)} BPM ·{" "}
              {selectedTrack.difficulty}
            </small>
            <div className="equalizer" aria-hidden="true">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((bar) => <i key={bar} />)}
            </div>
          </div>
        </aside>
      </section>

      <footer>
        <span>换道也要踩点</span>
        <i />
        <span>祝你一路涨粉</span>
      </footer>
    </main>
  );
}
