import { afterEach, describe, expect, it, vi } from "vitest";
import {
  capturerPositionDefilement,
  restaurerPositionDefilement,
} from "../src/lib/scrollPosition";

describe("conservation de la position de défilement", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rétablit exactement la position après deux images d’affichage", () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let prochainId = 0;
    const scrollTo = vi.fn();
    const fakeWindow = {
      scrollX: 12,
      scrollY: 840,
      scrollTo,
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        prochainId += 1;
        callbacks.set(prochainId, callback);
        return prochainId;
      },
      cancelAnimationFrame: vi.fn(),
    } as unknown as Window;
    vi.stubGlobal("window", fakeWindow);

    const position = capturerPositionDefilement();
    Object.defineProperties(fakeWindow, {
      scrollX: { value: 0, configurable: true },
      scrollY: { value: 0, configurable: true },
    });

    restaurerPositionDefilement(position);
    callbacks.get(1)?.(0);
    expect(scrollTo).not.toHaveBeenCalled();
    callbacks.get(2)?.(0);

    expect(scrollTo).toHaveBeenCalledOnce();
    expect(scrollTo).toHaveBeenCalledWith(12, 840);
  });

  it("permet d’annuler une restauration programmée", () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let prochainId = 0;
    const scrollTo = vi.fn();
    const cancelAnimationFrame = vi.fn((id: number) => callbacks.delete(id));
    vi.stubGlobal("window", {
      scrollX: 0,
      scrollY: 0,
      scrollTo,
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        prochainId += 1;
        callbacks.set(prochainId, callback);
        return prochainId;
      },
      cancelAnimationFrame,
    });

    const annuler = restaurerPositionDefilement({ x: 0, y: 120 });
    annuler();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    callbacks.get(1)?.(0);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
