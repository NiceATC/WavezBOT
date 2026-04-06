@wavezfm/api
Official JavaScript/TypeScript API client for Wavez.

This package is fetch-based and ships with zero runtime dependencies.

Installation
npm install @wavezfm/api

# or

yarn add @wavezfm/api

# or

bun add @wavezfm/api
Quick Start
import { createApiClient } from '@wavezfm/api';

const client = createApiClient({
baseURL: 'https://api.wavez.example.com',
});

const rooms = await client.room.list();
console.log(rooms.data);
Configuration
createApiClient({
baseURL: 'https://api.wavez.example.com', // required
timeout: 15_000, // optional, default: 30000
logging: false, // optional
headers: { 'X-App-Version': '1.0.0' }, // optional
credentials: 'include', // optional, default: include
locale: 'en', // optional, default: en
})
The client accepts either:

https://api.wavez.example.com
https://wavez.example.com/api
https://wavez.example.com
If you use a dedicated API origin such as api.wavez.example.com, the SDK keeps root paths like /rooms. If you pass the main site origin, the SDK still falls back to /api.

You can localize SDK-generated errors with locale or override specific messages with messages:

const client = createApiClient({
baseURL: 'https://api.wavez.example.com',
locale: 'en',
messages: {
roomBotCreatePrefixLengthInvalid: 'Custom prefix length message.',
},
});
Browser Session Auth
Wavez uses session cookies for most user-authenticated routes.

const client = createApiClient({
baseURL: 'https://wavez.example.com/api',
});

await client.auth.login({
email: 'user@example.com',
password: 'secret',
});

const me = await client.auth.me();
if (me.data) {
console.log(me.data.displayUsername ?? me.data.username);
}
For server-side Node integrations, room-bot routes are the best fit. Regular user routes rely on the browser session/cookie flow used by the site.

Room Bots
const client = createApiClient({
baseURL: 'https://wavez.example.com/api',
});

client.api.setRoomBotToken(process.env.WAVEZ_ROOM_BOT_TOKEN!);

const state = await client.roomBot.getState('room-id');
console.log(state.data.bot);
Realtime Room Bots
import { createRoomBotRealtimeClient } from '@wavezfm/api';

const bot = createRoomBotRealtimeClient({
baseURL: 'https://wavez.example.com/api',
botToken: process.env.WAVEZ_ROOM_BOT_TOKEN!,
roomId: 'room-id',
locale: 'en',
});

bot.on('message_created', (packet) => {
console.log(packet.payload);
});

await bot.connect();
Resources
All resources are exposed from the pre-configured client:

const client = createApiClient({ baseURL: 'https://wavez.example.com/api' });
Auth
await client.auth.login({ email, password });
await client.auth.register({ email, password, name, username });
const me = await client.auth.me(); // returns `null` in `data` when there is no active session
await client.auth.getPendingTwoFactor();
await client.auth.sendPendingTwoFactorCode();
await client.auth.verifyPendingTwoFactor({ code: '123456' });
Settings
await client.settings.get();
await client.settings.update({
bio: 'Late-night selector',
presenceStatus: 'busy',
showChatBadge: true,
});
await client.settings.getTwoFactor();
await client.settings.startEmailTwoFactor({ password: 'secret' });
await client.settings.startAuthenticatorTwoFactor({ password: 'secret' });
await client.settings.disableTwoFactor({ password: 'secret' });
Users
await client.user.getById('user-id');
await client.user.getByUsername('haru');
await client.user.getBadges('user-id');
await client.user.listAllBadges();
Rooms
await client.room.list();
await client.room.featured();
await client.room.getBySlug('wavez-lounge');
await client.room.getWaitlist('wavez-lounge');
await client.room.create({ slug: 'my-room', name: 'My Room' });
await client.room.join('wavez-lounge');
await client.room.favorite('room-id');
await client.room.getManagement('room-id');
await client.room.createBotToken('room-id', {
botName: 'Night Shift Bot',
commandPrefix: '!',
permissions: ['read_state', 'read_chat', 'send_chat', 'manage_room'],
});
Playlists
await client.playlist.list();
await client.playlist.create('My Playlist');
await client.playlist.update('playlist-id', { name: 'Late Night Set' });
await client.playlist.getTracks('playlist-id');
await client.playlist.previewUrl('https://youtube.com/watch?v=dQw4w9WgXcQ');
await client.playlist.addTrack('playlist-id', {
source: 'youtube',
sourceId: 'dQw4w9WgXcQ',
});
await client.playlist.reorderTracks('playlist-id', ['track-a', 'track-b']);
await client.playlist.startSpotifyImport({
playlistId: 'playlist-id',
url: 'https://open.spotify.com/playlist/...',
});
Sources
await client.source.searchYouTube('lofi hip hop', 10);
await client.source.searchSoundCloud('nightcore', 10);
await client.source.searchAll('ambient');
Chat
await client.chat.getMessages('room-id', 0, 50);
await client.chat.getMessagesBySlug('wavez-lounge', 0, 50);
await client.chat.updateMessage('room-id', 'message-id', {
content: 'edited message',
});
await client.chat.pinMessage('room-id', 'message-id');
await client.chat.clearChat('room-id');
Friends / Fans
await client.friend.list();
await client.friend.pending();
await client.friend.sendRequest('user-id');
await client.friend.acceptRequest('request-id');
await client.friend.follow('user-id');
await client.friend.followers();
Shop
await client.shop.getCatalog();
await client.shop.getWallet();
await client.shop.purchase({ itemId: 'badge-id' });
await client.shop.equip('avatar-id');
await client.shop.getInventory();
Billing
await client.billing.createSubscriptionCheckout({ cycle: 'monthly' });
await client.billing.createDiamondCheckout({ quantity: 1000 });
await client.billing.createRoomDonationCheckout('room-id', { amountCents: 500 });
await client.billing.createGlobalDonationCheckout({ amountCents: 1000 });
await client.billing.createDiamondGiftCheckout({
recipientUsername: 'haru',
quantity: 500,
});
await client.billing.listPendingGifts();
System
await client.system.status();
await client.system.publicStats();
await client.system.health();
Room Bots
client.api.setRoomBotToken(process.env.WAVEZ_ROOM_BOT_TOKEN!);

await client.roomBot.getState('room-id');
await client.roomBot.getMessages('room-id');
await client.roomBot.sendMessage('room-id', { content: '!lockqueue' });
await client.roomBot.updateSettings('room-id', {
queueLocked: true,
commandAnnouncement: {
commandId: 'lockqueue',
actorUsername: 'Night Shift Bot',
},
});
Error Handling
All methods throw ApiError on failure.

import { ApiError } from '@wavezfm/api';

try {
await client.auth.login({ email: 'bad@example.com', password: 'bad' });
} catch (error) {
if (error instanceof ApiError) {
console.log(error.message);
console.log(error.status);
console.log(error.code);
console.log(error.response);
}
}
Token Management
const client = createApiClient({ baseURL: 'https://wavez.example.com/api' });

client.api.setAuthToken('optional-bearer-token');
client.api.setRoomBotToken(process.env.WAVEZ_ROOM_BOT_TOKEN!);

client.api.getAuthToken();
client.api.getRoomBotToken();
Tree-Shaking
For maximum tree-shaking, import only what you need:

import { createApi } from '@wavezfm/api';
import { createRoomResource } from '@wavezfm/api/resources/room';
import { createRoomBotResource } from '@wavezfm/api/resources/room-bot';

const api = createApi({ baseURL: 'https://wavez.example.com/api' });
const room = createRoomResource(api);
const roomBot = createRoomBotResource(api);
TypeScript
import type {
AuthUser,
RoomSummary,
PlaylistTrack,
MediaSearchResult,
ChatMessage,
RoomBotState,
WsPacket,
} from '@wavezfm/api';
Notes
user/session routes are browser-first because the backend uses cookies and same-origin protections
room-bot routes are ideal for backend integrations and automation
the package is tree-shakable through factory exports in resources/\*
the realtime helper expects native WebSocket or a custom websocketFactory
Readme
Keywords

# Room Bot API

Guia oficial para criar bots de sala no WavezFM.

O modelo atual foi pensado para bots completos de automação e moderação:

- ler estado da sala em tempo real
- ler chat
- enviar mensagens
- reagir a comandos com prefixo, como `!lockqueue`
- moderar e gerenciar a sala conforme a role atual do dono do bot

## Como o modelo funciona

Cada bot de sala:

- pertence a uma sala específica
- é autenticado por token próprio
- herda a role atual do dono dentro da sala
- pode receber permissões adicionais no token
- pode usar HTTP e WebSocket

Importante:

- o token pode incluir `manage_room`
- isso não transforma todo bot em host automaticamente
- o bot só pode fazer o que a role atual do dono já pode fazer

Exemplo:

- se o dono for `manager`, um bot com `manage_room` pode fazer tudo que um `manager` pode
- se o dono cair para `bouncer`, o mesmo bot perde as ações de manager

## Permissões do token

Hoje os tokens suportam:

- `read_state`
- `read_chat`
- `send_chat`
- `manage_room`

## Prefixo do bot

O dono pode definir um prefixo próprio no token, por exemplo:

- `!`
- `?`
- `bot.`

Esse prefixo não é interpretado automaticamente pelo backend.

O fluxo esperado é:

1. seu bot escuta mensagens do chat
2. detecta comandos como `!lockqueue`
3. chama a API correspondente para executar a ação

## Limitações atuais

- o bot continua restrito à sala do token
- o bot não entra como presença visual
- o bot não conta como usuário online da room
- o bot não tem revogação individual de token ainda
- o token expira

## Gerar token

Endpoint:

`POST /api/rooms/:roomId/bot-tokens`

Autenticação:

- sessão normal do usuário
- cookies da conta
- CSRF igual ao frontend

Body:

```json
{
  "botName": "Night Shift Bot",
  "botAvatarUrl": "https://cdn.example.com/bots/night-shift.gif",
  "commandPrefix": "!",
  "permissions": ["read_state", "read_chat", "send_chat", "manage_room"],
  "expiresInHours": 168
}
```

Regras:

- `botName`: 2 a 40 caracteres
- `botAvatarUrl`: opcional, precisa ser URL direta para imagem
- `commandPrefix`: 1 a 12 caracteres, sem espaços, padrão `!`
- `expiresInHours`: 1 a 720

Resposta:

```json
{
  "token": "szrb1.xxxxxxxxxxxxxxxxx",
  "tokenId": "bot_123",
  "roomId": "e4560bd4-665f-4695-840f-b0f1dfedb225",
  "botUserId": "room-bot:bot_123",
  "botName": "Night Shift Bot",
  "botAvatarUrl": "https://cdn.example.com/bots/night-shift.gif",
  "commandPrefix": "!",
  "permissions": ["read_state", "read_chat", "send_chat", "manage_room"],
  "issuedAt": "2026-03-24T03:00:00.000Z",
  "expiresAt": "2026-03-31T03:00:00.000Z",
  "actorRole": "manager"
}
```

Importante:

- o campo `token` acima é o token bruto do bot
- ele é entregue na resposta de criação
- guarde esse valor com segurança no backend do seu bot
- depois use esse token em `Authorization: Bearer ...`, `X-WavezFM-Bot-Token` ou `?botToken=...`

## Como autenticar o bot

O token pode ser enviado por:

- `Authorization: Bearer <BOT_TOKEN>`
- `X-WavezFM-Bot-Token: <BOT_TOKEN>`
- `?botToken=<BOT_TOKEN>`

## Quick Start

```ts
const token = process.env.WAVEZ_ROOM_BOT_TOKEN!;
const roomId = process.env.WAVEZ_ROOM_ID!;

await fetch(`https://seu-dominio/api/bot/rooms/${roomId}/state`, {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});
```

## Recurso Bot

## Estado da sala

`GET /api/bot/rooms/:roomId/state`

Permissão:

- `read_state`

Resposta:

```json
{
  "bot": {
    "id": "room-bot:bot_123",
    "tokenId": "bot_123",
    "roomId": "e4560bd4-665f-4695-840f-b0f1dfedb225",
    "actorUserId": "dc9bc673-2b97-4295-a582-6bdef50df63c",
    "roomRole": "manager",
    "name": "Night Shift Bot",
    "avatarUrl": "https://cdn.example.com/bots/night-shift.gif",
    "commandPrefix": "!",
    "permissions": ["read_state", "read_chat", "send_chat", "manage_room"]
  },
  "snapshot": {},
  "customEmojis": []
}
```

## Histórico de mensagens

`GET /api/bot/rooms/:roomId/messages`

Permissão:

- `read_chat`

Query params:

- `limit`
- `offset`

## Enviar mensagem

`POST /api/bot/rooms/:roomId/messages`

Permissão:

- `send_chat`

Body:

```json
{
  "content": "Boa noite, chat."
}
```

O envio ainda respeita:

- mute ativo do dono
- bloqueio de links da sala

## Recurso Room Management

As rotas abaixo exigem:

- permissão de token `manage_room`
- e também que a role atual do dono possa executar a ação

Isso significa que um bot com `manage_room`:

- pode gerenciar fila se o dono tiver `manage_queue`
- pode mutar se o dono tiver `mute_user`
- pode mexer em roles se o dono tiver `manage_roles`
- pode mexer em link filters se o dono tiver `manage_links`
- pode mexer em settings se o dono tiver `manage_room`

## Overview da sala

`GET /api/bot/rooms/:roomId/management`

## Emojis da sala

`GET /api/bot/rooms/:roomId/emojis`

## Audit logs

`GET /api/bot/rooms/:roomId/audit-logs?limit=30`

Observação:

- continua sujeito à permissão real `view_audit_logs`

## Atualizar settings da sala

`PATCH /api/bot/rooms/:roomId/settings`

Exemplo:

```json
{
  "queueLocked": true,
  "commandAnnouncement": {
    "commandId": "lockqueue",
    "actorUsername": "Night Shift Bot"
  }
}
```

Campos úteis:

- `name`
- `description`
- `welcomeMessage`
- `isPrivate`
- `minimumChatLevel`
- `slowModeSeconds`
- `isNsfw`
- `queueLocked`
- `cycleWaitlist`
- `chatCommandAnnouncementsEnabled`
- `chatCommandAnnouncementCommands`
- `chatHistoryEnabled`
- `chatHistoryRetentionDays`
- `backgroundId`
- `videoFrameId`
- `rolePermissionOverrides`

## Atualizar filtros de links

`PATCH /api/bot/rooms/:roomId/link-filters`

Exemplo:

```json
{
  "blockAllLinks": true,
  "blockedLinkPatterns": ["discord.gg", "t.me"],
  "commandAnnouncement": {
    "commandId": "linkfilter",
    "actorUsername": "Night Shift Bot"
  }
}
```

## Alterar cargo de alguém

`PUT /api/bot/rooms/:roomId/roles/:userId`

Body:

```json
{
  "role": "bouncer"
}
```

## Bloquear ou liberar fila para alguém

`PUT /api/bot/rooms/:roomId/queue-access/:userId`

Body:

```json
{
  "blocked": true
}
```

## Desbanir usuário

`DELETE /api/bot/rooms/:roomId/bans/:userId`

Body opcional:

```json
{
  "commandAnnouncement": {
    "commandId": "unban",
    "actorUsername": "Night Shift Bot",
    "targetUsername": "alice"
  }
}
```

## Gerenciar emojis da sala

Criar:

`POST /api/bot/rooms/:roomId/emojis`

Atualizar:

`PATCH /api/bot/rooms/:roomId/emojis/:emojiId`

Remover:

`DELETE /api/bot/rooms/:roomId/emojis/:emojiId`

## Recurso Chat Moderation

Estas rotas também usam o mesmo modelo de permissão:

- token precisa ter `manage_room`
- e a role atual do dono precisa permitir a ação

## Deletar mensagem

`DELETE /api/bot/rooms/:roomId/messages/:messageId`

## Fixar mensagem

`PUT /api/bot/rooms/:roomId/pinned-message/:messageId`

## Remover fixado

`DELETE /api/bot/rooms/:roomId/pinned-message`

## Limpar chat

`POST /api/bot/rooms/:roomId/clear-chat`

## WebSocket

O WebSocket é o melhor caminho para:

- ouvir chat em tempo real
- ouvir fila, votos e playback
- reagir rápido a comandos com prefixo

Conexão:

```text
ws://SEU-DOMINIO/ws?botToken=<BOT_TOKEN>
```

Se o cliente suportar headers customizados no upgrade:

```http
Authorization: Bearer <BOT_TOKEN>
```

## Sem authenticate manual

Room bots já entram autenticados no upgrade.

O servidor envia um `ack` inicial:

```json
{
  "type": "ack",
  "event": "connected",
  "version": "v1",
  "timestamp": "2026-03-24T03:00:00.000Z",
  "payload": {
    "authenticated": true,
    "userId": "room-bot:bot_123",
    "username": "Night Shift Bot",
    "botPrefix": "!"
  }
}
```

## Envelope

```json
{
  "type": "command",
  "event": "join_room",
  "requestId": "req_1",
  "version": "v1",
  "timestamp": "2026-03-24T03:00:00.000Z",
  "payload": {}
}
```

## Comandos liberados para bots

Hoje os bots podem usar:

- `join_room`
- `leave_room`
- `send_chat`
- `remove_from_queue`
- `reorder_queue`
- `skip`
- `mute_user`
- `kick_user`
- `ban_user`
- `clear_chat`
- `ping`

Esses comandos só funcionam se:

- o token incluir a permissão necessária
- a role atual do dono permitir a ação

## Eventos úteis

- `room_state_snapshot`
- `message_created`
- `message_updated`
- `message_deleted`
- `chat_cleared`
- `user_joined`
- `user_left`
- `user_updated`
- `queue_reordered`
- `votes_snapshot`
- `track_started`
- `track_paused`
- `track_resumed`
- `track_skipped`
- `playback_sync`
- `pong`
- `error`

## Exemplo de bot com prefixo

```ts
import WebSocket from "ws";

const roomId = process.env.WAVEZ_ROOM_ID!;
const token = process.env.WAVEZ_ROOM_BOT_TOKEN!;
const ws = new WebSocket(
  `ws://localhost:3001/ws?botToken=${encodeURIComponent(token)}`,
);

const prefix = "!";

async function lockQueue() {
  await fetch(`http://localhost:3001/api/bot/rooms/${roomId}/settings`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      queueLocked: true,
      commandAnnouncement: {
        commandId: "lockqueue",
        actorUsername: "Night Shift Bot",
      },
    }),
  });
}

ws.on("open", () => {
  ws.send(
    JSON.stringify({
      type: "command",
      event: "join_room",
      requestId: "join-1",
      version: "v1",
      timestamp: new Date().toISOString(),
      payload: { roomId },
    }),
  );
});

ws.on("message", async (raw) => {
  const packet = JSON.parse(raw.toString());

  if (packet.event !== "message_created") {
    return;
  }

  const message = packet.payload?.message;
  if (!message?.content || typeof message.content !== "string") {
    return;
  }

  if (message.content.trim().toLowerCase() === `${prefix}lockqueue`) {
    await lockQueue();
  }
});
```

## Erros comuns

- `ROOM_BOT_TOKEN_REQUIRED`
- `ROOM_BOT_INVALID`
- `ROOM_BOT_SCOPE_MISMATCH`
- `ROOM_BOT_PERMISSION_DENIED`
- `ROOM_BOT_CHAT_FORBIDDEN`
- `ROOM_BOT_MANAGE_FORBIDDEN`
- `ROOM_BOT_ROOM_MISMATCH`
- `ROOM_NOT_FOUND`
- `ROOM_BANNED`
- `ROOM_PERMISSION_MANAGE_QUEUE`
- `ROOM_PERMISSION_MUTE_USER`
- `ROOM_PERMISSION_KICK_USER`
- `ROOM_PERMISSION_BAN_USER`
- `ROOM_PERMISSION_MANAGE_ROOM`
- `ROOM_PERMISSION_MANAGE_LINKS`
- `ROOM_PERMISSION_MANAGE_ROLES`
- `ROOM_PERMISSION_VIEW_AUDIT_LOGS`

## Segurança

- nunca exponha o token em frontend público
- guarde o token no backend do seu bot
- gere um token por integração
- use só as permissões necessárias
- renove o token perto do vencimento

## Variáveis importantes

Em produção, o backend precisa de:

- `ROOM_BOT_SECRET`

Fallback:

- `BETTER_AUTH_SECRET`

## Resumo

Fluxo recomendado:

1. o dono da sala gera um token com `commandPrefix` e, se precisar, `manage_room`
2. o bot conecta no WebSocket para ouvir estado e chat
3. o bot detecta comandos com prefixo
4. o bot chama a API HTTP ou WS para moderar/gerenciar
5. a role atual do dono continua sendo a fonte real de autoridade

Esse é o modelo atual oficial para bots completos de sala no WavezFM.
