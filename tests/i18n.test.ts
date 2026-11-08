import { describe, expect, it } from "vitest";
import { appliquerLangueInterface, normaliserTexteRecherche, textesArabes, textesFrancais } from "../src/lib/textes";

describe("i18n", () => {
  it("a les mêmes clés en français et en arabe", () => {
    expect(Object.keys(textesFrancais).sort()).toEqual(Object.keys(textesArabes).sort());
  });

  it("met à jour les attributs HTML de langue et de direction", () => {
    const previousDocument = globalThis.document;
    const node = { lang: "", dir: "" };
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { documentElement: node },
    });

    try {
      appliquerLangueInterface("ar");
      expect(node.lang).toBe("ar");
      expect(node.dir).toBe("rtl");

      appliquerLangueInterface("fr");
      expect(node.lang).toBe("fr");
      expect(node.dir).toBe("ltr");
    } finally {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: previousDocument,
      });
    }
  });

  it("normalise les recherches avec des lettres arabes", () => {
    expect(normaliserTexteRecherche("أحمد")).toBe("احمد");
    expect(normaliserTexteRecherche("إسماعيل")).toBe("اسماعيل");
    expect(normaliserTexteRecherche("علاء")).toBe("علاء");
    expect(normaliserTexteRecherche("Ali")).toBe("ali");
  });
});
