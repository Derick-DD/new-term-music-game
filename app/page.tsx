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
const MISS_WINDOW = 190;

type GameStatus =
  | "ready"
  | "playing"
  | "paused"
  | "lucky"
  | "finished"
  | "failed";
type EntityType = "fan" | "obstacle" | "lucky";
type ObstacleType = "cone" | "speaker" | "barrier";
type ToastTone = "cyan" | "pink" | "gold" | "danger";
type TrackId = "custom-upload";
type ToneMode = "normal" | "thick" | "thin";

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

const VEHICLE_LEVELS: VehicleLevel[] = [
  {
    level: 1,
    name: "星芽小巴",
    capacity: 30,
    primary: "#ff4fa3",
    secondary: "#ff78bf",
    task: "本局 HIT 4 次 + PERFECT 1 次",
    requirement: { hits: 4, perfect: 1 },
  },
  {
    level: 2,
    name: "应援大巴",
    capacity: 55,
    primary: "#6a5cff",
    secondary: "#9c8cff",
    task: "本局 HIT 12 次 + 最高连击 6",
    requirement: { hits: 12, maxCombo: 6 },
  },
  {
    level: 3,
    name: "巡演豪华号",
    capacity: 85,
    primary: "#00b9c8",
    secondary: "#72f1ff",
    task: "本局 HIT 22 次 + PERFECT 7 次 + 最高连击 10",
    requirement: { hits: 22, perfect: 7, maxCombo: 10 },
  },
  {
    level: 4,
    name: "银河应援号",
    capacity: 120,
    primary: "#e9a900",
    secondary: "#ffe66d",
    task: "已达最高等级",
  },
];

function getVehicle(level: number) {
  return VEHICLE_LEVELS[Math.max(0, Math.min(VEHICLE_LEVELS.length - 1, level - 1))];
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

const TRACKS: Track[] = [
  {
    id: "custom-upload",
    name: "自选歌曲",
    english: "CUSTOM TRACK",
    description: "上传本地歌曲，自动分析鼓点与节拍",
    tempoLabel: "AUTO BPM",
    difficulty: "RHYTHM",
    color: "#ffe66d",
    totalBeats: 96,
    grannyBeat: 42,
    melody: [220, 277.18, 329.63, 440, 415.3, 329.63, 277.18, 246.94],
    lanePattern: [
      2, 3, 2, 1, 0, 1, 3, 4, 3, 1, 2, 4, 3, 2, 0, 1,
      2, 4, 3, 2, 1, 0, 2, 3, 4, 2, 0, 1, 3, 4, 2, 1,
    ],
    bpmAt: () => 96,
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

function analyzeAudioBuffer(buffer: AudioBuffer) {
  const hopSize = 1024;
  const frameCount = Math.floor(buffer.length / hopSize);
  const envelope = new Float32Array(frameCount);
  const channels = Math.min(2, buffer.numberOfChannels);

  for (let frame = 0; frame < frameCount; frame += 1) {
    let energy = 0;
    const start = frame * hopSize;
    const end = Math.min(start + hopSize, buffer.length);
    for (let channel = 0; channel < channels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let sample = start; sample < end; sample += 4) {
        energy += Math.abs(data[sample]);
      }
    }
    envelope[frame] = energy / Math.max(1, ((end - start) / 4) * channels);
  }

  const flux = new Float32Array(frameCount);
  for (let frame = 1; frame < frameCount; frame += 1) {
    flux[frame] = Math.max(0, envelope[frame] - envelope[frame - 1]);
  }

  const secondsPerFrame = hopSize / buffer.sampleRate;
  const onsets: Array<{ time: number; strength: number }> = [];
  let lastOnset = -1;
  const rollingRadius = Math.max(4, Math.round(0.45 / secondsPerFrame));
  const minGapFrames = Math.max(1, Math.round(0.16 / secondsPerFrame));

  for (let frame = rollingRadius; frame < frameCount - rollingRadius; frame += 1) {
    let localAverage = 0;
    for (let index = frame - rollingRadius; index <= frame + rollingRadius; index += 1) {
      localAverage += flux[index];
    }
    localAverage /= rollingRadius * 2 + 1;
    const isPeak = flux[frame] > flux[frame - 1] && flux[frame] >= flux[frame + 1];
    if (
      isPeak &&
      flux[frame] > Math.max(0.002, localAverage * 1.45) &&
      frame - lastOnset >= minGapFrames
    ) {
      onsets.push({ time: frame * secondsPerFrame, strength: flux[frame] });
      lastOnset = frame;
    }
  }

  const bpmScores = new Map<number, number>();
  const strongest = [...onsets]
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 220)
    .sort((a, b) => a.time - b.time);

  for (let first = 0; first < strongest.length; first += 1) {
    for (let second = first + 1; second < Math.min(strongest.length, first + 9); second += 1) {
      const gap = strongest[second].time - strongest[first].time;
      if (gap < 0.28 || gap > 1.35) continue;
      let candidate = 60 / gap;
      while (candidate < 78) candidate *= 2;
      while (candidate > 168) candidate /= 2;
      const rounded = Math.round(candidate);
      const weight = Math.sqrt(strongest[first].strength * strongest[second].strength);
      bpmScores.set(rounded, (bpmScores.get(rounded) ?? 0) + weight);
    }
  }

  let bpm = 96;
  let bestScore = -1;
  for (const [candidate, score] of bpmScores) {
    const smoothed =
      score +
      (bpmScores.get(candidate - 1) ?? 0) * 0.55 +
      (bpmScores.get(candidate + 1) ?? 0) * 0.55;
    if (smoothed > bestScore) {
      bestScore = smoothed;
      bpm = candidate;
    }
  }

  const beatInterval = 60 / bpm;
  const phaseCandidates = strongest.filter((onset) => onset.time < Math.min(20, buffer.duration));
  let phase = phaseCandidates[0]?.time ?? 0;
  let phaseScore = -1;
  for (const candidate of phaseCandidates.slice(0, 80)) {
    let score = 0;
    for (const onset of strongest) {
      const distanceInBeats = Math.abs((onset.time - candidate.time) / beatInterval);
      const distanceToGrid = Math.abs(distanceInBeats - Math.round(distanceInBeats));
      if (distanceToGrid < 0.16) {
        score += onset.strength * (1 - distanceToGrid / 0.16);
      }
    }
    if (score > phaseScore) {
      phaseScore = score;
      phase = candidate.time;
    }
  }

  while (phase - beatInterval >= 0) phase -= beatInterval;
  const beatTimes: number[] = [];
  for (let time = phase; time <= buffer.duration; time += beatInterval) {
    beatTimes.push(Math.round(time * 1000));
  }
  if (beatTimes.length < 12) {
    beatTimes.length = 0;
    for (let time = 0; time <= buffer.duration; time += 60 / 96) {
      beatTimes.push(Math.round(time * 1000));
    }
    bpm = 96;
  }

  const averageFlux =
    flux.reduce((total, value) => total + value, 0) / Math.max(1, flux.length);
  let lane = 2;
  let laneDirection: -1 | 1 = 1;
  const lanePattern = beatTimes.map((time, beat) => {
    const frame = Math.min(
      flux.length - 1,
      Math.max(0, Math.round(time / 1000 / secondsPerFrame)),
    );
    let localStrength = 0;
    for (
      let index = Math.max(0, frame - 2);
      index <= Math.min(flux.length - 1, frame + 2);
      index += 1
    ) {
      localStrength = Math.max(localStrength, flux[index]);
    }
    if (beat > 0 && (localStrength > averageFlux * 1.7 || beat % 4 === 0)) {
      const step = localStrength > averageFlux * 3.2 && beat % 8 === 0 ? 2 : 1;
      const nextLane = lane + laneDirection * step;
      if (nextLane < 0 || nextLane > 4) {
        laneDirection = laneDirection === 1 ? -1 : 1;
      }
      lane = clampLane(lane + laneDirection * step);
    }
    return lane;
  });

  return { beatTimes, bpm, lanePattern };
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
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const lowShelfRef = useRef<BiquadFilterNode | null>(null);
  const highShelfRef = useRef<BiquadFilterNode | null>(null);
  const songRef = useRef<HTMLAudioElement | null>(null);
  const songUrlRef = useRef<string | null>(null);
  const detectedBeatTimesRef = useRef<number[]>([]);
  const detectedLanePatternRef = useRef<number[]>(TRACKS[0].lanePattern);
  const detectedBpmRef = useRef(96);
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
  const toneModeRef = useRef<ToneMode>("normal");
  const arrangementUntilRef = useRef(-1);
  const grannyWarnedRef = useRef(false);
  const toastTimerRef = useRef<number | null>(null);
  const judgementTimerRef = useRef<number | null>(null);

  const [status, setStatus] = useState<GameStatus>("ready");
  const [songReady, setSongReady] = useState(false);
  const [songLoading, setSongLoading] = useState(false);
  const [songFileName, setSongFileName] = useState("");
  const [songTitle, setSongTitle] = useState("未选择歌曲");
  const [songError, setSongError] = useState("");
  const [detectedBpm, setDetectedBpm] = useState(96);
  const [songDuration, setSongDuration] = useState(0);
  const [fans, setFans] = useState(STARTING_FANS);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [successfulHits, setSuccessfulHits] = useState(0);
  const [vehicleLevel, setVehicleLevel] = useState(1);
  const [progress, setProgress] = useState(0);
  const [beatIndex, setBeatIndex] = useState(0);
  const [currentBpm, setCurrentBpm] = useState(TRACKS[0].bpmAt(0));
  const [toneMode, setToneMode] = useState<ToneMode>("normal");
  const [muted, setMuted] = useState(false);
  const [shield, setShield] = useState(false);
  const [bestFans, setBestFans] = useState(0);
  const [bankCoins, setBankCoins] = useState(0);
  const [earnedCoins, setEarnedCoins] = useState(0);
  const [noteJudgement, setNoteJudgement] =
    useState<NoteJudgement | null>(null);
  const [resultTier, setResultTier] = useState<ConcertTier>(
    getConcertTier(STARTING_FANS),
  );
  const [toast, setToast] = useState<{
    text: string;
    tone: ToastTone;
    key: number;
  } | null>(null);
  const [luckyDialog, setLuckyDialog] = useState<LuckyDialog | null>(null);
  const selectedTrack = getTrack("custom-upload");
  const currentVehicle = getVehicle(vehicleLevel);
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
      trackRef.current.melody[
        targetBeat % trackRef.current.melody.length
      ];

    [base, base * 2].forEach((frequency, index) => {
      const sparkle = audio.createOscillator();
      const gain = audio.createGain();
      sparkle.type = index === 0 ? "square" : "sine";
      sparkle.frequency.setValueAtTime(frequency, now + index * 0.045);
      gain.gain.setValueAtTime(index === 0 ? 0.085 : 0.055, now + index * 0.045);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        now + 0.2 + index * 0.045,
      );
      sparkle.connect(gain).connect(audio.destination);
      sparkle.start(now + index * 0.045);
      sparkle.stop(now + 0.22 + index * 0.045);
    });
  }, []);

  const handleSongUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setSongLoading(true);
      setSongReady(false);
      setSongError("");
      setSongFileName(file.name);
      setSongTitle(file.name.replace(/\.[^.]+$/, ""));

      try {
        if (/\.mgg$/i.test(file.name)) {
          throw new Error("MGG 是音乐平台专有格式，请上传 MP3、M4A、WAV 或 AAC");
        }
        const supportedExtension = /\.(mp3|m4a|wav|aac|ogg|flac)$/i.test(file.name);
        if (!file.type.startsWith("audio/") && !supportedExtension) {
          throw new Error("请选择 MP3、M4A、WAV 等音频文件");
        }
        if (file.size > 80 * 1024 * 1024) {
          throw new Error("音频文件请控制在 80MB 以内");
        }
        const AudioContextClass =
          window.AudioContext ||
          (
            window as typeof window & {
              webkitAudioContext?: typeof AudioContext;
            }
          ).webkitAudioContext;
        if (!AudioContextClass) {
          throw new Error("当前浏览器不支持音频节拍分析");
        }

        const analysisContext = new AudioContextClass();
        const decoded = await analysisContext.decodeAudioData(
          await file.arrayBuffer(),
        );
        const analysis = analyzeAudioBuffer(decoded);
        await analysisContext.close();

        songRef.current?.pause();
        if (audioRef.current) {
          await audioRef.current.close();
          audioRef.current = null;
        }
        mediaSourceRef.current = null;
        lowShelfRef.current = null;
        highShelfRef.current = null;
        if (songUrlRef.current) URL.revokeObjectURL(songUrlRef.current);
        const url = URL.createObjectURL(file);
        const song = new Audio(url);
        song.preload = "auto";
        song.muted = mutedRef.current;
        song.playbackRate = 1;

        songUrlRef.current = url;
        songRef.current = song;
        detectedBeatTimesRef.current = analysis.beatTimes;
        detectedLanePatternRef.current = analysis.lanePattern;
        detectedBpmRef.current = analysis.bpm;
        setDetectedBpm(analysis.bpm);
        setSongDuration(decoded.duration);
        setCurrentBpm(analysis.bpm);
        setSongReady(true);
        showToast(`节拍分析完成 · ${analysis.bpm} BPM`, "gold");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "音频解析失败，请换一个文件";
        setSongError(message);
        setSongFileName("");
        setSongTitle("未选择歌曲");
        songRef.current = null;
      } finally {
        setSongLoading(false);
        event.target.value = "";
      }
    },
    [showToast],
  );

  const playBeat = useCallback((beat: number) => {
    const audio = audioRef.current;
    if (!audio || mutedRef.current) return;

    const track = trackRef.current;
    const isVariation = beat < arrangementUntilRef.current;
    const pitchRatio =
      toneModeRef.current === "thick"
        ? 0.84
        : toneModeRef.current === "thin"
          ? 1.18
          : 1;
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

    // The imported song is the backing track. Keep only a short arcade click
    // on top so the player can feel the analysed beat without masking the song.
    if (songRef.current) return;

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
          targetBeat: beat + TRAVEL_BEATS,
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
          targetBeat: beat + TRAVEL_BEATS,
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
        targetBeat: beat + TRAVEL_BEATS,
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
      const visualSpeed = 180 + trackRef.current.bpmAt(beatRef.current) * 1.2;
      const roadOffset = ((elapsed / 1000) * visualSpeed) % 92;
      const shakeX = shakeRef.current > 0 ? (Math.random() - 0.5) * 12 : 0;
      const shakeY = shakeRef.current > 0 ? (Math.random() - 0.5) * 8 : 0;

      ctx.save();
      ctx.translate(shakeX, shakeY);
      if (screenPunchRef.current > 0) {
        const scale = 1 + screenPunchRef.current * 0.014;
        ctx.translate(GAME_WIDTH / 2, GAME_HEIGHT / 2);
        ctx.scale(scale, scale);
        ctx.translate(-GAME_WIDTH / 2, -GAME_HEIGHT / 2);
      }
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
          const timingDistance = Math.abs(entity.hitAt - elapsed);
          if (timingDistance < 260) {
            const ringScale = 1 + timingDistance / 520;
            ctx.strokeStyle =
              timingDistance < 110 ? "#ffe66d" : "rgba(114, 241, 255, 0.82)";
            ctx.lineWidth = timingDistance < 110 ? 5 : 3;
            ctx.beginPath();
            ctx.arc(0, -5, 29 * ringScale, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = timingDistance < 110 ? "#ffe66d" : "#72f1ff";
            ctx.font = "bold 9px monospace";
            ctx.textAlign = "center";
            ctx.fillText(timingDistance < 110 ? "HIT!" : "SPACE", 0, -38);
          }
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
      const busY = PLAYER_Y - busBounceRef.current * 18;
      const vehicle = getVehicle(vehicleLevelRef.current);
      const busScale = 1 + (vehicle.level - 1) * 0.035;
      ctx.save();
      ctx.translate(Math.round(busX), Math.round(busY));
      ctx.scale(busScale, busScale);
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
      ctx.fillStyle = vehicle.primary;
      ctx.fillRect(-31, -52, 62, 105);
      ctx.fillStyle = vehicle.secondary;
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
      for (let light = 0; light < vehicle.level; light += 1) {
        ctx.fillStyle = light % 2 === 0 ? "#72f1ff" : "#ffe66d";
        ctx.fillRect(-22 + light * 12, -59, 8, 6);
      }
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
      if (collectFlashRef.current > 0) {
        ctx.fillStyle = `rgba(114, 241, 255, ${collectFlashRef.current * 0.16})`;
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
    if (songRef.current) {
      songRef.current.pause();
    }
    resetSongTone();
  }, [addBurst, resetSongTone]);

  const failGame = useCallback(() => {
    if (statusRef.current !== "playing") return;
    statusRef.current = "failed";
    setStatus("failed");
    setEarnedCoins(0);
    setProgress(100);
    shakeRef.current = 0.7;
    hitFlashRef.current = 1;
    addBurst(busXRef.current, PLAYER_Y - 8, "#ffe66d", 34);
    if (songRef.current) {
      songRef.current.pause();
    }
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
  }, [addBurst, resetSongTone]);

  const gameLoop = useCallback(
    function gameLoopFrame(now: number) {
      if (statusRef.current !== "playing") return;
      const delta = Math.min(0.035, Math.max(0, (now - lastTimeRef.current) / 1000));
      lastTimeRef.current = now;
      const elapsed =
        songRef.current && !songRef.current.paused
          ? songRef.current.currentTime * 1000
          : now - startTimeRef.current;
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
          pedestrianRef.current = {
            startAt: beatTimes[beat],
            hitAt: beatTimes[track.grannyBeat],
            endAt:
              beatTimes[
                Math.min(track.grannyBeat + 4, beatTimes.length - 1)
              ],
            direction: track.grannyBeat % 2 === 0 ? 1 : -1,
            x:
              track.grannyBeat % 2 === 0
                ? ROAD_LEFT - 24
                : ROAD_LEFT + ROAD_WIDTH + 24,
            y: -70,
          };
          showToast("注意！4 拍后行人抵达中间车道", "gold");
        }
        if (beat === track.grannyBeat) {
          showToast("危险！离开中间车道", "danger");
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
        (laneCenter(laneRef.current) - busXRef.current) * Math.min(1, delta * 14);

      const nextEntities: Entity[] = [];
      for (const currentEntity of entitiesRef.current) {
        const travelProgress =
          (elapsed - currentEntity.spawnAt) /
          Math.max(1, currentEntity.hitAt - currentEntity.spawnAt);
        const entity: Entity = {
          ...currentEntity,
          y: -70 + (PLAYER_Y + 70) * travelProgress,
        };

        if (entity.type === "fan") {
          if (!entity.handled && elapsed > entity.hitAt + MISS_WINDOW) {
            entity.handled = true;
            comboRef.current = 0;
            setCombo(0);
            showJudgement("MISS", "节拍漏击 · COMBO BREAK");
            addFloatText(
              laneCenter(entity.lane),
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
          entity.y > PLAYER_Y - 48 &&
          entity.y < PLAYER_Y + 52;

        if (!colliding) {
          if (!entity.handled && entity.y < GAME_HEIGHT + 90) {
            nextEntities.push(entity);
          }
          continue;
        }

        const x = laneCenter(entity.lane);
        if (entity.type === "lucky") {
          entity.handled = true;
          currentEntity.handled = true;
          entitiesRef.current = entitiesRef.current.filter(
            (item) => item.id !== entity.id,
          );
          statusRef.current = "lucky";
          setStatus("lucky");
          setLuckyDialog({ phase: "choice" });
          setNoteJudgement(null);
          songRef.current?.pause();
          void audioRef.current?.suspend();
          animationRef.current = null;
          return;
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
        const approachProgress =
          (elapsed - pedestrian.startAt) /
          Math.max(1, pedestrian.hitAt - pedestrian.startAt);
        const fromX =
          pedestrian.direction === 1 ? ROAD_LEFT - 24 : ROAD_LEFT + ROAD_WIDTH + 24;
        const toX =
          pedestrian.direction === 1 ? ROAD_LEFT + ROAD_WIDTH + 24 : ROAD_LEFT - 24;
        const pedestrianX = fromX + (toX - fromX) * crossingProgress;
        const pedestrianY = -70 + (PLAYER_Y + 70) * approachProgress;
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
        if (crossingProgress > 1.05 || pedestrianY > GAME_HEIGHT + 80) {
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
      screenPunchRef.current = Math.max(
        0,
        screenPunchRef.current - delta * 7,
      );

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (ctx) drawGame(ctx, elapsed);

      if (elapsed - lastHudRef.current > 100) {
        lastHudRef.current = elapsed;
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
      drawGame,
      failGame,
      finishGame,
      playBeat,
      resetSongTone,
      showJudgement,
      showToast,
      spawnBeat,
      triggerDamageVariation,
    ],
  );

  const hitNote = useCallback(() => {
    if (statusRef.current !== "playing") return;
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
      timingError <= 55
        ? "PERFECT"
        : timingError <= 110
          ? "GREAT"
          : "GOOD";
    comboRef.current += 1;
    maxComboRef.current = Math.max(maxComboRef.current, comboRef.current);
    if (quality === "PERFECT") perfectCountRef.current += 1;
    successfulHitsRef.current += 1;
    setSuccessfulHits(successfulHitsRef.current);
    checkVehicleUpgrade();
    const capacity = getVehicle(vehicleLevelRef.current).capacity;
    const fanGained = fansRef.current < capacity;
    fansRef.current = Math.min(capacity, fansRef.current + 1);
    setFans(fansRef.current);
    setCombo(comboRef.current);
    setMaxCombo(maxComboRef.current);
    showJudgement(
      quality,
      fanGained
        ? `JUST HIT · +1 FAN · ×${comboRef.current}`
        : `JUST HIT · BUS FULL ${capacity} · ×${comboRef.current}`,
    );
    playFanHit(candidate.targetBeat);

    const x = laneCenter(candidate.lane);
    addBurst(x, PLAYER_Y - 22, "#72f1ff", 28);
    if (quality === "PERFECT") addBurst(x, PLAYER_Y - 22, "#ffe66d", 20);
    addFloatText(
      x,
      PLAYER_Y - 64,
      fanGained
        ? quality === "PERFECT"
          ? "点上了! +1"
          : "+1 FAN"
        : `满载 ${capacity}`,
      quality === "PERFECT" ? "#ffe66d" : "#ffffff",
    );
    beatPulseRef.current = 1.65;
    collectFlashRef.current = 1;
    busBounceRef.current = 1;
    screenPunchRef.current = quality === "PERFECT" ? 1.2 : 0.72;
    navigator.vibrate?.(quality === "PERFECT" ? [18, 16, 28] : 22);

    if (
      quality === "PERFECT" &&
      perfectCountRef.current % 8 === 0 &&
      !shieldRef.current
    ) {
      shieldRef.current = true;
      setShield(true);
      showToast("8 次 PERFECT！获得应援护盾", "gold");
    }
  }, [
    addBurst,
    addFloatText,
    checkVehicleUpgrade,
    playFanHit,
    showJudgement,
    showToast,
  ]);

  const startGame = useCallback(async () => {
    const song = songRef.current;
    const analysedBeats = detectedBeatTimesRef.current;
    if (!songReady || !song || analysedBeats.length < 12) {
      showToast("请先上传一首本地歌曲", "pink");
      return;
    }
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
    if (audio && !mediaSourceRef.current) {
      const mediaSource = audio.createMediaElementSource(song);
      const lowShelf = audio.createBiquadFilter();
      const highShelf = audio.createBiquadFilter();
      lowShelf.type = "lowshelf";
      lowShelf.frequency.value = 320;
      lowShelf.gain.value = 0;
      highShelf.type = "highshelf";
      highShelf.frequency.value = 1900;
      highShelf.gain.value = 0;
      mediaSource.connect(lowShelf).connect(highShelf).connect(audio.destination);
      mediaSourceRef.current = mediaSource;
      lowShelfRef.current = lowShelf;
      highShelfRef.current = highShelf;
    }

    const totalBeats = analysedBeats.length - 1;
    const runtimeTrack: Track = {
      ...selectedTrack,
      name: songTitle,
      english: songTitle,
      totalBeats,
      grannyBeat: Math.max(8, Math.min(totalBeats - 6, Math.floor(totalBeats * 0.56))),
      tempoLabel: `${detectedBpmRef.current} BPM`,
      bpmAt: () => detectedBpmRef.current,
      lanePattern: detectedLanePatternRef.current,
    };
    trackRef.current = runtimeTrack;
    beatTimesRef.current = analysedBeats;
    window.localStorage.setItem("fan-bus-track", runtimeTrack.id);
    statusRef.current = "playing";
    setStatus("playing");
    laneRef.current = 2;
    busXRef.current = laneCenter(2);
    vehicleLevelRef.current = 1;
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
    successfulHitsRef.current = 0;
    grannyWarnedRef.current = false;
    invulnerableUntilRef.current = 0;
    beatPulseRef.current = 0;
    shakeRef.current = 0;
    hitFlashRef.current = 0;
    collectFlashRef.current = 0;
    busBounceRef.current = 0;
    screenPunchRef.current = 0;
    setFans(STARTING_FANS);
    setVehicleLevel(1);
    setCombo(0);
    setMaxCombo(0);
    setSuccessfulHits(0);
    setProgress(0);
    setShield(false);
    setCurrentBpm(detectedBpmRef.current);
    setToast(null);
    setNoteJudgement(null);
    setLuckyDialog(null);
    resetSongTone();

    song.pause();
    song.currentTime = 0;
    song.playbackRate = 1;
    song.muted = mutedRef.current;
    try {
      await audio?.resume();
      await song.play();
    } catch {
      statusRef.current = "ready";
      setStatus("ready");
      setSongError("浏览器未能播放该音频，请重新导入后再试");
      showToast("音频播放失败", "danger");
      return;
    }

    const now = performance.now();
    startTimeRef.current = now;
    lastTimeRef.current = now;
    lastHudRef.current = 0;
    animationRef.current = window.requestAnimationFrame(gameLoop);
  }, [
    gameLoop,
    resetSongTone,
    selectedTrack,
    showToast,
    songReady,
    songTitle,
  ]);

  const pauseGame = useCallback(() => {
    if (statusRef.current !== "playing") return;
    statusRef.current = "paused";
    setStatus("paused");
    if (animationRef.current) {
      window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    songRef.current?.pause();
    void audioRef.current?.suspend();
    setNoteJudgement(null);
  }, []);

  const resumeGame = useCallback(async () => {
    if (statusRef.current !== "paused" || !songRef.current) return;
    statusRef.current = "playing";
    setStatus("playing");
    try {
      await audioRef.current?.resume();
      await songRef.current.play();
      lastTimeRef.current = performance.now();
      animationRef.current = window.requestAnimationFrame(gameLoop);
    } catch {
      statusRef.current = "paused";
      setStatus("paused");
      showToast("歌曲继续播放失败，请重新发车", "danger");
    }
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
        doubledFans > capacity ? `翻倍！上限 ${capacity}` : "粉丝 ×2!",
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
      addFloatText(
        busXRef.current,
        PLAYER_Y - 64,
        "粉丝 ÷2",
        "#ff7ac8",
      );
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
    statusRef.current = "playing";
    setStatus("playing");
    try {
      await audioRef.current?.resume();
      await songRef.current.play();
      setLuckyDialog(null);
      lastTimeRef.current = performance.now();
      animationRef.current = window.requestAnimationFrame(gameLoop);
    } catch {
      statusRef.current = "lucky";
      setStatus("lucky");
      showToast("歌曲继续播放失败，请重新发车", "danger");
    }
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

  const returnToSongSelect = useCallback(() => {
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
    laneRef.current = 2;
    busXRef.current = laneCenter(2);
    vehicleLevelRef.current = 1;
    fansRef.current = STARTING_FANS;
    comboRef.current = 0;
    maxComboRef.current = 0;
    successfulHitsRef.current = 0;
    perfectCountRef.current = 0;
    shieldRef.current = false;
    setVehicleLevel(1);
    setFans(STARTING_FANS);
    setCombo(0);
    setMaxCombo(0);
    setSuccessfulHits(0);
    setShield(false);
    setProgress(0);
    setToast(null);
    setNoteJudgement(null);
    setLuckyDialog(null);
    entitiesRef.current = [];
    pedestrianRef.current = null;
  }, [resetSongTone]);

  const toggleMute = useCallback(() => {
    mutedRef.current = !mutedRef.current;
    if (songRef.current) songRef.current.muted = mutedRef.current;
    setMuted(mutedRef.current);
  }, []);

  useEffect(() => {
    const savedBest = Number(window.localStorage.getItem("fan-bus-best") || 0);
    const savedCoins = Number(window.localStorage.getItem("fan-bus-coins") || 0);
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
  }, [
    hitNote,
    move,
    pauseGame,
    resumeGame,
    startGame,
    toggleMute,
  ]);

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
      if (songUrlRef.current) {
        URL.revokeObjectURL(songUrlRef.current);
        songUrlRef.current = null;
      }
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
      if (judgementTimerRef.current) {
        window.clearTimeout(judgementTimerRef.current);
      }
    };
  }, [drawGame]);

  return (
    <main className="arcade-page">
      <div className="sky-grid" aria-hidden="true" />
      <header className="topbar">
        <div className="brand">
          <span className="brand-kicker">
            PIXEL TOUR /{" "}
            {status === "playing" || status === "paused" || status === "lucky"
              ? currentBpm
              : songReady
                ? detectedBpm
                : "--"}{" "}
            BPM
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
            <li><i className="legend fan-stick" />对准应援棒：按 HIT 粉丝 +1</li>
            <li><i className="legend warning" />障碍物：掉粉并改变音色，节奏不变</li>
            <li><i className="legend lucky-bag">?</i>锦囊：碰到后选择是否开启，再揭晓 ×2 或 ÷2</li>
            <li><i className="legend pedestrian-icon">♿</i>行人：按预警换到安全车道</li>
          </ul>
          <div className="side-upgrade-card">
            <small>BUS LV.{currentVehicle.level} · 容量 {currentVehicle.capacity}</small>
            <strong>{currentVehicle.name}</strong>
            <span>{currentVehicle.task}</span>
          </div>
          <p className="tip-copy">
            ← → 负责换道，SPACE / HIT 负责击打，P / ESC 暂停；只有在正确车道踩中点子才会收集。
          </p>
        </aside>

        <div className="game-cabinet">
          <div className="cabinet-top">
            <div>
              <span className="live-dot" />
              {status === "playing" ||
              status === "paused" ||
              status === "lucky"
                ? songTitle
                : "SELECT A TRACK"}
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
                {status === "paused" ? "▶ CONTINUE" : "Ⅱ PAUSE"}
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
              <span>FANS / CAP</span>
              <strong className="fans-count">
                {String(fans).padStart(3, "0")}
                <small>/{currentVehicle.capacity}</small>
              </strong>
            </div>
            <div className="hud-block combo-block">
              <span>BEAT COMBO</span>
              <strong>×{combo}</strong>
            </div>
            <div
              className={`music-state ${toneMode !== "normal" ? `is-variation is-${toneMode}` : ""}`}
            >
              <strong>{songReady ? currentBpm : "--"} BPM</strong>
              <span>
                {status === "lucky"
                  ? "锦囊抉择中 · TEMPO HOLD"
                  : status === "paused"
                  ? "已暂停 · P / ESC 继续"
                  : toneMode !== "normal"
                  ? `${toneMode === "thick" ? "厚" : "细"}音色中 · TEMPO LOCK`
                  : shield
                    ? "护盾减伤 READY"
                    : "对准点子按 HIT"}
              </span>
            </div>
          </div>

          <div className="vehicle-upgrade-strip" aria-label="车辆升级任务">
            <div className="vehicle-level-badge">
              <small>BUS</small>
              <strong>LV.{currentVehicle.level}</strong>
            </div>
            <div className="vehicle-task-copy">
              <strong>
                {currentVehicle.name}
                <span>载客上限 {currentVehicle.capacity}</span>
              </strong>
              <small>{currentVehicle.task}</small>
            </div>
            <div className="vehicle-task-meter" aria-label={`升级任务进度 ${vehicleTaskProgress}%`}>
              <span style={{ width: `${vehicleTaskProgress}%` }} />
              <b>{currentVehicle.requirement ? `${vehicleTaskProgress}%` : "MAX"}</b>
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

            {noteJudgement && (
              <div
                key={noteJudgement.key}
                className={`note-judgement quality-${noteJudgement.quality.toLowerCase()}`}
                aria-live="polite"
              >
                <strong>{noteJudgement.quality}</strong>
                <span>{noteJudgement.detail}</span>
              </div>
            )}

            {status === "ready" && (
              <div className="game-overlay intro-overlay">
                <div className="song-select-title">
                  <p className="overlay-kicker">SONG SELECT</p>
                  <h1>选歌</h1>
                  <span>上传歌曲后自动分析节拍</span>
                </div>
                <div className="track-picker" aria-label="选择本地歌曲">
                  <label
                    className={`uploaded-track-row ${songReady ? "is-selected" : ""}`}
                    htmlFor="custom-song-upload"
                  >
                    <span className="song-number">01</span>
                    <span className="track-copy">
                      <b>{songReady ? songTitle : "本地歌曲"}</b>
                      <small>
                        {songLoading
                          ? "正在拆解节拍与鼓点…"
                          : songReady
                            ? "节拍分析完成，可以发车"
                            : "支持 MP3 / M4A / WAV / AAC / OGG"}
                      </small>
                    </span>
                    <em>
                      {songLoading
                        ? "分析中"
                        : songReady
                          ? `${detectedBpm} BPM · ${Math.floor(songDuration / 60)}:${String(
                              Math.floor(songDuration % 60),
                            ).padStart(2, "0")}`
                          : "AUTO BPM"}
                    </em>
                    <i>{songLoading ? "ANALYZING" : songReady ? "✓ 已选择" : "UPLOAD"}</i>
                  </label>
                </div>
                <input
                  id="custom-song-upload"
                  className="visually-hidden"
                  type="file"
                  accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac,.mgg"
                  onChange={handleSongUpload}
                />
                <label className="upload-button" htmlFor="custom-song-upload">
                  {songReady ? "↻ 更换歌曲" : "＋ 上传本地歌曲"}
                </label>
                {songFileName && (
                  <p className="file-status" title={songFileName}>
                    {songReady ? "✓" : "…"} {songFileName}
                  </p>
                )}
                {songError && <p className="song-error">{songError}</p>}
                <p className="intro-copy">
                  应援棒到达黄色判定线时按 <strong>SPACE / HIT</strong><br />
                  当前 {currentVehicle.name} · 上限 {currentVehicle.capacity} 粉丝<br />
                  音频只保留在当前浏览器，不会上传服务器
                </p>
                <button
                  className="primary-button"
                  onClick={() => void startGame()}
                  disabled={!songReady || songLoading}
                >
                  <span>▶</span>{" "}
                  {songReady ? "用这首歌发车" : "请先上传歌曲"}
                </button>
                <p className="control-hint">
                  ← → / A D 换道 · SPACE 击打 · P / ESC 暂停
                </p>
              </div>
            )}

            {status === "paused" && (
              <div className="game-overlay pause-overlay">
                <p className="overlay-kicker">TOUR PAUSED</p>
                <div className="pause-icon" aria-hidden="true">
                  Ⅱ
                </div>
                <h2>巡演暂停</h2>
                <p>
                  歌曲、节拍和道路已经冻结。<br />
                  继续后从当前拍点重新出发。
                </p>
                <div className="result-actions pause-actions">
                  <button
                    className="primary-button"
                    onClick={() => void resumeGame()}
                  >
                    ▶ 继续游戏
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => void startGame()}
                  >
                    ↻ 重新开局
                  </button>
                  <button
                    className="secondary-button"
                    onClick={returnToSongSelect}
                  >
                    返回选歌
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
                <div className="lucky-dialog-icon" aria-hidden="true">
                  {luckyDialog.phase === "choice"
                    ? "?"
                    : luckyDialog.outcome === "double"
                      ? "×2"
                      : "÷2"}
                </div>

                {luckyDialog.phase === "choice" ? (
                  <>
                    <h2>是否开启锦囊？</h2>
                    <p className="lucky-dialog-copy">
                      开启后可能让粉丝翻倍，也可能直接减少一半。<br />
                      不开启则不会改变当前粉丝数。
                    </p>
                    <div className="lucky-risk-row" aria-label="锦囊可能结果">
                      <div className="lucky-risk-card is-good">
                        <small>GOOD LUCK</small>
                        <strong>
                          <i>↑</i>
                          <span>粉丝</span>
                          <b>×2</b>
                        </strong>
                        <em>最高到车辆载客上限</em>
                      </div>
                      <div className="lucky-risk-random" aria-hidden="true">
                        <b>?</b>
                        <small>随机</small>
                      </div>
                      <div className="lucky-risk-card is-risk">
                        <small>RISK</small>
                        <strong>
                          <i>↓</i>
                          <span>粉丝</span>
                          <b>÷2</b>
                        </strong>
                        <em>粉丝减半并中断连击</em>
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
                          ? `粉丝翻倍成功，车辆达到 ${luckyDialog.capacity} 人上限`
                          : "粉丝数量成功翻倍"
                        : "粉丝数量减少一半，连击已中断"}
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
                <p className="overlay-kicker">TOUR COMPLETE</p>
                <div className="stage-icon" style={{ color: resultTier.color }}>
                  {resultTier.icon}
                </div>
                <p className="result-label">今晚成功解锁</p>
                <h2 style={{ color: resultTier.color }}>{resultTier.name}</h2>
                <p className="result-place">
                  {songTitle} · {resultTier.place}
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
                <div className="result-actions">
                  <button className="primary-button" onClick={() => void startGame()}>
                    再跑一场
                  </button>
                  <button className="secondary-button" onClick={returnToSongSelect}>
                    返回选歌
                  </button>
                </div>
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
                <div className="result-actions">
                  <button className="primary-button" onClick={() => void startGame()}>
                    重新发车
                  </button>
                  <button className="secondary-button" onClick={returnToSongSelect}>
                    返回选歌
                  </button>
                </div>
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
            <button
              className="hit-button"
              onPointerDown={hitNote}
              aria-label="击打当前节拍"
              disabled={status !== "playing"}
            >
              <span>HIT</span>
              <small>SPACE</small>
            </button>
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
            <strong>{songReady ? songTitle : "WAITING FOR SONG"}</strong>
            <small>
              {songReady ? detectedBpm : "--"} BPM ·{" "}
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
