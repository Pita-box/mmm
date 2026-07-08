/**
 * Admin_Console — rozcestník administrátorských rozhraní (task 20.6, R3.4).
 *
 * Přístup jen pro roli Admin; skutečné vynucení (middleware) doplní task 21.
 * Tato stránka jen vykresluje navigaci na jednotlivé administrátorské sekce.
 */
import Link from "next/link";
import { Film, Users, UserCog, EyeOff, Megaphone, Tags, Lock, type LucideIcon } from "lucide-react";
import { requireUploader } from "@/lib/session";
import { canManageAdmin } from "@/lib/permissions";

const ADMIN_SECTIONS: readonly {
  href: string;
  title: string;
  desc: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}[] = [
  { href: "/admin/media", title: "Media", desc: "Upload, tagging and publish scheduling.", icon: Film },
  { href: "/admin/models", title: "Models", desc: "Create and edit model profiles.", icon: Users },
  { href: "/admin/tags", title: "Tags", desc: "Manage tag values — rename and delete.", icon: Tags, adminOnly: true },
  { href: "/admin/users", title: "Users", desc: "Accounts overview, roles, blocking and membership.", icon: UserCog, adminOnly: true },
  { href: "/admin/membership-gate", title: "Membership gate", desc: "Pick sample photos for the membership gate.", icon: Lock, adminOnly: true },
  { href: "/admin/pages", title: "Page visibility", desc: "Globally hide and show sections.", icon: EyeOff, adminOnly: true },
  { href: "/admin/notifications", title: "Notifications", desc: "Global notification banner.", icon: Megaphone, adminOnly: true },
];

export default async function AdminConsole() {
  // Distributor vidí jen média/modely; Admin-only sekce skryjeme (decideAccess je i tak blokuje).
  const principal = await requireUploader();
  const sections = ADMIN_SECTIONS.filter(
    (s) => !s.adminOnly || canManageAdmin(principal.role),
  );
  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-[length:var(--text-heading-sm)] font-black text-chalk-white">
          Admin Console
        </h1>
        <p className="mt-2 text-[length:var(--text-body)] text-silver">
          Manage content, users, pages and notifications.
        </p>
      </header>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <li key={section.href}>
              <Link
                href={section.href}
                className="block h-full rounded-[var(--radius-2xl)] border border-graphite bg-[color:var(--color-deep-space)] p-5 transition-colors hover:border-netflix-red"
              >
                <Icon aria-hidden size={24} className="mb-3 text-netflix-red" />
                <h2 className="text-[length:var(--text-subheading)] font-bold text-chalk-white">
                  {section.title}
                </h2>
                <p className="mt-1 text-[length:var(--text-caption)] text-silver">
                  {section.desc}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
