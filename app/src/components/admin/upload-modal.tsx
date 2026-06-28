"use client";

/**
 * UploadModal — popup obal nad `UploadWizard` (plán 012). Stejný wizard 1:1
 * jako stránka `/upload`, jen v dialogu. Esc / klik na pozadí zavře.
 */
import { useEffect } from "react";
import { X } from "lucide-react";
import { UploadWizard, type UploadWizardProps } from "./upload-wizard";

export interface UploadModalProps extends UploadWizardProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

export function UploadModal({ open, onClose, ...wizard }: UploadModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Nahrát média"
      className="fixed inset-0 z-[70] overflow-y-auto bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="flex min-h-full items-center justify-center p-4 sm:p-8">
        <div
          className="relative w-full max-w-3xl"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Zavřít"
            className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--color-charcoal)] bg-[color:var(--color-deep-space)]/70 text-chalk-white backdrop-blur-md transition-colors hover:text-netflix-red"
          >
            <X aria-hidden size={18} />
          </button>
          <UploadWizard {...wizard} />
        </div>
      </div>
    </div>
  );
}
