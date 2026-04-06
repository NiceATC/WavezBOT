# API Migration Status — WavezBOT

Mapa do que a `@wavezfm/api` suporta e como está integrado no bot.

> **Legenda**
>
> - ✅ Integrado — chamada real já feita pelo bot
> - ⚠️ Shim — existe no wrapper mas usa outro endpoint/workaround
> - ❌ Não integrado — suportado pela API mas ausente no bot

---

## REST — `lib/api/`

### Auth

| Método         | Status | Notas                      |
| -------------- | ------ | -------------------------- |
| `auth.login()` | ✅     | Handshake inicial          |
| `auth.me()`    | ✅     | Disponível via `_apiCalls` |

---

### Users

| Método                 | Status |
| ---------------------- | ------ |
| `user.getById()`       | ✅     |
| `user.getByUsername()` | ✅     |
| `user.getBadges()`     | ✅     |
| `user.listAllBadges()` | ✅     |

---

### Rooms

| Método                  | Status | Notas                                                             |
| ----------------------- | ------ | ----------------------------------------------------------------- |
| `room.list()`           | ✅     |                                                                   |
| `room.featured()`       | ✅     |                                                                   |
| `room.getBySlug()`      | ✅     | Usado no login para resolver room UUID a partir do slug           |
| `room.getWaitlist()`    | ✅     |                                                                   |
| `room.getManagement()`  | ✅     | Via `roomBot.getManagement()`                                     |
| `room.getBans()`        | ✅     | Extrai lista de bans de `roomBot.getManagement()`                 |
| `room.createBotToken()` | ✅     | Usado no flow de login com email+senha                            |
| `room.create()`         | ❌     |                                                                   |

#### Shims em `lib/api/room.js`

| Método                   | Comportamento Real                       | Status      |
| ------------------------ | ---------------------------------------- | ----------- |
| `lockWaitlist(roomId)`   | `updateSettings({ queueLocked: true })`  | ✅ Funciona |
| `unlockWaitlist(roomId)` | `updateSettings({ queueLocked: false })` | ✅ Funciona |

> Os shims `removeFromWaitlist`, `moveInWaitlist`, `skipTrack` e `vote` foram substituídos pelos métodos WS diretos (`wsRemoveFromQueue`, `wsReorderQueue`, `safeSkip`, `_castVote` no-op). Nenhum comando usa mais esses shims.

---

### Room Bot REST

| Método                         | Status |
| ------------------------------ | ------ |
| `roomBot.getState()`           | ✅     |
| `roomBot.getMessages()`        | ✅     |
| `roomBot.sendMessage()`        | ✅     |
| `roomBot.deleteMessage()`      | ✅     |
| `roomBot.pinMessage()`         | ✅     |
| `roomBot.clearPinnedMessage()` | ✅     |
| `roomBot.clearChat()`          | ✅     |
| `roomBot.getManagement()`      | ✅     |
| `roomBot.listAuditLogs()`      | ✅     |
| `roomBot.updateSettings()`     | ✅     |
| `roomBot.updateLinkFilters()`  | ✅     |
| `roomBot.setRole()`            | ✅     |
| `roomBot.setQueueAccess()`     | ✅     |
| `roomBot.unban()`              | ✅     |
| `roomBot.listEmojis()`         | ✅     |
| `roomBot.createEmoji()`        | ✅     |
| `roomBot.updateEmoji()`        | ✅     |
| `roomBot.deleteEmoji()`        | ✅     |

> `ban_user`, `kick_user` e `mute_user` não existem como endpoints REST — são executados via comandos WebSocket.

---

### Chat

| Método                 | Status | Notas                              |
| ---------------------- | ------ | ---------------------------------- |
| `chat.getMessages()`   | ✅     |                                    |
| `chat.pinMessage()`    | ✅     | Roteado via `roomBot.pinMessage()` |
| `chat.clearChat()`     | ✅     | Roteado via `roomBot.clearChat()`  |
| `chat.updateMessage()` | ❌     | Bot não edita mensagens            |

---

### Playlists

| Método                     | Status | Notas                                             |
| -------------------------- | ------ | ------------------------------------------------- |
| `playlist.list()`          | ✅     |                                                   |
| `playlist.create()`        | ✅     |                                                   |
| `playlist.update()`        | ✅     |                                                   |
| `playlist.remove()`        | ✅     |                                                   |
| `playlist.getTracks()`     | ✅     |                                                   |
| `playlist.addTrack()`      | ✅     |                                                   |
| `playlist.removeTrack()`   | ✅     |                                                   |
| `playlist.reorderTracks()` | ✅     |                                                   |
| `playlist.previewUrl()`    | ❌     | Preview de URL antes de adicionar — não integrado |

---

### Sources

| Método                      | Status |
| --------------------------- | ------ |
| `source.searchYouTube()`    | ✅     |
| `source.searchSoundCloud()` | ✅     |
| `source.searchAll()`        | ✅     |

---

### System

| Método                 | Status | Notas                                           |
| ---------------------- | ------ | ----------------------------------------------- |
| `system.status()`      | ❌     | Útil para `!stats` reportar saúde da plataforma |
| `system.publicStats()` | ❌     | Útil para `!stats`                              |
| `system.health()`      | ❌     | Útil para monitoramento interno                 |

---

## WebSocket — `lib/wavez-events.js`

### Eventos que o bot escuta

| Evento da API       | Constante no bot              | Status |
| ------------------- | ----------------------------- | ------ |
| `message_created`   | `ROOM_CHAT_MESSAGE`           | ✅     |
| `message_updated`   | `ROOM_CHAT_MESSAGE_UPDATED`   | ✅     |
| `message_deleted`   | `ROOM_CHAT_MESSAGE_DELETED`   | ✅     |
| `chat_cleared`      | `ROOM_CHAT_CLEARED`           | ✅     |
| `booth_advance`     | `ROOM_DJ_ADVANCE`             | ✅     |
| `track_skipped`     | `ROOM_TRACK_SKIPPED`          | ✅     |
| `track_paused`      | `ROOM_TRACK_PAUSED`           | ✅     |
| `track_resumed`     | `ROOM_TRACK_RESUMED`          | ✅     |
| `waitlist_update`   | `ROOM_WAITLIST_UPDATE`        | ✅     |
| `waitlist_join`     | `ROOM_WAITLIST_JOIN`          | ✅     |
| `waitlist_leave`    | `ROOM_WAITLIST_LEAVE`         | ✅     |
| `queue_reordered`   | `ROOM_QUEUE_REORDERED`        | ✅     |
| `vote_updated`      | `ROOM_VOTE`                   | ✅     |
| `track_grabbed`     | `ROOM_GRAB`                   | ✅     |
| `user_joined`       | `ROOM_USER_JOIN`              | ✅     |
| `user_left`         | `ROOM_USER_LEAVE`             | ✅     |
| `user_kicked`       | `ROOM_USER_KICK`              | ✅     |
| `user_banned`       | `ROOM_USER_BAN`               | ✅     |
| `user_role_updated` | `ROOM_USER_ROLE_UPDATE`       | ✅     |
| `user_updated`      | `ROOM_USER_UPDATE`            | ✅     |
| `error`             | `WS_PACKET_ERROR`             | ✅     |
| `pong`              | `WS_PONG`                     | ✅     |

---

### Comandos WebSocket que o bot pode enviar

| Comando WS          | Status | Notas                                                       |
| ------------------- | ------ | ----------------------------------------------------------- |
| `join_room`         | ✅     | Enviado na conexão via `autoJoinRoom=true`                   |
| `leave_room`        | ✅     | Enviado no disconnect                                       |
| `send_chat`         | ✅     | Mensagens do bot via `roomBot.sendMessage()`                |
| `skip`              | ✅     | `bot.safeSkip()` → `_pipeline.send('skip', { roomId })`     |
| `remove_from_queue` | ✅     | `bot.wsRemoveFromQueue(userId)`                             |
| `reorder_queue`     | ✅     | `bot.wsReorderQueue(userId, position)`                      |
| `mute_user`         | ✅     | `bot.wsMuteUser(userId, durationMs)` + client-side fallback |
| `kick_user`         | ✅     | `bot.wsKickUser(userId)`                                    |
| `ban_user`          | ✅     | `bot.wsBanUser(userId, { duration, reason })`               |
| `ping`              | ✅     | Heartbeat automático a cada 30s via `_pipeline.ping()`      |
| `clear_chat`        | ⚠️     | Bot usa REST `roomBot.clearChat()` — funciona               |

---

## Limitações da plataforma

| Item               | Status | Notas                                                                          |
| ------------------ | ------ | ------------------------------------------------------------------------------ |
| Votar (woot / meh) | ❌     | Nenhum endpoint REST ou comando WS exposto para bots — `_castVote` é no-op    |
| Unmute via WS      | ❌     | Sem comando `unmute_user` no WS — `wsUnmuteUser` apenas cancela o auto-delete |

---

## Pendências

| Item                                       | Sugestão                                              |
| ------------------------------------------ | ----------------------------------------------------- |
| `system.status()` / `system.publicStats()` | Integrar em `!stats` para mostrar saúde da plataforma |
| `chat.updateMessage()`                     | Editar mensagens do bot (ex: placar ao vivo)          |
| `playlist.previewUrl()`                    | Validar URL antes de adicionar à fila                 |
| Auto-renovação de token                    | Renovar antes do vencimento sem reiniciar o processo  |
