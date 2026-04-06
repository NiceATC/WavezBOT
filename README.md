# Wavez Chatbot

Standalone chatbot for the Wavez.fm platform with modular commands/events,
SQLite persistence, and full API/pipeline wrappers. Responds to chat commands,
auto-woots tracks, greets new users, and replies when @mentioned.

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Configure credentials
cp .env.example .env
# Fill in BOT_EMAIL and BOT_PASSWORD in .env

# 3. Configure room + features
# Copy config.example.json to config.json if needed, then edit
# (room, feature flags, messages, etc.)

# 4. Run
npm start

# Auto-restart on file changes (Node ≥ 18)
# Also starts the dashboard UI
npm run dev
```

---

## Dashboard (Next.js)

The dashboard lives in the `dashboard/` folder and talks to the bot's built-in
HTTP/WebSocket server.

1. Add the dashboard settings to `.env`:

```bash
DASHBOARD_ENABLED=true
DASHBOARD_BIND=127.0.0.1
DASHBOARD_PASSWORD=change_me
DASHBOARD_API_KEY=change_me_too
DASHBOARD_JWT_SECRET=change_me_super_secret
DASHBOARD_PUBLIC_URL=http://localhost:3000
DASHBOARD_PORT=3100
DASHBOARD_ALLOWED_ORIGINS=http://localhost:3000
```

Optional: enable raw SQL execution in the admin DB editor with
`DASHBOARD_ALLOW_SQL=true`.

Optional: enable command/event file editing with
`DASHBOARD_ALLOW_FILE_EDIT=true`.

2. Install and run the dashboard:

```bash
cd dashboard
npm install
npm run dev
```

If you run the dashboard from another host or port, copy `dashboard/.env.example`
to `dashboard/.env.local` and set `NEXT_PUBLIC_DASHBOARD_API` accordingly.
Make sure `NEXT_PUBLIC_DASHBOARD_API_KEY` matches `DASHBOARD_API_KEY`.

3. Open the UI at `http://localhost:3000` and log in with the password.

When `DASHBOARD_ENABLED=true`, the `!help` command replies with
`DASHBOARD_PUBLIC_URL` instead of printing the command list in chat.

---

## Project structure

```
WavezBOT/
  index.js               ← entry point
  helpers/               ← shared helpers (fs, http, waitlist, etc.)
    banner.js            ← ASCII logo
    errors.js            ← retry error detection
    imgbb.js             ← ImgBB upload helper
    points.js            ← fixed-point points helpers
    profile-card.js      ← profile/balance image renderer
    random.js            ← random helpers
    roulette.js          ← roulette state + close helper
    tenor.js             ← Tenor GIF helper
  locales/
    pt-BR.json            ← Portuguese strings
    en-US.json            ← English strings
  lib/
    api/                 ← complete API call wrappers (all resources)
    bot.js               ← WavezBot core (pipeline, REST, dispatch logic)
    config.js            ← .env loader / config schema
    permissions.js       ← role hierarchy & helpers
    settings.js          ← runtime settings helpers
    storage.js           ← SQLite persistence
    version.js           ← bot version
    pipeline/            ← complete pipeline wrappers (events + actions)
  commands/
    index.js             ← CommandRegistry (auto-load, cooldowns, role checks)
    core/
      help.js            — !help [command]
      ping.js            — !ping
      start.js           — !start
      stop.js            — !stop
      reload.js          — !reload
      reloadcmd.js       — !reloadcmd
    info/
      active.js          — !active
      autowoot.js        — !autowoot-link
      ba.js              — !ba
      jointime.js        — !jointime
      lastseen.js        — !lastseen
      link.js            — !link
      mediaid.js         — !mediaid
      nowplaying.js      — !np / !nowplaying
      queue.js           — !queue
      stats.js           — !stats
    music/
      woot.js            — !woot
      blacklist.js       — !blacklist
      togglebl.js        — !togglebl
      motd.js            — !motd / !togglemotd
    mod/
      autoskip.js        — !autoskip
      afkremoval.js      — !afkremoval
      afklimit.js        — !afklimit
      afkreset.js        — !afkreset
      afktime.js         — !afktime
      skip.js            — !skip
      lock.js            — !lock / !unlock
      remove.js          — !remove
      move.js            — !move
      swap.js            — !swap
      timeguard.js       — !timeguard / !maxlength
      kick.js            — !kick
      mute.js            — !mute / !unmute
      ban.js             — !ban / !unban
    queue/
      dc.js              — !dc
      savequeue.js       — !savequeue
    system/
      autowoot.js        — !autowoot
      settings.js        — !settings
      welcome.js         — !welcome
    fun/
      eightball.js       — !8ball / !ask
      cookie.js          — !cookie
      duel.js            — !duel / !accept / !recuse / !duelmute
      ghostbuster.js     — !ghostbuster
      gif.js             — !gif / !giphy
      roulette.js        — !roulette / !join / !leave
      thor.js            — !thor
      fortune.js         — !fortune
    economy/
      balance.js         — !balance
      transfer.js        — !transfer
      economy.js         — !economy
      top.js             — !top
    xp/
      profile.js         — !perfil
      xptop.js           — !xptop
  events/
    index.js             ← EventRegistry (auto-load, cooldowns, enable/disable)
    core/
      greet.js           — welcome message on user join
    economy/
      chatReward.js       — points/XP for chat messages
      djReward.js         — points/XP for DJs
      voteReward.js       — points/XP for woots
      grabReward.js       — points/XP for grabs
    moderation/
      afkRemoval.js      — remove AFK users from waitlist
      mediaCheck.js       — skip age-restricted/blocked tracks
      timeGuard.js       — skip long tracks
    queue/
      waitlistSnapshot.js — snapshot for !dc
```

---

## Commands (summary)

Use `!help` in chat to see the full list with aliases and usage.

- Core: `!help`, `!ping`, `!start`, `!stop`, `!reload`, `!reloadcmd`
- Info: `!active`, `!lastseen`, `!jointime`, `!link`, `!mediaid`, `!autowoot-link`, `!np`/`!nowplaying`, `!stats`, `!queue`, `!lastplayed`, `!history`, `!topwoot`, `!topdj`, `!topsongs`, `!rank`
- Music: `!woot`, `!blacklist` (add/remove/list/info), `!togglebl`, `!motd`, `!togglemotd`, `!voteskip`
- Moderation: `!autoskip`, `!afkremoval`, `!afklimit`, `!afkreset`, `!afktime`, `!duelmute`, `!skip`, `!lock`, `!unlock`, `!remove`, `!move`, `!swap`, `!timeguard`, `!maxlength`, `!kick`, `!mute`, `!unmute`, `!ban`, `!unban`
- Queue: `!dc`, `!savequeue`
- System: `!autowoot`, `!settings`, `!welcome`
- Fun: `!ba`, `!fortune`, `!duel`, `!accept`, `!recuse`, `!8ball`/`!ask`, `!cookie`, `!ghostbuster`, `!gif`/`!giphy`, `!roulette`/`!join`/`!leave`, `!thor`, `!hug`, `!slap`, `!ship`, `!coin`, `!dice`, `!roll`, `!rps`, `!trivia`, `!roast`, `!compliment`, `!fact`, `!joke`, `!meme`, `!hack`, `!virus`, `!summon`, `!explode`, `!fakeban`
- Economy: `!balance`, `!transfer`, `!economy`, `!top`, `!casino`, `!daily`, `!shop`, `!buy`, `!work`, `!steal`
- XP: `!perfil`, `!xptop`

> **Role order (lowest → highest):** user · resident_dj · bouncer · manager · cohost · host  
> Both the bot **and** the sender must hold the required role for moderation commands to work.

---

## Adding a command

Create `commands/<category>/mycommand.js` — the `CommandRegistry` auto-loads it on startup (recursively):

```js
export default {
  name: "greet",
  aliases: ["oi", "hello"],
  descriptionKey: "commands.greet.description",
  usageKey: "commands.greet.usage",
  cooldown: 5_000, // ms between uses per user (default: 3 000)
  // minRole: "bouncer", // optional: minimum role required

  async execute(ctx) {
    // ctx.bot        — WavezBot instance
    // ctx.api        — @wavezfm/api REST client
    // ctx.apiCalls   — lib/api wrapper helpers
    // ctx.args       — string[] (words after command name)
    // ctx.rawArgs    — string after command name, unsplit
    // ctx.message    — full chat message
    // ctx.sender     — { userId, username, displayName }
    // ctx.senderRole / ctx.senderRoleLevel
    // ctx.botRole    / ctx.botRoleLevel
    // ctx.room       — room slug
    // ctx.reply(txt) — send a chat message

    await ctx.reply(
      ctx.t("commands.greet.reply", {
        name: ctx.sender.username ?? "amigo",
      }),
    );
  },
};
```

`description` / `usage` are still supported as fallbacks, but `descriptionKey` / `usageKey`
are recommended for i18n.

---

## Adding an event handler

Create `events/<category>/myevent.js` — the `EventRegistry` auto-loads it on startup (recursively):

```js
import { Events } from "../../lib/wavez-events.js";

export default {
  name: "my-event",
  descriptionKey: "events.myEvent.description",
  enabled: true, // default enabled state

  event: Events.ROOM_USER_JOIN,
  // events: [Events.ROOM_USER_JOIN, Events.ROOM_USER_LEAVE],  // or multiple

  // Optional cooldown (ms). Can be a function for config-driven values:
  cooldown: 60_000,
  // cooldown: (ctx) => ctx.bot.cfg.someConfigField,
  cooldownScope: "user", // "user" (per-user) or "global" (room-wide)

  async handle(ctx, data) {
    // ctx.bot        — WavezBot instance
    // ctx.api        — @wavezfm/api REST client
    // ctx.room       — room slug
    // ctx.reply(txt) — send a chat message
    // data           — raw pipeline event payload

    await ctx.reply(
      ctx.t("events.myEvent.welcome", {
        name: data.displayName ?? "stranger",
      }),
    );
  },
};
```

Toggle at runtime without restarting:

```js
bot.events.enable("my-event");
bot.events.disable("my-event");
```

---

## Configuration

### Secrets (`.env`)

| Variable        | Required | Description                             |
| --------------- | -------- | --------------------------------------- |
| `BOT_EMAIL`     | yes      | Bot account email                       |
| `BOT_PASSWORD`  | yes      | Bot account password                    |
| `IMGBB_API_KEY` | no       | ImgBB uploads for profile/balance cards |

### Settings (`config.json`)

Defaults below are from `config.example.json`.

| Key                                 | Default                                | Description                                            |
| ----------------------------------- | -------------------------------------- | ------------------------------------------------------ |
| `room`                              | _(required)_                           | Room slug to join                                      |
| `roomUrl`                           | `https://wavez.fm/room/{room}`         | Room link template used by the dashboard               |
| `locale`                            | `pt-BR`                                | Default locale (`pt-BR` or `en-US`)                    |
| `apiUrl`                            | `https://wavez.fm/api`                 | REST API base URL                                      |
| `cmdPrefix`                         | `!`                                    | Command prefix character                               |
| `autoWoot`                          | `true`                                 | Auto-woot every new track                              |
| `botMessage`                        | `"Oi! Sou um bot…"`                    | Reply when @mentioned; leave empty to disable          |
| `botMentionCooldownMs`              | `30000`                                | Min ms between mention replies                         |
| `greetEnabled`                      | `true`                                 | Send welcome message on user join                      |
| `greetMessage`                      | `"🎵 Bem-vindo(a) à sala, @{name}!"`   | Welcome template (`{name}` / `{username}`)             |
| `greetBackMessage`                  | `"🎵 Bem-vindo(a) de volta, @{name}!"` | Welcome-back template for returning users              |
| `greetCooldownMs`                   | `3600000`                              | Per-user cooldown for greets (default: 1 hour)         |
| `motdEnabled`                       | `false`                                | Enable MOTD                                            |
| `motdInterval`                      | `5`                                    | Songs between MOTD messages                            |
| `motd`                              | `"Mensagem do dia"`                    | MOTD content                                           |
| `intervalMessages`                  | `[]`                                   | Interval messages list                                 |
| `messageInterval`                   | `5`                                    | Songs between interval messages                        |
| `dcWindowMin`                       | `10`                                   | Minutes allowed to restore DC position                 |
| `blacklistEnabled`                  | `true`                                 | Enable track blacklist                                 |
| `timeGuardEnabled`                  | `false`                                | Enable time guard                                      |
| `maxSongLengthMin`                  | `10`                                   | Max song length in minutes                             |
| `autoSkipEnabled`                   | `false`                                | Enable auto-skip for stalled tracks                    |
| `afkRemovalEnabled`                 | `false`                                | Enable AFK removal from the waitlist                   |
| `afkLimitMin`                       | `60`                                   | Minutes of inactivity before AFK removal               |
| `duelMuteMin`                       | `5`                                    | Duel loser mute duration in minutes                    |
| `economyEnabled`                    | `true`                                 | Enable economy rewards                                 |
| `economyChatPoints`                 | `0.2`                                  | Points per rewarded chat message                       |
| `economyChatCooldownMs`             | `90000`                                | Min ms between chat rewards per user                   |
| `economyDjPoints`                   | `2`                                    | Points for playing a track                             |
| `economyWootPoints`                 | `0.1`                                  | Points per woot                                        |
| `economyGrabPoints`                 | `0.2`                                  | Points per grab                                        |
| `economyOnlinePointsPerHour`        | `0.25`                                 | Points per hour online                                 |
| `economyTransferMin`                | `5`                                    | Minimum transfer amount                                |
| `xpEnabled`                         | `true`                                 | Enable XP rewards                                      |
| `xpChatPoints`                      | `0.2`                                  | XP per rewarded chat message                           |
| `xpChatCooldownMs`                  | `90000`                                | Min ms between chat XP rewards per user                |
| `xpDjPoints`                        | `2`                                    | XP for playing a track                                 |
| `xpWootPoints`                      | `0.1`                                  | XP per woot                                            |
| `xpGrabPoints`                      | `0.2`                                  | XP per grab                                            |
| `xpOnlinePointsPerHour`             | `0.25`                                 | XP per hour online                                     |
| `xpBase`                            | `80`                                   | Base XP for next level                                 |
| `xpExponent`                        | `1.5`                                  | XP curve exponent                                      |
| `xpRewardBasePoints`                | `1`                                    | Base points rewarded on level up                       |
| `xpRewardStepPoints`                | `0.5`                                  | Extra points per level on level up                     |
| `xpBadgeRewards`                    | `{}`                                   | Level → badge map (future use)                         |
| `xpAchievementRewards`              | `{}`                                   | Level → achievement map (future use)                   |
| `leaderboardReset`                  | `weekly`                               | Reset schedule (`daily`, `weekly`, `monthly`, `never`) |
| `memeSubreddits`                    | `["memes", "wholesomememes", "funny"]` | Subreddits used by `!meme`                             |
| `casinoEnabled`                     | `true`                                 | Enable casino games                                    |
| `casinoMinBet`                      | `1`                                    | Minimum bet amount                                     |
| `casinoMaxBet`                      | `100`                                  | Maximum bet amount                                     |
| `casinoCooldownMs`                  | `5000`                                 | Cooldown between bets                                  |
| `casinoBetMultiplierFactor`         | `0.01`                                 | Bet scaling factor for multipliers                     |
| `casinoMultiplierMax`               | `6`                                    | Max multiplier after scaling                           |
| `casinoSlotsSymbols`                | `[...]`                                | Slots symbols (emoji/weight/multiplier)                |
| `casinoSlotsPairMultiplier`         | `1.2`                                  | Slots multiplier for two-of-a-kind                     |
| `casinoJackpotEnabled`              | `true`                                 | Enable slots jackpot                                   |
| `casinoJackpotLossShare`            | `0.1`                                  | Share of losses added to jackpot                       |
| `casinoJackpotSymbol`               | `"💎"`                                 | Jackpot symbol (3x triggers jackpot)                   |
| `casinoRouletteBetMultiplierFactor` | `0`                                    | Roulette bet scaling factor                            |
| `casinoRouletteRedMultiplier`       | `2`                                    | Roulette multiplier for red                            |
| `casinoRouletteBlackMultiplier`     | `2`                                    | Roulette multiplier for black                          |
| `casinoRouletteGreenMultiplier`     | `14`                                   | Roulette multiplier for green                          |
| `casinoDiceSides`                   | `6`                                    | Dice sides for casino dice                             |
| `casinoDiceWinMultiplier`           | `6`                                    | Dice multiplier on exact match                         |
| `dailyRewardAmount`                 | `5`                                    | Daily reward points                                    |
| `dailyRewardCooldownMs`             | `86400000`                             | Daily reward cooldown (ms)                             |
| `shopItems`                         | `[...]`                                | Shop items list                                        |
| `workJobs`                          | `[...]`                                | Jobs list (xpMin/pay)                                  |
| `workCooldownMs`                    | `86400000`                             | Work claim cooldown (ms)                               |
| `stealEnabled`                      | `true`                                 | Enable steal command                                   |
| `stealMinAmount`                    | `0.5`                                  | Minimum steal amount                                   |
| `stealMaxAmount`                    | `2`                                    | Maximum steal amount                                   |
| `stealFailChance`                   | `0.3`                                  | Chance of failed steal                                 |
| `stealBailAmount`                   | `3`                                    | Bail amount on failure                                 |
| `stealMuteMinutes`                  | `10`                                   | Mute duration if bail fails                            |
| `voteSkipEnabled`                   | `true`                                 | Enable vote skip                                       |
| `voteSkipThreshold`                 | `0.3`                                  | Portion of active users required                       |
| `voteSkipDurationMs`                | `60000`                                | Vote duration (ms)                                     |
| `voteSkipActiveWindowMs`            | `1800000`                              | Active window for vote count (ms)                      |
| `imageRenderingEnabled`             | `true`                                 | Enable ImgBB profile/balance cards                     |
| `mediaCheckDebug`                   | `false`                                | Log details from mediaCheck                            |

Settings changed via `!settings` are persisted and override `config.json` on startup.

Profile/balance/casino image cards require `IMGBB_API_KEY` and `imageRenderingEnabled: true`.

---

## Localization (i18n)

- Set the default locale in `config.json` using `locale` (`pt-BR` or `en-US`).
- You can switch at runtime with `!settings locale en-US` or `!settings locale pt-BR`.
- Add/adjust keys in `locales/pt-BR.json` and `locales/en-US.json`.

For localized config messages (like `botMessage`, `greetMessage`, `motd`, `intervalMessages`),
you can provide an object with locale keys:

```json
{
  "botMessage": {
    "pt-BR": "Oi! Sou um bot.",
    "en-US": "Hi! I'm a bot."
  }
}
```

---

## Persistence

The bot stores data in a local SQLite file named `wavezbot.sqlite`:

- Runtime settings saved by `!settings`
- Track blacklist entries
- Waitlist snapshots for `!dc` restore
- Greet state (welcome vs. welcome-back)
- AFK activity state (last chat/join)
- Track history (last played)
- Leaderboard stats (woots, DJ plays, top songs)
- Daily reward claims
- Work assignments/claims
- Shop purchases
- Casino jackpot pool
- Economy balances
- XP state (level/xp totals)

---

## Tech stack

- [`@wavezfm/api`](https://www.npmjs.com/package/@wavezfm/api) — official Wavez REST + realtime client
- [`dotenv`](https://www.npmjs.com/package/dotenv) — `.env` loader
