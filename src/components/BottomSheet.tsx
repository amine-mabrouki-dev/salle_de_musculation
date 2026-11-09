import { useEffect, useId, useRef, type ReactNode } from "react";
import {
  capturerPositionDefilement,
  restaurerPositionDefilement,
  type PositionDefilement,
} from "../lib/scrollPosition";
import { texte } from "../lib/textes";

interface BottomSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function BottomSheet({ open, title, onClose, children }: BottomSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const positionAvantOuverture = useRef<PositionDefilement | null>(null);
  const annulerRestauration = useRef<(() => void) | null>(null);

  function restaurerDefilement(): void {
    if (!positionAvantOuverture.current) return;
    annulerRestauration.current?.();
    annulerRestauration.current = restaurerPositionDefilement(positionAvantOuverture.current);
    positionAvantOuverture.current = null;
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      positionAvantOuverture.current = capturerPositionDefilement();
      dialog.showModal();
    }
    if (!open && dialog.open) {
      dialog.close();
      restaurerDefilement();
    }
  }, [open]);

  return (
    <dialog
      className="bottom-sheet"
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={() => {
        onClose();
        restaurerDefilement();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }}
    >
      <div className="bottom-sheet-content">
        <div className="bottom-sheet-heading">
          <h2 id={titleId}>{title}</h2>
          <button
            className="icon-button"
            type="button"
            aria-label={texte("fermer")}
            onClick={() => dialogRef.current?.close()}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
