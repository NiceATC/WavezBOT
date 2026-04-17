import { createCanvas } from "@napi-rs/canvas";

const WIDTH = 1920;
const PAD = 40;
const FONT_DISPLAY = '"Trebuchet MS","Palatino Linotype",serif';
const FONT_BODY = '"Georgia","Palatino Linotype",serif';
const COLOR_INK = "#f8fafc";
const COLOR_MUTED = "#cbd5e1";
const COLOR_PANEL = "rgba(9, 15, 27, 0.82)";
const COLOR_PANEL_EDGE = "rgba(255, 255, 255, 0.08)";
const LEVEL_COLORS = Object.freeze({
  none: ["#334155", "#64748b"],
  bronze: ["#b45309", "#f59e0b"],
  silver: ["#94a3b8", "#e2e8f0"],
  gold: ["#f59e0b", "#facc15"],
});

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

function fillBackground(ctx, width, height, accentA, accentB) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#07111d");
  gradient.addColorStop(1, "#111827");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const haloLeft = ctx.createRadialGradient(150, 120, 10, 150, 120, 320);
  haloLeft.addColorStop(0, `${accentA}55`);
  haloLeft.addColorStop(1, `${accentA}00`);
  ctx.fillStyle = haloLeft;
  ctx.fillRect(0, 0, width, height);

  const haloRight = ctx.createRadialGradient(
    width - 180,
    height - 110,
    10,
    width - 180,
    height - 110,
    360,
  );
  haloRight.addColorStop(0, `${accentB}55`);
  haloRight.addColorStop(1, `${accentB}00`);
  ctx.fillStyle = haloRight;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.035)";
  for (let x = 16; x < width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, PAD);
    ctx.lineTo(x, height - PAD);
    ctx.stroke();
  }
}

function drawShell(ctx, width, height, title, subtitle, accentA, accentB) {
  fillBackground(ctx, width, height, accentA, accentB);

  const shellX = PAD;
  const shellY = PAD;
  const shellW = width - PAD * 2;
  const shellH = height - PAD * 2;
  ctx.fillStyle = COLOR_PANEL;
  drawRoundedRect(ctx, shellX, shellY, shellW, shellH, 26);
  ctx.fill();
  ctx.strokeStyle = COLOR_PANEL_EDGE;
  ctx.lineWidth = 1;
  ctx.stroke();

  const strip = ctx.createLinearGradient(
    shellX + 24,
    shellY + 20,
    shellX + 220,
    shellY + 20,
  );
  strip.addColorStop(0, accentA);
  strip.addColorStop(1, accentB);
  ctx.fillStyle = strip;
  ctx.fillRect(shellX + 24, shellY + 20, 140, 5);

  ctx.fillStyle = COLOR_INK;
  ctx.font = `700 48px ${FONT_DISPLAY}`;
  ctx.fillText(title, shellX + 20, shellY + 72);
  ctx.fillStyle = COLOR_MUTED;
  ctx.font = `600 28px ${FONT_BODY}`;
  ctx.fillText(subtitle, shellX + 20, shellY + 116);

  return { shellX, shellY, shellW, shellH };
}

function drawInfoCard(ctx, x, y, w, h, label, value, accent) {
  ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
  drawRoundedRect(ctx, x, y, w, h, 18);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.fillRect(x + 12, y + 12, 48, 5);
  ctx.fillStyle = COLOR_MUTED;
  ctx.font = `600 19px ${FONT_BODY}`;
  ctx.fillText(label, x + 12, y + 34);
  ctx.fillStyle = COLOR_INK;
  const valueLines = wrapTextLines(ctx, String(value ?? "-"), w - 24, {
    font: `700 30px ${FONT_DISPLAY}`,
    maxLines: 2,
  });
  valueLines.forEach((line, index) => {
    ctx.fillText(line, x + 12, y + 80 + index * 32);
  });
}

function wrapTextLines(
  ctx,
  text,
  maxWidth,
  { font, maxLines = Infinity } = {},
) {
  const content = String(text ?? "").trim();
  if (!content) return [""];
  if (font) ctx.font = font;
  const words = content.split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }
    if (!current) {
      lines.push(word);
      if (lines.length >= maxLines) return clampLastLine(ctx, lines, maxWidth);
      continue;
    }
    lines.push(current);
    if (lines.length >= maxLines) return clampLastLine(ctx, lines, maxWidth);
    current = word;
  }

  if (current) lines.push(current);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    return clampLastLine(ctx, lines, maxWidth);
  }
  return lines;
}

function clampLastLine(ctx, lines, maxWidth) {
  if (!lines.length) return lines;
  let last = String(lines[lines.length - 1] ?? "");
  if (ctx.measureText(last).width <= maxWidth) return lines;
  while (last.length > 1 && ctx.measureText(`${last}...`).width > maxWidth) {
    last = last.slice(0, -1);
  }
  lines[lines.length - 1] = `${last}...`;
  return lines;
}

export function renderVipStatusCard({
  username,
  levelKey = "none",
  title = "VIP Status",
  subtitle = "Premium membership overview",
  statusLabel = "Status",
  statusValue = "Inactive",
  expiresLabel = "Expires",
  expiresValue = "-",
  balanceLabel = "Balance",
  balanceValue = "-",
  renewLabel = "Renewal",
  renewValue = "Manual",
  benefitItems = [],
}) {
  const [accentA, accentB] = LEVEL_COLORS[levelKey] ?? LEVEL_COLORS.none;
  const height = 1160;
  const canvas = createCanvas(WIDTH, height);
  const ctx = canvas.getContext("2d");
  const shell = drawShell(
    ctx,
    WIDTH,
    height,
    title,
    subtitle,
    accentA,
    accentB,
  );

  const heroX = shell.shellX + 24;
  const heroY = shell.shellY + 170;
  const heroW = shell.shellW - 48;
  const heroH = 184;
  const heroGrad = ctx.createLinearGradient(
    heroX,
    heroY,
    heroX + heroW,
    heroY + heroH,
  );
  heroGrad.addColorStop(0, `${accentA}dd`);
  heroGrad.addColorStop(1, `${accentB}dd`);
  ctx.fillStyle = heroGrad;
  drawRoundedRect(ctx, heroX, heroY, heroW, heroH, 24);
  ctx.fill();

  ctx.fillStyle = "rgba(8, 15, 24, 0.55)";
  drawRoundedRect(ctx, heroX + 16, heroY + 16, heroW - 32, heroH - 32, 18);
  ctx.fill();

  ctx.fillStyle = COLOR_INK;
  ctx.font = `800 54px ${FONT_DISPLAY}`;
  ctx.fillText(username || "User", heroX + 22, heroY + 72);
  ctx.font = `700 36px ${FONT_DISPLAY}`;
  const statusLines = wrapTextLines(ctx, statusValue, heroW - 56, {
    maxLines: 2,
  });
  statusLines.forEach((line, idx) => {
    ctx.fillText(line, heroX + 22, heroY + 128 + idx * 40);
  });
  ctx.fillStyle = COLOR_MUTED;
  ctx.font = `600 18px ${FONT_BODY}`;
  ctx.fillText(statusLabel, heroX + 22, heroY + 164);

  const statsY = heroY + heroH + 30;
  const gap = 18;
  const cardW = Math.floor((heroW - gap * 2) / 3);
  drawInfoCard(
    ctx,
    heroX,
    statsY,
    cardW,
    130,
    expiresLabel,
    expiresValue,
    accentA,
  );
  drawInfoCard(
    ctx,
    heroX + cardW + gap,
    statsY,
    cardW,
    130,
    balanceLabel,
    balanceValue,
    accentB,
  );
  drawInfoCard(
    ctx,
    heroX + (cardW + gap) * 2,
    statsY,
    cardW,
    130,
    renewLabel,
    renewValue,
    accentA,
  );

  const listY = statsY + 182;
  ctx.fillStyle = COLOR_INK;
  ctx.font = `700 32px ${FONT_DISPLAY}`;
  ctx.fillText("Beneficios Premium", heroX, listY);

  const colGap = 18;
  const rowGap = 18;
  const cols = 2;
  const benefitW = Math.floor((heroW - colGap) / cols);
  const benefitH = 112;

  benefitItems.slice(0, 6).forEach((item, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = heroX + col * (benefitW + colGap);
    const y = listY + 24 + row * (benefitH + rowGap);
    ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
    drawRoundedRect(ctx, x, y, benefitW, benefitH, 16);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.stroke();
    ctx.fillStyle = item.accent ?? accentB;
    ctx.fillRect(x + 10, y + 10, 34, 4);
    ctx.fillStyle = COLOR_MUTED;
    ctx.font = `600 17px ${FONT_BODY}`;
    const labelLines = wrapTextLines(ctx, item.label, benefitW - 28, {
      maxLines: 1,
    });
    labelLines.forEach((line, i) => {
      ctx.fillText(line, x + 10, y + 36 + i * 20);
    });
    ctx.fillStyle = COLOR_INK;
    ctx.font = `700 25px ${FONT_DISPLAY}`;
    const valueLines = wrapTextLines(ctx, item.value, benefitW - 28, {
      maxLines: 2,
    });
    valueLines.forEach((line, i) => {
      ctx.fillText(line, x + 10, y + 74 + i * 26);
    });
  });

  return canvas.toBuffer("image/png");
}

export function renderVipPlansCard({
  title = "VIP Plans",
  subtitle = "Premium subscriptions",
  vipCards = [],
  footer = "",
}) {
  const top = 180;
  const gridGapX = 18;
  const gridGapY = 18;
  const cols = Math.max(1, Math.min(3, vipCards.length || 1));
  const rows = Math.ceil(Math.max(1, vipCards.length) / cols);
  const cardW = Math.floor(
    (WIDTH - PAD * 2 - 52 - (cols - 1) * gridGapX) / cols,
  );
  const cardH = 430;
  const height = Math.max(
    700,
    top + rows * cardH + (rows - 1) * gridGapY + 120,
  );

  const canvas = createCanvas(WIDTH, height);
  const ctx = canvas.getContext("2d");
  drawShell(ctx, WIDTH, height, title, subtitle, "#f59e0b", "#facc15");

  const left = PAD + 26;
  const cards = vipCards.length
    ? vipCards
    : [
        {
          name: "VIP",
          benefits: "-",
          durations: [],
        },
      ];

  cards.forEach((planCard, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = left + col * (cardW + gridGapX);
    const y = top + row * (cardH + gridGapY);

    ctx.fillStyle = "rgba(255,255,255,0.04)";
    drawRoundedRect(ctx, x, y, cardW, cardH, 18);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.stroke();

    const headerY = y + 54;
    ctx.fillStyle = COLOR_INK;
    ctx.font = `700 34px ${FONT_DISPLAY}`;
    const nameLines = wrapTextLines(ctx, planCard.name, cardW - 52, {
      maxLines: 1,
    });
    ctx.fillText(nameLines[0], x + 16, headerY);

    ctx.fillStyle = "rgba(245, 158, 11, 0.9)";
    ctx.fillRect(x + 16, y + 70, 72, 5);

    ctx.fillStyle = COLOR_MUTED;
    const benefitLines = wrapTextLines(ctx, planCard.benefits, cardW - 28, {
      font: `600 21px ${FONT_BODY}`,
      maxLines: 3,
    });
    benefitLines.forEach((line, lineIndex) => {
      ctx.fillText(line, x + 16, y + 108 + lineIndex * 28);
    });

    const durationTop = y + 220;
    const durationRowH = 48;
    (planCard.durations ?? []).slice(0, 4).forEach((entry, rowIndex) => {
      const rowY = durationTop + rowIndex * durationRowH;
      ctx.fillStyle =
        rowIndex % 2 === 0
          ? "rgba(255,255,255,0.05)"
          : "rgba(255,255,255,0.025)";
      drawRoundedRect(ctx, x + 10, rowY - 26, cardW - 20, 38, 10);
      ctx.fill();

      ctx.fillStyle = COLOR_INK;
      ctx.font = `700 18px ${FONT_BODY}`;
      ctx.fillText(entry.label, x + 16, rowY - 2);

      ctx.fillStyle = COLOR_MUTED;
      ctx.font = `600 17px ${FONT_BODY}`;
      const rightText = `${entry.price}`;
      const rightW = ctx.measureText(rightText).width;
      ctx.fillText(rightText, x + cardW - 14 - rightW, rowY - 2);
    });
  });

  if (footer) {
    ctx.fillStyle = COLOR_MUTED;
    const footerLines = wrapTextLines(ctx, footer, WIDTH - PAD * 2 - 52, {
      font: `600 18px ${FONT_BODY}`,
      maxLines: 2,
    });
    footerLines.forEach((line, index) => {
      ctx.fillText(line, left, height - 52 + index * 22);
    });
  }

  return canvas.toBuffer("image/png");
}
