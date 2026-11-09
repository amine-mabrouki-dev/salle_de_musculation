import { texte } from "../lib/textes";

export type Status = "actif" | "bientot" | "expire";

const icones: Record<Status, string> = {
  actif: "✓",
  bientot: "!",
  expire: "×",
};

interface StatusChipProps {
  status: Status;
  label?: string;
}

export function StatusChip({ status, label }: StatusChipProps) {
  const libelles: Record<Status, string> = {
    actif: texte("statutValide"),
    bientot: texte("statutBientot"),
    expire: texte("statutTermine"),
  };
  return (
    <span className={`status-chip status-chip-${status}`} aria-label={label ?? libelles[status]}>
      <span className="status-chip-icon" aria-hidden="true">{icones[status]}</span>
      {label ?? libelles[status]}
    </span>
  );
}
