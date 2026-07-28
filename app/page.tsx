"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Phase = "intro" | "playing" | "paused" | "bag" | "revive" | "result";
type EntityType = "fan" | "barrier" | "lightstick" | "bag";

type Entity = {
  id: number;
  world: number;
  offset: number;
  type: EntityType;
  value: number;
  hard?: boolean;
  hit?: boolean;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
};

type Feedback = {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
};

type GameData = {
  elapsed: number;
  distance: number;
  carX: number;
  fans: number;
  lightsticks: number;
  combo: number;
  bestCombo: number;
  coins: number;
  entities: Entity[];
  particles: Particle[];
  feedback: Feedback[];
  spawnClock: number;
  entityId: number;
  invincible: number;
  shake: number;
  lastBeat: number;
};

type GameResult = {
  venue: string;
  kicker: string;
  reward: number;
  score: number;
};

const GOAL_DISTANCE = 1200;
const WORLD_SCALE = 2.25;
const STARTING_COINS = 60;
const DEMO_NOTES = [
  220, 261.63, 293.66, 329.63, 293.66, 261.63, 220, 196,
  220, 261.63, 329.63, 392, 329.63, 293.66, 261.63, 220,
];

const createGame = (): GameData => ({
  elapsed: 0,
  distance: 0,
  carX: 0,
  fans: 12,
  lightsticks: 0,
  combo: 0,
  bestCombo: 0,
  coins: STARTING_COINS,
  entities: [],
  particles: [],
  feedback: [],
  spawnClock: 0,
  entityId: 0,
  invincible: 0,
  shake: 0,
  lastBeat: -1,
});

function trackX(world: number, width: number) {
  return (
    width * 0.5 +
    Math.sin(world * 0.017) * width * 0.2 +
    Math.sin(world * 0.006 + 1.3) * width * 0.075
  );
}

function venueFor(fans: number, lightsticks: number): GameResult {
  const score = fans + lightsticks * 4;
  if (score >= 105) {
    return { venue: "万人体育场", kicker: "全城沸腾", reward: 200, score };
  }
  if (score >= 72) {
    return { venue: "万人体育馆", kicker: "热浪出圈", reward: 120, score };
  }
  if (score >= 42) {
    return { venue: "星光剧院", kicker: "一票难求", reward: 80, score };
  }
  return { venue: "LIVEHOUSE", kicker: "首演成功", reward: 40, score };
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef<Phase>("intro");
  const soundRef = useRef(true);
  const onTrackRef = useRef(true);
  const gameRef = useRef<GameData>(createGame());
  const keysRef = useRef({ left: false, right: false });
  const draggingRef = useRef(false);
  const sizeRef = useRef({ width: 1200, height: 680, dpr: 1 });
  const audioRef = useRef<{
    context: AudioContext;
    master: GainNode;
    filter: BiquadFilterNode;
  } | null>(null);

  const [phase, setPhaseState] = useState<Phase>("intro");
  const [soundOn, setSoundOn] = useState(true);
  const [onTrack, setOnTrack] = useState(true);
  const [hud, setHud] = useState({
    fans: 12,
    lightsticks: 0,
    combo: 0,
    distance: 0,
    coins: STARTING_COINS,
  });
  const [result, setResult] = useState<GameResult>(() => venueFor(12, 0));

  const setPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const initAudio = useCallback(() => {
    if (audioRef.current) {
      void audioRef.current.context.resume();
      return;
    }
    const context = new AudioContext();
    const master = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 10000;
    master.gain.value = 0.13;
    filter.connect(master);
    master.connect(context.destination);
    audioRef.current = { context, master, filter };
  }, []);

  const playNote = useCallback((frequency: number, strong: boolean) => {
    const audio = audioRef.current;
    if (!audio || !soundRef.current) return;

    const now = audio.context.currentTime;
    const oscillator = audio.context.createOscillator();
    const noteGain = audio.context.createGain();
    oscillator.type = strong ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(frequency, now);
    noteGain.gain.setValueAtTime(0.0001, now);
    noteGain.gain.exponentialRampToValueAtTime(strong ? 0.34 : 0.22, now + 0.025);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
    oscillator.connect(noteGain);
    noteGain.connect(audio.filter);
    oscillator.start(now);
    oscillator.stop(now + 0.4);

    if (strong) {
      const bass = audio.context.createOscillator();
      const bassGain = audio.context.createGain();
      bass.type = "sine";
      bass.frequency.value = frequency / 2;
      bassGain.gain.setValueAtTime(0.12, now);
      bassGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.46);
      bass.connect(bassGain);
      bassGain.connect(audio.filter);
      bass.start(now);
      bass.stop(now + 0.48);
    }
  }, []);

  const syncHud = useCallback(() => {
    const game = gameRef.current;
    setHud({
      fans: game.fans,
      lightsticks: game.lightsticks,
      combo: game.combo,
      distance: Math.min(GOAL_DISTANCE, Math.floor(game.distance)),
      coins: game.coins,
    });
  }, []);

  const startGame = useCallback(() => {
    initAudio();
    const width = sizeRef.current.width;
    const next = createGame();
    next.carX = trackX(0, width);
    next.coins = gameRef.current.coins || STARTING_COINS;
    gameRef.current = next;
    onTrackRef.current = true;
    setOnTrack(true);
    syncHud();
    setPhase("playing");
  }, [initAudio, setPhase, syncHud]);

  const finishGame = useCallback(() => {
    const game = gameRef.current;
    const nextResult = venueFor(game.fans, game.lightsticks);
    game.coins += nextResult.reward;
    setResult(nextResult);
    syncHud();
    setPhase("result");
  }, [setPhase, syncHud]);

  const togglePause = useCallback(() => {
    if (phaseRef.current === "playing") setPhase("paused");
    else if (phaseRef.current === "paused") setPhase("playing");
  }, [setPhase]);

  const toggleSound = useCallback(() => {
    const next = !soundRef.current;
    soundRef.current = next;
    setSoundOn(next);
    if (next) {
      initAudio();
      void audioRef.current?.context.resume();
    }
  }, [initAudio]);

  const setMove = useCallback((direction: "left" | "right", active: boolean) => {
    keysRef.current[direction] = active;
  }, []);

  const useBag = useCallback(() => {
    const game = gameRef.current;
    const lucky = Math.random() >= 0.42;
    if (lucky) {
      game.fans *= 2;
      game.feedback.push({
        x: game.carX,
        y: sizeRef.current.height * 0.58,
        text: "欧气爆棚 · 粉丝翻倍",
        color: "#dfff4f",
        life: 2,
      });
    } else {
      game.fans = Math.floor(game.fans / 2);
      game.combo = 0;
      game.feedback.push({
        x: game.carX,
        y: sizeRef.current.height * 0.58,
        text: "舆情突袭 · 粉丝减半",
        color: "#ff6685",
        life: 2,
      });
    }
    syncHud();
    if (game.fans <= 0) setPhase("revive");
    else setPhase("playing");
  }, [setPhase, syncHud]);

  const skipBag = useCallback(() => {
    gameRef.current.feedback.push({
      x: gameRef.current.carX,
      y: sizeRef.current.height * 0.58,
      text: "稳住节奏",
      color: "#ffffff",
      life: 1.5,
    });
    setPhase("playing");
  }, [setPhase]);

  const revive = useCallback(() => {
    const game = gameRef.current;
    if (game.coins < 30) return;
    game.coins -= 30;
    game.fans = 8;
    game.combo = 0;
    game.invincible = 3;
    game.feedback.push({
      x: game.carX,
      y: sizeRef.current.height * 0.62,
      text: "返场成功 · 3秒无敌",
      color: "#dfff4f",
      life: 2,
    });
    syncHud();
    setPhase("playing");
  }, [setPhase, syncHud]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let animationFrame = 0;
    let previous = performance.now();
    let hudClock = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      sizeRef.current = { width: rect.width, height: rect.height, dpr };
      if (!gameRef.current.carX) {
        gameRef.current.carX = trackX(gameRef.current.distance, rect.width);
      }
    };

    const burst = (x: number, y: number, color: string, count = 14) => {
      const particles = gameRef.current.particles;
      for (let i = 0; i < count; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 35 + Math.random() * 90;
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 25,
          life: 0.7 + Math.random() * 0.5,
          color,
        });
      }
    };

    const spawnEntity = () => {
      const game = gameRef.current;
      const roll = Math.random();
      let type: EntityType;
      if (roll < 0.5) type = "fan";
      else if (roll < 0.73) type = "barrier";
      else if (roll < 0.9) type = "lightstick";
      else type = "bag";

      const hard = type === "barrier" && Math.random() > 0.64;
      const width = sizeRef.current.width;
      const roadWidth = Math.max(92, Math.min(168, width * 0.15));
      let offset = (Math.random() - 0.5) * roadWidth * 0.72;
      if (type === "lightstick") {
        offset =
          (Math.random() > 0.5 ? 1 : -1) *
          (roadWidth * (0.78 + Math.random() * 0.62));
      }
      if (type === "bag") {
        offset = (Math.random() - 0.5) * roadWidth * 1.55;
      }

      const world = game.distance + 255 + Math.random() * 18;
      game.entities.push({
        id: game.entityId++,
        world,
        offset,
        type,
        value: type === "fan" ? (hard ? 6 : 2 + Math.floor(Math.random() * 3)) : 1,
        hard,
      });

      if (type === "barrier" && hard) {
        game.entities.push({
          id: game.entityId++,
          world: world + 5,
          offset: offset + (Math.random() > 0.5 ? roadWidth * 0.62 : -roadWidth * 0.62),
          type: "fan",
          value: 7,
          hard: true,
        });
      }
    };

    const drawStar = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => {
      ctx.beginPath();
      for (let i = 0; i < 10; i += 1) {
        const radius = i % 2 === 0 ? r : r * 0.42;
        const angle = -Math.PI / 2 + (i * Math.PI) / 5;
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    };

    const drawFan = (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      scale: number,
      valuable: boolean,
    ) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.fillStyle = valuable ? "#dfff4f" : "#ffffff";
      ctx.beginPath();
      ctx.arc(0, -8, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = valuable ? "#dfff4f" : "#5ff0e8";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 17);
      ctx.moveTo(0, 5);
      ctx.lineTo(-10, -2);
      ctx.moveTo(0, 5);
      ctx.lineTo(10, -3);
      ctx.moveTo(0, 17);
      ctx.lineTo(-8, 28);
      ctx.moveTo(0, 17);
      ctx.lineTo(8, 28);
      ctx.stroke();
      ctx.fillStyle = valuable ? "#dfff4f" : "#ff6685";
      ctx.fillRect(9, -16, 4, 17);
      ctx.fillRect(12, -16, 16, 9);
      ctx.restore();
    };

    const drawEntity = (
      ctx: CanvasRenderingContext2D,
      entity: Entity,
      x: number,
      y: number,
      scale: number,
    ) => {
      if (entity.type === "fan") {
        drawFan(ctx, x, y, scale, Boolean(entity.hard));
        if (entity.value >= 6) {
          ctx.fillStyle = "#071021";
          ctx.font = `800 ${Math.max(10, 12 * scale)}px Arial`;
          ctx.textAlign = "center";
          ctx.fillText(`+${entity.value}`, x, y - 26 * scale);
        }
        return;
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      if (entity.type === "barrier") {
        ctx.fillStyle = entity.hard ? "#ff6685" : "#ffb84d";
        ctx.fillRect(-25, -14, 50, 28);
        ctx.fillStyle = "#071021";
        for (let i = -18; i < 20; i += 16) {
          ctx.save();
          ctx.translate(i, 0);
          ctx.rotate(-0.55);
          ctx.fillRect(-4, -17, 8, 34);
          ctx.restore();
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(-21, -20, 8, 8);
        ctx.fillRect(13, -20, 8, 8);
      } else if (entity.type === "lightstick") {
        ctx.rotate(-0.35);
        ctx.shadowColor = "#5ff0e8";
        ctx.shadowBlur = 16;
        ctx.fillStyle = "#5ff0e8";
        ctx.fillRect(-5, -25, 10, 38);
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(-7, 10, 14, 12);
      } else {
        ctx.fillStyle = "#825bff";
        ctx.fillRect(-22, -18, 44, 38);
        ctx.fillStyle = "#dfff4f";
        ctx.fillRect(-4, -18, 8, 38);
        ctx.fillRect(-22, -6, 44, 8);
        drawStar(ctx, 0, 1, 9);
        ctx.fill();
      }
      ctx.restore();
    };

    const drawBus = (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      invincible: boolean,
      isOnTrack: boolean,
    ) => {
      ctx.save();
      ctx.translate(x, y);
      if (invincible) {
        ctx.globalAlpha = 0.56 + Math.sin(performance.now() * 0.02) * 0.3;
      }
      ctx.shadowColor = isOnTrack ? "#5ff0e8" : "#ff6685";
      ctx.shadowBlur = isOnTrack ? 28 : 10;
      ctx.fillStyle = "#16d4cd";
      ctx.fillRect(-34, -49, 68, 94);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#071021";
      ctx.fillRect(-27, -39, 54, 30);
      ctx.fillStyle = "#dfff4f";
      ctx.fillRect(-34, 18, 68, 12);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-25, 34, 13, 6);
      ctx.fillRect(12, 34, 13, 6);
      ctx.fillStyle = "#101b36";
      ctx.fillRect(-42, -28, 8, 22);
      ctx.fillRect(34, -28, 8, 22);
      ctx.fillRect(-42, 19, 8, 22);
      ctx.fillRect(34, 19, 8, 22);
      ctx.fillStyle = "#dfff4f";
      drawStar(ctx, 0, 9, 13);
      ctx.fill();
      ctx.restore();
    };

    const update = (dt: number) => {
      const game = gameRef.current;
      const { width, height } = sizeRef.current;
      const roadWidth = Math.max(92, Math.min(168, width * 0.15));
      const carY = height * 0.78;

      game.elapsed += dt;
      game.distance += dt * 30;
      game.spawnClock += dt;
      game.invincible = Math.max(0, game.invincible - dt);
      game.shake = Math.max(0, game.shake - dt * 3.2);

      const moveSpeed = Math.max(260, width * 0.34);
      if (keysRef.current.left) game.carX -= moveSpeed * dt;
      if (keysRef.current.right) game.carX += moveSpeed * dt;
      game.carX = Math.max(48, Math.min(width - 48, game.carX));

      const center = trackX(game.distance, width);
      const nextOnTrack = Math.abs(game.carX - center) <= roadWidth / 2 + 29;
      if (nextOnTrack !== onTrackRef.current) {
        onTrackRef.current = nextOnTrack;
        setOnTrack(nextOnTrack);
        game.feedback.push({
          x: game.carX,
          y: carY - 70,
          text: nextOnTrack ? "音轨已接通" : "偏离音轨",
          color: nextOnTrack ? "#dfff4f" : "#ff6685",
          life: 1.2,
        });
      }

      const audio = audioRef.current;
      if (audio) {
        const active = soundRef.current && phaseRef.current === "playing";
        audio.master.gain.setTargetAtTime(active ? (nextOnTrack ? 0.14 : 0.055) : 0.0001, audio.context.currentTime, 0.08);
        audio.filter.frequency.setTargetAtTime(nextOnTrack ? 10500 : 360, audio.context.currentTime, 0.1);
      }

      const beat = Math.floor(game.elapsed * 2.15);
      if (beat !== game.lastBeat) {
        game.lastBeat = beat;
        playNote(DEMO_NOTES[beat % DEMO_NOTES.length], beat % 4 === 0);
      }

      while (game.spawnClock >= 0.64) {
        game.spawnClock -= 0.64;
        spawnEntity();
      }

      for (const entity of game.entities) {
        if (entity.hit) continue;
        const y = carY - (entity.world - game.distance) * WORLD_SCALE;
        const x = trackX(entity.world, width) + entity.offset;
        if (Math.abs(y - carY) < 51 && Math.abs(x - game.carX) < 50) {
          entity.hit = true;
          if (entity.type === "fan") {
            game.fans += entity.value;
            game.combo += 1;
            game.bestCombo = Math.max(game.bestCombo, game.combo);
            burst(x, y, entity.hard ? "#dfff4f" : "#5ff0e8", entity.hard ? 22 : 12);
            game.feedback.push({
              x,
              y: y - 28,
              text: `粉丝 +${entity.value}`,
              color: entity.hard ? "#dfff4f" : "#ffffff",
              life: 1.1,
            });
          } else if (entity.type === "lightstick") {
            game.lightsticks += 1;
            game.combo += 1;
            game.bestCombo = Math.max(game.bestCombo, game.combo);
            burst(x, y, "#5ff0e8", 16);
            game.feedback.push({
              x,
              y: y - 28,
              text: "应援棒 +1",
              color: "#5ff0e8",
              life: 1.1,
            });
          } else if (entity.type === "bag") {
            setPhase("bag");
          } else if (game.invincible <= 0) {
            const loss = entity.hard ? 8 : 4;
            game.fans = Math.max(0, game.fans - loss);
            game.combo = 0;
            game.shake = 1;
            burst(x, y, "#ff6685", 22);
            game.feedback.push({
              x,
              y: y - 28,
              text: `掉粉 -${loss}`,
              color: "#ff6685",
              life: 1.25,
            });
            if (navigator.vibrate) navigator.vibrate(80);
            if (game.fans <= 0) setPhase("revive");
          }
        }
      }

      game.entities = game.entities.filter(
        (entity) => !entity.hit && entity.world > game.distance - 48,
      );
      game.particles = game.particles.filter((particle) => {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vy += 115 * dt;
        particle.life -= dt;
        return particle.life > 0;
      });
      game.feedback = game.feedback.filter((item) => {
        item.y -= 30 * dt;
        item.life -= dt;
        return item.life > 0;
      });

      if (game.distance >= GOAL_DISTANCE) finishGame();
    };

    const draw = () => {
      const game = gameRef.current;
      const { width, height, dpr } = sizeRef.current;
      const carY = height * 0.78;
      const roadWidth = Math.max(92, Math.min(168, width * 0.15));
      const idleOffset = phaseRef.current === "intro" ? performance.now() * 0.008 : 0;
      const drawDistance = game.distance + idleOffset;

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      context.save();
      if (game.shake > 0) {
        context.translate(
          (Math.random() - 0.5) * game.shake * 13,
          (Math.random() - 0.5) * game.shake * 9,
        );
      }

      context.fillStyle = "#071021";
      context.fillRect(0, 0, width, height);

      context.fillStyle = "#101b36";
      for (let i = 0; i < 24; i += 1) {
        const bx = ((i * 137.5) % (width + 100)) - 40;
        const bh = 25 + ((i * 31) % 82);
        context.fillRect(bx, height * 0.42 - bh, 58, bh);
      }

      for (let i = 0; i < 72; i += 1) {
        const sx = (i * 97.17) % width;
        const sy = (i * 43.71) % (height * 0.62);
        const pulse = 0.35 + ((Math.sin(performance.now() * 0.002 + i) + 1) / 2) * 0.65;
        context.globalAlpha = pulse;
        context.fillStyle = i % 9 === 0 ? "#dfff4f" : "#ffffff";
        context.fillRect(sx, sy, i % 9 === 0 ? 3 : 1.5, i % 9 === 0 ? 3 : 1.5);
      }
      context.globalAlpha = 1;

      context.fillStyle = "#0b1830";
      context.fillRect(0, height * 0.42, width, height * 0.58);

      context.lineCap = "round";
      context.lineJoin = "round";
      const path = new Path2D();
      const points: Array<{ x: number; y: number }> = [];
      for (let y = -20; y <= carY + 90; y += 18) {
        const futureWorld = drawDistance + (carY - y) / WORLD_SCALE;
        points.push({ x: trackX(futureWorld, width), y });
      }
      points.forEach((point, index) => {
        if (index === 0) path.moveTo(point.x, point.y);
        else path.lineTo(point.x, point.y);
      });

      context.strokeStyle = "#342b79";
      context.lineWidth = roadWidth + 34;
      context.stroke(path);
      context.strokeStyle = "#5ff0e8";
      context.lineWidth = roadWidth;
      context.globalAlpha = 0.7;
      context.stroke(path);
      context.globalAlpha = 1;
      context.strokeStyle = "#ffffff";
      context.lineWidth = 3;
      context.setLineDash([14, 18]);
      context.lineDashOffset = game.distance * 2;
      context.stroke(path);
      context.setLineDash([]);

      for (let y = 18; y < carY; y += 70) {
        const world = drawDistance + (carY - y) / WORLD_SCALE;
        const x = trackX(world, width);
        context.fillStyle = "#dfff4f";
        drawStar(context, x, y, 5 + y / height * 3);
        context.fill();
      }

      context.fillStyle = "#1a2744";
      for (let i = 0; i < 12; i += 1) {
        const y = height * 0.47 + (i % 6) * 62;
        const side = i % 2 === 0 ? 1 : -1;
        const x = side > 0 ? width - 18 - (i % 3) * 34 : 18 + (i % 3) * 34;
        context.beginPath();
        context.arc(x, y, 7, 0, Math.PI * 2);
        context.fill();
        context.fillRect(x - 4, y + 7, 8, 18);
        context.strokeStyle = i % 3 === 0 ? "#ff6685" : "#5ff0e8";
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(x + side * 4, y + 11);
        context.lineTo(x + side * 16, y - 9);
        context.stroke();
      }

      for (const entity of game.entities) {
        const y = carY - (entity.world - game.distance) * WORLD_SCALE;
        if (y < -60 || y > height + 60) continue;
        const x = trackX(entity.world, width) + entity.offset;
        const scale = 0.62 + Math.max(0, y / height) * 0.52;
        drawEntity(context, entity, x, y, scale);
      }

      for (const particle of game.particles) {
        context.globalAlpha = Math.max(0, particle.life);
        context.fillStyle = particle.color;
        context.fillRect(particle.x - 2, particle.y - 2, 4, 4);
      }
      context.globalAlpha = 1;

      const busX =
        phaseRef.current === "intro"
          ? trackX(drawDistance, width)
          : game.carX || trackX(game.distance, width);
      drawBus(context, busX, carY, game.invincible > 0, onTrackRef.current);

      for (const item of game.feedback) {
        context.globalAlpha = Math.min(1, item.life * 1.5);
        context.fillStyle = item.color;
        context.font = `900 ${Math.max(14, Math.min(22, width * 0.018))}px Arial`;
        context.textAlign = "center";
        context.shadowColor = "#071021";
        context.shadowBlur = 8;
        context.fillText(item.text, item.x, item.y);
      }
      context.shadowBlur = 0;
      context.globalAlpha = 1;
      context.restore();
    };

    const loop = (now: number) => {
      const dt = Math.min((now - previous) / 1000, 0.034);
      previous = now;
      if (phaseRef.current === "playing") {
        update(dt);
        hudClock += dt;
        if (hudClock >= 0.1) {
          hudClock = 0;
          syncHud();
        }
      } else if (audioRef.current) {
        audioRef.current.master.gain.setTargetAtTime(
          0.0001,
          audioRef.current.context.currentTime,
          0.06,
        );
      }
      draw();
      animationFrame = requestAnimationFrame(loop);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
        event.preventDefault();
        keysRef.current.left = true;
      }
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
        event.preventDefault();
        keysRef.current.right = true;
      }
      if (event.code === "Space") {
        event.preventDefault();
        togglePause();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
        keysRef.current.left = false;
      }
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
        keysRef.current.right = false;
      }
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    animationFrame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [finishGame, playNote, setPhase, syncHud, togglePause]);

  const pointToCar = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current || phaseRef.current !== "playing") return;
    const rect = event.currentTarget.getBoundingClientRect();
    gameRef.current.carX = Math.max(
      48,
      Math.min(rect.width - 48, event.clientX - rect.left),
    );
  };

  const handleControlPointer = (
    event: React.PointerEvent<HTMLButtonElement>,
    direction: "left" | "right",
    active: boolean,
  ) => {
    event.preventDefault();
    if (active) event.currentTarget.setPointerCapture(event.pointerId);
    setMove(direction, active);
  };

  const progress = Math.min(100, (hud.distance / GOAL_DISTANCE) * 100);

  return (
    <main className="game-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-star" aria-hidden="true">★</span>
          <div>
            <strong>星光巡演</strong>
            <span>STAR ROAD TOUR</span>
          </div>
        </div>

        <div className="now-playing" aria-label="当前曲目">
          <span className={phase === "playing" && onTrack ? "equalizer active" : "equalizer"}>
            <i />
            <i />
            <i />
            <i />
          </span>
          <div>
            <b>一路向北 · 玩法 DEMO</b>
            <span>原创示范伴奏 · 非原曲音频</span>
          </div>
        </div>

        <div className="top-actions">
          <button
            className="icon-button"
            type="button"
            onClick={toggleSound}
            aria-label={soundOn ? "关闭声音" : "开启声音"}
            title={soundOn ? "关闭声音" : "开启声音"}
          >
            {soundOn ? "♪" : "×"}
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={togglePause}
            aria-label={phase === "paused" ? "继续游戏" : "暂停游戏"}
            title={phase === "paused" ? "继续游戏" : "暂停游戏"}
            disabled={phase !== "playing" && phase !== "paused"}
          >
            {phase === "paused" ? "▶" : "Ⅱ"}
          </button>
        </div>
      </header>

      <section className="game-stage" aria-label="星光巡演游戏区域">
        <canvas
          ref={canvasRef}
          onPointerDown={(event) => {
            draggingRef.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            pointToCar(event);
          }}
          onPointerMove={pointToCar}
          onPointerUp={() => {
            draggingRef.current = false;
          }}
          onPointerCancel={() => {
            draggingRef.current = false;
          }}
        />

        <div className="hud" aria-live="polite">
          <div className="hud-stat">
            <span>粉丝</span>
            <strong>{hud.fans}</strong>
            <small>人气值</small>
          </div>
          <div className="hud-stat">
            <span>应援</span>
            <strong>{hud.lightsticks}</strong>
            <small>荧光棒</small>
          </div>
          <div className="hud-stat combo-stat">
            <span>连击</span>
            <strong>{hud.combo}</strong>
            <small>COMBO</small>
          </div>
        </div>

        <div className={onTrack ? "track-status online" : "track-status offline"}>
          <span className="status-dot" />
          {onTrack ? "音轨在线 · 原声清晰" : "偏离星光之路 · 音乐失真"}
        </div>

        <div className="route-progress">
          <div className="route-copy">
            <span>巡演进度</span>
            <b>{hud.distance} / {GOAL_DISTANCE}m</b>
          </div>
          <div className="progress-rail" aria-label={`巡演进度 ${Math.round(progress)}%`}>
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>

        {phase === "playing" && (
          <div className="controls" aria-label="移动控制">
            <button
              type="button"
              onPointerDown={(event) => handleControlPointer(event, "left", true)}
              onPointerUp={(event) => handleControlPointer(event, "left", false)}
              onPointerCancel={(event) => handleControlPointer(event, "left", false)}
              onPointerLeave={(event) => setMove("left", false)}
              aria-label="向左移动"
              title="向左移动"
            >
              ←
            </button>
            <span>按住移动 · 也可拖动车身</span>
            <button
              type="button"
              onPointerDown={(event) => handleControlPointer(event, "right", true)}
              onPointerUp={(event) => handleControlPointer(event, "right", false)}
              onPointerCancel={(event) => handleControlPointer(event, "right", false)}
              onPointerLeave={(event) => setMove("right", false)}
              aria-label="向右移动"
              title="向右移动"
            >
              →
            </button>
          </div>
        )}

        {phase === "intro" && (
          <div className="overlay intro-overlay">
            <div className="intro-panel">
              <div className="eyebrow">TME HACKATHON · PLAYABLE DEMO</div>
              <h1>开上音轨，<br /><em>把星光装满全场。</em></h1>
              <p>
                左右移动巡演大巴。贴住发光音调线才能听清伴奏，
                沿途接粉、抢应援棒，也要绕开让你掉粉的路障。
              </p>
              <div className="mission-grid">
                <div><b>01</b><span>贴住音轨<br />保持原声</span></div>
                <div><b>02</b><span>接走粉丝<br />扩大声量</span></div>
                <div><b>03</b><span>冲进场馆<br />赢取金币</span></div>
              </div>
              <button className="primary-button" type="button" onClick={startGame}>
                <span>开始巡演</span>
                <b>→</b>
              </button>
              <div className="key-hint">
                <span>键盘 A D / ← →</span>
                <i />
                <span>手机按键或拖动</span>
              </div>
            </div>
            <aside className="tour-pass" aria-label="本场演出信息">
              <span>TONIGHT&apos;S ROUTE</span>
              <strong>向北站</strong>
              <b>1200M</b>
              <small>目标：万人体育场</small>
            </aside>
          </div>
        )}

        {phase === "paused" && (
          <div className="overlay compact-overlay">
            <div className="dialog">
              <span className="dialog-icon">Ⅱ</span>
              <p className="dialog-kicker">TOUR BREAK</p>
              <h2>巡演暂停</h2>
              <p>喘口气，星光之路会在这里等你。</p>
              <button className="primary-button" type="button" onClick={togglePause}>
                <span>继续上路</span><b>▶</b>
              </button>
            </div>
          </div>
        )}

        {phase === "bag" && (
          <div className="overlay compact-overlay">
            <div className="dialog bag-dialog">
              <span className="dialog-icon">?</span>
              <p className="dialog-kicker">MYSTERY DROP</p>
              <h2>神秘锦囊上车</h2>
              <p>拆开可能让粉丝翻倍，也可能遭遇舆情让粉丝减半。敢赌吗？</p>
              <div className="odds">
                <span><b>58%</b> 粉丝 ×2</span>
                <span><b>42%</b> 粉丝 ×0.5</span>
              </div>
              <div className="dialog-actions">
                <button className="secondary-button" type="button" onClick={skipBag}>稳住，不拆</button>
                <button className="primary-button" type="button" onClick={useBag}>
                  <span>现在拆开</span><b>?</b>
                </button>
              </div>
            </div>
          </div>
        )}

        {phase === "revive" && (
          <div className="overlay compact-overlay danger-overlay">
            <div className="dialog">
              <span className="dialog-icon">!</span>
              <p className="dialog-kicker">FANS LOST</p>
              <h2>粉丝已经清零</h2>
              <p>巡演大巴暂时熄火。支付 30 金币，可带 8 位铁粉返场并获得 3 秒无敌。</p>
              <div className="coin-balance">金币余额 <strong>{hud.coins}</strong></div>
              <div className="dialog-actions">
                <button className="secondary-button" type="button" onClick={() => setPhase("intro")}>
                  结束本场
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={revive}
                  disabled={hud.coins < 30}
                >
                  <span>{hud.coins >= 30 ? "30 金币复活" : "金币不足"}</span><b>↻</b>
                </button>
              </div>
              <small className="demo-note">演示版本仅使用虚拟金币，不会产生真实支付。</small>
            </div>
          </div>
        )}

        {phase === "result" && (
          <div className="overlay result-overlay">
            <div className="result-panel">
              <div className="result-copy">
                <p className="dialog-kicker">TOUR COMPLETE</p>
                <span className="result-kicker">{result.kicker}</span>
                <h2>{result.venue}</h2>
                <p>今夜的星光都到齐了。你的粉丝与应援声量，解锁了这座演出场馆。</p>
              </div>
              <div className="result-stats">
                <div><span>最终粉丝</span><strong>{hud.fans}</strong></div>
                <div><span>应援棒</span><strong>{hud.lightsticks}</strong></div>
                <div><span>人气总分</span><strong>{result.score}</strong></div>
                <div className="reward"><span>演出收入</span><strong>+{result.reward} 金币</strong></div>
              </div>
              <button className="primary-button" type="button" onClick={startGame}>
                <span>再跑一场</span><b>↻</b>
              </button>
            </div>
          </div>
        )}
      </section>

      <footer className="game-footer">
        <span><i className="legend fan" />接粉丝，挑战路障旁的高价值铁粉</span>
        <span><i className="legend barrier" />碰撞路障会掉粉，粉丝清零则失败</span>
        <span><i className="legend stick" />道路两侧藏有加成更高的应援棒</span>
        <b>SPACE 暂停</b>
      </footer>
    </main>
  );
}
