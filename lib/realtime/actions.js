/**
 * lib/realtime/actions.js
 *
 * Helper wrappers for the Wavez realtime bot client actions.
 * The client is the object returned by createRoomBotRealtimeClient().
 */

export function pipelineConnect(client) {
  return client.connect();
}

export function pipelineDisconnect(client) {
  return client.disconnect();
}

export function pipelineSend(client, event, payload) {
  return client.send(event, payload);
}

export function pipelineJoinRoom(client, roomId) {
  return client.joinRoom(roomId);
}

export function pipelineLeaveRoom(client, roomId) {
  return client.leaveRoom(roomId);
}

export function pipelineOn(client, event, listener) {
  return client.on(event, listener);
}

export function pipelineOff(client, event, listener) {
  return client.off(event, listener);
}

export function pipelineOnce(client, event, listener) {
  return client.once(event, listener);
}
