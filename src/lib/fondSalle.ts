const cleFondSalle = "moulares:gym-background:v1";

export function lireFondSalle(): string | null {
  return localStorage.getItem(cleFondSalle);
}

export function enregistrerFondSalle(image: string): void {
  localStorage.setItem(cleFondSalle, image);
}

export function reinitialiserFondSalle(): void {
  localStorage.removeItem(cleFondSalle);
}

export function proprietesFondSalle(image: string | null): void {
  if (image) {
    document.documentElement.style.setProperty("--user-gym-background", `url("${image}")`);
  } else {
    document.documentElement.style.removeProperty("--user-gym-background");
  }
}

export async function convertirImageRedimensionneeEnBlob(file: File): Promise<Blob> {
  const dataUrl = await redimensionnerImage(file);
  const reponse = await fetch(dataUrl);
  if (!reponse.ok) {
    throw new Error("Impossible de préparer la photo pour son envoi.");
  }
  return reponse.blob();
}

export async function redimensionnerImage(file: File): Promise<string> {
  const image = await chargerImage(file);
  const maxDimension = 1600;
  const ratio = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Le navigateur ne permet pas de préparer cette image.");
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

function chargerImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Cette image ne peut pas être ouverte. Choisissez un autre fichier."));
    };
    image.src = url;
  });
}
