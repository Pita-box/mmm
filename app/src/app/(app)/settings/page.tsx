/**
 * Settings — nastavení uživatelského profilu, hesla a Telegram (R18, R19).
 *
 * Server načte aktuální profil přes Settings_Service a předá klientskému
 * `SettingsPanel` server actions pro uložení profilu, změnu hesla a vyhodnocení
 * Telegram cíle.
 */
import { SettingsPanel } from "@/components/settings/settings-panel"
import { settingsService } from "@/services/settings-service"
import { isOk } from "@/lib/result"
import { requireSession } from "@/lib/session"
import { requireVisibleSection } from "@/lib/section-visibility"
import {
  saveProfileAction,
  changePasswordAction,
  telegramTargetAction,
} from "./settings-actions"

export default async function SettingsPage() {
  const principal = await requireSession()
  await requireVisibleSection("settings", principal.role)
  const profile = await settingsService.getProfile(principal.userId)
  const initialDisplayName = isOk(profile) ? profile.value.displayName : ""

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-[length:var(--text-heading-sm)] font-black text-[color:var(--color-chalk-white)]">
          Settings
        </h1>
        <p className="mt-2 text-[length:var(--text-body)] text-[color:var(--color-silver)]">
          Manage your profile, password, and community access.
        </p>
      </header>

      <SettingsPanel
        initialDisplayName={initialDisplayName}
        saveProfile={saveProfileAction}
        changePassword={changePasswordAction}
        telegramTarget={telegramTargetAction}
      />
    </section>
  )
}
