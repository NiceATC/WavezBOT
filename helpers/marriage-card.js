import { createCanvas } from "@napi-rs/canvas";

const WIDTH = 1000;
const HEIGHT = 560;
const PAD = 40;
const FONT_TITLE = '"Trebuchet MS","Palatino Linotype",serif';
const FONT_BODY = '"Palatino Linotype","Georgia",serif';
const FONT_SCRIPT =
  '"Brush Script MT","Lucida Handwriting","Segoe Script",cursive';

function drawHeartShape(ctx, cx, cy, size, fill = "#fb7185", broken = false) {
  const s = Math.max(8, Number(size) || 24);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.34);
  ctx.bezierCurveTo(
    cx - s * 0.62,
    cy - s * 0.2,
    cx - s * 0.5,
    cy - s * 0.86,
    cx,
    cy - s * 0.42,
  );
  ctx.bezierCurveTo(
    cx + s * 0.5,
    cy - s * 0.86,
    cx + s * 0.62,
    cy - s * 0.2,
    cx,
    cy + s * 0.34,
  );
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  if (broken) {
    ctx.strokeStyle = "rgba(255,255,255,0.88)";
    ctx.lineWidth = Math.max(2, s * 0.06);
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.06, cy - s * 0.34);
    ctx.lineTo(cx + s * 0.05, cy - s * 0.14);
    ctx.lineTo(cx - s * 0.02, cy - s * 0.02);
    ctx.lineTo(cx + s * 0.12, cy + s * 0.16);
    ctx.stroke();
  }
  ctx.restore();
}

function renderBackdrop(ctx) {
  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, "#130f24");
  bg.addColorStop(0.5, "#24113f");
  bg.addColorStop(1, "#3a1f4f");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glowA = ctx.createRadialGradient(150, 120, 20, 150, 120, 300);
  glowA.addColorStop(0, "rgba(244, 114, 182, 0.40)");
  glowA.addColorStop(1, "rgba(244, 114, 182, 0)");
  ctx.fillStyle = glowA;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glowB = ctx.createRadialGradient(
    WIDTH - 140,
    100,
    20,
    WIDTH - 140,
    100,
    320,
  );
  glowB.addColorStop(0, "rgba(251, 191, 36, 0.35)");
  glowB.addColorStop(1, "rgba(251, 191, 36, 0)");
  ctx.fillStyle = glowB;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawMainFrame(ctx) {
  drawRoundedRect(ctx, PAD, PAD, WIDTH - PAD * 2, HEIGHT - PAD * 2, 30);
  ctx.fillStyle = "rgba(7, 11, 20, 0.55)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function formatDateLabel(stamp, locale = "pt-BR") {
  const date = new Date(Number(stamp) || Date.now());
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
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

function truncate(ctx, text, maxWidth) {
  const input = String(text ?? "").trim() || "User";
  if (ctx.measureText(input).width <= maxWidth) return input;
  let out = input;
  while (out.length > 1 && ctx.measureText(`${out}...`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}...`;
}

export async function renderMarriageCertificate({
  partnerA,
  partnerB,
  marriedAt = Date.now(),
  labels = {},
  locale = "pt-BR",
}) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  renderBackdrop(ctx);
  drawMainFrame(ctx);

  const title = labels.title ?? "Wedding Certificate";
  const subtitle = labels.subtitle ?? "A união foi oficializada";
  const betweenLabel = labels.between ?? "Entre";
  const dateLabel = labels.date ?? "Data";

  ctx.fillStyle = "#f8fafc";
  ctx.font = `700 52px ${FONT_TITLE}`;
  ctx.fillText(title, PAD + 36, PAD + 84);

  ctx.fillStyle = "#cbd5e1";
  ctx.font = `600 24px ${FONT_BODY}`;
  ctx.fillText(subtitle, PAD + 38, PAD + 124);

  const panelX = PAD + 36;
  const panelY = PAD + 164;
  const panelW = WIDTH - PAD * 2 - 72;
  const panelH = 260;
  drawRoundedRect(ctx, panelX, panelY, panelW, panelH, 22);
  const panelGrad = ctx.createLinearGradient(
    panelX,
    panelY,
    panelX + panelW,
    panelY + panelH,
  );
  panelGrad.addColorStop(0, "rgba(15, 23, 42, 0.78)");
  panelGrad.addColorStop(1, "rgba(30, 41, 59, 0.70)");
  ctx.fillStyle = panelGrad;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.stroke();

  ctx.fillStyle = "#fbcfe8";
  ctx.font = `600 22px ${FONT_BODY}`;
  ctx.fillText(betweenLabel.toUpperCase(), panelX + 24, panelY + 44);

  const heartX = panelX + panelW / 2;
  const nameY = panelY + 150;
  const maxNameWidth = (panelW - 220) / 2;

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 64px ${FONT_SCRIPT}`;
  const nameA = truncate(ctx, partnerA, maxNameWidth);
  const nameB = truncate(ctx, partnerB, maxNameWidth);
  ctx.fillText(nameA, panelX + panelW * 0.25, nameY);
  ctx.fillText(nameB, panelX + panelW * 0.75, nameY);

  const heartGlow = ctx.createRadialGradient(
    heartX,
    panelY + 130,
    12,
    heartX,
    panelY + 130,
    72,
  );
  heartGlow.addColorStop(0, "rgba(251, 113, 133, 0.45)");
  heartGlow.addColorStop(1, "rgba(251, 113, 133, 0)");
  ctx.fillStyle = heartGlow;
  ctx.fillRect(heartX - 90, panelY + 42, 180, 180);

  drawHeartShape(ctx, heartX, panelY + 132, 58, "#fb7185", false);

  ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
  ctx.font = `600 18px ${FONT_BODY}`;
  ctx.fillText("forever", heartX, panelY + 178);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  const dateText = formatDateLabel(marriedAt, locale);

  ctx.fillStyle = "#cbd5e1";
  ctx.font = `600 22px ${FONT_BODY}`;
  ctx.fillText(`${dateLabel}: ${dateText}`, panelX + 24, panelY + panelH - 24);

  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = `600 18px ${FONT_BODY}`;
  ctx.fillText("WavezBOT Registry", WIDTH - PAD - 240, HEIGHT - PAD - 20);

  return canvas.toBuffer("image/png");
}

export function renderMarriageStatusCard({
  partnerA,
  partnerB,
  marriedAt,
  together,
  labels = {},
  locale = "pt-BR",
}) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  renderBackdrop(ctx);
  drawMainFrame(ctx);

  const title = labels.title ?? "Marriage Status";
  const subtitle = labels.subtitle ?? "Officially united";
  const partnerLabel = labels.partner ?? "Partner";
  const sinceLabel = labels.since ?? "Married since";
  const togetherLabel = labels.together ?? "Time together";
  const dateText = formatDateLabel(marriedAt, locale);

  ctx.fillStyle = "#f8fafc";
  ctx.font = `700 48px ${FONT_TITLE}`;
  ctx.fillText(title, PAD + 36, PAD + 82);

  ctx.fillStyle = "#cbd5e1";
  ctx.font = `600 23px ${FONT_BODY}`;
  ctx.fillText(subtitle, PAD + 38, PAD + 120);

  const panelX = PAD + 36;
  const panelY = PAD + 154;
  const panelW = WIDTH - PAD * 2 - 72;
  const panelH = 292;
  drawRoundedRect(ctx, panelX, panelY, panelW, panelH, 22);
  const panelGrad = ctx.createLinearGradient(
    panelX,
    panelY,
    panelX + panelW,
    panelY + panelH,
  );
  panelGrad.addColorStop(0, "rgba(15, 23, 42, 0.78)");
  panelGrad.addColorStop(1, "rgba(30, 41, 59, 0.70)");
  ctx.fillStyle = panelGrad;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 60px ${FONT_SCRIPT}`;
  ctx.fillText(
    truncate(ctx, partnerA, panelW * 0.38),
    panelX + panelW * 0.26,
    panelY + 108,
  );
  ctx.fillText(
    truncate(ctx, partnerB, panelW * 0.38),
    panelX + panelW * 0.74,
    panelY + 108,
  );

  drawHeartShape(ctx, panelX + panelW / 2, panelY + 100, 52, "#fb7185", false);

  ctx.textAlign = "left";
  const statY = panelY + 168;
  const statGap = 14;
  const statW = Math.floor((panelW - 64 - statGap * 2) / 3);

  function drawStat(x, label, value) {
    drawRoundedRect(ctx, x, statY, statW, 94, 16);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.stroke();
    ctx.fillStyle = "#cbd5e1";
    ctx.font = `600 16px ${FONT_BODY}`;
    ctx.fillText(label, x + 14, statY + 34);
    ctx.fillStyle = "#f8fafc";
    ctx.font = `700 24px ${FONT_TITLE}`;
    ctx.fillText(value, x + 14, statY + 70);
  }

  drawStat(panelX + 22, partnerLabel, truncate(ctx, partnerB, statW - 26));
  drawStat(panelX + 22 + statW + statGap, sinceLabel, dateText);
  drawStat(
    panelX + 22 + (statW + statGap) * 2,
    togetherLabel,
    String(together ?? "-"),
  );

  return canvas.toBuffer("image/png");
}

export async function renderDivorceCertificate({
  partnerA,
  partnerB,
  marriedAt,
  divorcedAt,
  together,
  labels = {},
  locale = "pt-BR",
}) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  renderBackdrop(ctx);
  drawMainFrame(ctx);

  const title = labels.title ?? "Divorce Certificate";
  const subtitle = labels.subtitle ?? "Union formally dissolved";
  const marriedDateLabel = labels.marriedDate ?? "Marriage date";
  const divorceDateLabel = labels.divorceDate ?? "Divorce date";
  const togetherLabel = labels.together ?? "Time together";

  ctx.fillStyle = "#f8fafc";
  ctx.font = `700 48px ${FONT_TITLE}`;
  ctx.fillText(title, PAD + 36, PAD + 82);

  ctx.fillStyle = "#cbd5e1";
  ctx.font = `600 23px ${FONT_BODY}`;
  ctx.fillText(subtitle, PAD + 38, PAD + 120);

  const panelX = PAD + 36;
  const panelY = PAD + 154;
  const panelW = WIDTH - PAD * 2 - 72;
  const panelH = 292;
  drawRoundedRect(ctx, panelX, panelY, panelW, panelH, 22);
  const panelGrad = ctx.createLinearGradient(
    panelX,
    panelY,
    panelX + panelW,
    panelY + panelH,
  );
  panelGrad.addColorStop(0, "rgba(39, 19, 37, 0.80)");
  panelGrad.addColorStop(1, "rgba(45, 24, 32, 0.72)");
  ctx.fillStyle = panelGrad;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 56px ${FONT_SCRIPT}`;
  ctx.fillText(
    truncate(ctx, partnerA, panelW * 0.38),
    panelX + panelW * 0.26,
    panelY + 102,
  );
  ctx.fillText(
    truncate(ctx, partnerB, panelW * 0.38),
    panelX + panelW * 0.74,
    panelY + 102,
  );

  drawHeartShape(ctx, panelX + panelW / 2, panelY + 92, 50, "#fb7185", true);

  ctx.textAlign = "left";
  const statY = panelY + 156;
  const rowGap = 52;

  function line(label, value, y) {
    ctx.fillStyle = "#fbcfe8";
    ctx.font = `600 21px ${FONT_BODY}`;
    ctx.fillText(`${label}:`, panelX + 26, y);
    ctx.fillStyle = "#f8fafc";
    ctx.font = `700 25px ${FONT_TITLE}`;
    ctx.fillText(value, panelX + 250, y + 1);
  }

  line(marriedDateLabel, formatDateLabel(marriedAt, locale), statY);
  line(divorceDateLabel, formatDateLabel(divorcedAt, locale), statY + rowGap);
  line(togetherLabel, String(together ?? "-"), statY + rowGap * 2);

  return canvas.toBuffer("image/png");
}
