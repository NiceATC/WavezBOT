/**
 * lib/realtime/connection.js
 *
 * Connection lifecycle helpers for the Wavez realtime bot client.
 * Uses plain event strings ("open", "close", etc.) from @wavezfm/api.
 */

export function onPipelineOpen(client, handler) {
  return client.on("open", handler);
}

export function onPipelineClose(client, handler) {
  return client.on("close", handler);
}

export function onPipelineConnected(client, handler) {
  return client.on("connected", handler);
}

export function onPipelineError(client, handler) {
  return client.on("socket_error", handler);
}

export function onPipelinePacket(client, handler) {
  return client.on("packet", handler);
}
