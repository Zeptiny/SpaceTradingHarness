import { io } from "socket.io-client";
import { api } from "../client/index.js";
import { bus } from "./bus.js";
import { scheduler } from "../agent/scheduler.js";
import { runtime } from "../state/runtime.js";

const MIN_WAKE_GAP_MS = 10_000;

export async function startSocketIngest(): Promise<void> {
  try {
    const { data } = await api.socketUrl();
    const url = (data as { url?: string })?.url;
    if (typeof url !== "string" || !url) {
      console.warn("[socket] no url returned; skipping ingest");
      return;
    }
    const socket = io(url, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelayMax: 30_000,
    });
    let lastWake = 0;

    socket.on("connect", () => {
      runtime.socket.connected = true;
      console.log("[socket] connected to SpaceTraders event stream");
    });
    socket.on("disconnect", () => {
      runtime.socket.connected = false;
      console.warn("[socket] disconnected; scheduler wakeups still active");
    });
    socket.on("connect_error", err => {
      runtime.socket.connected = false;
      console.warn("[socket] connect error:", err.message);
    });

    socket.onAny((event, ...args) => {
      runtime.socket.lastEventAt = Date.now();
      runtime.socket.events++;
      const payload = args[0];
      bus.emit({ type: "GameEvent", ts: Date.now(), event, payload });
      const now = Date.now();
      if (now - lastWake > MIN_WAKE_GAP_MS && !scheduler.paused) {
        lastWake = now;
        scheduler.wakeNow(`socket event: ${event}`);
      }
    });
  } catch (err) {
    console.warn("[socket] ingest unavailable (falling back to scheduler only):", err instanceof Error ? err.message : err);
  }
}
