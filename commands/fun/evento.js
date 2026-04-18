import {
  getLiveEventStatus,
  getLiveEventTop,
  revealQuizAnswer,
  startDropEvent,
  startQuizEvent,
  tryClaimDrop,
} from "../../helpers/live-events.js";

function toSender(ctx) {
  return {
    userId: ctx?.sender?.userId ?? null,
    username: ctx?.sender?.username ?? null,
    displayName: ctx?.sender?.displayName ?? ctx?.sender?.username ?? null,
  };
}

export default {
  name: "evento",
  aliases: ["event"],
  minRole: "manager",
  descriptionKey: "commands.fun.evento.description",
  usageKey: "commands.fun.evento.usage",
  cooldown: 3000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { args, reply, t, bot } = ctx;
    const action = String(args[0] ?? "")
      .trim()
      .toLowerCase();

    if (!action || action === "status") {
      const status = getLiveEventStatus();
      if (!status.hasQuiz && !status.hasDrop) {
        await reply(t("commands.fun.evento.idle"));
        return;
      }

      if (status.hasQuiz) {
        const seconds = Math.max(
          0,
          Math.ceil((status.quiz.expiresAt - Date.now()) / 1000),
        );
        await reply(t("commands.fun.evento.quizActive", { seconds }));
        return;
      }

      if (status.hasDrop) {
        const seconds = Math.max(
          0,
          Math.ceil((status.drop.expiresAt - Date.now()) / 1000),
        );
        await reply(
          t("commands.fun.evento.dropActive", {
            seconds,
            code: status.drop.code,
          }),
        );
      }
      return;
    }

    if (action === "quiz") {
      const res = await startQuizEvent(bot, { source: "manual" }).catch(
        (err) => {
          throw err;
        },
      );
      if (!res?.ok) {
        await reply(t("commands.fun.evento.alreadyRunning"));
      }
      return;
    }

    if (action === "drop") {
      const res = await startDropEvent(bot, { source: "manual" }).catch(
        (err) => {
          throw err;
        },
      );
      if (!res?.ok) {
        await reply(t("commands.fun.evento.alreadyRunning"));
      }
      return;
    }

    if (action === "join") {
      const ok = await tryClaimDrop(
        bot,
        toSender(ctx),
        `${bot.cfg.cmdPrefix ?? "!"}evento join`,
      );
      if (!ok) {
        await reply(t("commands.fun.evento.noDrop"));
      }
      return;
    }

    if (action === "answer" || action === "resposta" || action === "reveal") {
      const answer = await revealQuizAnswer();
      if (!answer) {
        await reply(t("commands.fun.evento.noQuiz"));
        return;
      }
      await reply(t("commands.fun.evento.answer", { answer }));
      return;
    }

    if (action === "top") {
      const top = getLiveEventTop(bot, Number(args[1]) || 10);
      if (!top.length) {
        await reply(t("commands.fun.evento.topEmpty"));
        return;
      }
      await reply(t("commands.fun.evento.top", { lines: top.join(" | ") }));
      return;
    }

    await reply(t("commands.fun.evento.usageMessage"));
  },
};
