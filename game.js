const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const overlay = document.getElementById("overlay");
const statusLabel = document.getElementById("statusLabel");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const primaryButton = document.getElementById("primaryButton");
const shareButton = document.getElementById("shareButton");
const scoreValue = document.getElementById("scoreValue");
const bestValue = document.getElementById("bestValue");
const playerName = document.getElementById("playerName");

const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const GROUND_HEIGHT = 92;
const PIPE_WIDTH = 82;
const PIPE_GAP = 188;
const PIPE_SPEED = 3.3;
const PIPE_INTERVAL = 1480;
const BIRD_X = 118;
const BIRD_RADIUS = 20;
const GRAVITY = 0.44;
const FLAP_POWER = -8.2;
const STORAGE_KEY = "sky-hopper-best";

const state = {
  phase: "idle",
  birdY: HEIGHT * 0.4,
  birdVelocity: 0,
  birdTilt: 0,
  pipes: [],
  score: 0,
  best: Number.parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10) || 0,
  lastTime: 0,
  spawnTimer: 840,
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function updateScoreUI() {
  scoreValue.textContent = String(state.score);
  bestValue.textContent = String(state.best);
}

function updateOverlay(title, text, kicker, primaryText, canShare) {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  statusLabel.textContent = kicker;
  primaryButton.textContent = primaryText;
  shareButton.hidden = !canShare;
}

function configureTelegram() {
  if (!tg) {
    playerName.textContent = "Browser preview";
    return;
  }

  tg.ready();
  tg.expand();

  if (typeof tg.setHeaderColor === "function") {
    tg.setHeaderColor("#0f1724");
  }

  if (typeof tg.setBackgroundColor === "function") {
    tg.setBackgroundColor("#0f1724");
  }

  const user = tg.initDataUnsafe && tg.initDataUnsafe.user ? tg.initDataUnsafe.user : null;
  playerName.textContent = user && user.first_name ? user.first_name : "Telegram pilot";
}

function saveBest() {
  localStorage.setItem(STORAGE_KEY, String(state.best));
}

function createPipe() {
  const verticalMargin = 110;
  const maxGapCenter = HEIGHT - GROUND_HEIGHT - verticalMargin;
  const minGapCenter = verticalMargin + 40;
  const gapCenter =
    minGapCenter + Math.random() * Math.max(40, maxGapCenter - minGapCenter);

  return {
    x: WIDTH + 96,
    gapTop: gapCenter - PIPE_GAP / 2,
    gapBottom: gapCenter + PIPE_GAP / 2,
    passed: false,
  };
}

function resetRun() {
  state.phase = "idle";
  state.birdY = HEIGHT * 0.4;
  state.birdVelocity = 0;
  state.birdTilt = 0;
  state.pipes = [];
  state.score = 0;
  state.spawnTimer = 840;
  updateScoreUI();
  updateOverlay(
    "Sky Hopper",
    "Tap the screen or press Space to fly. Thread the gaps and survive as long as possible.",
    "Tap to launch",
    "Start run",
    false
  );
  overlay.hidden = false;
}

function beginRun() {
  state.phase = "running";
  state.birdVelocity = FLAP_POWER;
  overlay.hidden = true;
}

function finishRun() {
  state.phase = "gameover";

  if (state.score > state.best) {
    state.best = state.score;
    saveBest();
  }

  updateScoreUI();
  updateOverlay(
    "Run complete",
    `Final score: ${state.score}. Send it to Telegram or jump straight into another run.`,
    state.score === state.best ? "New best" : "Try again",
    "Play again",
    true
  );
  overlay.hidden = false;

  if (tg && tg.HapticFeedback) {
    tg.HapticFeedback.notificationOccurred("error");
  }
}

function trySendScore() {
  const payload = JSON.stringify({
    score: state.score,
    best: state.best,
  });

  if (tg && typeof tg.sendData === "function") {
    tg.sendData(payload);
    updateOverlay(
      "Score sent",
      "Telegram received your score. You can close the mini app or start another run.",
      "Delivered",
      "Play again",
      false
    );
    return;
  }

  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    navigator.clipboard.writeText(payload).catch(() => {});
  }

  updateOverlay(
    "Telegram not detected",
    "Open this page from the bot to send the score automatically. The payload was copied to the clipboard when possible.",
    "Browser preview",
    "Play again",
    false
  );
}

function flap() {
  if (state.phase === "idle") {
    beginRun();
    return;
  }

  if (state.phase === "running") {
    state.birdVelocity = FLAP_POWER;
    if (tg && tg.HapticFeedback) {
      tg.HapticFeedback.impactOccurred("light");
    }
    return;
  }

  if (state.phase === "gameover") {
    resetRun();
    beginRun();
  }
}

function handlePrimaryAction() {
  if (state.phase === "gameover") {
    resetRun();
  }

  if (state.phase === "idle") {
    beginRun();
  }
}

function intersectsPipe(pipe) {
  const birdLeft = BIRD_X - BIRD_RADIUS;
  const birdRight = BIRD_X + BIRD_RADIUS;
  const birdTop = state.birdY - BIRD_RADIUS;
  const birdBottom = state.birdY + BIRD_RADIUS;
  const pipeLeft = pipe.x;
  const pipeRight = pipe.x + PIPE_WIDTH;

  const overlapsHorizontally = birdRight > pipeLeft && birdLeft < pipeRight;
  if (!overlapsHorizontally) {
    return false;
  }

  const hitsTopPipe = birdTop < pipe.gapTop;
  const hitsBottomPipe = birdBottom > pipe.gapBottom;
  return hitsTopPipe || hitsBottomPipe;
}

function update(deltaMs) {
  if (state.phase !== "running") {
    return;
  }

  const factor = deltaMs / 16.6667;
  state.birdVelocity += GRAVITY * factor;
  state.birdY += state.birdVelocity * factor;
  state.birdTilt = clamp(state.birdVelocity * 0.08, -0.55, 1.15);

  state.spawnTimer += deltaMs;
  if (state.spawnTimer >= PIPE_INTERVAL) {
    state.spawnTimer = 0;
    state.pipes.push(createPipe());
  }

  for (const pipe of state.pipes) {
    pipe.x -= PIPE_SPEED * factor;

    if (!pipe.passed && pipe.x + PIPE_WIDTH < BIRD_X) {
      pipe.passed = true;
      state.score += 1;
      updateScoreUI();
      if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.notificationOccurred("success");
      }
    }

    if (intersectsPipe(pipe)) {
      finishRun();
      return;
    }
  }

  state.pipes = state.pipes.filter((pipe) => pipe.x + PIPE_WIDTH > -4);

  if (state.birdY - BIRD_RADIUS <= 0 || state.birdY + BIRD_RADIUS >= HEIGHT - GROUND_HEIGHT) {
    finishRun();
  }
}

function drawBackground(timeMs) {
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, "#4ec8ff");
  sky.addColorStop(0.56, "#8be4ff");
  sky.addColorStop(1, "#e6fbff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  for (let index = 0; index < 4; index += 1) {
    const drift = ((timeMs * 0.012) + index * 120) % (WIDTH + 140);
    const x = WIDTH - drift;
    const y = 90 + index * 72;
    ctx.beginPath();
    ctx.ellipse(x, y, 38, 18, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 24, y + 6, 30, 14, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 24, y + 8, 26, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#7bc96f";
  ctx.beginPath();
  ctx.moveTo(0, HEIGHT - GROUND_HEIGHT - 46);
  ctx.quadraticCurveTo(90, HEIGHT - GROUND_HEIGHT - 96, 190, HEIGHT - GROUND_HEIGHT - 28);
  ctx.quadraticCurveTo(290, HEIGHT - GROUND_HEIGHT + 8, WIDTH, HEIGHT - GROUND_HEIGHT - 34);
  ctx.lineTo(WIDTH, HEIGHT - GROUND_HEIGHT);
  ctx.lineTo(0, HEIGHT - GROUND_HEIGHT);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#826436";
  ctx.fillRect(0, HEIGHT - GROUND_HEIGHT, WIDTH, GROUND_HEIGHT);

  ctx.fillStyle = "#9a7b45";
  for (let x = 0; x < WIDTH + 24; x += 24) {
    ctx.fillRect(x, HEIGHT - GROUND_HEIGHT, 14, 12);
  }
}

function drawPipes() {
  for (const pipe of state.pipes) {
    ctx.fillStyle = "#15a272";
    ctx.fillRect(pipe.x, 0, PIPE_WIDTH, pipe.gapTop);
    ctx.fillRect(pipe.x, pipe.gapBottom, PIPE_WIDTH, HEIGHT - pipe.gapBottom - GROUND_HEIGHT);

    ctx.fillStyle = "#0f7c56";
    ctx.fillRect(pipe.x + PIPE_WIDTH - 12, 0, 12, pipe.gapTop);
    ctx.fillRect(
      pipe.x + PIPE_WIDTH - 12,
      pipe.gapBottom,
      12,
      HEIGHT - pipe.gapBottom - GROUND_HEIGHT
    );

    ctx.fillStyle = "#1bc48b";
    ctx.fillRect(pipe.x - 6, pipe.gapTop - 24, PIPE_WIDTH + 12, 24);
    ctx.fillRect(pipe.x - 6, pipe.gapBottom, PIPE_WIDTH + 12, 24);
  }
}

function drawBird() {
  ctx.save();
  ctx.translate(BIRD_X, state.birdY);
  ctx.rotate(state.birdTilt);

  ctx.fillStyle = "#ffcf33";
  ctx.beginPath();
  ctx.arc(0, 0, BIRD_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f4b400";
  ctx.beginPath();
  ctx.ellipse(-4, 6, 12, 8, -0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(7, -6, 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#1b1f24";
  ctx.beginPath();
  ctx.arc(9, -6, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ff7c36";
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(28, 4);
  ctx.lineTo(16, 8);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawCenterScore() {
  if (state.phase !== "running") {
    return;
  }

  ctx.fillStyle = "rgba(10, 21, 35, 0.22)";
  ctx.font = "800 90px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.fillText(String(state.score), WIDTH / 2, 126);

  ctx.fillStyle = "#ffffff";
  ctx.fillText(String(state.score), WIDTH / 2 - 4, 120);
}

function render(timeMs) {
  drawBackground(timeMs);
  drawPipes();
  drawBird();
  drawCenterScore();
}

function loop(timeMs) {
  if (!state.lastTime) {
    state.lastTime = timeMs;
  }

  const delta = Math.min(34, timeMs - state.lastTime);
  state.lastTime = timeMs;

  update(delta);
  render(timeMs);

  window.requestAnimationFrame(loop);
}

canvas.addEventListener("pointerdown", flap);
primaryButton.addEventListener("click", handlePrimaryAction);
shareButton.addEventListener("click", trySendScore);

window.addEventListener("keydown", (event) => {
  if (event.code === "Space" || event.code === "ArrowUp") {
    event.preventDefault();
    flap();
  }
});

configureTelegram();
updateScoreUI();
resetRun();
window.requestAnimationFrame(loop);
