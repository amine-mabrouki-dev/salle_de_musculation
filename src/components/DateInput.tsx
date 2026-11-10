import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { texte } from "../lib/textes";

interface DateInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
}

function formaterDate(dateIso: string): string {
  const resultat = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso);
  return resultat ? `${resultat[3]}/${resultat[2]}/${resultat[1]}` : "";
}

function convertirDate(dateAffichee: string): string | null {
  const resultat = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateAffichee);
  if (!resultat) return null;
  const [, jour, mois, annee] = resultat;
  const date = new Date(Date.UTC(Number(annee), Number(mois) - 1, Number(jour)));
  if (
    date.getUTCFullYear() !== Number(annee)
    || date.getUTCMonth() !== Number(mois) - 1
    || date.getUTCDate() !== Number(jour)
  ) return null;
  return `${annee}-${mois}-${jour}`;
}

function formaterSaisie(valeur: string): string {
  const chiffres = valeur.replace(/\D/g, "").slice(0, 8);
  if (chiffres.length <= 2) return chiffres;
  if (chiffres.length <= 4) return `${chiffres.slice(0, 2)}/${chiffres.slice(2)}`;
  return `${chiffres.slice(0, 2)}/${chiffres.slice(2, 4)}/${chiffres.slice(4)}`;
}

export function DateInput({ id, value, onChange, min, max, required = false }: DateInputProps) {
  const [saisie, setSaisie] = useState(() => formaterDate(value));
  const champTexte = useRef<HTMLInputElement>(null);
  const calendrier = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSaisie(formaterDate(value));
  }, [value]);

  function modifierSaisie(event: ChangeEvent<HTMLInputElement>): void {
    const prochaineSaisie = formaterSaisie(event.target.value);
    const dateIso = convertirDate(prochaineSaisie);
    const valide = !prochaineSaisie
      ? !required
      : dateIso !== null
        && (!min || dateIso >= min)
        && (!max || dateIso <= max);
    event.target.setCustomValidity(valide ? "" : texte("dateFormatInvalide"));
    setSaisie(prochaineSaisie);
    if (dateIso && valide) onChange(dateIso);
    else if (!prochaineSaisie) onChange("");
  }

  function ouvrirCalendrier(): void {
    const champ = calendrier.current;
    if (!champ) return;
    if (typeof champ.showPicker === "function") champ.showPicker();
    else champ.click();
  }

  return (
    <span className="date-input-control">
      <input
        ref={champTexte}
        id={id}
        className="date-input-text"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="JJ/MM/AAAA"
        value={saisie}
        onChange={modifierSaisie}
        onBlur={(event) => {
          if (convertirDate(saisie) === null && saisie) {
            event.currentTarget.setCustomValidity(texte("dateFormatInvalide"));
          }
        }}
        maxLength={10}
        pattern={required ? "\\d{2}/\\d{2}/\\d{4}" : "\\d{2}/\\d{2}/\\d{4}|"}
        required={required}
        aria-label={texte("formatDateAide")}
      />
      <button
        className="date-input-calendar-button"
        type="button"
        aria-label={texte("choisirDate")}
        onClick={ouvrirCalendrier}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 2v3M17 2v3M3.5 9h17M5 4.5h14A1.5 1.5 0 0 1 20.5 6v14A1.5 1.5 0 0 1 19 21.5H5A1.5 1.5 0 0 1 3.5 20V6A1.5 1.5 0 0 1 5 4.5Z" />
        </svg>
      </button>
      <input
        ref={calendrier}
        className="date-input-native"
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        min={min}
        max={max}
        onChange={(event) => {
          const date = event.target.value;
          setSaisie(formaterDate(date));
          champTexte.current?.setCustomValidity("");
          onChange(date);
        }}
      />
    </span>
  );
}
