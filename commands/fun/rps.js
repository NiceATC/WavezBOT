import { pickRandom } from "../../helpers/random.js";

const CHOICES = ["rock", "paper", "scissors"];

function normalizeChoice(value) {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  if (["rock", "r", "pedra"].includes(text)) return "rock";
  if (["paper", "p", "papel"].includes(text)) return "paper";
  if (["scissors", "s", "tesoura", "tesouras"].includes(text))
    return "scissors";
  return null;
}

function getOutcome(userChoice, botChoice) {
  if (userChoice === botChoice) return "draw";
  if (
    (userChoice === "rock" && botChoice === "scissors") ||
    (userChoice === "paper" && botChoice === "rock") ||
    (userChoice === "scissors" && botChoice === "paper")
  ) {
    return "win";
  }
  return "lose";
}

export default {
  name: "rps",
  aliases: ["jokenpo"],
  descriptionKey: "commands.fun.rps.description",
  usageKey: "commands.fun.rps.usage",
  cooldown: 3000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { args, t, reply } = ctx;
    const userChoice = normalizeChoice(args[0]);
    if (!userChoice) {
      await reply(t("commands.fun.rps.usageMessage"));
      return;
    }

    const botChoice = pickRandom(CHOICES);
    const result = getOutcome(userChoice, botChoice);

    await reply(
      t("commands.fun.rps.reply", {
        user: t(`commands.rps.choice.${userChoice}`),
        bot: t(`commands.rps.choice.${botChoice}`),
        result: t(`commands.rps.result.${result}`),
      }),
    );
  },
};
