import { createCanvas } from "@napi-rs/canvas";
import { formatPoints } from "./points.js";

const WIDTH = 900;
const HEIGHT = 392;
const PAD = 28;
const FONT_TITLE = '"Trebuchet MS","Palatino Linotype",serif';
const FONT_BODY = '"Palatino Linotype","Georgia",serif';
const FONT_EMOJI =
  '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
const COLOR_TEXT = "#e2e8f0";
const COLOR_MUTED = "#94a3b8";
const COLOR_PANEL = "rgba(10, 16, 24, 0.78)";
const COLOR_PANEL_EDGE = "rgba(255, 255, 255, 0.08)";
const COLOR_GOLD = "#fbbf24";
const COLOR_CYAN = "#22d3ee";
const COLOR_EMBER = "#fb923c";

function drawRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function renderBase({ title, subtitle, accent = COLOR_CYAN, height = HEIGHT }) {
  const canvasHeight = Math.max(HEIGHT, Number(height) || HEIGHT);
  const canvas = createCanvas(WIDTH, canvasHeight);
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, WIDTH, canvasHeight);
  gradient.addColorStop(0, "#0b0f14");
  gradient.addColorStop(1, "#16212d");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, canvasHeight);

  const glow = ctx.createRadialGradient(140, 70, 20, 140, 70, 220);
  glow.addColorStop(0, "rgba(34, 211, 238, 0.25)");
  glow.addColorStop(1, "rgba(34, 211, 238, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, canvasHeight);

  const glow2 = ctx.createRadialGradient(
    WIDTH - 140,
    canvasHeight - 70,
    30,
    WIDTH - 140,
    canvasHeight - 70,
    260,
  );
  glow2.addColorStop(0, "rgba(251, 191, 36, 0.18)");
  glow2.addColorStop(1, "rgba(251, 191, 36, 0)");
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, WIDTH, canvasHeight);

  const panelX = PAD;
  const panelY = PAD;
  const panelW = WIDTH - PAD * 2;
  const panelH = canvasHeight - PAD * 2;
  ctx.fillStyle = COLOR_PANEL;
  drawRoundedRect(ctx, panelX, panelY, panelW, panelH, 22);
  ctx.fill();
  ctx.strokeStyle = COLOR_PANEL_EDGE;
  ctx.stroke();

  const accentGrad = ctx.createLinearGradient(
    panelX + 20,
    panelY + 18,
    panelX + 150,
    panelY + 18,
  );
  accentGrad.addColorStop(0, accent);
  accentGrad.addColorStop(1, COLOR_GOLD);
  ctx.fillStyle = accentGrad;
  ctx.fillRect(panelX + 20, panelY + 18, 96, 4);

  ctx.fillStyle = COLOR_TEXT;
  ctx.font = `700 24px ${FONT_TITLE}`;
  ctx.fillText(title, panelX + 20, panelY + 50);

  ctx.fillStyle = COLOR_MUTED;
  ctx.font = `600 18px ${FONT_BODY}`;
  ctx.fillText(subtitle, panelX + 20, panelY + 76);

  return { canvas, ctx, panelX, panelY, panelW, panelH, canvasHeight };
}

function drawStat(
  ctx,
  x,
  y,
  label,
  value,
  width = 220,
  valueColor = COLOR_TEXT,
) {
  ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
  drawRoundedRect(ctx, x, y, width, 64, 16);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.stroke();

  ctx.fillStyle = COLOR_MUTED;
  ctx.font = `600 14px ${FONT_BODY}`;
  ctx.fillText(label, x + 16, y + 24);

  ctx.fillStyle = valueColor;
  ctx.font = `700 20px ${FONT_TITLE}`;
  ctx.fillText(value, x + 16, y + 48);
}

export function renderSlotsCard({
  username,
  bet,
  reels,
  gain,
  balance,
  jackpot,
  jackpotWon,
  labels = {},
}) {
  const title = labels.title ?? "Slots";
  const subtitle = labels.subtitle ?? username ?? "Player";
  const betLabel = labels.bet ?? "Bet";
  const gainLabel = labels.win ?? "Win";
  const balanceLabel = labels.balance ?? "Balance";
  const jackpotLabel = labels.jackpot ?? "Jackpot";

  const gainSign = gain >= 0 ? "+" : "";
  const gainText = `${gainSign}${formatPoints(gain)}`;
  const gainColor = gain > 0 ? "#4ade80" : gain < 0 ? "#f87171" : COLOR_TEXT;

  const { canvas, ctx, panelX, panelY, panelW, panelH } = renderBase({
    title,
    subtitle,
    accent: COLOR_EMBER,
  });

  const badgeW = 200;
  const badgeH = 54;
  const badgeX = panelX + panelW - badgeW - 20;
  const badgeY = panelY + 20;
  const badgeGrad = ctx.createLinearGradient(
    badgeX,
    badgeY,
    badgeX + badgeW,
    badgeY + badgeH,
  );
  badgeGrad.addColorStop(0, jackpotWon ? "#facc15" : "#38bdf8");
  badgeGrad.addColorStop(1, jackpotWon ? COLOR_EMBER : COLOR_GOLD);
  ctx.fillStyle = badgeGrad;
  drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 16);
  ctx.fill();
  ctx.fillStyle = "rgba(10, 14, 20, 0.7)";
  drawRoundedRect(ctx, badgeX + 6, badgeY + 6, badgeW - 12, badgeH - 12, 12);
  ctx.fill();
  ctx.fillStyle = COLOR_TEXT;
  ctx.font = `700 12px ${FONT_TITLE}`;
  ctx.fillText(jackpotLabel.toUpperCase(), badgeX + 16, badgeY + 26);
  ctx.fillStyle = jackpotWon ? COLOR_GOLD : COLOR_TEXT;
  ctx.font = `700 18px ${FONT_TITLE}`;
  ctx.fillText(formatPoints(jackpot ?? 0), badgeX + 16, badgeY + 46);

  const reelW = 132;
  const reelH = 108;
  const reelY = panelY + 104;
  const gap = 24;
  const totalW = reelW * 3 + gap * 2;
  let startX = panelX + (panelW - totalW) / 2;

  const frameX = startX - 16;
  const frameY = reelY - 14;
  const frameW = totalW + 32;
  const frameH = reelH + 28;
  const frameGrad = ctx.createLinearGradient(
    frameX,
    frameY,
    frameX + frameW,
    frameY + frameH,
  );
  frameGrad.addColorStop(0, "rgba(255, 255, 255, 0.08)");
  frameGrad.addColorStop(1, "rgba(255, 255, 255, 0.02)");
  ctx.fillStyle = frameGrad;
  drawRoundedRect(ctx, frameX, frameY, frameW, frameH, 22);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.stroke();

  reels.forEach((symbol) => {
    ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
    drawRoundedRect(ctx, startX, reelY, reelW, reelH, 20);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.stroke();

    ctx.fillStyle = "#f8fafc";
    ctx.font = `64px ${FONT_EMOJI}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(symbol ?? "?", startX + reelW / 2, reelY + reelH / 2);

    startX += reelW + gap;
  });

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  const statsY = panelY + panelH - 76;
  const statW = 240;
  const gapStat = 14;
  const totalStatsW = statW * 3 + gapStat * 2;
  const leftX = panelX + Math.floor((panelW - totalStatsW) / 2);
  drawStat(ctx, leftX, statsY, betLabel, formatPoints(bet), statW);
  drawStat(
    ctx,
    leftX + statW + gapStat,
    statsY,
    gainLabel,
    gainText,
    statW,
    gainColor,
  );
  drawStat(
    ctx,
    leftX + (statW + gapStat) * 2,
    statsY,
    balanceLabel,
    formatPoints(balance),
    statW,
  );

  return canvas.toBuffer("image/png");
}

export function renderRouletteCard({
  username,
  bet,
  choice,
  number,
  color,
  gain,
  balance,
  labels = {},
}) {
  const title = labels.title ?? "Roulette";
  const subtitle = labels.subtitle ?? username ?? "Player";
  const betLabel = labels.bet ?? "Bet";
  const gainLabel = labels.win ?? "Win";
  const balanceLabel = labels.balance ?? "Balance";
  const pickLabel = labels.pick ?? "Pick";
  const resultLabel = labels.result ?? "Result";

  const gainSign = gain >= 0 ? "+" : "";
  const gainText = `${gainSign}${formatPoints(gain)}`;
  const gainColor = gain > 0 ? "#4ade80" : gain < 0 ? "#f87171" : COLOR_TEXT;

  const { canvas, ctx, panelX, panelY, panelW, panelH } = renderBase({
    title,
    subtitle,
    accent: "#22d3ee",
  });

  const badgeW = 260;
  const badgeH = 112;
  const badgeX = panelX + (panelW - badgeW) / 2;
  const badgeY = panelY + 96;

  ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
  drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 20);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.stroke();

  ctx.fillStyle = COLOR_MUTED;
  ctx.font = `600 14px ${FONT_BODY}`;
  ctx.fillText(pickLabel, badgeX + 20, badgeY + 28);
  ctx.fillStyle = COLOR_TEXT;
  ctx.font = `700 22px ${FONT_TITLE}`;
  ctx.fillText(String(choice ?? "-"), badgeX + 20, badgeY + 52);

  ctx.fillStyle = COLOR_MUTED;
  ctx.font = `600 14px ${FONT_BODY}`;
  ctx.fillText(resultLabel, badgeX + 20, badgeY + 76);
  ctx.fillStyle = COLOR_TEXT;
  ctx.font = `700 24px ${FONT_TITLE}`;
  ctx.fillText(String(number ?? "-"), badgeX + 20, badgeY + 100);

  if (color) {
    const orbX = badgeX + badgeW - 44;
    const orbY = badgeY + badgeH / 2;
    const orbGrad = ctx.createRadialGradient(
      orbX - 6,
      orbY - 6,
      6,
      orbX,
      orbY,
      24,
    );
    orbGrad.addColorStop(0, "rgba(255, 255, 255, 0.7)");
    orbGrad.addColorStop(1, color);
    ctx.fillStyle = orbGrad;
    ctx.beginPath();
    ctx.arc(orbX, orbY, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const statsY = panelY + panelH - 76;
  const statW = 200;
  const gapStat = 18;
  const totalStatsW = statW * 3 + gapStat * 2;
  const leftX = panelX + Math.floor((panelW - totalStatsW) / 2);
  drawStat(ctx, leftX, statsY, betLabel, formatPoints(bet), statW);
  drawStat(
    ctx,
    leftX + statW + gapStat,
    statsY,
    gainLabel,
    gainText,
    statW,
    gainColor,
  );
  drawStat(
    ctx,
    leftX + (statW + gapStat) * 2,
    statsY,
    balanceLabel,
    formatPoints(balance),
    statW,
  );

  return canvas.toBuffer("image/png");
}

function drawInfoChip(ctx, x, y, w, h, label, value, accent) {
  ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
  drawRoundedRect(ctx, x, y, w, h, 16);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.10)";
  ctx.stroke();

  ctx.fillStyle = accent;
  ctx.fillRect(x + 14, y + 14, 34, 4);
  ctx.fillStyle = COLOR_MUTED;
  ctx.font = `600 13px ${FONT_BODY}`;
  ctx.fillText(label, x + 14, y + 34);
  ctx.fillStyle = COLOR_TEXT;
  ctx.font = `700 24px ${FONT_TITLE}`;
  ctx.fillText(String(value), x + 14, y + 64);
}

function drawPip(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 5.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawDieFace(ctx, x, y, size, value, hit) {
  const pipColor = hit ? "#052e16" : "#111827";
  const fillA = hit ? "rgba(74, 222, 128, 0.95)" : "rgba(248, 250, 252, 0.96)";
  const fillB = hit ? "rgba(34, 197, 94, 0.95)" : "rgba(226, 232, 240, 0.96)";

  const faceGrad = ctx.createLinearGradient(x, y, x + size, y + size);
  faceGrad.addColorStop(0, fillA);
  faceGrad.addColorStop(1, fillB);
  ctx.fillStyle = faceGrad;
  drawRoundedRect(ctx, x, y, size, size, 22);
  ctx.fill();
  ctx.strokeStyle = hit
    ? "rgba(74, 222, 128, 0.55)"
    : "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = 2;
  ctx.stroke();

  const left = x + size * 0.28;
  const center = x + size * 0.5;
  const right = x + size * 0.72;
  const top = y + size * 0.28;
  const middle = y + size * 0.5;
  const bottom = y + size * 0.72;

  const pipMap = {
    1: [[center, middle]],
    2: [
      [left, top],
      [right, bottom],
    ],
    3: [
      [left, top],
      [center, middle],
      [right, bottom],
    ],
    4: [
      [left, top],
      [right, top],
      [left, bottom],
      [right, bottom],
    ],
    5: [
      [left, top],
      [right, top],
      [center, middle],
      [left, bottom],
      [right, bottom],
    ],
    6: [
      [left, top],
      [right, top],
      [left, middle],
      [right, middle],
      [left, bottom],
      [right, bottom],
    ],
  };

  const pips = pipMap[value];
  if (pips) {
    for (const [pipX, pipY] of pips) {
      drawPip(ctx, pipX, pipY, pipColor);
    }
    return;
  }

  ctx.fillStyle = pipColor;
  ctx.font = `700 28px ${FONT_TITLE}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(value), x + size / 2, y + size / 2);
}

export function renderDiceCard({
  username,
  bet,
  guess,
  rolls,
  diceCount,
  gain,
  balance,
  labels = {},
}) {
  const title = labels.title ?? "Dice";
  const subtitle = labels.subtitle ?? username ?? "Player";
  const betLabel = labels.bet ?? "Bet";
  const gainLabel = labels.win ?? "Win";
  const balanceLabel = labels.balance ?? "Balance";
  const pickLabel = labels.pick ?? "Pick";
  const resultLabel = labels.result ?? "Result";
  const diceLabel = labels.dice ?? "Dice";

  const gainSign = gain >= 0 ? "+" : "";
  const gainText = `${gainSign}${formatPoints(gain)}`;
  const gainColor = gain > 0 ? "#4ade80" : gain < 0 ? "#f87171" : COLOR_TEXT;
  const rollList = Array.isArray(rolls) && rolls.length ? rolls : [0];

  const { canvas, ctx, panelX, panelY, panelW, panelH } = renderBase({
    title,
    subtitle,
    accent: "#8b5cf6",
    height: 452,
  });

  const chipY = panelY + 92;
  const chipW = 150;
  const chipH = 78;
  const chipGap = 16;
  const totalChipW = chipW * 2 + chipGap;
  const chipX = panelX + Math.floor((panelW - totalChipW) / 2);
  drawInfoChip(
    ctx,
    chipX,
    chipY,
    chipW,
    chipH,
    pickLabel,
    guess ?? "-",
    "#a78bfa",
  );
  drawInfoChip(
    ctx,
    chipX + chipW + chipGap,
    chipY,
    chipW,
    chipH,
    diceLabel,
    diceCount ?? rollList.length,
    "#22d3ee",
  );

  ctx.fillStyle = COLOR_MUTED;
  ctx.font = `600 14px ${FONT_BODY}`;
  ctx.fillText(resultLabel, panelX + 24, panelY + 186);
  ctx.fillStyle = COLOR_TEXT;
  ctx.font = `700 20px ${FONT_TITLE}`;
  ctx.fillText(rollList.join(" • "), panelX + 24, panelY + 210);

  const stageX = panelX + 22;
  const stageY = panelY + 220;
  const stageW = panelW - 44;
  const stageH = 72;
  const stageGrad = ctx.createLinearGradient(
    stageX,
    stageY,
    stageX + stageW,
    stageY + stageH,
  );
  stageGrad.addColorStop(0, "rgba(139, 92, 246, 0.10)");
  stageGrad.addColorStop(1, "rgba(34, 211, 238, 0.08)");
  ctx.fillStyle = stageGrad;
  drawRoundedRect(ctx, stageX, stageY, stageW, stageH, 22);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.10)";
  ctx.stroke();

  const dieSize = 60;
  const dieGap = 18;
  const totalDiceW = dieSize * rollList.length + dieGap * (rollList.length - 1);
  let dieX = panelX + Math.floor((panelW - totalDiceW) / 2);
  const dieY = stageY + Math.floor((stageH - dieSize) / 2);
  for (const value of rollList) {
    const hit = Number(value) === Number(guess);
    if (hit) {
      const hitGlow = ctx.createRadialGradient(
        dieX + dieSize / 2,
        dieY + dieSize / 2,
        12,
        dieX + dieSize / 2,
        dieY + dieSize / 2,
        58,
      );
      hitGlow.addColorStop(0, "rgba(74, 222, 128, 0.20)");
      hitGlow.addColorStop(1, "rgba(74, 222, 128, 0)");
      ctx.fillStyle = hitGlow;
      ctx.fillRect(dieX - 12, dieY - 12, dieSize + 24, dieSize + 24);
    }

    drawDieFace(ctx, dieX, dieY, dieSize, Number(value), hit);
    dieX += dieSize + dieGap;
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  const statsY = panelY + panelH - 76;
  const statW = 200;
  const gapStat = 18;
  const totalStatsW = statW * 3 + gapStat * 2;
  const leftX = panelX + Math.floor((panelW - totalStatsW) / 2);
  drawStat(ctx, leftX, statsY, betLabel, formatPoints(bet), statW);
  drawStat(
    ctx,
    leftX + statW + gapStat,
    statsY,
    gainLabel,
    gainText,
    statW,
    gainColor,
  );
  drawStat(
    ctx,
    leftX + (statW + gapStat) * 2,
    statsY,
    balanceLabel,
    formatPoints(balance),
    statW,
  );

  return canvas.toBuffer("image/png");
}

export function renderAviatorCard({
  username,
  bet,
  multiplier,
  autoCashout = null,
  gain = null,
  balance = null,
  crashed = false,
  cashedOut = false,
  history = [],
  labels = {},
}) {
  const title = labels.title ?? "Aviator";
  const subtitle = labels.subtitle ?? username ?? "Player";
  const betLabel = labels.bet ?? "Bet";
  const gainLabel = labels.gain ?? "Gain";
  const balanceLabel = labels.balance ?? "Balance";
  const autoLabel = labels.auto ?? "Auto";
  const currentLabel = labels.current ?? "Current";
  const statusLabel = labels.status ?? "Status";
  const runningText = labels.running ?? "Flying";
  const crashedText = labels.crashed ?? "Crashed";
  const cashedOutText = labels.cashedOut ?? "Cashed out";

  const statusText = cashedOut
    ? cashedOutText
    : crashed
      ? crashedText
      : runningText;
  const statusColor = cashedOut ? "#4ade80" : crashed ? "#f87171" : COLOR_GOLD;
  const multiplierText = `${Number(multiplier ?? 1).toFixed(2)}x`;
  const gainValue =
    gain == null ? "--" : `${gain >= 0 ? "+" : ""}${formatPoints(gain)}`;
  const gainColor =
    gain == null
      ? COLOR_TEXT
      : gain > 0
        ? "#4ade80"
        : gain < 0
          ? "#f87171"
          : COLOR_TEXT;
  const autoValue =
    autoCashout && autoCashout > 1
      ? `${Number(autoCashout).toFixed(2)}x`
      : "Manual";

  const { canvas, ctx, panelX, panelY, panelW, panelH } = renderBase({
    title,
    subtitle,
    accent: "#38bdf8",
    height: 446,
  });

  const statusW = 184;
  const statusH = 54;
  const statusX = panelX + panelW - statusW - 22;
  const statusY = panelY + 22;
  ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
  drawRoundedRect(ctx, statusX, statusY, statusW, statusH, 16);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.10)";
  ctx.stroke();
  ctx.fillStyle = COLOR_MUTED;
  ctx.font = `600 12px ${FONT_BODY}`;
  ctx.fillText(statusLabel.toUpperCase(), statusX + 16, statusY + 22);
  ctx.fillStyle = statusColor;
  ctx.font = `700 20px ${FONT_TITLE}`;
  ctx.fillText(statusText, statusX + 16, statusY + 44);

  ctx.fillStyle = statusColor;
  ctx.font = `800 52px ${FONT_TITLE}`;
  ctx.fillText(multiplierText, panelX + 26, panelY + 136);

  const chartX = panelX + 22;
  const chartY = panelY + 154;
  const chartW = panelW - 44;
  const chartH = 150;
  const chartGrad = ctx.createLinearGradient(
    chartX,
    chartY,
    chartX + chartW,
    chartY + chartH,
  );
  chartGrad.addColorStop(0, "rgba(56, 189, 248, 0.08)");
  chartGrad.addColorStop(
    1,
    crashed ? "rgba(239, 68, 68, 0.10)" : "rgba(250, 204, 21, 0.08)",
  );
  ctx.fillStyle = chartGrad;
  drawRoundedRect(ctx, chartX, chartY, chartW, chartH, 22);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.10)";
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
  for (let i = 1; i < 4; i += 1) {
    const lineY = chartY + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(chartX + 16, lineY);
    ctx.lineTo(chartX + chartW - 16, lineY);
    ctx.stroke();
  }

  const points =
    Array.isArray(history) && history.length
      ? history
      : [1, Number(multiplier ?? 1)];
  const maxValue = Math.max(1.5, ...points, Number(multiplier ?? 1));
  const plotLeft = chartX + 22;
  const plotBottom = chartY + chartH - 22;
  const plotW = chartW - 44;
  const plotH = chartH - 44;
  ctx.beginPath();
  points.forEach((value, index) => {
    const px = plotLeft + (plotW * index) / Math.max(1, points.length - 1);
    const py = plotBottom - ((value - 1) / (maxValue - 1)) * plotH;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.strokeStyle = statusColor;
  ctx.lineWidth = 4;
  ctx.stroke();

  const lastIndex = points.length - 1;
  const planeX =
    plotLeft + (plotW * lastIndex) / Math.max(1, points.length - 1 || 1);
  const planeY =
    plotBottom - ((points[lastIndex] - 1) / (maxValue - 1)) * plotH;
  ctx.fillStyle = statusColor;
  ctx.font = `700 26px ${FONT_TITLE}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("✈", planeX, planeY - 10);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  const statsY = panelY + panelH - 76;
  const statW = 184;
  const gapStat = 16;
  const totalStatsW = statW * 4 + gapStat * 3;
  const leftX = panelX + Math.floor((panelW - totalStatsW) / 2);
  drawStat(ctx, leftX, statsY, betLabel, formatPoints(bet), statW);
  drawStat(
    ctx,
    leftX + statW + gapStat,
    statsY,
    currentLabel,
    multiplierText,
    statW,
    statusColor,
  );
  drawStat(
    ctx,
    leftX + (statW + gapStat) * 2,
    statsY,
    gain == null ? autoLabel : gainLabel,
    gain == null ? autoValue : gainValue,
    statW,
    gain == null ? COLOR_TEXT : gainColor,
  );
  drawStat(
    ctx,
    leftX + (statW + gapStat) * 3,
    statsY,
    balanceLabel,
    formatPoints(balance ?? 0),
    statW,
  );

  return canvas.toBuffer("image/png");
}
