"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const GAME_WIDTH = 480;
const GAME_HEIGHT = 720;
const ROAD_LEFT = 42;
const ROAD_WIDTH = 396;
const LANE_WIDTH = ROAD_WIDTH / 5;
const PLAYER_Y = 584;
const BPM = 120;
const BEAT_MS = 60_000 / BPM;
const SPAWN_BEATS = 60;
const TOTAL_BEATS = 64;
const STARTING_FANS = 12;
const TRAVEL_BEATS = 4;
const ENTITY_SPEED = (PLAYER_Y + 70) / ((BEAT_MS / 1000) * TRAVEL_BEATS);

type GameStatus = "ready" | "playing" | "finished";
type EntityType = "fan" | "obstacle" | "lucky";
type ObstacleType = "cone" | "speaker" | "barrier";
type ToastTone = "cyan" | "pink" | "gold" | "danger";

type Entity = {
  id: number;
  type: EntityType;
  lane: number;
  y: number;
  obstacle?: ObstacleType;
  handled: boolean;
  wobble: number;
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

const SAFE_PATH = [
  2, 2, 3, 3, 4, 3, 2, 1, 1, 0, 1, 2, 3, 4, 4, 3,
  2, 1, 0, 0, 1, 2, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3,
];

const MELODY = [261.63, 329.63, 392, 523.25, 440, 392, 329.63, 293.66];

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
  const startTimeRef = useRef(0);
  const lastTimeRef = useRef(0);
  const lastHudRef = useRef(0);
  const entityIdRef = useRef(0);
  const entitiesRef = useRef<Entity[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const floatTextRef = useRef<FloatText[]>([]);
  const audioRef = useRef<AudioContext | null>(null);
  const mutedRef = useRef(false);
  const beatPulseRef = useRef(0);
  const shakeRef = useRef(0);
  const hitFlashRef = useRef(0);
  const invulnerableUntilRef = useRef(0);
  const lastMoveBeatRef = useRef(-1);
  const shieldRef = useRef(false);
  const perfectCountRef = useRef(0);
  const toastTimerRef = useRef<number | null>(null);

  const [status, setStatus] = useState<GameStatus>("ready");
  const [fans, setFans] = useState(STARTING_FANS);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [progress, setProgress] = useState(0);
  const [beatIndex, setBeatIndex] = useState(0);
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

    const now = audio.currentTime;
    const kick = audio.createOscillator();
    const kickGain = audio.createGain();
    kick.type = "sine";
    kick.frequency.setValueAtTime(120, now);
    kick.frequency.exponentialRampToValueAtTime(48, now + 0.13);
    kickGain.gain.setValueAtTime(0.34, now);
    kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    kick.connect(kickGain).connect(audio.destination);
    kick.start(now);
    kick.stop(now + 0.18);

    const note = audio.createOscillator();
    const noteGain = audio.createGain();
    note.type = beat % 4 === 0 ? "square" : "triangle";
    note.frequency.setValueAtTime(MELODY[beat % MELODY.length], now);
    noteGain.gain.setValueAtTime(beat % 2 === 0 ? 0.075 : 0.045, now);
    noteGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    note.connect(noteGain).connect(audio.destination);
    note.start(now);
    note.stop(now + 0.17);

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
  }, []);

  const spawnBeat = useCallback((beat: number) => {
    if (beat >= SPAWN_BEATS) return;

    const safeLane = SAFE_PATH[beat % SAFE_PATH.length];
    const spawnY = -70;

    if (beat > 0) {
      if (beat % 16 === 15) {
        entitiesRef.current.push({
          id: entityIdRef.current++,
          type: "lucky",
          lane: safeLane,
          y: spawnY,
          handled: false,
          wobble: Math.random() * Math.PI,
        });
      } else {
        entitiesRef.current.push({
          id: entityIdRef.current++,
          type: "fan",
          lane: safeLane,
          y: spawnY,
          handled: false,
          wobble: Math.random() * Math.PI,
        });
        if (beat % 4 === 1) {
          entitiesRef.current.push({
            id: entityIdRef.current++,
            type: "fan",
            lane: safeLane,
            y: spawnY - 34,
            handled: false,
            wobble: Math.random() * Math.PI,
          });
        }
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
        handled: false,
        wobble: Math.random() * Math.PI,
      });
    }
  }, []);

  const drawGame = useCallback(
    (ctx: CanvasRenderingContext2D, elapsed: number) => {
      const pulse = beatPulseRef.current;
      const roadOffset = ((elapsed / 1000) * ENTITY_SPEED) % 92;
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

  const gameLoop = useCallback(
    (now: number) => {
      if (statusRef.current !== "playing") return;
      const delta = Math.min(0.035, Math.max(0, (now - lastTimeRef.current) / 1000));
      lastTimeRef.current = now;
      const elapsed = now - startTimeRef.current;

      while (elapsed >= nextBeatRef.current * BEAT_MS) {
        const beat = nextBeatRef.current;
        beatRef.current = beat;
        beatPulseRef.current = 1;
        playBeat(beat);
        spawnBeat(beat);
        nextBeatRef.current += 1;
        setBeatIndex(beat);
      }

      busXRef.current +=
        (laneCenter(laneRef.current) - busXRef.current) * Math.min(1, delta * 14);

      for (const entity of entitiesRef.current) {
        entity.y += ENTITY_SPEED * delta;
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
          if (shieldRef.current) {
            shieldRef.current = false;
            setShield(false);
            addBurst(x, PLAYER_Y - 8, "#72f1ff", 24);
            addFloatText(x, PLAYER_Y - 58, "护盾抵挡!", "#72f1ff");
            showToast("应援护盾挡住了！", "cyan");
          } else {
            const loss =
              entity.obstacle === "barrier"
                ? 10
                : entity.obstacle === "speaker"
                  ? 7
                  : 4;
            const actualLoss = Math.min(fansRef.current, loss);
            fansRef.current -= actualLoss;
            comboRef.current = 0;
            setFans(fansRef.current);
            setCombo(0);
            shakeRef.current = 0.34;
            hitFlashRef.current = 1;
            addBurst(x, PLAYER_Y, "#ff375f", 17);
            addFloatText(x, PLAYER_Y - 58, `-${actualLoss} 粉丝`, "#ff526f");
            showToast(`撞到障碍！-${actualLoss} 粉丝`, "danger");
          }
        }
      }

      entitiesRef.current = entitiesRef.current.filter(
        (entity) => !entity.handled && entity.y < GAME_HEIGHT + 90,
      );

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
        setProgress(Math.min(100, (elapsed / (TOTAL_BEATS * BEAT_MS)) * 100));
      }

      if (elapsed >= TOTAL_BEATS * BEAT_MS) {
        finishGame();
        return;
      }

      animationRef.current = window.requestAnimationFrame(gameLoop);
    },
    [
      addBurst,
      addFloatText,
      drawGame,
      finishGame,
      playBeat,
      showToast,
      spawnBeat,
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
    shieldRef.current = false;
    perfectCountRef.current = 0;
    lastMoveBeatRef.current = -1;
    invulnerableUntilRef.current = 0;
    beatPulseRef.current = 0;
    shakeRef.current = 0;
    hitFlashRef.current = 0;
    setFans(STARTING_FANS);
    setCombo(0);
    setMaxCombo(0);
    setProgress(0);
    setShield(false);
    setToast(null);

    const now = performance.now();
    startTimeRef.current = now;
    lastTimeRef.current = now;
    lastHudRef.current = 0;
    animationRef.current = window.requestAnimationFrame(gameLoop);
  }, [gameLoop]);

  const move = useCallback(
    (direction: -1 | 1) => {
      if (statusRef.current !== "playing") return;
      const nextLane = clampLane(laneRef.current + direction);
      if (nextLane === laneRef.current) return;
      laneRef.current = nextLane;

      const elapsed = performance.now() - startTimeRef.current;
      const nearestBeat = Math.round(elapsed / BEAT_MS);
      const distance = Math.abs(elapsed - nearestBeat * BEAT_MS);
      if (nearestBeat === lastMoveBeatRef.current) return;
      lastMoveBeatRef.current = nearestBeat;

      if (distance <= 115) {
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
      } else if (distance <= 210) {
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
    setBestFans(savedBest);
    setBankCoins(savedCoins);

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
          <span className="brand-kicker">PIXEL TOUR / 120 BPM</span>
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
            <li><i className="legend warning" />障碍物：掉粉</li>
            <li><i className="legend lucky-bag">?</i>锦囊：×2 或 ÷2</li>
          </ul>
          <p className="tip-copy">
            在鼓点亮起时换道可积累合拍连击；连续 8 次 PERFECT 获得一次护盾。
          </p>
        </aside>

        <div className="game-cabinet">
          <div className="cabinet-top">
            <div>
              <span className="live-dot" />
              TOUR IN PROGRESS
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
            <div className={`shield-chip ${shield ? "is-active" : ""}`}>
              {shield ? "SHIELD READY" : "8 PERFECT = SHIELD"}
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
                <p className="overlay-kicker">NEXT STOP</p>
                <h1>
                  <span>应援</span>
                  <span>巴士</span>
                </h1>
                <p className="english-title">RHYTHM RUSH</p>
                <div className="mini-bus" aria-hidden="true">
                  <span>★</span>
                </div>
                <p className="intro-copy">
                  跟着 120 BPM 换道，收集应援棒，<br />
                  把今晚的舞台越办越大！
                </p>
                <button className="primary-button" onClick={startGame}>
                  <span>▶</span> 点击发车
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
                <p className="result-place">{resultTier.place}</p>
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
            <strong>NEON HIGHWAY</strong>
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
