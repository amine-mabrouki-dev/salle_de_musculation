import { describe, expect, it } from "vitest";
import { formaterMontantDT } from "../src/lib/money";

describe("format des montants en dinars tunisiens", () => {
  it("affiche toujours les millimes dans les totaux", () => {
    expect(formaterMontantDT(435)).toBe("435,000");
    expect(formaterMontantDT(818.476)).toBe("818,476");
    expect(formaterMontantDT(12.345)).toBe("12,345");
  });
});
