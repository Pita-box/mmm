"use client";

/**
 * ModelProfileForm — vytvoření/editace profilu modelu (task 20.6, R4.1).
 *
 * Formulář pro jméno (1–100) a volitelné bio (0–1000). Validace běží přes
 * sdílená čistá jádra (`validateModelName`, `validateBio`), takže UI odmítne
 * neplatný vstup ještě před odesláním a zobrazí chybu u konkrétního pole
 * (R4.2, R4.3, R4.5). Skutečné uložení (Model_Service) doplní task 21.2 —
 * komponenta volá injektovaný `onSubmit`, který je zatím TODO stub.
 */
import { useState } from "react";
import { UserPlus, Save } from "lucide-react";
import { validateModelName, validateBio, LENGTH_BOUNDS } from "@/lib/validation";
import { AdminCard, Field, TextInput, TextArea, Button, WiringNotice } from "./admin-ui";

export interface ModelProfileValues {
  readonly name: string;
  readonly bio: string;
}

export interface ModelProfileFormProps {
  /** Počáteční hodnoty pro editaci; prázdné pro vytvoření. */
  readonly initial?: ModelProfileValues;
  /** Režim formuláře — řídí jen popisky. */
  readonly mode?: "create" | "edit";
  /**
   * Odeslání platných hodnot. TODO(task 21): napojit na Model_Service
   * (createProfile / updateProfile) přes server action.
   */
  readonly onSubmit?: (values: ModelProfileValues) => void | Promise<void>;
}

export function ModelProfileForm({
  initial,
  mode = "create",
  onSubmit,
}: ModelProfileFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [bio, setBio] = useState(initial?.bio ?? "");
  const [submitted, setSubmitted] = useState(false);

  const nameError =
    submitted && !validateModelName(name)
      ? `Jméno musí mít ${LENGTH_BOUNDS.modelName.min}–${LENGTH_BOUNDS.modelName.max} znaků.`
      : null;
  const bioError =
    submitted && !validateBio(bio)
      ? `Bio nesmí přesáhnout ${LENGTH_BOUNDS.bio.max} znaků.`
      : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!validateModelName(name) || !validateBio(bio)) return;
    // TODO(task 21): napojit na Model_Service přes server action.
    void onSubmit?.({ name, bio });
  }

  return (
    <AdminCard
      title={mode === "edit" ? "Upravit profil modelu" : "Nový profil modelu"}
      description="Jméno 1–100 znaků, bio je volitelné (max 1000 znaků)."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <Field
          label="Jméno modelu"
          htmlFor="model-name"
          error={nameError}
          hint={`${name.length}/${LENGTH_BOUNDS.modelName.max}`}
        >
          <TextInput
            id="model-name"
            value={name}
            maxLength={LENGTH_BOUNDS.modelName.max}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jméno modelu"
            aria-invalid={nameError != null}
          />
        </Field>

        <Field
          label="Bio"
          htmlFor="model-bio"
          error={bioError}
          hint={`${bio.length}/${LENGTH_BOUNDS.bio.max}`}
        >
          <TextArea
            id="model-bio"
            value={bio}
            maxLength={LENGTH_BOUNDS.bio.max}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Krátký popis modelu (volitelné)"
            aria-invalid={bioError != null}
          />
        </Field>

        <div>
          <Button type="submit">
            {mode === "edit" ? (
              <>
                <Save aria-hidden size={16} />
                Uložit změny
              </>
            ) : (
              <>
                <UserPlus aria-hidden size={16} />
                Vytvořit profil
              </>
            )}
          </Button>
        </div>
      </form>
      <WiringNotice />
    </AdminCard>
  );
}
