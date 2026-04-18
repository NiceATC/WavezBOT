import {
  revealQuizAnswer,
  startQuizEvent,
  tryAnswerQuiz,
} from "../../helpers/live-events.js";

export default {
  name: "trivia",
  descriptionKey: "commands.fun.trivia.description",
  usageKey: "commands.fun.trivia.usage",
  cooldown: 8000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { args, t, reply, bot, sender, rawArgs } = ctx;
    const action = String(args[0] ?? "")
      .trim()
      .toLowerCase();

    if (["answer", "reveal", "resposta"].includes(action)) {
      const answer = await revealQuizAnswer();
      if (!answer) {
        await reply(t("commands.fun.trivia.noActive"));
        return;
      }
      await reply(t("commands.fun.trivia.answer", { answer }));
      return;
    }

    if (
      rawArgs &&
      action &&
      !["answer", "reveal", "resposta"].includes(action)
    ) {
      const ok = await tryAnswerQuiz(bot, sender, rawArgs);
      if (!ok) {
        await reply(t("commands.fun.trivia.noActive"));
      }
      return;
    }

    try {
      const started = await startQuizEvent(bot, {
        source: "trivia",
        noReward: true,
      });
      if (!started?.ok) {
        await reply(t("commands.fun.evento.alreadyRunning"));
        return;
      }
    } catch (err) {
      await reply(t("commands.fun.trivia.error", { error: err.message }));
    }
  },
};
