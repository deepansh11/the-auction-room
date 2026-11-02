import { useEffect, useRef } from "react";
import { apiGetSession } from "./api.js";
import { acceptSessionSnapshot, subscribeToSessionStream } from "./realtime.js";
import { createRefreshController } from "./refreshController.js";

export function useSessionRealtime(sessionId, user, handlers) {
  const callbacks = useRef(handlers);
  callbacks.current = handlers;
  useEffect(() => {
    const controller = createRefreshController({
      fetchLatest: () => apiGetSession(sessionId, user?.token),
      applyLatest: next => acceptSessionSnapshot(sessionId, next),
      onError: error => callbacks.current.onError?.(error),
      isHidden: () => document.hidden,
    });
    const unsubscribe = subscribeToSessionStream(sessionId, {
      onUpdate: next => callbacks.current.onUpdate?.(next),
      onClosed: (next, reason) => callbacks.current.onClosed?.(next, reason),
      onStatus: healthy => { controller.setHealthy(healthy); callbacks.current.onStatus?.(healthy); },
      onPending: command => callbacks.current.onPending?.(command),
      onError: error => callbacks.current.onError?.(error),
    }, user?.username, user?.token);
    const onFocus = () => controller.refresh();
    const onVisibility = () => { if (!document.hidden) controller.refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    controller.start();
    return () => {
      controller.stop();
      unsubscribe();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [sessionId, user?.username, user?.token]);
}
