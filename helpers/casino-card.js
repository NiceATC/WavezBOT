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

function renderBase({ title, subtitle, accent = COLOR_CYAN }) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, "#0b0f14");
  gradient.addColorStop(1, "#16212d");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glow = ctx.createRadialGradient(140, 70, 20, 140, 70, 220);
  glow.addColorStop(0, "rgba(34, 211, 238, 0.25)");
  glow.addColorStop(1, "rgba(34, 211, 238, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glow2 = ctx.createRadialGradient(
    WIDTH - 140,
    HEIGHT - 70,
    30,
    WIDTH - 140,
    HEIGHT - 70,
    260,
  );
  glow2.addColorStop(0, "rgba(251, 191, 36, 0.18)");
  glow2.addColorStop(1, "rgba(251, 191, 36, 0)");
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const panelX = PAD;
  const panelY = PAD;
  const panelW = WIDTH - PAD * 2;
  const panelH = HEIGHT - PAD * 2;
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

  return { canvas, ctx, panelX, panelY, panelW, panelH };
}

function drawStat(ctx, x, y, label, value, width = 220) {
  ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
  drawRoundedRect(ctx, x, y, width, 64, 16);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.stroke();

  ctx.fillStyle = COLOR_MUTED;
  ctx.font = `600 14px ${FONT_BODY}`;
  ctx.fillText(label, x + 16, y + 24);

  ctx.fillStyle = COLOR_TEXT;
  ctx.font = `700 20px ${FONT_TITLE}`;
  ctx.fillText(value, x + 16, y + 48);
}

export function renderSlotsCard({
  username,
  bet,
  reels,
  win,
  net,
  jackpot,
  jackpotWon,
  labels = {},
}) {
  const title = labels.title ?? "Slots";
  const subtitle = labels.subtitle ?? username ?? "Player";
  const betLabel = labels.bet ?? "Bet";
  const winLabel = labels.win ?? "Win";
  const netLabel = labels.net ?? "Net";
  const jackpotLabel = labels.jackpot ?? "Jackpot";

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
  const statW = 176;
  const gapStat = 14;
  const totalStatsW = statW * 4 + gapStat * 3;
  const leftX = panelX + Math.floor((panelW - totalStatsW) / 2);
  drawStat(ctx, leftX, statsY, betLabel, formatPoints(bet), statW);
  drawStat(
    ctx,
    leftX + statW + gapStat,
    statsY,
    winLabel,
    formatPoints(win),
    statW,
  );
  drawStat(
    ctx,
    leftX + (statW + gapStat) * 2,
    statsY,
    netLabel,
    formatPoints(net),
    statW,
  );
  drawStat(
    ctx,
    leftX + (statW + gapStat) * 3,
    statsY,
    jackpotLabel,
    formatPoints(jackpot ?? 0),
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
  win,
  net,
  labels = {},
}) {
  const title = labels.title ?? "Roulette";
  const subtitle = labels.subtitle ?? username ?? "Player";
  const betLabel = labels.bet ?? "Bet";
  const winLabel = labels.win ?? "Win";
  const netLabel = labels.net ?? "Net";
  const pickLabel = labels.pick ?? "Pick";
  const resultLabel = labels.result ?? "Result";

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
    winLabel,
    formatPoints(win),
    statW,
  );
  drawStat(
    ctx,
    leftX + (statW + gapStat) * 2,
    statsY,
    netLabel,
    formatPoints(net),
    statW,
  );

  return canvas.toBuffer("image/png");
}
