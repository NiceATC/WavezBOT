import { fetchJson } from "../../helpers/http.js";

const TRIVIA_URL = "https://opentdb.com/api.php?amount=1&type=multiple";
const TRIVIA_TTL_MS = 5 * 60_000;
let lastTrivia = null;

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

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default {
  name: "trivia",
  descriptionKey: "commands.fun.trivia.description",
  usageKey: "commands.fun.trivia.usage",
  cooldown: 8000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { args, t, reply } = ctx;
    const action = String(args[0] ?? "")
      .trim()
      .toLowerCase();

    if (["answer", "reveal", "resposta"].includes(action)) {
      if (!lastTrivia || Date.now() - lastTrivia.at > TRIVIA_TTL_MS) {
        await reply(t("commands.fun.trivia.noActive"));
        return;
      }
      await reply(t("commands.fun.trivia.answer", { answer: lastTrivia.answer }));
      return;
    }

    try {
      const data = await fetchJson(TRIVIA_URL);
      const item = Array.isArray(data?.results) ? data.results[0] : null;
      if (!item?.question || !item?.correct_answer) {
        await reply(t("commands.fun.trivia.noQuestion"));
        return;
      }

      const question = decodeHtml(item.question);
      const correct = decodeHtml(item.correct_answer);
      const incorrect = Array.isArray(item.incorrect_answers)
        ? item.incorrect_answers.map((ans) => decodeHtml(ans))
        : [];
      const options = shuffle([correct, ...incorrect]);
      const labeled = options.map((opt, idx) => `${idx + 1}) ${opt}`);

      lastTrivia = {
        question,
        answer: correct,
        at: Date.now(),
      };

      await reply(
        `${t("commands.fun.trivia.question", { question })} ${t(
          "commands.fun.trivia.options",
          {
            options: labeled.join(" | "),
          },
        )}`,
      );
    } catch (err) {
      await reply(t("commands.fun.trivia.error", { error: err.message }));
    }
  },
};
