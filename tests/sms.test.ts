import { describe, expect, it } from "vitest";
import {
  composerRappelSMS,
  lienSMS,
  normaliserNumeroTunisien,
} from "../src/lib/sms";

describe("SMS tunisien", () => {
  it.each([
    ["22 123 456", "+21622123456"],
    ["00216 22 123 456", "+21622123456"],
    ["+216 (22) 123-456", "+21622123456"],
    ["022123456", "+21622123456"],
  ])("normalise %s vers %s", (source, attendu) => {
    expect(normaliserNumeroTunisien(source)).toEqual({
      valide: true,
      numeroE164: attendu,
    });
  });

  it("distingue un numéro absent d’un numéro invalide", () => {
    expect(normaliserNumeroTunisien("  ")).toEqual({ valide: false, raison: "absent" });
    expect(normaliserNumeroTunisien("abc 22 123 456")).toEqual({ valide: false, raison: "invalide" });
    expect(normaliserNumeroTunisien("+216 22 123")).toEqual({ valide: false, raison: "invalide" });
  });

  it("compose le brouillon en arabe et ajoute le solde seulement s’il est positif", () => {
    const infos = { nom: "سامي", expiration: "12 ديسمبر 2026", reste_a_payer: "5.5" };
    const message = composerRappelSMS(infos, "ar");
    expect(message).toContain("مرحبًا سامي");
    expect(message).toContain("المتبقي: 5.5 د.ت.");
    expect(composerRappelSMS({ ...infos, reste_a_payer: "0" }, "ar"))
      .not.toContain("المتبقي:");
  });

  it("encode le message dans l’URI du composeur SMS", () => {
    expect(lienSMS("+21622123456", "مرحبا Sami"))
      .toBe("sms:+21622123456?body=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7%20Sami");
  });
});
