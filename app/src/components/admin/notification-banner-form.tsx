"use client";

/**
 * NotificationBannerForm — aktivace/deaktivace globálního oznámení (task 20.6).
 *
 * Admin zadá text (1–500 znaků) a banner aktivuje (R17.1) nebo aktuální banner
 * deaktivuje (R17.2). Validace délky běží přes sdílené čisté jádro
 * (`validateNotificationText`), takže neplatný text se odmítne ještě před
 * odesláním (R17.3). Skutečné uložení (Notification_Service) doplní task 21.2 —
 * `onActivate` / `onDeactivate` jsou zatím TODO stuby.
 */
import { useState } from "react";
import { Megaphone, BellOff } from "lucide-react";
import { validateNotificationText } from "@/lib/validation";
import { LENGTH_BOUNDS } from "@/lib/validation";
import { AdminCard, Field, TextArea, Button, Badge, WiringNotice } from "./admin-ui";

export interface NotificationBannerFormProps {
  /** Aktuálně aktivní text banneru, nebo `null` když žádný není aktivní. */
  readonly activeText?: string | null;
  /** TODO(task 21): napojit na Notification_Service.activate. */
  readonly onActivate?: (text: string) => void | Promise<void>;
  /** TODO(task 21): napojit na Notification_Service.deactivate. */
  readonly onDeactivate?: () => void | Promise<void>;
}

export function NotificationBannerForm({
  activeText = null,
  onActivate,
  onDeactivate,
}: NotificationBannerFormProps) {
  const [text, setText] = useState(activeText ?? "");
  const [submitted, setSubmitted] = useState(false);

  const textError =
    submitted && !validateNotificationText(text)
      ? `Text musí mít ${LENGTH_BOUNDS.notificationText.min}–${LENGTH_BOUNDS.notificationText.max} znaků.`
      : null;

  function handleActivate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!validateNotificationText(text)) return;
    // TODO(task 21): napojit na Notification_Service.activate.
    void onActivate?.(text);
  }

  return (
    <AdminCard
      title="Oznamovací banner"
      description="Globální oznámení pro všechny přihlášené uživatele (text 1–500 znaků)."
    >
      {activeText ? (
        <p className="mb-4 flex items-center gap-2 text-[length:var(--text-caption)] text-silver">
          <Badge tone="negative">Aktivní</Badge>
          <span className="truncate">{activeText}</span>
        </p>
      ) : (
        <p className="mb-4 text-[length:var(--text-caption)] text-ash">
          Žádné aktivní oznámení.
        </p>
      )}

      <form onSubmit={handleActivate} className="flex flex-col gap-5" noValidate>
        <Field
          label="Text oznámení"
          htmlFor="notification-text"
          error={textError}
          hint={`${text.length}/${LENGTH_BOUNDS.notificationText.max}`}
        >
          <TextArea
            id="notification-text"
            value={text}
            maxLength={LENGTH_BOUNDS.notificationText.max}
            onChange={(e) => setText(e.target.value)}
            placeholder="Text zobrazený všem uživatelům"
            aria-invalid={textError != null}
          />
        </Field>

        <div className="flex gap-3">
          <Button type="submit">
            <Megaphone aria-hidden size={16} />
            {activeText ? "Aktualizovat oznámení" : "Aktivovat oznámení"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!activeText}
            onClick={() => {
              void onDeactivate?.();
            }}
          >
            <BellOff aria-hidden size={16} />
            Deaktivovat
          </Button>
        </div>
      </form>
      <WiringNotice />
    </AdminCard>
  );
}
