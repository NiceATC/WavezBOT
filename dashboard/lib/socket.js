"use client";

import { useEffect, useRef } from "react";
import { WS_BASE, buildApiUrl } from "./constants";

export function useDashboardSocket(token, onMessage) {
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    let active = true;
    let ws;
    let reconnectTimer;
    let reconnectAttempt = 0;

    const scheduleReconnect = () => {
      if (!active) return;
      const delay = Math.min(1000 * 2 ** reconnectAttempt, 10_000);
      reconnectAttempt += 1;
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        connect();
      }, delay);
    };

    const connect = async () => {
      const url = new URL("/ws", WS_BASE);
      if (token) {
        url.searchParams.set("token", token);
      } else {
        try {
          const res = await fetch(buildApiUrl("/api/ws-token"));
          const data = await res.json().catch(() => ({}));
          if (data?.token) url.searchParams.set("wsToken", data.token);
        } catch {
          // ignore
        }
      }

      if (!active) return;
      ws = new WebSocket(url.toString());

      ws.onopen = () => {
        reconnectAttempt = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handlerRef.current?.(data);
        } catch {
          // ignore
        }
      };

      ws.onerror = () => {
        try {
          ws?.close();
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      active = false;
      clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [token]);
}
