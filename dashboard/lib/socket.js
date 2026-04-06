"use client";

import { useEffect, useRef } from "react";
import { WS_BASE, buildApiUrl } from "./constants";

export function useDashboardSocket(token, onMessage) {
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    let active = true;
    let ws;

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

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handlerRef.current?.(data);
        } catch {
          // ignore
        }
      };
    };

    connect();

    return () => {
      active = false;
      if (ws) ws.close();
    };
  }, [token]);
}
