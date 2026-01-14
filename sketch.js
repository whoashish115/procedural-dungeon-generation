const TILE_WALL = 0;
const TILE_FLOOR = 1;
const TILE_WATER = 2;
const TILE_LAVA = 3;
const TILE_PILLAR = 4;
const TILE_RUBBLE = 5;
const TILE_DOOR = 6;
const TILE_UP = 7;
const TILE_DOWN = 8;
const TILE_TORCH = 9;
const TILE_TRAP = 10;
const TILE_TREASURE = 11;

const CONTROL_H = 76;

const ROOM_MIN = 6;
const ROOM_MAX = 16;
const MAX_DEPTH = 5;

const MAX_HEALTH = 7;
const START_LIFELINE = 1;

const PLAYER_MOVE_DELAY = 4;
const ENEMY_MOVE_DELAY = 10;
const ACTION_RADIUS = 4;

let tileSize = 12;
let cols = 0;
let rows = 0;
let mapPxW = 0;
let mapPxH = 0;

let grid = [];
let feats = [];
let rooms = [];
let floorTiles = [];
let enemies = [];

let player = { x: 1, y: 1 };
let startPos = { x: 1, y: 1 };
let exitPos = { x: 1, y: 1 };

let health = MAX_HEALTH;
let lifeline = START_LIFELINE;
let treasureFound = 0;
let treasureTotal = 0;
let statusMsg = "Explore the dungeon.";

let moveCd = 0;
let enemyCd = 0;

let paused = false;
let runStartFrame = 0;

let stats = {
  steps: 0,
  kills: 0,
  traps: 0,
  treasures: 0,
  cleared: 0,
  deaths: 0
};

let statusEl;
let heartsEl;
let lifelineEl;
let tileSizeValEl;
let overlayEl;
let overlayTitleEl;
let overlaySubtitleEl;
let statsGridEl;
let overlayBtn;

function setup() {
  const controls = document.getElementById("controls");
  const controlHeight = controls ? controls.offsetHeight : CONTROL_H;

  createCanvas(windowWidth, windowHeight - controlHeight);
  pixelDensity(1);
  noSmooth();
  frameRate(30);
  textFont("monospace");

  statusEl = document.getElementById("status");
  heartsEl = document.getElementById("hearts");
  lifelineEl = document.getElementById("lifeline");
  tileSizeValEl = document.getElementById("tileSizeVal");
  overlayEl = document.getElementById("overlay");
  overlayTitleEl = document.getElementById("overlayTitle");
  overlaySubtitleEl = document.getElementById("overlaySubtitle");
  statsGridEl = document.getElementById("statsGrid");
  overlayBtn = document.getElementById("overlayBtn");

  const slider = document.getElementById("tileSize");
  const regenBtn = document.getElementById("regenBtn");

  if (slider) {
    tileSize = int(slider.value);
    if (tileSizeValEl) tileSizeValEl.textContent = String(tileSize);

    slider.addEventListener("input", () => {
      tileSize = int(slider.value);
      if (tileSizeValEl) tileSizeValEl.textContent = String(tileSize);
      resizeForTileSize();
      generateDungeon();
      redraw();
    });
  }

  if (regenBtn) {
    regenBtn.addEventListener("click", () => {
      hideOverlay();
      generateDungeon();
      redraw();
    });
  }

  if (overlayBtn) {
    overlayBtn.addEventListener("click", () => {
      hideOverlay();
      generateDungeon();
      redraw();
    });
  }

  resizeForTileSize();
  generateDungeon();
  syncUI();
}

function windowResized() {
  const controls = document.getElementById("controls");
  const controlHeight = controls ? controls.offsetHeight : CONTROL_H;
  resizeCanvas(windowWidth, windowHeight - controlHeight);
  resizeForTileSize();
  generateDungeon();
  redraw();
}

function resizeForTileSize() {
  cols = max(12, floor(width / tileSize));
  rows = max(12, floor(height / tileSize));
  mapPxW = cols * tileSize;
  mapPxH = rows * tileSize;
}

function draw() {
  background(10);

  if (!paused) {
    movePlayerIfHeld();
    updateEnemies();
  }

  drawMap();
  drawFeatures();
  drawEnemies();
  drawPlayer();
}

function keyPressed() {
  if (key === "r" || key === "R") {
    hideOverlay();
    generateDungeon();
    redraw();
    return false;
  }

  if (paused) return false;

  if (key === " " || key === "e" || key === "E") {
    playerAction();
    redraw();
    return false;
  }

  return true;
}

function syncUI() {
  if (statusEl) statusEl.textContent = statusMsg;
  if (heartsEl) {
    let s = "";
    for (let i = 0; i < MAX_HEALTH; i++) {
      s += i < health ? "♥" : "♡";
    }
    heartsEl.textContent = "Hearts: " + s;
  }
  if (lifelineEl) {
    lifelineEl.textContent = `Lifeline: ${lifeline}`;
  }
}

function setStatus(msg) {
  statusMsg = msg;
  syncUI();
}

function formatTime(frames) {
  const totalSeconds = floor(frames / 30);
  const m = floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

function statRow(label, value) {
  return `<span class="label">${label}</span><span class="value">${value}</span>`;
}

function showOverlay(title, subtitle) {
  paused = true;

  if (overlayTitleEl) overlayTitleEl.textContent = title;
  if (overlaySubtitleEl) overlaySubtitleEl.textContent = subtitle;

  if (statsGridEl) {
    statsGridEl.innerHTML =
      statRow("Treasures this run", `${treasureFound}/${treasureTotal}`) +
      statRow("Time this run", formatTime(frameCount - runStartFrame)) +
      statRow("Steps taken", stats.steps) +
      statRow("Enemies defeated", stats.kills) +
      statRow("Traps triggered", stats.traps) +
      statRow("Treasures collected", stats.treasures) +
      statRow("Dungeons cleared", stats.cleared) +
      statRow("Deaths", stats.deaths);
  }

  if (overlayEl) overlayEl.classList.remove("hidden");
}

function hideOverlay() {
  paused = false;
  if (overlayEl) overlayEl.classList.add("hidden");
}

function generateDungeon() {
  let ok = false;
  let attempts = 0;

  while (!ok && attempts < 25) {
    attempts++;

    grid = Array.from({ length: rows }, () => Array(cols).fill(TILE_WALL));
    feats = Array.from({ length: rows }, () => Array(cols).fill(null));
    rooms = [];
    floorTiles = [];
    enemies = [];
    treasureFound = 0;
    treasureTotal = 0;
    health = MAX_HEALTH;
    lifeline = START_LIFELINE;
    moveCd = 0;
    enemyCd = 0;
    statusMsg = "Explore the dungeon.";

    const root = new BSPNode(1, 1, cols - 2, rows - 2, 0);
    root.split();
    root.build(grid, rooms);

    decorate();
    collectWalkableTiles();

    startPos = pickStart();
    if (!startPos) continue;

    player = { x: startPos.x, y: startPos.y };
    feats[player.y][player.x] = TILE_UP;

    const dist = floodFill(player.x, player.y);
    let farthest = null;
    let bestD = -1;

    for (const t of floorTiles) {
      const d = dist[t.y][t.x];
      if (d >= 0 && d > bestD) {
        bestD = d;
        farthest = { x: t.x, y: t.y };
      }
    }

    if (!farthest) continue;

    exitPos = farthest;
    feats[exitPos.y][exitPos.x] = TILE_DOWN;

    placeRandomFeatures(TILE_TREASURE, 12, 7);
    placeRandomFeatures(TILE_TRAP, 14, 6);
    placeRandomFeatures(TILE_TORCH, 18, 5);
    placeEnemies(10, 8);

    treasureTotal = countFeatures(TILE_TREASURE);

    feats[player.y][player.x] = TILE_UP;
    feats[exitPos.y][exitPos.x] = TILE_DOWN;

    ok = true;
  }

  runStartFrame = frameCount;
  syncUI();
  if (!ok) setStatus("Dungeon generation failed. Try again.");
}

function pickStart() {
  const candidates = floorTiles.filter(t => countOpenNeighbours(t.x, t.y) > 0);

  if (candidates.length === 0) return null;

  const preferred = rooms.length > 0 ? rooms[0].center : null;
  if (preferred) {
    let best = null;
    let bestDist = Infinity;

    for (const t of candidates) {
      const d = manhatten(t.x, t.y, preferred.x, preferred.y);
      if (d < bestDist) {
        bestDist = d;
        best = t;
      }
    }

    return best || candidates[0];
  }

  return candidates[0];
}

function movePlayerIfHeld() {
  if (moveCd > 0) {
    moveCd--;
    return;
  }

  const dir = heldDir();
  if (!dir) return;

  if (tryMovePlayer(dir.dx, dir.dy)) {
    moveCd = PLAYER_MOVE_DELAY;
  }
}

function heldDir() {
  if (keyIsDown(LEFT_ARROW) || keyIsDown(65)) return { dx: -1, dy: 0 };
  if (keyIsDown(RIGHT_ARROW) || keyIsDown(68)) return { dx: 1, dy: 0 };
  if (keyIsDown(UP_ARROW) || keyIsDown(87)) return { dx: 0, dy: -1 };
  if (keyIsDown(DOWN_ARROW) || keyIsDown(83)) return { dx: 0, dy: 1 };
  return null;
}

function tryMovePlayer(dx, dy) {
  const nx = player.x + dx;
  const ny = player.y + dy;

  if (!inBounds(nx, ny)) return false;
  if (!isWalkableTile(nx, ny)) return false;

  const enemyIndex = enemies.findIndex(e => e.x === nx && e.y === ny);
  if (enemyIndex >= 0) {
    enemies.splice(enemyIndex, 1);
    stats.kills++;
    setStatus("You defeated an enemy.");
  }

  player.x = nx;
  player.y = ny;
  stats.steps++;

  const f = feats[ny][nx];

  if (f === TILE_TREASURE) {
    treasureFound++;
    stats.treasures++;
    feats[ny][nx] = null;
    setStatus("You found treasure.");
  } else if (f === TILE_TRAP) {
    feats[ny][nx] = null;
    stats.traps++;
    applyDamage(1, "A trap hit you.");
  } else if (f === TILE_TORCH) {
    feats[ny][nx] = null;
    setStatus("The torch lights the passage.");
  } else if (f === TILE_DOWN) {
    stats.cleared++;
    feats[player.y][player.x] = TILE_UP;
    syncUI();
    showOverlay("Dungeon Cleared", "You reached the exit.");
    return true;
  } else {
    setStatus("Exploring...");
  }

  feats[player.y][player.x] = TILE_UP;
  syncUI();
  return true;
}

function playerAction() {
  let killed = 0;
  let scared = 0;

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    const d = manhatten(player.x, player.y, e.x, e.y);

    if (d <= 1) {
      enemies.splice(i, 1);
      killed++;
    } else if (d <= ACTION_RADIUS) {
      e.scared = max(e.scared || 0, 6);
      scared++;
    }
  }

  stats.kills += killed;

  if (killed > 0) {
    setStatus(`You defeated ${killed} enemy${killed > 1 ? "ies" : ""}.`);
  } else if (scared > 0) {
    setStatus(`You scared ${scared} enemy${scared > 1 ? "ies" : ""}.`);
  } else {
    setStatus("Nothing nearby to hit or scare.");
  }

  syncUI();
}

function updateEnemies() {
  enemyCd++;
  if (enemyCd < ENEMY_MOVE_DELAY) return;
  enemyCd = 0;

  shuffleArr(enemies);

  const occupied = new Set(enemies.map(e => keyOf(e.x, e.y)));

  for (const e of enemies) {
    occupied.delete(keyOf(e.x, e.y));

    if (e.scared && e.scared > 0) e.scared--;

    const next = chooseEnemyStep(e, occupied);

    if (next) {
      if (next.x === player.x && next.y === player.y) {
        applyDamage(1, "An enemy hit you.");
        if (health <= 0) return;
      } else {
        e.x = next.x;
        e.y = next.y;
      }
    }

    occupied.add(keyOf(e.x, e.y));
  }
}

function chooseEnemyStep(enemy, occupied) {
  const distToPlayer = manhatten(enemy.x, enemy.y, player.x, player.y);
  const away = enemy.scared > 0;

  const candidates = [
    { x: enemy.x + 1, y: enemy.y },
    { x: enemy.x - 1, y: enemy.y },
    { x: enemy.x, y: enemy.y + 1 },
    { x: enemy.x, y: enemy.y - 1 }
  ];

  shuffleArr(candidates);

  let best = null;
  let bestScore = away ? -Infinity : Infinity;

  for (const c of candidates) {
    if (!inBounds(c.x, c.y)) continue;
    if (!canEnemyOccupy(c.x, c.y, occupied)) continue;

    const score = manhatten(c.x, c.y, player.x, player.y);

    if (away) {
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    } else {
      const targetScore = distToPlayer <= 10 ? score : random();
      if (distToPlayer <= 10) {
        if (score < bestScore) {
          bestScore = score;
          best = c;
        }
      } else {
        if (best === null || targetScore < bestScore) {
          bestScore = targetScore;
          best = c;
        }
      }
    }
  }

  return best;
}

function canEnemyOccupy(x, y, occupied) {
  if (!isWalkableTile(x, y)) return false;
  if (occupied.has(keyOf(x, y))) return false;
  if (feats[y][x] !== null && feats[y][x] !== TILE_UP && feats[y][x] !== TILE_DOWN) return false;
  return true;
}

function applyDamage(amount, msg) {
  health -= amount;

  if (health > 0) {
    setStatus(msg);
    syncUI();
    return;
  }

  if (lifeline > 0) {
    lifeline--;
    health = 4;
    player = { x: startPos.x, y: startPos.y };

    for (const e of enemies) {
      if (manhatten(e.x, e.y, player.x, player.y) <= 5) {
        e.scared = max(e.scared || 0, 8);
      }
    }

    setStatus("Lifeline saved you.");
    feats[player.y][player.x] = TILE_UP;
    syncUI();
    return;
  }

  stats.deaths++;
  setStatus("You were defeated.");
  syncUI();
  showOverlay("You Died", "The dungeon claims another.");
}

function drawMap() {
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const t = grid[y][x];
      const px = x * tileSize;
      const py = y * tileSize;

      if (t === TILE_WALL) {
        fill(20, 24, 32);
        rect(px, py, tileSize, tileSize);

        if ((x * 17 + y * 23) % 11 === 0) {
          fill(34, 38, 50);
          rect(
            px + floor(tileSize * 0.28),
            py + floor(tileSize * 0.28),
            max(2, floor(tileSize * 0.2)),
            max(2, floor(tileSize * 0.2))
          );
        }
      } else if (t === TILE_FLOOR) {
        fill(170, 161, 146);
        rect(px, py, tileSize, tileSize);

        if ((x + y) % 5 === 0) {
          fill(156, 148, 134);
          rect(
            px + floor(tileSize * 0.3),
            py + floor(tileSize * 0.3),
            max(2, floor(tileSize * 0.25)),
            max(2, floor(tileSize * 0.25))
          );
        }
      } else if (t === TILE_WATER) {
        fill(35, 70, 120);
        rect(px, py, tileSize, tileSize);
        fill(60, 110, 170);
        ellipse(px + tileSize * 0.35, py + tileSize * 0.35, tileSize * 0.25, tileSize * 0.25);
      } else if (t === TILE_LAVA) {
        fill(120, 30, 18);
        rect(px, py, tileSize, tileSize);
        fill(255, 140, 30);
        ellipse(px + tileSize * 0.5, py + tileSize * 0.5, tileSize * 0.55, tileSize * 0.55);
      } else if (t === TILE_PILLAR) {
        fill(105, 98, 90);
        rect(px + 2, py + 2, tileSize - 4, tileSize - 4);
        fill(140, 132, 124);
        rect(px + 4, py + 4, tileSize - 8, tileSize - 8);
      } else if (t === TILE_RUBBLE) {
        fill(150, 138, 120);
        rect(px, py, tileSize, tileSize);
        fill(120, 110, 96);
        triangle(
          px + 3, py + tileSize - 4,
          px + tileSize / 2, py + 3,
          px + tileSize - 4, py + tileSize - 4
        );
      } else if (t === TILE_DOOR) {
        fill(170, 161, 146);
        rect(px, py, tileSize, tileSize);
        fill(92, 62, 28);
        rect(px + 2, py + 5, tileSize - 4, tileSize - 10);
        fill(200, 170, 90);
        rect(px + tileSize / 2 - 1, py + 6, 2, tileSize - 12);
      }
    }
  }

  stroke(0, 14);
  for (let x = 0; x <= cols; x++) line(x * tileSize, 0, x * tileSize, mapPxH);
  for (let y = 0; y <= rows; y++) line(0, y * tileSize, mapPxW, y * tileSize);
  noStroke();
}

function drawFeatures() {
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const f = feats[y][x];
      if (f == null) continue;

      const px = x * tileSize;
      const py = y * tileSize;

      if (f === TILE_UP) {
        fill(250, 240, 120);
        rect(px + 3, py + 3, tileSize - 6, tileSize - 6);
        fill(70, 50, 10);
        rect(px + 6, py + 6, tileSize - 12, tileSize - 12);
      } else if (f === TILE_DOWN) {
        fill(255, 220, 90);
        rect(px + 3, py + 3, tileSize - 6, tileSize - 6);
        fill(70, 50, 10);
        triangle(
          px + tileSize / 2, py + tileSize - 4,
          px + 4, py + 5,
          px + tileSize - 4, py + 5
        );
      } else if (f === TILE_TREASURE) {
        fill(200, 140, 40);
        rect(px + 3, py + 6, tileSize - 6, tileSize - 8);
        fill(255, 230, 120);
        rect(px + 5, py + 4, tileSize - 10, 4);
      } else if (f === TILE_TRAP) {
        fill(190, 45, 45);
        triangle(
          px + tileSize / 2, py + 4,
          px + 4, py + tileSize - 4,
          px + tileSize - 4, py + tileSize - 4
        );
      } else if (f === TILE_TORCH) {
        fill(255, 170, 40, 60);
        ellipse(px + tileSize / 2, py + tileSize / 2, tileSize * 1.8, tileSize * 1.8);
        fill(255, 120, 20);
        ellipse(px + tileSize / 2, py + tileSize / 2, 6, 10);
        stroke(90, 60, 30);
        line(px + tileSize / 2, py + 11, px + tileSize / 2, py + 5);
        noStroke();
      }
    }
  }
}

function drawEnemies() {
  for (const e of enemies) {
    const px = e.x * tileSize;
    const py = e.y * tileSize;

    fill(e.scared > 0 ? color(160, 120, 220) : color(120, 60, 170));
    ellipse(px + tileSize / 2, py + tileSize / 2, tileSize - 4, tileSize - 4);

    fill(255);
    ellipse(px + tileSize / 2 - 2, py + tileSize / 2 - 1, 3, 3);
    ellipse(px + tileSize / 2 + 2, py + tileSize / 2 - 1, 3, 3);
  }
}

function drawPlayer() {
  const px = player.x * tileSize;
  const py = player.y * tileSize;

  fill(70, 220, 255);
  ellipse(px + tileSize / 2, py + tileSize / 2, tileSize * 0.68, tileSize * 0.68);

  fill(255);
  ellipse(px + tileSize / 2 - 2, py + tileSize / 2 - 2, 2, 2);
  ellipse(px + tileSize / 2 + 2, py + tileSize / 2 - 2, 2, 2);
}

function decorate() {
  for (const room of rooms) {
    if (room.shape === "rect" || room.shape === "pill" || room.shape === "circle") {
      addRoomDecor(room);
    }
  }

  const candidates = rooms.filter(r => r.w * r.h >= 60);
  shuffleArr(candidates);

  for (let i = 0; i < min(4, candidates.length); i++) {
    const r = candidates[i];
    const kind = random(["water", "water", "lava", "rubble"]);
    const cx = r.center.x + floor(random(-2, 3));
    const cy = r.center.y + floor(random(-2, 3));

    if (kind === "water") carveBlob(cx, cy, floor(random(2, 4)), TILE_WATER);
    else if (kind === "lava") carveBlob(cx, cy, floor(random(1, 3)), TILE_LAVA);
    else carveBlob(cx, cy, floor(random(2, 4)), TILE_RUBBLE);
  }

  for (const room of rooms) {
    addDoorsNearRoom(room);
  }
}

function addRoomDecor(room) {
  const chance = random();

  if (chance < 0.33 && room.w >= 8 && room.h >= 8) {
    const spots = [
      { x: room.x + 2, y: room.y + 2 },
      { x: room.x + room.w - 3, y: room.y + 2 },
      { x: room.x + 2, y: room.y + room.h - 3 },
      { x: room.x + room.w - 3, y: room.y + room.h - 3 }
    ];

    for (const s of spots) {
      if (inBounds(s.x, s.y) && grid[s.y][s.x] === TILE_FLOOR) grid[s.y][s.x] = TILE_PILLAR;
    }
  } else if (chance < 0.66) {
    const kind = random() < 0.5 ? TILE_RUBBLE : TILE_WATER;
    carveBlob(room.center.x, room.center.y, 2, kind);
  } else {
    addEdgeDoor(room);
    addEdgeDoor(room);
  }
}

function addDoorsNearRoom(room) {
  const doors = [];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      if (!inBounds(x, y)) continue;
      if (grid[y][x] !== TILE_FLOOR) continue;

     const wallCount = countAdjacentWalls(x, y);
      if (wallCount >= 3 && random() < 0.03) doors.push({ x, y });
    }
  }

  for (const d of doors) {
    grid[d.y][d.x] = TILE_DOOR;
  }
}

function addEdgeDoor(room) {
  const edges = [];

  for (let x = room.x; x < room.x + room.w; x++) {
    edges.push({ x, y: room.y });
    edges.push({ x, y: room.y + room.h - 1 });
  }

  for (let y = room.y; y < room.y + room.h; y++) {
    edges.push({ x: room.x, y });
    edges.push({ x: room.x + room.w - 1, y });
  }

  shuffleArr(edges);

  for (const p of edges) {
    if (inBounds(p.x, p.y) && grid[p.y][p.x] === TILE_FLOOR) {
      grid[p.y][p.x] = TILE_DOOR;
      break;
    }
  }
}

function placeRandomFeatures(type, count, minDistFromStart) {
  let placed = 0;
  let tries = 0;

  while (placed < count && tries < 4000) {
    tries++;
    const t = random(floorTiles);
    if (!t) break;

    if (!inBounds(t.x, t.y)) continue;
    if (!isWalkableTile(t.x, t.y)) continue;
    if (feats[t.y][t.x] !== null) continue;
    if (t.x === player.x && t.y === player.y) continue;
    if (t.x === exitPos.x && t.y === exitPos.y) continue;
    if (manhatten(player.x, player.y, t.x, t.y) < minDistFromStart) continue;

    feats[t.y][t.x] = type;
    placed++;
  }
}

function placeEnemies(count, minDistFromStart) {
  let placed = 0;
  let tries = 0;

  while (placed < count && tries < 4000) {
    tries++;
    const t = random(floorTiles);
    if (!t) break;

    if (!inBounds(t.x, t.y)) continue;
    if (!isWalkableTile(t.x, t.y)) continue;
    if (feats[t.y][t.x] !== null) continue;
    if (t.x === player.x && t.y === player.y) continue;
    if (t.x === exitPos.x && t.y === exitPos.y) continue;
    if (manhatten(player.x, player.y, t.x, t.y) < minDistFromStart) continue;
    if (enemies.some(e => e.x === t.x && e.y === t.y)) continue;

    enemies.push({ x: t.x, y: t.y, scared: 0 });
    placed++;
  }
}

function collectWalkableTiles() {
  floorTiles = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (isWalkableTile(x, y)) floorTiles.push({ x, y });
    }
  }
}

function isWalkableTile(x, y) {
  const t = grid[y][x];
  return t === TILE_FLOOR || t === TILE_DOOR;
}

function countOpenNeighbours(x, y) {
  let c = 0;
  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1]
  ];
  for (const [dx, dy] of dirs) {
    const nx = x + dx;
    const ny = y + dy;
    if (inBounds(nx, ny) && isWalkableTile(nx, ny)) c++;
  }
  return c;
}

function floodFill(startX, startY) {
  const dist = Array.from({ length: rows }, () => Array(cols).fill(-1));
  const q = [];
  let head = 0;

  if (!inBounds(startX, startY)) return dist;
  if (!isWalkableTile(startX, startY)) return dist;

  dist[startY][startX] = 0;
  q.push({ x: startX, y: startY });

  while (head < q.length) {
    const cur = q[head++];
    const d = dist[cur.y][cur.x];

    const dirs = [
      [1, 0], [-1, 0], [0, 1], [0, -1]
    ];

    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!inBounds(nx, ny)) continue;
      if (!isWalkableTile(nx, ny)) continue;
      if (dist[ny][nx] !== -1) continue;

      dist[ny][nx] = d + 1;
      q.push({ x: nx, y: ny });
    }
  }

  return dist;
}

function countFeatures(type) {
  let c = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (feats[y][x] === type) c++;
    }
  }
  return c;
}

function countAdjacentWalls(x, y) {
  let walls = 0;
  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1]
  ];
  for (const [dx, dy] of dirs) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inBounds(nx, ny) || grid[ny][nx] === TILE_WALL) walls++;
  }
  return walls;
}

function carveBlob(cx, cy, radius, type) {
  for (let y = cy - radius - 1; y <= cy + radius + 1; y++) {
    for (let x = cx - radius - 1; x <= cx + radius + 1; x++) {
      if (!inBounds(x, y)) continue;
      const d = dist(x, y, cx, cy);
      if (d <= radius + random(-0.5, 0.75) && grid[y][x] !== TILE_WALL) {
        grid[y][x] = type;
      }
    }
  }
}

function keyOf(x, y) {
  return `${x},${y}`;
}

function manhatten(x1, y1, x2, y2) {
  return abs(x1 - x2) + abs(y1 - y2);
}

function shuffleArr(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = floor(random(i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

class BSPNode {
  constructor(x, y, w, h, depth = 0) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.depth = depth;
    this.left = null;
    this.right = null;
    this.room = null;
    this.center = null;
  }

  split() {
    if (this.depth >= MAX_DEPTH) return false;

    const canSplitH = this.h >= ROOM_MIN * 2 + 4;
    const canSplitV = this.w >= ROOM_MIN * 2 + 4;

    if (!canSplitH && !canSplitV) return false;

    let splitHorizontally;
    if (canSplitH && canSplitV) splitHorizontally = random() < 0.5;
    else splitHorizontally = canSplitH;

    if (splitHorizontally) {
      const minSplit = this.y + ROOM_MIN + 2;
      const maxSplit = this.y + this.h - ROOM_MIN - 2;
      if (maxSplit <= minSplit) return false;

      const splitY = floor(random(minSplit, maxSplit + 1));
      const topH = splitY - this.y;
      const bottomH = this.y + this.h - splitY;

      if (topH < ROOM_MIN || bottomH < ROOM_MIN) return false;

      this.left = new BSPNode(this.x, this.y, this.w, topH, this.depth + 1);
      this.right = new BSPNode(this.x, splitY, this.w, bottomH, this.depth + 1);
    } else {
      const minSplit = this.x + ROOM_MIN + 2;
      const maxSplit = this.x + this.w - ROOM_MIN - 2;
      if (maxSplit <= minSplit) return false;

      const splitX = floor(random(minSplit, maxSplit + 1));
      const leftW = splitX - this.x;
      const rightW = this.x + this.w - splitX;

      if (leftW < ROOM_MIN || rightW < ROOM_MIN) return false;

      this.left = new BSPNode(this.x, this.y, leftW, this.h, this.depth + 1);
      this.right = new BSPNode(splitX, this.y, rightW, this.h, this.depth + 1);
    }

    this.left.split();
    this.right.split();
    return true;
  }

  build(map, roomList) {
    if (this.left || this.right) {
      if (this.left) this.left.build(map, roomList);
      if (this.right) this.right.build(map, roomList);

      const a = this.left ? this.left.getCenter() : null;
      const b = this.right ? this.right.getCenter() : null;
      if (a && b) carveCorridor(a, b);
      return;
    }

    this.createRoom(map);
    if (this.room) roomList.push(this.room);
  }

  createRoom(map) {
    const pad = 1;
    const usableW = this.w - pad * 2;
    const usableH = this.h - pad * 2;

    if (usableW < ROOM_MIN || usableH < ROOM_MIN) return;

    const shapeOptions = [];
    if (usableW >= 6 && usableH >= 6) {
      shapeOptions.push("rect", "circle", "diamond", "pill", "cross", "ring");
    } else {
      shapeOptions.push("rect", "circle", "diamond");
    }

    const shape = random(shapeOptions);

    const room = {
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      shape,
      cells: [],
      center: { x: 0, y: 0 }
    };

    room.w = floor(random(ROOM_MIN, min(ROOM_MAX, usableW) + 1));
    room.h = floor(random(ROOM_MIN, min(ROOM_MAX, usableH) + 1));

    const minX = this.x + pad;
    const maxX = this.x + this.w - room.w - pad;
    const minY = this.y + pad;
    const maxY = this.y + this.h - room.h - pad;

    if (maxX < minX || maxY < minY) return;

    room.x = floor(random(minX, maxX + 1));
    room.y = floor(random(minY, maxY + 1));

    carveRoomShape(map, room);
    room.cells = collect_room_cells(room);
    room.center = roomCenter(room.cells);

    this.room = room;
    this.center = room.center;
  }

  getCenter() {
    if (this.center) return this.center;
    const a = this.left ? this.left.getCenter() : null;
    const b = this.right ? this.right.getCenter() : null;
    return a || b;
  }
}

function carveRoomShape(map, room) {
  const cx = room.x + room.w / 2;
  const cy = room.y + room.h / 2;

  function carveCell(x, y) {
    if (!inBounds(x, y)) return;
    map[y][x] = TILE_FLOOR;
  }

  if (room.shape === "rect") {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) carveCell(x, y);
    }
  } else if (room.shape === "circle") {
    const rx = room.w / 2;
    const ry = room.h / 2;
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny <= 1.0 + random(-0.08, 0.08)) carveCell(x, y);
      }
    }
  } else if (room.shape === "diamond") {
    const rx = room.w / 2;
    const ry = room.h / 2;
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        const dx = abs((x + 0.5) - cx) / rx;
        const dy = abs((y + 0.5) - cy) / ry;
        if (dx + dy <= 1.0 + random(-0.08, 0.08)) carveCell(x, y);
      }
    }
  } else if (room.shape === "pill") {
    const r = floor(min(room.w, room.h) / 2);
    const coreX1 = room.x + r;
    const coreX2 = room.x + room.w - r - 1;
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        const inCore = x >= coreX1 && x <= coreX2;
        const leftArc = dist(x, y, coreX1, cy) <= r + 0.2;
        const rightArc = dist(x, y, coreX2, cy) <= r + 0.2;
        if (inCore || leftArc || rightArc) carveCell(x, y);
      }
    }
  } else if (room.shape === "cross") {
    const armW = max(2, floor(room.w * 0.33));
    const armH = max(2, floor(room.h * 0.33));
    const midX = room.x + floor(room.w / 2);
    const midY = room.y + floor(room.h / 2);

    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        const vertical = abs(x - midX) <= floor(armW / 2);
        const horizontal = abs(y - midY) <= floor(armH / 2);
        if (vertical || horizontal) carveCell(x, y);
      }
    }
  } else if (room.shape === "ring") {
    const rx = room.w / 2;
    const ry = room.h / 2;
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        const d = nx * nx + ny * ny;
        if (d <= 1.0 && d >= 0.35) carveCell(x, y);
      }
    }
  }

  chewUpEdges(map, room);
}

function chewUpEdges(map, room) {
  for (let pass = 0; pass < 2; pass++) {
    for (let y = room.y - 1; y <= room.y + room.h; y++) {
      for (let x = room.x - 1; x <= room.x + room.w; x++) {
        if (!inBounds(x, y)) continue;
        if (map[y][x] === TILE_FLOOR && random() < 0.01) {
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx;
            const ny = y + dy;
            if (inBounds(nx, ny) && map[ny][nx] === TILE_WALL && random() < 0.25) {
              map[ny][nx] = TILE_FLOOR;
            }
          }
        }
      }
    }
  }
}

function collect_room_cells(room) {
  const cells = [];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      if (inBounds(x, y) && grid[y][x] !== TILE_WALL) cells.push({ x, y });
    }
  }
  return cells;
}

function roomCenter(cells) {
  if (!cells || cells.length === 0) return { x: 1, y: 1 };
  let sx = 0;
  let sy = 0;
  for (const c of cells) {
    sx += c.x;
    sy += c.y;
  }
  return {
    x: floor(sx / cells.length),
    y: floor(sy / cells.length)
  };
}

function carveCorridor(a, b) {
  const wide = random() < 0.45 ? 2 : 1;

  if (random() < 0.5) {
    carveHorizontal(a.x, b.x, a.y, wide);
    carveVertical(a.y, b.y, b.x, wide);
  } else {
    carveVertical(a.y, b.y, a.x, wide);
    carveHorizontal(a.x, b.x, b.y, wide);
  }

  if (random() < 0.35) {
    const midX = floor((a.x + b.x) / 2) + floor(random(-3, 4));
    const midY = floor((a.y + b.y) / 2) + floor(random(-3, 4));
    carveBlob(midX, midY, 1, TILE_FLOOR);
  }
}

function carveHorizontal(x1, x2, y, width = 1) {
  const start = min(x1, x2);
  const end = max(x1, x2);
  const half = floor(width / 2);
  for (let x = start; x <= end; x++) {
    for (let oy = -half; oy <= half; oy++) carveTile(x, y + oy);
  }
}

function carveVertical(y1, y2, x, width = 1) {
  const start = min(y1, y2);
  const end = max(y1, y2);
  const half = floor(width / 2);
  for (let y = start; y <= end; y++) {
    for (let ox = -half; ox <= half; ox++) carveTile(x + ox, y);
  }
}

function carveTile(x, y) {
  if (!inBounds(x, y)) return;
  if (grid[y][x] === TILE_WALL) grid[y][x] = TILE_FLOOR;
}

function randInt(minVal, maxVal) {
  minVal = floor(minVal);
  maxVal = floor(maxVal);
  if (maxVal < minVal) return minVal;
  return floor(random(minVal, maxVal + 1));
}

function inBounds(x, y) {
  return x >= 0 && x < cols && y >= 0 && y < rows;
}
