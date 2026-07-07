"use client";

/**
 * SettingsPanel — klientská část stránky Settings (task 21.2).
 *
 * Tři nezávislé bloky: uložení profilu (R18.1/R18.2), změna hesla
 * (R18.3–R18.5) a přesměrování na Telegram v nové záložce (R19.1/R19.2).
 * Validace je autoritou služeb na serveru; tady jen zobrazujeme jejich
 * výsledek. Mutace běží přes předané server actions.
 */
import { useActionState, useState, useTransition } from "react";
import { Save, KeyRound, Send } from "lucide-react";
import { AdminCard, Field, TextInput, Button } from "@/components/admin";
import type { FormState, TelegramTarget } from "@/app/(app)/settings/settings-actions";

type FormAction = (prev: FormState, formData: FormData) => Promise<FormState>;

const INITIAL: FormState = { ok: false, error: null };

function Feedback({ state, success }: { state: FormState; success: string }) {
  if (state.error) {
    return (
      <p role="alert" className="text-[length:var(--text-caption)] text-netflix-red">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p role="status" className="text-[length:var(--text-caption)] text-silver">
        {success}
      </p>
    );
  }
  return null;
}

export interface SettingsPanelProps {
  readonly initialDisplayName: string;
  readonly saveProfile: FormAction;
  readonly changePassword: FormAction;
  readonly telegramTarget: () => Promise<TelegramTarget>;
}

export function SettingsPanel({
  initialDisplayName,
  saveProfile,
  changePassword,
  telegramTarget,
}: SettingsPanelProps) {
  const [profileState, profileAction, profilePending] = useActionState(
    saveProfile,
    INITIAL,
  );
  const [passwordState, passwordAction, passwordPending] = useActionState(
    changePassword,
    INITIAL,
  );

  const [telegramError, setTelegramError] = useState<string | null>(null);
  const [telegramPending, startTelegram] = useTransition();

  function openTelegram() {
    setTelegramError(null);
    startTelegram(async () => {
      const target = await telegramTarget();
      if ("url" in target) {
        // R19.2 — otevřít v nové záložce, původní stránku ponechat.
        window.open(target.url, "_blank", "noopener,noreferrer");
      } else {
        setTelegramError(target.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <AdminCard
        title="Profile"
        description="Update your display name (1–255 characters)."
      >
        <form action={profileAction} className="flex flex-col gap-5" noValidate>
          <Field label="Display name" htmlFor="displayName">
            <TextInput
              id="displayName"
              name="displayName"
              defaultValue={initialDisplayName}
              maxLength={255}
              placeholder="Your name"
            />
          </Field>
          <Feedback state={profileState} success="Profile saved." />
          <div>
            <Button type="submit" disabled={profilePending}>
              <Save aria-hidden size={16} />
              {profilePending ? "Saving…" : "Save profile"}
            </Button>
          </div>
        </form>
      </AdminCard>

      <AdminCard
        title="Change password"
        description="Enter your current and new password (8–128 characters)."
      >
        <form action={passwordAction} className="flex flex-col gap-5" noValidate>
          <Field label="Current password" htmlFor="currentPassword">
            <TextInput
              id="currentPassword"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
            />
          </Field>
          <Field label="New password" htmlFor="newPassword">
            <TextInput
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
            />
          </Field>
          <Feedback state={passwordState} success="Password changed." />
          <div>
            <Button type="submit" disabled={passwordPending}>
              <KeyRound aria-hidden size={16} />
              {passwordPending ? "Changing…" : "Change password"}
            </Button>
          </div>
        </form>
      </AdminCard>

      <AdminCard
        title="Telegram"
        description="Go to the private Telegram group (opens in a new tab)."
      >
        <div className="flex flex-col gap-3">
          {telegramError ? (
            <p role="alert" className="text-[length:var(--text-caption)] text-netflix-red">
              {telegramError}
            </p>
          ) : null}
          <div>
            <Button type="button" onClick={openTelegram} disabled={telegramPending}>
              <Send aria-hidden size={16} />
              {telegramPending ? "Opening…" : "Open Telegram"}
            </Button>
          </div>
        </div>
      </AdminCard>
    </div>
  );
}
