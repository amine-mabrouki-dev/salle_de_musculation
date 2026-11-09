import { describe, expect, it } from "vitest";
import { creerHtmlRapportSauvegarde } from "../src/lib/backupReport";
import type { DonneesLocales } from "../src/lib/localRepository";

const donnees: DonneesLocales = {
  sections: [{
    id: "fitness",
    name: "Fitness",
    coach_name: null,
    coach_phone: null,
    is_active: true,
  }],
  tarifs: [{
    id: "tarif-adulte",
    section_id: "fitness",
    category: "adulte",
    monthly_price: 40,
    annual_price: 400,
  }],
  membres: [{
    id: "member-1",
    full_name: "Amina <script>alert(1)</script>",
    phone: "22123456",
    notes: "Note & commentaire",
    created_at: "2026-11-08T10:00:00.000Z",
  }],
  abonnements: [{
    id: "sub-1",
    member_id: "member-1",
    section_id: "fitness",
    tariff_id: "tarif-adulte",
    duration: "monthly",
    start_date: "2026-11-01",
    end_date: "2026-11-30",
    price: 40,
    amount_due: 10,
    status: "actif",
  }],
  paiements: [{
    id: "payment-1",
    member_id: "member-1",
    subscription_id: "sub-1",
    amount: 30,
    paid_at: "2026-11-01",
    method: "especes",
    recorded_at: "2026-11-01T10:00:00.000Z",
    cancelled_at: null,
  }],
  depenses: [{
    id: "expense-1",
    user_id: "user-1",
    label: "Entretien",
    amount: 25,
    category: "entretien",
    section_id: "fitness",
    spent_at: "2026-11-02",
    updated_at: "2026-11-02T10:00:00.000Z",
    deleted_at: null,
  }],
  annulationsPaiements: [],
  annulationsDepenses: [],
};

describe("rapport PDF de sauvegarde", () => {
  it("crée un document imprimable avec nom de fichier daté et les tableaux", () => {
    const html = creerHtmlRapportSauvegarde(
      donnees,
      new Date("2026-11-09T12:00:00+01:00"),
      "fr",
    );

    expect(html).toContain("<title>sauvegarde_salle_2026-11-09</title>");
    expect(html).toContain("size: A4 landscape");
    expect(html).toContain("Membres");
    expect(html).toContain("Abonnements");
    expect(html).toContain("Paiements");
    expect(html).toContain("Dépenses");
    expect(html).toContain("Fitness");
    expect(html).toContain("Amina &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("thead { display: table-header-group; }");
  });

  it("configure le rapport arabe en RTL avec ses libellés traduits", () => {
    const html = creerHtmlRapportSauvegarde(
      donnees,
      new Date("2026-11-09T12:00:00+01:00"),
      "ar",
    );

    expect(html).toContain('<html lang="ar" dir="rtl">');
    expect(html).toContain("نسخة احتياطية للقاعة");
    expect(html).toContain("الأعضاء");
    expect(html).toContain("اللياقة البدنية");
  });
});
