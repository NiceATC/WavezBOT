export default {
  name: "ids",
  aliases: ["id", "userid"],
  description: "Mostra IDs do usuario atual ou de outro usuario na sala.",
  usage: "!ids [usuario]",
  cooldown: 3000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, args, sender, reply, mention, mentionUser } = ctx;
    const targetInput = String(args[0] ?? "").trim();

    let target = null;
    if (targetInput) {
      target = bot.findRoomUser(targetInput);
      if (!target) {
        await reply(`Usuario nao encontrado: ${mention(targetInput)}`);
        return;
      }
    } else {
      target = bot.findRoomUser(sender.username ?? sender.displayName ?? "");
      if (!target && sender.userId != null) {
        target = {
          userId: String(sender.userId),
          publicId: bot.getRoomUserPublicId(sender.userId),
          username: sender.username ?? null,
          displayName: sender.displayName ?? sender.username ?? null,
          role: sender.senderRole ?? "user",
        };
      }
    }

    if (!target?.userId) {
      await reply("Nao consegui localizar os IDs desse usuario.");
      return;
    }

    const publicId =
      target.publicId ?? bot.getRoomUserPublicId(target.userId) ?? "-";
    const role = target.role ?? "user";
    await reply(
      `${mentionUser(target, targetInput || target.displayName || target.username || target.userId)} | userId: ${target.userId} | publicId: ${publicId} | role: ${role}`,
    );
  },
};
