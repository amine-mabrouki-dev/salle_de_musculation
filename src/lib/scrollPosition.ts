export interface PositionDefilement {
  x: number;
  y: number;
}

export function capturerPositionDefilement(): PositionDefilement {
  return { x: window.scrollX, y: window.scrollY };
}

export function restaurerPositionDefilement(position: PositionDefilement): () => void {
  let premierCadre = 0;
  let secondCadre = 0;
  premierCadre = window.requestAnimationFrame(() => {
    secondCadre = window.requestAnimationFrame(() => {
      window.scrollTo(position.x, position.y);
    });
  });
  return () => {
    window.cancelAnimationFrame(premierCadre);
    window.cancelAnimationFrame(secondCadre);
  };
}
