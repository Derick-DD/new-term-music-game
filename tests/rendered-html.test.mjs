import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);
const FIXED_AUDIO_FILE = "congratulations-treasure-tf-family.mp3";
const EXPECTED_AUDIO_SHA256 =
  "448bddb1c19d0da0fe5911a28babbdbe6ce73477c1bcc0eaffea64c49e8874b5";
const EXPECTED_ROAD_SHA256 =
  "93404f24f404f48e795725bc7132658db9a8ef594f5a5c0e878eb69787061bd5";

async function exists(relativePath) {
  try {
    await access(new URL(relativePath, ROOT));
    return true;
  } catch {
    return false;
  }
}

test("builds a portable static site without leaderboard services", async () => {
  const [nextConfig, packageSource, viteConfig, worker, hosting] =
    await Promise.all([
      readFile(new URL("next.config.ts", ROOT), "utf8"),
      readFile(new URL("package.json", ROOT), "utf8"),
      readFile(new URL("vite.config.ts", ROOT), "utf8"),
      readFile(new URL("worker/index.ts", ROOT), "utf8"),
      readFile(new URL(".openai/hosting.json", ROOT), "utf8"),
    ]);
  const packageFile = JSON.parse(packageSource);
  const hostingConfig = JSON.parse(hosting);

  assert.match(nextConfig, /output: "export"/);
  assert.match(nextConfig, /trailingSlash: true/);
  assert.match(packageFile.scripts.build, /build:static.*build:sites/);
  assert.equal(packageFile.scripts["build:static"], "next build");
  assert.doesNotMatch(packageSource, /vinext|plugin-rsc|react-server-dom-webpack/);
  assert.match(viteConfig, /publicDir: "out"/);
  assert.match(viteConfig, /static-adapter\.ts/);
  assert.match(worker, /env\.ASSETS\.fetch\(request\)/);
  assert.doesNotMatch(worker, /D1|DB|app-router|image-optimization/);
  assert.deepEqual(Object.keys(hostingConfig), ["project_id"]);

  assert.equal(await exists("app/api/"), false);
  assert.equal(await exists("db/"), false);
  assert.equal(await exists("drizzle/"), false);
  assert.equal(await exists("out/index.html"), true);
  assert.equal(await exists("dist/client/index.html"), true);
  assert.equal(await exists("dist/server/index.js"), true);
  assert.equal(await exists("dist/.openai/drizzle"), false);
});

test("uses one fixed audio file and preserves the versioned timing data", async () => {
  const [page, chartSource, audio, publicAudioFiles] = await Promise.all([
    readFile(new URL("app/page.tsx", ROOT), "utf8"),
    readFile(
      new URL("app/data/congratulations-treasure.chart.json", ROOT),
      "utf8",
    ),
    readFile(new URL(`public/audio/${FIXED_AUDIO_FILE}`, ROOT)),
    readdir(new URL("public/audio/", ROOT)),
  ]);
  const chart = JSON.parse(chartSource);
  assert.deepEqual(chart.gameplay.grannyBeats, [62]);
  assert.equal(chart.gameplay.grannyBeats.length, 1);
  const audioFiles = publicAudioFiles.filter((fileName) =>
    /\.(?:mp3|m4a|wav|aac|ogg|flac)$/i.test(fileName),
  );

  assert.deepEqual(audioFiles, [FIXED_AUDIO_FILE]);
  assert.equal(
    createHash("sha256").update(audio).digest("hex"),
    EXPECTED_AUDIO_SHA256,
  );
  assert.equal(chart.audio.sha256, EXPECTED_AUDIO_SHA256);
  assert.equal(chart.timing.beatTimesMs.length, 173);
  assert.equal(chart.gameplay.lanePattern.length, 173);
  assert.equal(chart.gameplay.notePattern.length, 173);
  assert.equal(chart.gameplay.intensityPattern.length, 173);
  assert.match(page, /PRECOMPUTED_CHART\.timing\.beatTimesMs/);
  assert.match(page, /songRef\.current\.currentTime \* 1000/);
  assert.match(page, /song\.playbackRate = 1/);
  assert.doesNotMatch(page, /decodeAudioData|type="file"|handleSongUpload/);
});

test("implements the requested campus gameplay safeguards", async () => {
  const [page, chartSource, roadImage] = await Promise.all([
    readFile(new URL("app/page.tsx", ROOT), "utf8"),
    readFile(
      new URL("app/data/congratulations-treasure.chart.json", ROOT),
      "utf8",
    ),
    readFile(new URL("public/assets/campus-season/campus-road.png", ROOT)),
  ]);
  const chart = JSON.parse(chartSource);
  let strongNotes = 0;
  let weakOrdinal = 0;
  let knowledgeBeforeClearance = 0;
  let spawnedKnowledge = 0;
  const clearedTargetBeats = [];
  for (
    let targetBeat = 4;
    targetBeat < chart.timing.beatTimesMs.length;
    targetBeat += 1
  ) {
    const level = chart.gameplay.notePattern[targetBeat];
    if (level === 2) strongNotes += 1;
    if (level === 1) weakOrdinal += 1;
    const shouldSpawnKnowledge =
      level === 2 ||
      (level === 1 && (weakOrdinal % 2 === 0 || weakOrdinal % 7 === 0));
    if (!shouldSpawnKnowledge) continue;
    knowledgeBeforeClearance += 1;
    const isPedestrianClearance = chart.gameplay.grannyBeats.some(
      (pedestrianBeat) => Math.abs(targetBeat - pedestrianBeat) <= 4,
    );
    if (isPedestrianClearance) clearedTargetBeats.push(targetBeat);
    else spawnedKnowledge += 1;
  }

  assert.equal(strongNotes, 84);
  assert.equal(knowledgeBeforeClearance, 114);
  assert.deepEqual(clearedTargetBeats, [58, 59, 60, 62, 64, 66]);
  assert.equal(spawnedKnowledge, 108);
  assert.ok(spawnedKnowledge / strongNotes > 1.2);
  assert.match(
    page,
    /weakNoteOrdinal % 2 === 0 \|\| weakNoteOrdinal % 7 === 0/,
  );
  assert.match(page, /\[19, 57\]\.includes\(activeNoteOrdinal\)/);
  assert.match(page, /const MAGNET_SPAWN_ORDINALS = \[36, 64\] as const/);
  assert.match(page, /const SECOND_MAGNET_CHANCE = 0\.25/);
  assert.match(
    page,
    /Math\.random\(\) < SECOND_MAGNET_CHANCE \? 2 : 1/,
  );
  assert.match(
    page,
    /magnetSpawnedRef\.current < magnetQuotaRef\.current/,
  );
  assert.match(
    page,
    /if \(bonusType === "magnet"\) magnetSpawnedRef\.current \+= 1/,
  );
  assert.ok((page.match(/magnetSpawnedRef\.current = 0/g) ?? []).length >= 2);
  assert.doesNotMatch(page, /activeNoteOrdinal % 28 === 8/);
  let activeNoteOrdinal = 0;
  const magnetTargetBeats = [];
  for (
    let targetBeat = 4;
    targetBeat < chart.gameplay.notePattern.length;
    targetBeat += 1
  ) {
    if (chart.gameplay.notePattern[targetBeat] !== 2) continue;
    activeNoteOrdinal += 1;
    if ([36, 64].includes(activeNoteOrdinal)) magnetTargetBeats.push(targetBeat);
  }
  assert.deepEqual(magnetTargetBeats, [74, 130]);
  assert.ok(
    magnetTargetBeats.every((targetBeat) => Math.abs(targetBeat - 62) > 4),
  );
  assert.ok(
    magnetTargetBeats.every(
      (targetBeat) => targetBeat - 4 >= 62 + (16 - 8),
    ),
  );
  for (const quota of [1, 2]) {
    let spawnedMagnets = 0;
    for (let ordinal = 1; ordinal <= strongNotes; ordinal += 1) {
      if (
        [36, 64].includes(ordinal) &&
        spawnedMagnets < quota
      ) {
        spawnedMagnets += 1;
      }
    }
    assert.equal(spawnedMagnets, quota);
  }
  assert.match(page, /const PERFECT_WINDOW = 65/);
  assert.match(page, /const GREAT_WINDOW = 155/);
  assert.match(page, /const MISS_WINDOW = 240/);
  assert.match(page, /elapsed <= entity\.hitAt \+ ENTITY_DESPAWN_AFTER_MS/g);
  assert.match(page, /const PEDESTRIAN_WARNING_BEATS = 8/);
  assert.match(page, /const PEDESTRIAN_EVENT_BEATS = 16/);
  assert.match(page, /const PEDESTRIAN_ITEM_CLEARANCE_BEATS = 4/);
  assert.match(page, /PEDESTRIAN_DANGER_WINDOW_MS/);
  assert.match(page, /grannyBeats: number\[\]/);
  assert.match(page, /grannyBeats: PRECOMPUTED_CHART\.gameplay\.grannyBeats\.slice\(0, 1\)/);
  assert.match(page, /有行人经过，小心/);
  assert.equal(page.match(/有行人经过，小心/g)?.length, 1);
  assert.doesNotMatch(
    page,
    /横穿|前方人行横道|老人正在|观察老人位置|再次礼让|行人已安全通过/,
  );
  assert.match(page, /roadYFromProgress\(approachProgress\)/);
  assert.match(page, /pedestrianXAtDepth\([\s\S]*?crossingProgress/);
  assert.match(page, /if \(!shouldSpawnKnowledge \|\| isPedestrianClearance\) return/);
  assert.match(page, /PEDESTRIAN_COLLISION_RADIUS = 56/);
  assert.match(page, /pedestrianY >= GAME_HEIGHT \|\| elapsed > pedestrian\.endAt/);
  assert.doesNotMatch(
    page,
    /pedestrian\.lane|reservedPedestrian|PEDESTRIAN_LANES|pedestrianLaneForIndex/,
  );
  assert.match(page, /141,[\s\S]*?46,[\s\S]*?229,[\s\S]*?420/);

  assert.equal(
    createHash("sha256").update(roadImage).digest("hex"),
    EXPECTED_ROAD_SHA256,
  );
  assert.equal(roadImage.readUInt32BE(16), 1024);
  assert.equal(roadImage.readUInt32BE(20), 1536);
  assert.match(page, /const ROAD_SAFE_INSET = 8/);
  assert.match(page, /const ROAD_WIDTH = GAME_WIDTH - ROAD_SAFE_INSET \* 2/);
  assert.match(page, /const ROAD_BOTTOM_DEPTH/);
  assert.match(page, /laneBoundaryXAtDepth\(boundary, ROAD_BOTTOM_DEPTH\)/);
  assert.match(page, /for \(const boundary of \[0, 5\]\)/);
  assert.match(
    page,
    /for \(let boundary = 1; boundary < 5; boundary \+= 1\)[\s\S]*?laneBoundaryXAtDepth\(boundary, startDepth\)[\s\S]*?laneBoundaryXAtDepth\(boundary, endDepth\)/,
  );
  assert.doesNotMatch(
    page,
    /laneXAtDepth\(lane, startDepth\)[\s\S]*?laneXAtDepth\(lane, endDepth\)/,
  );
  assert.doesNotMatch(page, /fillRect\(ROAD_LEFT \+ 10, PLAYER_Y - 4/);
  assert.doesNotMatch(page, /fillRect\(laneCenter\(lane\) - 18/);
  assert.match(
    page,
    /ctx\.drawImage\(images\.road, 0, 0, GAME_WIDTH, GAME_HEIGHT\)/,
  );
  assert.match(page, /roadDashTextureShear = -29 \/ 404/);
  assert.match(page, /ctx\.clip\(\)[\s\S]*?ctx\.transform\([\s\S]*?roadDashTextureShear/);
  assert.match(page, /const CROSSWALK_BAR_COUNT = 10/);
  assert.match(page, /const CROSSWALK_SIDE_PADDING = 0\.035/);
  assert.match(page, /const CROSSWALK_BAR_GAP = 0\.028/);
  assert.match(
    page,
    /roadXAtFraction\(barStart, crosswalkFarDepth\)[\s\S]*?roadXAtFraction\(barEnd, crosswalkFarDepth\)[\s\S]*?roadXAtFraction\(barEnd, crosswalkNearDepth\)[\s\S]*?roadXAtFraction\(barStart, crosswalkNearDepth\)/,
  );

  const gameWidth = 480;
  const roadLeft = 8;
  const roadWidth = 464;
  const laneWidth = roadWidth / 5;
  const vanishX = gameWidth / 2;
  const bottomDepth = (720 - 302) / (584 - 302);
  const atDepth = (x, depth) => vanishX + (x - vanishX) * depth;
  const playerCenters = Array.from(
    { length: 5 },
    (_, lane) => roadLeft + laneWidth * lane + laneWidth / 2,
  );
  const playerBoundaries = Array.from(
    { length: 6 },
    (_, boundary) => roadLeft + laneWidth * boundary,
  );
  assert.deepEqual(
    playerCenters.map((x) => Number(x.toFixed(1))),
    [54.4, 147.2, 240, 332.8, 425.6],
  );
  assert.deepEqual(
    playerBoundaries.map((x) => Number(x.toFixed(1))),
    [8, 100.8, 193.6, 286.4, 379.2, 472],
  );
  assert.deepEqual(
    playerCenters.map((x) => Number(atDepth(x, bottomDepth).toFixed(3))),
    [-35.109, 102.445, 240, 377.555, 515.109],
  );
  assert.deepEqual(
    playerBoundaries.map((x) => Number(atDepth(x, bottomDepth).toFixed(3))),
    [-103.887, 33.668, 171.223, 308.777, 446.332, 583.887],
  );
  for (const depth of [0.1, 0.5, 1, bottomDepth]) {
    for (let lane = 0; lane < 5; lane += 1) {
      const centerAtDepth = atDepth(playerCenters[lane], depth);
      const leftAtDepth = atDepth(playerBoundaries[lane], depth);
      const rightAtDepth = atDepth(playerBoundaries[lane + 1], depth);
      assert.equal(
        Number(centerAtDepth.toFixed(8)),
        Number(((leftAtDepth + rightAtDepth) / 2).toFixed(8)),
      );
    }
  }
  const largestVehicleHalfWidth = 62.8 / 2;
  assert.ok(playerCenters[0] - largestVehicleHalfWidth > 0);
  assert.ok(playerCenters[4] + largestVehicleHalfWidth < gameWidth);

  const hitCrosswalkWidth =
    atDepth(playerBoundaries[5], 1) - atDepth(playerBoundaries[0], 1);
  assert.equal(hitCrosswalkWidth, roadWidth);
  assert.equal(playerCenters[2], vanishX);
  assert.ok(playerCenters[2] - playerCenters[1] > 56);
  assert.ok(playerCenters[3] - playerCenters[2] > 56);

  const crosswalkBarCount = 10;
  const crosswalkSidePadding = 0.035;
  const crosswalkBarGap = 0.028;
  const crosswalkBarWidth =
    (1 -
      crosswalkSidePadding * 2 -
      crosswalkBarGap * (crosswalkBarCount - 1)) /
    crosswalkBarCount;
  const crosswalkBars = Array.from({ length: crosswalkBarCount }, (_, bar) => {
    const start =
      crosswalkSidePadding + bar * (crosswalkBarWidth + crosswalkBarGap);
    return { start, end: start + crosswalkBarWidth };
  });
  assert.ok(crosswalkBarWidth > 0);
  assert.ok(crosswalkBars[0].start >= crosswalkSidePadding);
  assert.ok(crosswalkBars.at(-1).end <= 1 - crosswalkSidePadding + 1e-12);
  for (let bar = 1; bar < crosswalkBars.length; bar += 1) {
    assert.ok(crosswalkBars[bar].start > crosswalkBars[bar - 1].end);
  }
  const firstBarFarWidth =
    atDepth(roadLeft + roadWidth * crosswalkBars[0].end, 0.35) -
    atDepth(roadLeft + roadWidth * crosswalkBars[0].start, 0.35);
  const firstBarNearWidth =
    atDepth(roadLeft + roadWidth * crosswalkBars[0].end, 1) -
    atDepth(roadLeft + roadWidth * crosswalkBars[0].start, 1);
  assert.ok(firstBarNearWidth > firstBarFarWidth);

  const smoothstep = (progress) => progress * progress * (3 - 2 * progress);
  const pedestrianX = (direction, crossingProgress, depth) => {
    const left = atDepth(playerBoundaries[0], depth);
    const right = atDepth(playerBoundaries[5], depth);
    const spriteScale = 0.3 + Math.min(1, depth) * 0.7;
    const edgeInset = Math.min(
      25 * spriteScale,
      Math.max(0, (right - left) / 2),
    );
    const safeLeft = left + edgeInset;
    const safeRight = right - edgeInset;
    const eased = smoothstep(crossingProgress);
    return direction === 1
      ? safeLeft + (safeRight - safeLeft) * eased
      : safeRight + (safeLeft - safeRight) * eased;
  };
  const eventStartAt = chart.timing.beatTimesMs[62 - 8];
  const eventHitAt = chart.timing.beatTimesMs[62];
  const eventEndAt = chart.timing.beatTimesMs[62 + 8];
  assert.equal(eventStartAt, 27_000);
  assert.equal(eventHitAt, 31_000);
  assert.equal(eventEndAt, 35_000);
  assert.equal((eventHitAt - eventStartAt) / (eventEndAt - eventStartAt), 0.5);
  assert.equal(pedestrianX(1, 0, 0), vanishX);
  assert.equal(pedestrianX(-1, 0, 0), vanishX);
  assert.equal(pedestrianX(1, 0.5, 1), playerCenters[2]);
  assert.equal(pedestrianX(-1, 0.5, 1), playerCenters[2]);
  const halfApproachDepth = Math.pow(0.5, 1.42);
  const leftToRightQuarter = pedestrianX(1, 0.25, halfApproachDepth);
  const rightToLeftQuarter = pedestrianX(-1, 0.25, halfApproachDepth);
  assert.ok(leftToRightQuarter < vanishX);
  assert.ok(rightToLeftQuarter > vanishX);
  assert.equal(
    Number((leftToRightQuarter + rightToLeftQuarter).toFixed(6)),
    gameWidth,
  );
  assert.equal(302 + (584 - 302) * Math.pow(0, 1.42), 302);
  assert.equal(302 + (584 - 302) * Math.pow(1, 1.42), 584);
  assert.equal(584 + (720 + 48 - 584), 768);
  assert.doesNotMatch(
    page,
    /x \+ wobble|busBounce|fillRect\(-27, 45|ctx\.shadowColor|ctx\.shadowBlur|ctx\.ellipse/,
  );
  assert.match(page, /const bounds = \{ x: -50, y: -96, width: 100, height: 100 \}/);
  assert.match(page, /const VEHICLE_VISUAL_SCALE = 1\.2/);
  assert.match(page, /const VEHICLE_EFFECT_CENTER_Y = -46 \* VEHICLE_VISUAL_SCALE/);
  assert.match(
    page,
    /const busScale =\s*VEHICLE_VISUAL_SCALE \* \(1 \+ \(vehicle\.level - 1\) \* 0\.015\)/,
  );
  assert.match(
    page,
    /VEHICLE_VISUAL_SCALE \* \(48 \+ index \* 9 \+ pulse \* 5\)/,
  );
  assert.match(page, /VEHICLE_VISUAL_SCALE \* \(48 \+ pulse \* 4\)/);
  assert.match(page, /lastVehicleImageRef\.current/);
  assert.match(page, /fansRef\.current \+= 1/g);
  assert.match(page, /name: "校车大巴"/);
  assert.doesNotMatch(page, /capacity|满载|BUS FULL|开学校车大巴/);
});

test("ships the direct-start mobile copy and QR placeholder", async () => {
  const [page, styles, exportedHtml] = await Promise.all([
    readFile(new URL("app/page.tsx", ROOT), "utf8"),
    readFile(new URL("app/globals.css", ROOT), "utf8"),
    readFile(new URL("out/index.html", ROOT), "utf8"),
  ]);

  assert.match(page, /type ReadyPage = "home" \| "rules"/);
  assert.match(page, /踩准节拍，有用的知识\+1\+1\+1/);
  assert.match(page, /跟着歌曲节拍收集知识，解锁你的新学期隐藏人设/);
  assert.match(page, /升级开学载具/);
  assert.match(page, /从0开始收集知识，自行车也可以升级成校车/);
  assert.match(page, /疯狂汲取知识/);
  assert.match(
    styles,
    /\.story-route strong,\s*\.story-mission strong\s*\{\s*color: #0b678f;\s*font-weight: 900;\s*text-shadow: none;/,
  );
  assert.match(page, /知识数量x最高连击次数=你的新学期人设/);
  assert.match(page, /游戏BGM《恭喜你发现了宝藏》——TF家族/);
  assert.match(page, /share-card-qr-placeholder/);
  assert.match(page, /二维码占位/);
  assert.doesNotMatch(page, /准备出发|首校园主题曲|级载具进化/);
  assert.doesNotMatch(page, /排行榜|leaderboard|知识星|BPM|01:26|完整版/);
  assert.doesNotMatch(exportedHtml, /排行榜|知识星|BPM|01:26|完整版/);

  assert.match(styles, /-apple-system, BlinkMacSystemFont/);
  assert.match(styles, /min-height: 100svh/);
  assert.match(styles, /height: 100dvh/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /\.story-title::before,[\s\S]*?display: none/);
  assert.match(styles, /\.share-card-qr-placeholder/);
  assert.match(styles, /\.home-copy h1 span \{\s*color: #168daa/);
  assert.match(styles, /\.home-copy h1 strong \{\s*color: #e54a86/);
  assert.match(
    styles,
    /\.share-result-button:hover \{[\s\S]*?background: #ffd84d/,
  );
  assert.match(styles, /\.concert-score strong:first-of-type/);
  assert.match(styles, /\.concert-score strong:nth-of-type\(2\)/);
  assert.doesNotMatch(styles, /leaderboard|share-card-rank/);
});

test("uses ImageGen vehicle sprites with visible occupants", async () => {
  const vehicleFiles = [
    "vehicle-bicycle.png",
    "vehicle-motorcycle.png",
    "vehicle-car.png",
    "vehicle-school-bus.png",
  ];
  const images = await Promise.all(
    vehicleFiles.map((fileName) =>
      readFile(new URL(`public/assets/campus-season/${fileName}`, ROOT)),
    ),
  );
  for (const image of images) {
    assert.ok(image.byteLength > 100_000);
    assert.equal(image.readUInt32BE(16), 640);
    assert.equal(image.readUInt32BE(20), 640);
    assert.equal(image[25], 6);
  }

  const page = await readFile(new URL("app/page.tsx", ROOT), "utf8");
  for (const fileName of vehicleFiles) assert.match(page, new RegExp(fileName));
  assert.match(page, /entity\.type === "lucky"/);
  assert.match(page, /const haloColor/);
  assert.match(page, /ENTITY_RENDER_SIZE \*/);
});

test("uses a unified ImageGen crayon persona icon set", async () => {
  const outcomeFiles = [
    "outcome-slacker-fish-crayon.png",
    "outcome-scholar-cheese.png",
    "outcome-grind-cat-roll.png",
    "outcome-hidden-dog-reader.png",
    "outcome-genius-penguin.png",
  ];
  const [page, styles, ...images] = await Promise.all([
    readFile(new URL("app/page.tsx", ROOT), "utf8"),
    readFile(new URL("app/globals.css", ROOT), "utf8"),
    ...outcomeFiles.map((fileName) =>
      readFile(
        new URL(`public/assets/campus-season/icons/${fileName}`, ROOT),
      ),
    ),
  ]);

  const hashes = new Set();
  for (let index = 0; index < outcomeFiles.length; index += 1) {
    const image = images[index];
    assert.ok(image.byteLength > 150_000);
    assert.equal(image.readUInt32BE(16), 512);
    assert.equal(image.readUInt32BE(20), 512);
    assert.equal(image[25], 6);
    hashes.add(createHash("sha256").update(image).digest("hex"));
    assert.match(page, new RegExp(outcomeFiles[index].replace(".", "\\.")));
  }
  assert.equal(hashes.size, outcomeFiles.length);
  assert.match(page, /drawContainedImage\(context, tierIcon, 320, 300, 440, 440\)/);
  assert.match(styles, /\.share-card-venue > img \{\s*width: 112px;\s*height: 112px/);
  assert.match(
    styles,
    /@media \(max-width: 380px\), \(max-height: 680px\) and \(max-width: 780px\)[\s\S]*?\.share-card-venue > img \{\s*width: 96px;\s*height: 96px/,
  );
  const shareCardStart = page.indexOf('<article className="share-result-card">');
  const shareCardEnd = page.indexOf("</article>", shareCardStart);
  const shareCardMarkup = page.slice(shareCardStart, shareCardEnd);
  assert.ok(shareCardStart >= 0 && shareCardEnd > shareCardStart);
  assert.ok(
    shareCardMarkup.indexOf('className="share-card-venue"') <
      shareCardMarkup.indexOf('className="share-card-score"'),
  );
  assert.equal((shareCardMarkup.match(/resultTier\.iconSrc/g) ?? []).length, 1);
  assert.equal((shareCardMarkup.match(/resultTier\.name/g) ?? []).length, 1);
  assert.match(shareCardMarkup, /本次解锁/);
  assert.doesNotMatch(shareCardMarkup, /校园新生|share-card-player/);
  assert.doesNotMatch(page, /data\.nickname|data\.song/);
  assert.match(page, /context\.fillRect\(92, 1138, 560, 206\)/);
  assert.match(page, /context\.fillRect\(682, 1138, 306, 206\)/);
  assert.match(
    styles,
    /@media \(max-width: 780px\) \{\s*\.stage-icon \{\s*width: 76px;\s*height: 76px/,
  );
});
