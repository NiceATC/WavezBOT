import { createCanvas } from "@napi-rs/canvas";
import { formatPoints } from "./points.js";

const WIDTH = 960;
const HEIGHT = 360;
const PAD = 32;
const FONT_DISPLAY = '"Trebuchet MS","Palatino Linotype",serif';
const FONT_BODY = '"Palatino Linotype","Georgia",serif';
const COLOR_INK = "#e5e7eb";
const COLOR_MUTED = "#94a3b8";
const COLOR_PANEL = "rgba(10, 15, 22, 0.72)";
const COLOR_PANEL_EDGE = "rgba(255, 255, 255, 0.08)";
const COLOR_ACCENT = "#22d3ee";
const COLOR_ACCENT_ALT = "#2dd4bf";
const COLOR_GOLD = "#f59e0b";
const COLOR_EMBER = "#fb923c";

const VIP_THEMES = {
  bronze: {
    accent: "#f59e0b",
    start: "rgba(245, 158, 11, 0.32)",
    end: "rgba(251, 146, 60, 0.18)",
  },
  silver: {
    accent: "#cbd5e1",
    start: "rgba(203, 213, 225, 0.30)",
    end: "rgba(148, 163, 184, 0.18)",
  },
  gold: {
    accent: "#facc15",
    start: "rgba(250, 204, 21, 0.30)",
    end: "rgba(245, 158, 11, 0.18)",
  },
};

function resolveVipTheme(vipLevelKey, fallbackAccent = COLOR_GOLD) {
  const key = String(vipLevelKey ?? "").toLowerCase();
  const base = VIP_THEMES[key];
  if (base) return base;
  return {
    accent: fallbackAccent,
    start: "rgba(245, 158, 11, 0.30)",
    end: "rgba(245, 158, 11, 0.12)",
  };
}

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

function renderBase({ title, username }) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, "#0b0f14");
  gradient.addColorStop(1, "#141f2b");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glow = ctx.createRadialGradient(130, 70, 20, 130, 70, 240);
  glow.addColorStop(0, "rgba(34, 211, 238, 0.25)");
  glow.addColorStop(1, "rgba(34, 211, 238, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glow2 = ctx.createRadialGradient(
    WIDTH - 160,
    HEIGHT - 70,
    30,
    WIDTH - 160,
    HEIGHT - 70,
    260,
  );
  glow2.addColorStop(0, "rgba(245, 158, 11, 0.20)");
  glow2.addColorStop(1, "rgba(245, 158, 11, 0)");
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
  ctx.lineWidth = 1;
  for (let i = 16; i < WIDTH; i += 36) {
    ctx.beginPath();
    ctx.moveTo(i, PAD);
    ctx.lineTo(i, HEIGHT - PAD);
    ctx.stroke();
  }

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
    panelX + 120,
    panelY + 18,
  );
  accentGrad.addColorStop(0, COLOR_ACCENT);
  accentGrad.addColorStop(1, COLOR_GOLD);
  ctx.fillStyle = accentGrad;
  ctx.fillRect(panelX + 20, panelY + 18, 84, 4);

  ctx.fillStyle = COLOR_INK;
  ctx.font = `700 26px ${FONT_DISPLAY}`;
  ctx.fillText(title, panelX + 20, panelY + 52);

  ctx.fillStyle = COLOR_MUTED;
  ctx.font = `600 20px ${FONT_BODY}`;
  ctx.fillText(username, panelX + 20, panelY + 82);

  return { canvas, ctx };
}

export function renderProfileCard({
  username,
  level,
  xp,
  nextReq,
  rewardPoints,
  balance,
  vipLabel = null,
  vipLevelKey = null,
  marriageLabel = null,
  marriageValue = null,
  vipAccent = COLOR_GOLD,
  labels = {},
}) {
  const title = labels.title ?? "Profile";
  const levelLabel = labels.level ?? "Level";
  const xpLabel = labels.xp ?? "XP";
  const rewardLabel = labels.reward ?? "Next reward";
  const balanceLabel = labels.balance ?? "Balance";
  const vipStatusLabel = labels.vip ?? "VIP";
  const marriageStatusLabel = labels.marriage ?? "Marriage";
  const pointsLabel = labels.points ?? "points";
  const safeName = username || "User";
  const { canvas, ctx } = renderBase({ title, username: safeName });

  const innerX = PAD + 20;
  const innerW = WIDTH - PAD * 2 - 40;

  const badgeW = 168;
  const badgeH = 104;
  const badgeX = WIDTH - PAD - badgeW - 20;
  const badgeY = PAD + 36;
  const badgeGrad = ctx.createLinearGradient(
    badgeX,
    badgeY,
    badgeX + badgeW,
    badgeY + badgeH,
  );
  badgeGrad.addColorStop(0, COLOR_ACCENT_ALT);
  badgeGrad.addColorStop(1, COLOR_GOLD);
  ctx.fillStyle = badgeGrad;
  drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 16);
  ctx.fill();
  ctx.fillStyle = "rgba(10, 14, 19, 0.75)";
  drawRoundedRect(ctx, badgeX + 12, badgeY + 12, badgeW - 24, 22, 11);
  ctx.fill();
  ctx.fillStyle = COLOR_INK;
  ctx.font = `700 12px ${FONT_DISPLAY}`;
  ctx.fillText(levelLabel.toUpperCase(), badgeX + 22, badgeY + 28);
  ctx.fillStyle = COLOR_INK;
  ctx.font = `800 42px ${FONT_DISPLAY}`;
  ctx.fillText(String(level), badgeX + 20, badgeY + 80);

  const barX = innerX;
  const barY = PAD + 150;
  const barW = innerW;
  const barH = 16;
  const ratio = nextReq > 0 ? Math.min(1, xp / nextReq) : 0;
  const percent = Math.round(ratio * 100);
  const xpText = `${formatPoints(xp)} / ${formatPoints(nextReq)} (${percent}%)`;

  ctx.fillStyle = COLOR_INK;
  ctx.font = `600 18px ${FONT_BODY}`;
  ctx.fillText(`${xpLabel}: ${xpText}`, innerX, barY - 12);

  ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
  drawRoundedRect(ctx, barX, barY, barW, barH, 10);
  ctx.fill();

  if (ratio > 0) {
    const fillW = Math.max(10, Math.floor(barW * ratio));
    const fillGrad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
    fillGrad.addColorStop(0, COLOR_ACCENT);
    fillGrad.addColorStop(1, COLOR_GOLD);
    ctx.fillStyle = fillGrad;
    drawRoundedRect(ctx, barX, barY, fillW, barH, 10);
    ctx.fill();
  }

  const cardGap = 16;
  const cardY = barY + 36;
  const cardH = 92;
  const statCount = 2 + (vipLabel ? 1 : 0) + (marriageLabel ? 1 : 0);
  const cardW = Math.floor((barW - cardGap * (statCount - 1)) / statCount);
  let cardIndex = 0;

  function drawStatCard(x, label, value, accent) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
    drawRoundedRect(ctx, x, cardY, cardW, cardH, 16);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.stroke();

    ctx.fillStyle = accent;
    ctx.fillRect(x + 16, cardY + 16, 36, 4);
    ctx.fillStyle = COLOR_INK;
    ctx.font = `600 16px ${FONT_BODY}`;
    ctx.fillText(label, x + 16, cardY + 40);
    ctx.font = `700 24px ${FONT_DISPLAY}`;
    ctx.fillText(value, x + 16, cardY + 72);
  }

  const rewardText = `${formatPoints(rewardPoints)} ${pointsLabel}`;
  drawStatCard(
    innerX + (cardW + cardGap) * cardIndex,
    rewardLabel,
    rewardText,
    COLOR_EMBER,
  );
  cardIndex += 1;

  if (balance != null) {
    const balanceText = `${formatPoints(balance)} ${pointsLabel}`;
    drawStatCard(
      innerX + (cardW + cardGap) * cardIndex,
      balanceLabel,
      balanceText,
      COLOR_ACCENT_ALT,
    );
    cardIndex += 1;
  }

  if (vipLabel) {
    const vipX = innerX + (cardW + cardGap) * cardIndex;
    const vipTheme = resolveVipTheme(vipLevelKey, vipAccent);
    const vipGrad = ctx.createLinearGradient(
      vipX,
      cardY,
      vipX + cardW,
      cardY + cardH,
    );
    vipGrad.addColorStop(0, vipTheme.start);
    vipGrad.addColorStop(1, vipTheme.end);
    ctx.fillStyle = vipGrad;
    drawRoundedRect(ctx, vipX, cardY, cardW, cardH, 16);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.stroke();

    ctx.fillStyle = vipTheme.accent;
    ctx.fillRect(vipX + 16, cardY + 16, 36, 4);
    ctx.fillStyle = COLOR_INK;
    ctx.font = `600 16px ${FONT_BODY}`;
    ctx.fillText(vipStatusLabel, vipX + 16, cardY + 40);
    ctx.font = `700 24px ${FONT_DISPLAY}`;
    ctx.fillText(vipLabel, vipX + 16, cardY + 72);
    cardIndex += 1;
  }

  if (marriageLabel && marriageValue) {
    drawStatCard(
      innerX + (cardW + cardGap) * cardIndex,
      marriageStatusLabel,
      String(marriageValue),
      "#f472b6",
    );
  }

  return canvas.toBuffer("image/png");
}

export function renderBalanceCard({
  username,
  balance,
  vipLabel = null,
  vipLevelKey = null,
  vipAccent = COLOR_GOLD,
  labels = {},
}) {
  const title = labels.title ?? "Balance";
  const balanceLabel = labels.balance ?? "Balance";
  const vipStatusLabel = labels.vip ?? "VIP";
  const pointsLabel = labels.points ?? "points";
  const safeName = username || "User";
  const { canvas, ctx } = renderBase({ title, username: safeName });

  const innerX = PAD + 20;
  const innerW = WIDTH - PAD * 2 - 40;
  const barY = PAD + 150;
  const barH = 16;

  ctx.fillStyle = COLOR_INK;
  ctx.font = `600 18px ${FONT_BODY}`;
  ctx.fillText(balanceLabel.toUpperCase(), innerX, barY - 12);

  ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
  drawRoundedRect(ctx, innerX, barY, innerW, barH, 10);
  ctx.fill();

  const fillGrad = ctx.createLinearGradient(
    innerX,
    barY,
    innerX + innerW,
    barY,
  );
  fillGrad.addColorStop(0, COLOR_ACCENT_ALT);
  fillGrad.addColorStop(1, COLOR_GOLD);
  ctx.fillStyle = fillGrad;
  drawRoundedRect(ctx, innerX, barY, Math.max(12, innerW * 0.66), barH, 10);
  ctx.fill();

  ctx.fillStyle = COLOR_INK;
  ctx.font = `800 42px ${FONT_DISPLAY}`;
  ctx.fillText(`${formatPoints(balance)} ${pointsLabel}`, innerX, barY + 78);

  if (vipLabel) {
    const vipTheme = resolveVipTheme(vipLevelKey, vipAccent);
    const badgeW = 230;
    const badgeH = 96;
    const badgeX = innerX + innerW - badgeW;
    const badgeY = PAD + 30;

    const badgeGrad = ctx.createLinearGradient(
      badgeX,
      badgeY,
      badgeX + badgeW,
      badgeY + badgeH,
    );
    badgeGrad.addColorStop(0, vipTheme.start);
    badgeGrad.addColorStop(1, vipTheme.end);
    ctx.fillStyle = badgeGrad;
    drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 18);
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
    ctx.stroke();

    ctx.fillStyle = vipTheme.accent;
    ctx.fillRect(badgeX + 16, badgeY + 16, 42, 4);

    ctx.fillStyle = COLOR_MUTED;
    ctx.font = `600 14px ${FONT_BODY}`;
    ctx.fillText(vipStatusLabel.toUpperCase(), badgeX + 16, badgeY + 40);

    ctx.fillStyle = COLOR_INK;
    ctx.font = `700 28px ${FONT_DISPLAY}`;
    ctx.fillText(vipLabel, badgeX + 16, badgeY + 76);
  }

  return canvas.toBuffer("image/png");
}
