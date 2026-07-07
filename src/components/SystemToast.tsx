"use client";

/**
 * SystemToast — krátké systémové oznámení (např. „Link is copied!"). Centrované
 * dole se spacingem; auto-zmizí. Glassmorphism dle design-system-netflix.
 */
import { useEffect } from "react";

export interface SystemToastProps {
  /** Text k zobrazení, nebo `null` (skryto). */
  readonly message: string | null;
  /** Vymaže zprávu po vypršení. */
  readonly onClear: () => void;
  /** Doba zobrazení v ms (výchozí 2500). */
  readonly durationMs?: number;
}

export function SystemToast({ message, onClear, durationMs = 2500 }: SystemToastProps) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClear, durationMs);
    return () => clearTimeout(t);
  }, [message, durationMs, onClear]);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        animation: "toast-in 220ms ease-out",
        borderColor: "color-mix(in oklab, var(--color-chalk-white) 15%, transparent)",
        boxShadow: "0 8px 30px rgba(0, 0, 0, 0.5)",
      }}
      className="fixed bottom-8 left-1/2 z-[80] -translate-x-1/2 rounded-[var(--radius-pills)] border bg-[color:var(--color-deep-space)]/70 px-6 py-3 text-[length:var(--text-body)] font-medium text-[color:var(--color-chalk-white)] backdrop-blur-md"
    >
      {message}
    </div>
  );
}

export default SystemToast;
