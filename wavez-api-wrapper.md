# Wavez API Wrapper

Wrapper unificado criado para o pacote `@wavezfm/api`.

Arquivo principal:

- `lib/wavez-sdk.js`

Ele expõe quatro coisas:

- `client`: cliente bruto retornado por `createApiClient()`
- `api`: camada de baixo nível (`client.api`) com `request/get/post/...` e gestão de tokens
- `rest`: wrappers organizados por recurso, via `createApiCalls()`
- `createRealtime()`: fábrica do cliente websocket room-bot

## Uso rápido

```js
import { createWavezSdk, ApiError } from "./lib/wavez-sdk.js";

const sdk = createWavezSdk({
  baseURL: "https://wavez.example.com/api",
  locale: "pt-BR",
  roomBotToken: process.env.WAVEZ_ROOM_BOT_TOKEN,
});

const rooms = await sdk.rest.room.list();
const state = await sdk.rest.roomBot.getState("room-id");

const realtime = sdk.createRealtime({ roomId: "room-id" });
realtime.on("message_created", (packet) => {
  console.log(packet.payload);
});

await realtime.connect();
```

## Exemplo Room Bot REST

```js
const sdk = createWavezSdk({
  baseURL: "https://wavezfm.example.com/api",
});

sdk.setRoomBotToken(process.env.WAVEZ_ROOM_BOT_TOKEN);

await sdk.client.roomBot.getState("room-id");
await sdk.client.roomBot.getMessages("room-id");
await sdk.client.roomBot.sendMessage("room-id", { content: "!lockqueue" });

await sdk.client.roomBot.updateSettings("room-id", {
  queueLocked: true,
  commandAnnouncement: {
    commandId: "lockqueue",
    actorUsername: "Night Shift Bot",
  },
});
```

## Error Handling

Todos os métodos podem lançar `ApiError` em falhas de API.

```js
import { ApiError } from "./lib/wavez-sdk.js";

try {
  await sdk.client.auth.login({
    email: "bad@example.com",
    password: "bad",
  });
} catch (error) {
  if (error instanceof ApiError) {
    console.log(error.message);
    console.log(error.status);
    console.log(error.code);
    console.log(error.response);
  }
}
```

## Token Management

Você pode gerenciar tokens no nível baixo (`sdk.api`) ou no wrapper (`sdk`).

```js
sdk.api.setAuthToken("optional-bearer-token");
sdk.api.setRoomBotToken(process.env.WAVEZ_ROOM_BOT_TOKEN);

sdk.api.getAuthToken();
sdk.api.getRoomBotToken();

sdk.setAuthToken("optional-bearer-token");
sdk.setRoomBotToken(process.env.WAVEZ_ROOM_BOT_TOKEN);

sdk.getAuthToken();
sdk.getRoomBotToken();
```

## Tree-Shaking

Se você quiser bundle mínimo, pode importar apenas os factories necessários direto do pacote:

```js
import { createApi } from "@wavezfm/api";
import { createRoomResource } from "@wavezfm/api/resources/room";
import { createRoomBotResource } from "@wavezfm/api/resources/room-bot";

const api = createApi({ baseURL: "https://wavezfm.example.com/api" });
const room = createRoomResource(api);
const roomBot = createRoomBotResource(api);
```

O wrapper em `lib/wavez-sdk.js` também reexporta esses factories para facilitar.

## TypeScript

Os tipos devem ser importados do pacote oficial:

```ts
import type {
  AuthUser,
  RoomSummary,
  PlaylistTrack,
  MediaSearchResult,
  ChatMessage,
  RoomBotState,
  WsPacket,
} from "@wavezfm/api";
```

## Recursos REST suportados

### Auth

- `login`
- `register`
- `me`
- `getPendingTwoFactor`
- `sendPendingTwoFactorCode`
- `verifyPendingTwoFactor`
- `getTwoFactorStatus`

### Settings

- `get`
- `update`
- `getTwoFactor`
- `sendPhoneVerification`
- `verifyPhoneNumber`
- `startEmailTwoFactor`
- `startSmsTwoFactor`
- `verifyOtpTwoFactor`
- `startAuthenticatorTwoFactor`
- `verifyAuthenticatorTwoFactor`
- `disableTwoFactor`

### User

- `getById`
- `getByUsername`
- `getBadges`
- `listAllBadges`

### Room

- `list`
- `featured`
- `getBySlug`
- `getJoinPreview`
- `getWaitlist`
- `getQueueStatus`
- `create`
- `join`
- `favorite`
- `unfavorite`
- `getManagement`
- `createBotToken`
- `listEmojis`
- `listAuditLogs`
- `updateSettings`
- `updateLinkFilters`
- `setRole`
- `setQueueAccess`
- `unban`
- `createEmoji`
- `updateEmoji`
- `deleteEmoji`

### Playlist

- `list`
- `create`
- `update`
- `remove`
- `getTracks`
- `previewUrl`
- `addTrack`
- `reorderTracks`
- `removeTrack`
- `listImports`
- `getImport`
- `startSpotifyImport`
- `importYouTubePlaylist`
- `importSoundCloudPlaylist`
- `cancelImport`
- `searchPreview`

### Source

- `search`
- `searchYouTube`
- `searchSoundCloud`
- `searchAll`

### Chat

- `getMessages`
- `getMessagesBySlug`
- `deleteMessage`
- `updateMessage`
- `pinMessage`
- `clearPinnedMessage`
- `clearChat`

### Friend

- `list`
- `pending`
- `sendRequest`
- `acceptRequest`
- `rejectRequest`
- `remove`
- `follow`
- `unfollow`
- `followers`
- `following`

### Shop

- `getCatalog`
- `getWallet`
- `purchase`
- `equip`
- `getInventory`

### Billing

- `createSubscriptionCheckout`
- `createDiamondCheckout`
- `createRoomDonationCheckout`
- `createGlobalDonationCheckout`
- `createDiamondGiftCheckout`
- `createSubscriptionGiftCheckout`
- `listPendingGifts`
- `markGiftSeen`

### System

- `status`
- `publicStats`
- `health`

### Room Bot

- `getState`
- `getQueueStatus`
- `getMessages`
- `sendMessage`
- `deleteMessage`
- `pinMessage`
- `clearPinnedMessage`
- `clearChat`
- `getManagement`
- `listEmojis`
- `listAuditLogs`
- `updateSettings`
- `updateLinkFilters`
- `setRole`
- `setQueueAccess`
- `unban`
- `createEmoji`
- `updateEmoji`
- `deleteEmoji`

## WebSocket room-bot

### Comandos que o cliente consegue enviar

- `join_room`
- `leave_room`
- `ping`
- `send_chat`
- `skip`
- `remove_from_queue`
- `reorder_queue`
- `mute_user`
- `kick_user`
- `ban_user`

### Eventos úteis que o bot pode escutar

- `open`
- `close`
- `connected`
- `socket_error`
- `packet`
- `message_created`
- `message_updated`
- `message_deleted`
- `chat_cleared`
- `track_started`
- `track_skipped`
- `track_paused`
- `track_resumed`
- `room_state_snapshot`
- `waitlist_update`
- `waitlist_join`
- `waitlist_leave`
- `queue_reordered`
- `votes_snapshot`
- `track_grabbed`
- `user_joined`
- `user_left`
- `user_kicked`
- `user_banned`
- `user_role_updated`
- `user_updated`
- `pong`
- `error`

## O que da para fazer com ele

- autenticar usuario por sessao
- criar e gerenciar room-bot tokens
- ler estado da room e da fila
- ler, enviar, apagar, fixar e limpar chat
- moderar room com bot token dentro dos limites da role do dono
- buscar usuarios, badges, rooms e catalogo da loja
- gerenciar playlists e importar conteudo de Spotify, YouTube e SoundCloud
- consultar status publico da plataforma
- criar integrações realtime via websocket

## Limitações atuais observadas

- rotas de usuario/sessao sao browser-first; no backend o fluxo room-bot e mais adequado
- o prefixo do bot e apenas metadado do token; o backend nao executa comandos automaticamente
- o SDK atual nao expõe voto de faixa para bots
- a capacidade real de moderacao do bot depende da role atual do dono na room

## Notas importantes

- user/session routes sao browser-first por dependerem de cookie e same-origin
- room-bot routes sao mais adequadas para backend e automacao
- o pacote e tree-shakable via exports em resources
- o helper realtime espera WebSocket nativo ou websocketFactory customizado

## Arquivos adicionados/atualizados

- `lib/wavez-sdk.js`
- `lib/api/index.js`
- `lib/api/auth.js`
- `lib/api/settings.js`
- `lib/api/user.js`
- `lib/api/room.js`
- `lib/api/roomBot.js`
- `lib/api/chat.js`
- `lib/api/playlist.js`
- `lib/api/source.js`
- `lib/api/friend.js`
- `lib/api/shop.js`
- `lib/api/billing.js`
- `lib/api/system.js`
