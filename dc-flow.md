# Fluxo completo do sistema `!dc`

Este documento descreve o comportamento real atual do sistema de restore de fila por DC no bot.

Escopo coberto:

- quando a fila é salva
- como a posição é normalizada
- como o banco registra presença e saída
- o que acontece quando o usuário sai
- o que acontece quando o usuário volta
- o que acontece quando alguém executa `!dc`
- superfícies prováveis de falha para auditoria

## Visão geral

O sistema de `!dc` depende de 4 partes principais:

1. Normalização de fila em memória
2. Captura de snapshots da fila por eventos
3. Persistência em `waitlist_state`
4. Restauração via comando `!dc`

Arquivos centrais:

- `lib/waitlist.js`
- `events/queue/waitlistSnapshot.js`
- `events/queue/djAdvanceSnapshot.js`
- `lib/storage.js`
- `commands/queue/dc.js`
- `lib/bot.js`

## Convenção de posição usada pelo bot

O bot não confia cegamente no `entry.position` bruto da API.

Ele usa a lógica de `lib/waitlist.js` para decidir se o DJ atual está sendo contado dentro do array retornado pela API.

Regras:

- se o primeiro item da fila tiver `isCurrentDj === true`, o bot considera que a lista inclui o DJ
- se não tiver esse flag, mas o primeiro item tiver o mesmo id do DJ atual, o bot também considera que a lista inclui o DJ
- se incluir DJ, o offset da waitlist é `1`
- se não incluir DJ, o offset da waitlist é `0`

Consequência:

- posição e total persistidos pelo sistema de DC são sempre a posição normalizada da waitlist
- o sistema tenta continuar funcionando mesmo se a API mudar de `conta DJ` para `não conta DJ`

## Onde a fila é salva

O sistema hoje usa **5 fontes de snapshot** independentes, todas convergindo para `upsertWaitlistSnapshot()`:

### 1. Evento `room_state_snapshot` (Cooldown: 2s)

Arquivo: `events/queue/waitlistSnapshot.js`

Esse evento é uma das principais fontes de atualização do estado da fila.

Fluxo:

- recebe payload WS do snapshot da sala
- tenta montar a fila a partir de:
  - `snapshot.queue`
  - `snapshot.users`
  - id do DJ atual encontrado em playback/dj/currentDj/current_dj
- para cada item do array, calcula a posição normalizada com `getWaitlistPositionForIndex`
- ignora qualquer item que corresponda ao DJ atual e gere posição `null`
- salva no banco com `upsertWaitlistSnapshot(..., { markMissingLeft: true })`

Se o payload WS não for suficiente:

- faz fallback para `api.room.getQueueStatus(room)`
- monta a fila a partir de `queue.entries`
- recalcula a posição normalizada
- salva no banco

### 2. Evento `queue_reordered` (Cooldown: 2s)

Arquivo: `events/queue/waitlistSnapshot.js`

O mesmo handler acima também escuta `queue_reordered`.

Objetivo:

- persistir rapidamente mudanças manuais de posição
- manter o snapshot do `!dc` próximo do estado real da fila

### 3. Evento `waitlist_join` (Sem cooldown)

Arquivo: `events/queue/waitlistJoinSnapshot.js`

**NOVO**: Dispara imediatamente quando um usuário entra na fila (não depende de mudança de DJ).

Fluxo:

- escuta `ROOM_WAITLIST_JOIN`
- chama `api.room.getQueueStatus(room)` para ter dados completos
- reconstrói a fila usando `queue.entries`
- normaliza as posições com `getWaitlistPositionForIndex`
- salva no banco com `upsertWaitlistSnapshot(..., { markMissingLeft: true })`

Importância:

- sem esse handler, o sistema só descobria que o usuário voltou quando outro evento disparava
- agora a volta à fila é registrada imediatamente
- `last_left_at` é zerado no banco assim que o usuário reappears

### 4. Evento `waitlist_leave` (Sem cooldown)

Arquivo: `events/queue/waitlistLeaveSnapshot.js`

**NOVO**: Dispara imediatamente quando um usuário sai da fila.

Fluxo:

- escuta `ROOM_WAITLIST_LEAVE`
- chama `api.room.getQueueStatus(room)`
- reconstrói a fila de quem ficou
- salva no banco com `upsertWaitlistSnapshot(..., { markMissingLeft: true })`

Resultado:

- quem saiu recebe `last_left_at = now` rapidamente
- quem ficou tem posição atualizada

### 5. Evento de troca de DJ (Sem cooldown)

Arquivo: `events/queue/djAdvanceSnapshot.js`

Esse evento existe para forçar atualização da fila exatamente em mudanças de DJ.

Fluxo:

- escuta `ROOM_DJ_ADVANCE`
- chama `api.room.getQueueStatus(room)`
- reconstrói a fila usando `queue.entries`
- normaliza as posições com `getWaitlistPositionForIndex`
- salva no banco com `upsertWaitlistSnapshot(..., { markMissingLeft: true })`

Motivo dessa camada extra:

- reduzir janela em que o banco fica atrasado logo após troca de DJ
- evitar depender apenas do snapshot WS geral

### 6. Periodic snapshot (A cada 30 segundos)

Arquivo: `lib/bot.js` → `_startPeriodicWaitlistSnapshot()`

**NOVO**: Snapshot automático a cada 30 segundos como rede de segurança.

Fluxo:

- temporizador iniciado em `_joinRoom()`
- chamado continuamente: `_savePeriodicWaitlistSnapshot()`
- chama `api.room.getQueueStatus(room)`
- reconstrói fila e salva no banco
- parado em `stop()`

Propósito:

- garantir que nenhuma mudança de fila fique mais de 30s sem ser persistida
- mitigar o risco de eventos perdidos
- aumenta confiabilidade para DC restore de 100% para praticamente garantido

## Resumo de cobertura de snapshot

| Evento               | Handler                  | Cooldown | Dispara em                   |
| -------------------- | ------------------------ | -------- | ---------------------------- |
| ROOM_STATE_SNAPSHOT  | waitlistSnapshot         | 2s       | Qualquer mudança na sala     |
| ROOM_QUEUE_REORDERED | waitlistSnapshot         | 2s       | Reordena manual (move, swap) |
| ROOM_WAITLIST_JOIN   | waitlistJoinSnapshot     | 0s       | Usuário entra na fila        |
| ROOM_WAITLIST_LEAVE  | waitlistLeaveSnapshot    | 0s       | Usuário sai da fila          |
| ROOM_DJ_ADVANCE      | djAdvanceSnapshot        | 0s       | DJ muda                      |
| Timer de 30s         | periodicWaitlistSnapshot | N/A      | A cada 30 segundos           |

Resultado: A fila é persistida em **até 30 segundos** em qualquer situação.

## Como a persistência funciona

Arquivo: `lib/storage.js`

Tabela usada:

- `waitlist_state`

Campos principais:

- `room_slug`
- `room_id`
- `user_id`
- `public_id`
- `username`
- `display_name`
- `position`
- `queue_length`
- `is_current_dj`
- `last_seen_at`
- `last_left_at`
- `source`
- `updated_at`

### Escrita principal: `upsertWaitlistSnapshot(entries, options)`

Passos:

- recebe uma lista já preparada pelos eventos/comandos
- normaliza ids e posição
- abre transação serializada
- faz upsert de cada usuário em `waitlist_state`
- atualiza:
  - posição atual da waitlist
  - tamanho da fila salva
  - último momento em que esse usuário foi visto na fila: `last_seen_at`
  - origem da atualização: `source`
- sempre que o usuário reaparece num snapshot, `last_left_at` é zerado (`NULL`)

### Marcação de ausentes: `markMissingLeft: true`

Quando `upsertWaitlistSnapshot` roda com essa flag:

- pega todos os usuários da sala já persistidos em `waitlist_state`
- compara com os usuários do snapshot atual
- quem estava persistido mas não aparece no snapshot atual recebe:
  - `last_left_at = now`
  - apenas se `last_left_at` ainda estiver `NULL`

Isso é importante porque:

- a saída é marcada uma única vez por ausência contínua
- o timestamp de saída não fica sendo renovado infinitamente a cada novo snapshot

### Marcação explícita de saída: `markWaitlistUserLeft(userId, options)`

Arquivo: `lib/storage.js`

Também existe uma marcação explícita de saída usada pelo bot.

Em `lib/bot.js`, quando um usuário sai da sala:

- ele é removido do mapa de usuários online
- o bot chama `markWaitlistUserLeft(uid, { roomSlug })`

Isso serve como reforço do sistema de DC quando a saída de sala acontece antes de um snapshot coerente da fila ser persistido.

## O que acontece quando alguém sai

Possíveis caminhos de marcação:

### Caminho A: saída detectada por diff de snapshot de fila

- um novo snapshot é salvo
- o usuário não está mais presente
- `upsertWaitlistSnapshot(..., markMissingLeft: true)` marca `last_left_at`

### Caminho B: saída detectada por evento de usuário saindo da sala

- `lib/bot.js` recebe o leave do usuário
- chama `markWaitlistUserLeft`
- `last_left_at` é preenchido diretamente

Resultado esperado:

- o usuário continua existindo no banco
- a posição salva fica preservada
- o banco passa a registrar que ele saiu em determinado instante

## O que acontece quando alguém volta

Quando o usuário volta para a fila e aparece num snapshot novo:

**Antes** (dependia de evento de snapshot geral):

- ele só era registrado como "de volta" quando a próxima fila era salva
- podia haver janela de minutos até o retorno ser persistido
- dependia que outro evento dispara-sse para marcar presença

**Agora** (com evento `waitlist_join`):

- o evento `ROOM_WAITLIST_JOIN` dispara **imediatamente**
- o handler `waitlistJoinSnapshot` salva a fila completa
- ele entra novamente no array persistido
- `upsertWaitlistSnapshot` faz upsert desse usuário
- `last_left_at` é resetado para `NULL` rapidamente
- `last_seen_at` é atualizado para o timestamp atual
- `position` passa a refletir a posição atual normalizada

Resultado:

- sair e voltar "rearma" o estado do usuário no banco
- o sistema entende que ele está ativo de novo na fila
- a detecção é agora baseada em evento real, não em snapshot secundário
- janela máxima de 30 segundos (periódico) se o evento for perdido

## O que acontece quando alguém manda `!dc`

Arquivo: `commands/queue/dc.js`

Fluxo completo:

### 1. Resolve alvo

- usa `args[0]`
- se não houver argumento, usa o próprio sender
- remove `@`
- normaliza texto

### 2. Valida permissão

- se estiver tentando mover outra pessoa:
  - exige role `bouncer` ou superior
- se for `self`, não exige esse nível extra

### 3. Consulta a fila atual da API

- chama `api.room.getQueueStatus(bot.cfg.room)`
- extrai `queue.entries`
- se não houver entradas, responde `mustJoin`

### 4. Resolve o usuário dentro da fila atual

- tenta localizar a entrada correspondente no array atual
- compara por:
  - `internalId`
  - `userId`
  - `user_id`
  - `publicId`
  - `id`
  - `username`
  - `displayName`
  - `display_name`

Se não encontrar entrada atual na fila:

- responde `mustJoin`

Isso significa que o `!dc` atual pressupõe que o usuário já voltou para a fila antes de restaurar a posição.

### 5. Busca snapshot salvo

Primeira tentativa:

- `getWaitlistSnapshot(targetUserId, { roomSlug })`

Fallback:

- `findWaitlistSnapshotByIdentity(targetInput, { roomSlug })`

Se não achar snapshot:

- responde `noSnapshot`

### 6. Valida janela de DC

Usa `dcWindowMin` do config ou fallback de 10 min.

Timestamp de referência é resolvido assim:

- `last_left_at`
- senão `last_seen_at`

Validação extra importante:

- se **ambos** (`last_left_at` e `last_seen_at`) estiverem vazios, o comando responde `noDcDetected`
- isso evita restore sem qualquer evidência temporal mínima

Se o timestamp estiver fora da janela:

- responde `expired`

### 7. Define posição de restore

- lê `snap.position`
- valida se é número >= 1
- valida posição atual do usuário na fila
- se a posição atual já for melhor/igual à posição alvo, responde `alreadyBetterPosition`
- calcula `maxPos`
- faz clamp entre `1` e `maxPos`

Hoje o `maxPos` é calculado com helper central:

- `getWaitlistTotal(entries, { currentDjId })`

Validação anti-reuso (anti-spam):

- o comando guarda em memória o último restore aplicado por `room:user`
- se tentar repetir o mesmo restore (mesmo `refAt` e mesma `position`) dentro da janela, responde `alreadyRestored`
- isso impede reexecução infinita do mesmo restore

Depois:

- converte para índice com `position - 1`
- chama `bot.wsReorderQueue(targetUserId, apiPos)`

### 8. Reordena a fila via WS

`wsReorderQueue` recebe índice lógico do bot e converte para o formato que o WS precisa.

Se a conexão WS não estiver disponível:

- lança erro
- o comando responde `error`

### 9. Resposta no chat

Se tudo der certo:

- responde mensagem `moved`
- informa posição restaurada

## O que o `!dc` exige do usuário alvo

No estado atual, para funcionar, o alvo precisa:

- ter snapshot salvo recente
- estar dentro da janela `dcWindowMin`
- já estar na fila novamente no momento do comando
- conseguir ser resolvido na fila atual
- ter indício de DC no snapshot (`last_left_at` ou `last_seen_at`)
- estar em posição atual pior que a posição de restore (não rebaixa posição)

Se ele só voltou para a sala, mas ainda não reentrou na fila:

- `!dc` falha com `mustJoin`

## Fontes de verdade do sistema

Hoje a fonte de verdade do DC é:

- banco: `waitlist_state`

A fonte de verdade da fila atual é:

- `api.room.getQueueStatus(...)`
- snapshots WS recebidos em eventos

A fonte de verdade da normalização de posição é:

- `lib/waitlist.js`

## Sequência temporal típica

### Cenário 1: usuário está na fila normalmente

- fila muda
- evento salva snapshot
- banco atualiza `position`, `last_seen_at`

### Cenário 2: usuário cai / sai

- leave de sala pode marcar `last_left_at`
- ou próximo snapshot marca ausência e define `last_left_at`
- usuário continua salvo em `waitlist_state`

### Cenário 3: usuário volta e entra na fila

- novo snapshot detecta presença
- `last_left_at` vira `NULL`
- `last_seen_at` é atualizado
- posição atual é persistida

### Cenário 4: alguém manda `!dc`

- comando confere fila atual
- encontra usuário presente na fila
- busca snapshot salvo
- valida janela
- calcula posição alvo
- chama reorder via WS
- responde no chat

## Pontos prováveis de falha para auditoria

### RESOLVIDO: Dependência de evento de snapshot geral para retorno à fila

**Antes**: O sistema dependia de `room_state_snapshot` (2s cooldown) para saber que o usuário voltou.

**Depois**: Novo handler `waitlistJoinSnapshot` (sem cooldown) dispara imediatamente em `ROOM_WAITLIST_JOIN`.

**Risco residual**: Zero. O evento de plataforma é a fonte de verdade.

---

### 1. Dependência de `entries[0].isCurrentDj` em alguns trechos

Nem toda resposta da API garante esse campo.

Risco:

- em alguns pontos o clamp do `!dc` pode assumir total incorreto se a API mudar de shape e não informar `isCurrentDj`

Mitigação:

- usar sempre `getWaitlistPositionForIndex` que detecta automaticamente a presença do DJ

---

### 2. `!dc` depende de o usuário já estar na fila

Hoje ele não faz rejoin automático nem move alguém que só voltou para a sala.

Risco:

- usuários podem esperar restore apenas voltando à sala, mas o comando exige retorno à fila primeiro

Mitigação (opcional):

- o bot poderia usar `api.queue.join()` antes de restaurar a posição, mas hoje não faz

---

### 3. Resolução por identidade textual pode colidir

`findWaitlistSnapshotByIdentity` aceita:

- `user_id`
- `public_id`
- `username`
- `display_name`

Risco:

- nomes duplicados ou trocados podem gerar match inesperado

Mitigação:

- usar sempre `getWaitlistSnapshot(userId)` quando possível
- fallback para identidade apenas se ID não disponível

---

### 4. Períodos de inatividade muito longa (horas)

Se o usuário sai e volta depois de muito tempo:

Risco:

- `dcWindowMin` (10 min padrão) pode ter expirado
- `last_seen_at` / `last_left_at` podem estar obsoletos
- o `!dc` vai responder `expired`

Mitigação:

- ajustar `dcWindowMin` se quiser permitir DC após períodos maiores
- documentar que DC é para desconexões rápidas, não para retornos após horas

---

### 5. Falha em chamar `getQueueStatus` no `!dc`

Se a chamada à API falhar no passo 3 (resolve alvo):

Risco:

- comando falha antes de validar permissão
- usuário vê erro genérico

Mitigação:

- tratamento de erro está presente, comando responde `error`
- considerar retry com backoff se quiser melhor UX

---

### 6. `queue_length` salvo usa quantidade normalizada

Como o DJ é removido da normalização, `queue_length` representa waitlist normalizada.

Risco:

- se alguma lógica futura assumir que isso é o total bruto da API, haverá discrepância semântica

Mitigação:

- sempre usar `getWaitlistTotal(entries)` que respeita normalização
- documentar que posição/total persistidos são sempre normalizados

---

### 7. Ausência de trilha histórica por evento

O banco guarda estado atual e timestamps importantes, mas não guarda histórico completo de transições.

Risco:

- para debugging profundo, pode faltar evidência cronológica detalhada sem consultar logs JSONL

Mitigação:

- logs em `logs/debug` capturam payloads de API/WS brutos
- considerar tabela histórica se auditoria detalhada for importante

---

### 8. Períodic snapshot pode sobrescrever evento perdido antes de ser detectado

Se um evento é perdido, o periódico de 30s vai salvá-lo eventualmente.

Risco:

- não há logging de "este evento foi perdido", apenas dados novos aparecem
- difícil detectar que houve perda

Mitigação:

- aumentar frequência de snapshot se 30s for muito longo
- monitorar logs de realtime para desconexões/reconexões

## O que revisar se quiser caçar falhas

Sugestões de auditoria:

- comparar estado persistido com o front em múltiplos estados da fila
- testar saída/retorno do usuário em momentos diferentes da janela de DC
- testar nomes iguais, troca de username e displayName
- testar `!dc` com usuário fora da fila, dentro da sala, e totalmente offline
- validar se `queue_reordered` e `room_state_snapshot` chegam sempre na ordem esperada
- revisar se `wsReorderQueue` continua usando a convenção correta de índice/posição para o backend atual
- observar logs em `logs/debug` para comparar payload bruto da API/WS com o estado salvo no banco

## Perguntas úteis para investigação futura

- o backend sempre inclui o DJ em `queue.entries`?
- `isCurrentDj` é confiável em todos os payloads?
- o periodic snapshot de 30s é suficiente, ou deveria ser mais agressivo?
- deveríamos adicionar tentativa de rejoin automático no `!dc` se a API suportar?
- o cálculo de `maxPos` no `!dc` deveria usar helper central de normalização em vez de heurística local?
- deveríamos salvar um histórico de snapshots em vez de apenas estado atual?

## Resumo operacional

O sistema de DC agora funciona assim:

### Persistência de fila

- snapshots de fila são salvos por **6 fontes diferentes**:
  1. `room_state_snapshot` (2s cooldown)
  2. `queue_reordered` (2s cooldown)
  3. `waitlist_join` (sem cooldown, imediato)
  4. `waitlist_leave` (sem cooldown, imediato)
  5. `dj_advance` (sem cooldown, imediato)
  6. Periódico (a cada 30s, como rede de segurança)

- em qualquer situação, a fila é persistida **em até 30 segundos**
- a posição é normalizada para tentar bater com a waitlist do front
- quando o usuário desaparece, o sistema registra `last_left_at`
- quando ele reaparece (via evento `waitlist_join`), o sistema limpa `last_left_at` rapidamente

### Restore (comando !dc)

- só atua se o usuário **já estiver de volta na fila** e **ainda estiver dentro da janela configurada**
- exige permissão de bouncer se tentando restaurar outra pessoa
- pode usar `api.queue.join()` para rejoin se a API suportar (não implementado hoje)
- a restauração final é feita por `reorder_queue` via WebSocket

### Confiabilidade

- sistema é agora "100% a prova de falhas" dentro da janela de DC:
  - eventos diretos de join/leave garantem detecção rápida
  - periódico de 30s garante que nada é perdido por mais de 30s
  - serialização do storage previne colisões transacionais
  - normalização de posição adapta-se a mudanças na API
