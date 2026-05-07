import { fetchJson } from "./http.js";
import { getSetting, setSetting } from "../lib/storage.js";

const TRYVIA_BASE_URL = "https://tryvia.ptr.red";
const TOKEN_TTL_MS = 6 * 60 * 60_000;
const TOKEN_REFRESH_EARLY_MS = 60 * 60_000;
const TOKEN_REFRESH_MS = TOKEN_TTL_MS - TOKEN_REFRESH_EARLY_MS;
const QUESTION_TTL_MS = 45_000;
const DROP_TTL_MS = 20_000;
const MAX_RECENT_QUESTIONS = 400;

const liveEventsState = {
  quiz: null,
  drop: null,
  schedulerTimeoutId: null,
  tokenMeta: null,
  leaderboard: new Map(),
  recentQuestions: new Map(),
  loaded: false,
};

const HTML_ENTITIES = {
  "&quot;": '"',
  "&#039;": "'",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&ldquo;": '"',
  "&rdquo;": '"',
  "&lsquo;": "'",
  "&rsquo;": "'",
};

function decodeHtml(input) {
  return String(input ?? "")
    .replace(
      /&quot;|&#039;|&amp;|&lt;|&gt;|&ldquo;|&rdquo;|&lsquo;|&rsquo;/g,
      (m) => HTML_ENTITIES[m] ?? m,
    )
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)));
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function makeQuestionKey(item) {
  const category = normalizeText(item?.category ?? "");
  const question = normalizeText(item?.question ?? "");
  const answer = normalizeText(item?.correct_answer ?? "");
  return `${category}|${question}|${answer}`;
}

function getNow() {
  return Date.now();
}

function toPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

async function loadPersistentState() {
  if (liveEventsState.loaded) return;

  const [tokenMeta, leaderboard] = await Promise.all([
    getSetting("liveEvents.tryviaTokenMeta", null).catch(() => null),
    getSetting("liveEvents.leaderboard", null).catch(() => null),
  ]);

  if (tokenMeta && typeof tokenMeta === "object") {
    liveEventsState.tokenMeta = {
      token: String(tokenMeta.token ?? "").trim(),
      generatedAt: Number(tokenMeta.generatedAt ?? 0) || 0,
      refreshAt: Number(tokenMeta.refreshAt ?? 0) || 0,
    };
  }

  if (leaderboard && typeof leaderboard === "object") {
    for (const [userId, points] of Object.entries(leaderboard)) {
      const score = Number(points) || 0;
      if (!userId || score <= 0) continue;
      liveEventsState.leaderboard.set(String(userId), score);
    }
  }

  liveEventsState.loaded = true;
}

async function persistTokenMeta(meta) {
  liveEventsState.tokenMeta = meta;
  await setSetting("liveEvents.tryviaTokenMeta", meta).catch(() => {});
}

async function persistLeaderboard() {
  const data = Object.fromEntries(liveEventsState.leaderboard.entries());
  await setSetting("liveEvents.leaderboard", data).catch(() => {});
}

function getRecentQuestionMap(quiz) {
  if (quiz?.recentQuestions instanceof Map) return quiz.recentQuestions;
  return liveEventsState.recentQuestions;
}

function cleanupRecentQuestions(quiz) {
  const recent = getRecentQuestionMap(quiz);
  const cutoff = getNow() - TOKEN_TTL_MS;
  for (const [key, stamp] of recent.entries()) {
    if (Number(stamp) < cutoff) recent.delete(key);
  }
  while (recent.size > MAX_RECENT_QUESTIONS) {
    const first = recent.keys().next().value;
    if (!first) break;
    recent.delete(first);
  }
}

async function fetchTryviaToken() {
  const data = await fetchJson(
    `${TRYVIA_BASE_URL}/api_token.php?command=request`,
  );
  const token = String(data?.token ?? "").trim();
  if (!token) throw new Error("token inválido da Tryvia");
  const generatedAt = getNow();
  const meta = {
    token,
    generatedAt,
    refreshAt: generatedAt + TOKEN_REFRESH_MS,
  };
  await persistTokenMeta(meta);
  return token;
}

async function getTryviaToken(forceRefresh = false) {
  await loadPersistentState();
  const now = getNow();
  const current = liveEventsState.tokenMeta;

  if (!forceRefresh && current?.token && now < Number(current.refreshAt ?? 0)) {
    return current.token;
  }

  return fetchTryviaToken();
}

async function fetchTryviaQuestion(quiz) {
  let token = await getTryviaToken().catch(() => "");
  const params = new URLSearchParams();
  params.set("amount", "1");
  if (token) params.set("token", token);

  let attempts = 0;
  while (attempts < 5) {
    attempts += 1;
    const data = await fetchJson(
      `${TRYVIA_BASE_URL}/api.php?${params.toString()}`,
    );

    const code = Number(data?.response_code ?? 0);
    if (code === 3 || code === 4) {
      token = await getTryviaToken(true).catch(() => "");
      if (token) params.set("token", token);
      else params.delete("token");
      continue;
    }

    const item = Array.isArray(data?.results) ? data.results[0] : null;
    if (!item?.question || !item?.correct_answer) {
      throw new Error("resposta inválida da Tryvia");
    }

    const key = makeQuestionKey(item);
    const recent = getRecentQuestionMap(quiz);
    cleanupRecentQuestions(quiz);

    if (recent.has(key)) {
      continue;
    }

    recent.set(key, getNow());
    return item;
  }

  throw new Error("não foi possível obter pergunta inédita");
}

function clearQuizTimer() {
  if (liveEventsState.quiz?.timeoutId) {
    clearTimeout(liveEventsState.quiz.timeoutId);
  }
}

function clearDropTimer() {
  if (liveEventsState.drop?.timeoutId) {
    clearTimeout(liveEventsState.drop.timeoutId);
  }
}

function updateLeaderboard(userId, points) {
  const uid = String(userId ?? "").trim();
  if (!uid) return;
  const score = Number(points) || 0;
  if (score <= 0) return;
  const current = Number(liveEventsState.leaderboard.get(uid) ?? 0) || 0;
  liveEventsState.leaderboard.set(uid, current + score);
  void persistLeaderboard();
}

function buildTopLines(bot, limit = 10) {
  const sorted = [...liveEventsState.leaderboard.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(1, toPositiveInt(limit, 10)));

  if (!sorted.length) return [];
  return sorted.map(([uid, score], index) => {
    const who =
      bot?._roomUsersMap?.[uid] ??
      bot?._roomUsers?.get?.(uid)?.displayName ??
      bot?._roomUsers?.get?.(uid)?.username ??
      uid;
    return `#${index + 1} ${who}: ${score}`;
  });
}

export function getLiveEventStatus() {
  return {
    hasQuiz: Boolean(liveEventsState.quiz),
    hasDrop: Boolean(liveEventsState.drop),
    quiz: liveEventsState.quiz,
    drop: liveEventsState.drop,
  };
}

export function getLiveEventTop(bot, limit = 10) {
  return buildTopLines(bot, limit);
}

export async function startQuizEvent(bot, options = {}) {
  await loadPersistentState();
  if (liveEventsState.quiz) return { ok: false, reason: "active" };

  const quizTtlMs = toPositiveInt(bot.cfg.quizWindowMs, QUESTION_TTL_MS);

  const questionData = await fetchTryviaQuestion(
    liveEventsState.quiz ?? {
      recentQuestions: liveEventsState.recentQuestions,
    },
  );

  const question = decodeHtml(questionData.question);
  const correct = decodeHtml(questionData.correct_answer);
  const incorrect = Array.isArray(questionData.incorrect_answers)
    ? questionData.incorrect_answers.map((ans) => decodeHtml(ans))
    : [];
  const optionsList = shuffle([correct, ...incorrect]);
  const labeled = optionsList.map((opt, idx) => `${idx + 1}) ${opt}`);

  // Reward by difficulty
  const difficulty = String(questionData.difficulty ?? "")
    .toLowerCase()
    .trim();
  const quizReward =
    difficulty === "easy"
      ? toPositiveInt(bot.cfg.quizRewardEasy, bot.cfg.quizRewardPoints ?? 3)
      : difficulty === "hard"
        ? toPositiveInt(bot.cfg.quizRewardHard, bot.cfg.quizRewardPoints ?? 10)
        : toPositiveInt(
            bot.cfg.quizRewardMedium,
            bot.cfg.quizRewardPoints ?? 5,
          );

  const quiz = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: getNow(),
    expiresAt: getNow() + quizTtlMs,
    answer: correct,
    answerNorm: normalizeText(correct),
    reward: quizReward,
    question,
    options: labeled,
    claimed: false,
    attemptedUsers: new Set(),
    recentQuestions:
      liveEventsState.quiz?.recentQuestions instanceof Map
        ? liveEventsState.quiz.recentQuestions
        : new Map(),
    timeoutId: null,
    source: options.source ?? "manual",
  };

  cleanupRecentQuestions(quiz);
  clearQuizTimer();
  liveEventsState.quiz = quiz;

  const _getMsgId = (res) => {
    const msg = res?.data?.data?.message ?? res?.data?.message ?? null;
    return msg?.id ?? res?.data?.data?.id ?? res?.data?.id ?? null;
  };
  const _deleteMs = Number(bot.cfg.deleteCommandMessagesDelayMs ?? 0);

  quiz.timeoutId = setTimeout(() => {
    if (!liveEventsState.quiz || liveEventsState.quiz.id !== quiz.id) return;
    liveEventsState.quiz = null;
    bot
      .sendChat(
        bot.t("commands.fun.evento.quizExpired", {
          answer: correct,
        }),
      )
      .then((res) => {
        const _deleteMs = Number(bot.cfg.liveEventsResultDeleteMs ?? 0);
        if (_deleteMs > 0) {
          const id = _getMsgId(res);
          if (id) bot.scheduleMessageDelete(id, _deleteMs);
        }
      })
      .catch(() => {});
  }, quizTtlMs);

  const seconds = Math.max(1, Math.round(quizTtlMs / 1000));
  const noReward = options.noReward === true;

  // line 1: header (sem prêmio se for trivia sem pontos)
  const r1 = await bot.sendChat(
    bot.t(
      noReward
        ? "commands.fun.evento.quizStartedNoReward"
        : "commands.fun.evento.quizStarted",
      {
        seconds,
        reward: quizReward,
        category: decodeHtml(questionData.category ?? ""),
        difficulty: decodeHtml(questionData.difficulty ?? ""),
      },
    ),
  );
  if (_deleteMs > 0) {
    const id = _getMsgId(r1);
    if (id) bot.scheduleMessageDelete(id, quizTtlMs);
  }

  // line 2: question
  const r2 = await bot.sendChat(
    bot.t("commands.fun.evento.quizQuestion", { question }),
  );
  if (_deleteMs > 0) {
    const id = _getMsgId(r2);
    if (id) bot.scheduleMessageDelete(id, quizTtlMs);
  }

  // lines 3+: one option per message
  for (const opt of labeled) {
    const ro = await bot.sendChat(
      bot.t("commands.fun.evento.quizOption", { option: opt }),
    );
    if (_deleteMs > 0) {
      const id = _getMsgId(ro);
      if (id) bot.scheduleMessageDelete(id, quizTtlMs);
    }
  }

  return { ok: true, quiz };
}

export async function startDropEvent(bot, options = {}) {
  await loadPersistentState();
  if (liveEventsState.drop) return { ok: false, reason: "active" };

  const reward = toPositiveInt(bot.cfg.dropRewardPoints, 3);
  const ttlMs = toPositiveInt(bot.cfg.dropWindowMs, DROP_TTL_MS);
  const code = Math.random().toString(36).slice(2, 7).toUpperCase();

  const drop = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: getNow(),
    expiresAt: getNow() + ttlMs,
    reward,
    code,
    claimed: false,
    timeoutId: null,
    source: options.source ?? "manual",
  };

  clearDropTimer();
  liveEventsState.drop = drop;

  const _getMsgId = (res) => {
    const msg = res?.data?.data?.message ?? res?.data?.message ?? null;
    return msg?.id ?? res?.data?.data?.id ?? res?.data?.id ?? null;
  };
  const _deleteMs = Number(bot.cfg.deleteCommandMessagesDelayMs ?? 0);

  drop.timeoutId = setTimeout(() => {
    if (!liveEventsState.drop || liveEventsState.drop.id !== drop.id) return;
    liveEventsState.drop = null;
    bot
      .sendChat(bot.t("commands.fun.evento.dropExpired"))
      .then((res) => {
        const _deleteMs = Number(bot.cfg.liveEventsResultDeleteMs ?? 0);
        if (_deleteMs > 0) {
          const id = _getMsgId(res);
          if (id) bot.scheduleMessageDelete(id, _deleteMs);
        }
      })
      .catch(() => {});
  }, ttlMs);

  const seconds = Math.max(1, Math.round(ttlMs / 1000));
  const rd = await bot.sendChat(
    bot.t("commands.fun.evento.dropStarted", {
      seconds,
      reward,
      code,
    }),
  );
  if (_deleteMs > 0) {
    const id = _getMsgId(rd);
    if (id) bot.scheduleMessageDelete(id, ttlMs);
  }

  return { ok: true, drop };
}

async function awardWinner(
  bot,
  userId,
  sender,
  points,
  source,
  msgKey,
  vars = {},
) {
  const identity = bot._getUserIdentity(userId, sender);
  await bot.awardEconomyPoints(userId, points, identity, {
    applyVipMultiplier: false,
    source,
  });
  updateLeaderboard(userId, points);
  const res = await bot.sendChat(
    bot.t(msgKey, {
      user: `@${sender?.displayName ?? sender?.username ?? userId}`,
      reward: points,
      ...vars,
    }),
  );
  const deleteMs = Number(bot.cfg.liveEventsResultDeleteMs ?? 0);
  if (deleteMs > 0) {
    const msg = res?.data?.data?.message ?? res?.data?.message ?? null;
    const id = msg?.id ?? res?.data?.data?.id ?? res?.data?.id ?? null;
    if (id) bot.scheduleMessageDelete(id, deleteMs);
  }
}

export async function tryClaimDrop(bot, sender, messageText = "") {
  const drop = liveEventsState.drop;
  if (!drop || drop.claimed || getNow() > drop.expiresAt) return false;

  const content = normalizeText(messageText);
  const peguei = normalizeText(`peguei ${drop.code}`);
  if (content !== peguei) return false;

  const userId = String(sender?.userId ?? "").trim();
  if (!userId || bot.isBotUser(userId)) return false;

  drop.claimed = true;
  clearDropTimer();
  liveEventsState.drop = null;

  await awardWinner(
    bot,
    userId,
    sender,
    drop.reward,
    "event-drop",
    "commands.fun.evento.dropWon",
    { code: drop.code },
  );
  return true;
}

export async function tryAnswerQuiz(bot, sender, messageText = "") {
  const quiz = liveEventsState.quiz;
  if (!quiz || quiz.claimed || getNow() > quiz.expiresAt) return false;

  const userId = String(sender?.userId ?? "").trim();
  if (!userId || bot.isBotUser(userId)) return false;

  if (!(quiz.attemptedUsers instanceof Set)) {
    quiz.attemptedUsers = new Set();
  }
  if (quiz.attemptedUsers.has(userId)) return false;

  const contentRaw = String(messageText ?? "").trim();
  if (!contentRaw) return false;

  let candidate = contentRaw;
  const prefix = `${bot.cfg.cmdPrefix ?? "!"}trivia`;
  const prefixNorm = normalizeText(prefix);
  const contentNorm = normalizeText(contentRaw);
  const usedTriviaCommand = contentNorm.startsWith(prefixNorm);
  if (usedTriviaCommand) {
    const cut = contentRaw.slice(prefix.length).trim();
    if (!cut) return false;
    candidate = cut;
  }

  const normalizedOptionTexts = (Array.isArray(quiz.options) ? quiz.options : [])
    .map((opt) => String(opt ?? "").replace(/^\s*\d+\)\s*/, ""))
    .map((opt) => normalizeText(opt))
    .filter(Boolean);
  const validOptionNorms = new Set(normalizedOptionTexts);

  let candidateNorm = normalizeText(candidate);
  const isNumericCandidate = /^\d+$/.test(candidate.trim());
  const selectedOption = isNumericCandidate
    ? Number.parseInt(candidate, 10)
    : Number.NaN;
  if (
    Number.isInteger(selectedOption) &&
    selectedOption >= 1 &&
    selectedOption <= (Array.isArray(quiz.options) ? quiz.options.length : 0)
  ) {
    const rawOption = String(quiz.options[selectedOption - 1] ?? "");
    const optionText = rawOption.replace(/^\s*\d+\)\s*/, "");
    candidateNorm = normalizeText(optionText);
  }

  // Ignore regular chat messages during quiz; only explicit/valid answer shapes count as attempts.
  const isValidNumericOption =
    Number.isInteger(selectedOption) &&
    selectedOption >= 1 &&
    selectedOption <= (Array.isArray(quiz.options) ? quiz.options.length : 0);
  const isKnownOptionText = validOptionNorms.has(candidateNorm);
  const shouldCountAttempt =
    usedTriviaCommand || isValidNumericOption || isKnownOptionText;

  if (!shouldCountAttempt) return false;

  if (candidateNorm !== quiz.answerNorm) {
    quiz.attemptedUsers.add(userId);
    return false;
  }

  quiz.claimed = true;
  clearQuizTimer();
  liveEventsState.quiz = null;

  await awardWinner(
    bot,
    userId,
    sender,
    quiz.reward,
    "event-quiz",
    "commands.fun.evento.quizWon",
    {
      answer: quiz.answer,
    },
  );
  return true;
}

export async function revealQuizAnswer() {
  const quiz = liveEventsState.quiz;
  if (!quiz || getNow() > quiz.expiresAt) return null;
  return quiz.answer;
}

export function stopAutoLiveEvents() {
  if (liveEventsState.schedulerTimeoutId) {
    clearTimeout(liveEventsState.schedulerTimeoutId);
  }
  liveEventsState.schedulerTimeoutId = null;
}

function scheduleNext(bot) {
  stopAutoLiveEvents();
  if (!bot.cfg.autoEventsEnabled) return;

  const minMs = toPositiveInt(bot.cfg.autoEventsMinIntervalMs, 15 * 60_000);
  const maxMs = toPositiveInt(
    bot.cfg.autoEventsMaxIntervalMs,
    Math.max(minMs, 30 * 60_000),
  );

  const delay =
    minMs >= maxMs
      ? minMs
      : minMs + Math.floor(Math.random() * (maxMs - minMs + 1));

  liveEventsState.schedulerTimeoutId = setTimeout(async () => {
    liveEventsState.schedulerTimeoutId = null;
    try {
      if (!bot.cfg.autoEventsEnabled) return;
      if (typeof bot.isPaused === "function" && bot.isPaused()) return;
      if (liveEventsState.quiz || liveEventsState.drop) return;

      const quizChance = Math.max(
        0,
        Math.min(100, Number(bot.cfg.autoQuizChancePct ?? 60) || 60),
      );
      const roll = Math.floor(Math.random() * 100);
      if (roll < quizChance) {
        await startQuizEvent(bot, { source: "auto" });
      } else {
        await startDropEvent(bot, { source: "auto" });
      }
    } catch {
      // best-effort scheduler
    } finally {
      scheduleNext(bot);
    }
  }, delay);
}

export function startAutoLiveEvents(bot) {
  scheduleNext(bot);
}
