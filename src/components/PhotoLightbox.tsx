import { useEffect, useRef } from "react";
import { texte } from "../lib/textes";

interface PhotoLightboxProps {
  open: boolean;
  src: string | null;
  alt: string;
  onClose: () => void;
}

export function PhotoLightbox({ open, src, alt, onClose }: PhotoLightboxProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && src && !dialog.open) dialog.showModal();
    if ((!open || !src) && dialog.open) dialog.close();
  }, [open, src]);

  return (
    <dialog
      className="photo-lightbox"
      ref={dialogRef}
      aria-label={texte("photoTitre")}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }}
    >
      <button
        className="photo-lightbox-close"
        type="button"
        aria-label={texte("fermer")}
        onClick={() => dialogRef.current?.close()}
      >
        ×
      </button>
      {src && <img className="photo-lightbox-image" src={src} alt={alt} />}
    </dialog>
  );
}
