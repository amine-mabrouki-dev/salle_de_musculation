import type { DonneesLocales } from "./localRepository";
import { getLangueInterface, nomActiviteAffiche, type LangueInterface } from "./textes";

type LibellesRapport = {
  titre: string;
  genereLe: string;
  membres: string;
  abonnements: string;
  paiements: string;
  depenses: string;
  activitesTarifs: string;
  nom: string;
  telephone: string;
  notes: string;
  ajouteLe: string;
  activite: string;
  categorie: string;
  duree: string;
  debut: string;
  fin: string;
  montant: string;
  reste: string;
  statut: string;
  date: string;
  mode: string;
  libelle: string;
  tarifMensuel: string;
  tarifAnnuel: string;
  annule: string;
  oui: string;
  non: string;
  aucun: string;
  enfant: string;
  adulte: string;
  mensuel: string;
  annuel: string;
  especes: string;
  virement: string;
  autre: string;
  categoriesDepense: Record<string, string>;
};

const libelles: Record<LangueInterface, LibellesRapport> = {
  fr: {
    titre: "Sauvegarde de la salle",
    genereLe: "Exporté le",
    membres: "Membres",
    abonnements: "Abonnements",
    paiements: "Paiements",
    depenses: "Dépenses",
    activitesTarifs: "Activités et tarifs",
    nom: "Nom complet",
    telephone: "Téléphone",
    notes: "Notes",
    ajouteLe: "Inscrit le",
    activite: "Activité",
    categorie: "Catégorie",
    duree: "Durée",
    debut: "Début",
    fin: "Fin",
    montant: "Montant (DT)",
    reste: "Reste dû (DT)",
    statut: "État",
    date: "Date",
    mode: "Mode",
    libelle: "Libellé",
    tarifMensuel: "Tarif mensuel (DT)",
    tarifAnnuel: "Tarif annuel (DT)",
    annule: "Annulé",
    oui: "Oui",
    non: "Non",
    aucun: "Aucune donnée",
    enfant: "Enfant",
    adulte: "Adulte",
    mensuel: "Mensuel",
    annuel: "Annuel",
    especes: "Espèces",
    virement: "Virement",
    autre: "Autre",
    categoriesDepense: {
      loyer: "Loyer",
      salaire_coach: "Salaire coach",
      energie: "Énergie",
      entretien: "Entretien",
      publicite: "Publicité",
      materiel: "Matériel",
      autre: "Autre",
    },
  },
  ar: {
    titre: "نسخة احتياطية للقاعة",
    genereLe: "تاريخ التصدير",
    membres: "الأعضاء",
    abonnements: "الاشتراكات",
    paiements: "الدفعات",
    depenses: "المصاريف",
    activitesTarifs: "الأنشطة والأسعار",
    nom: "الاسم الكامل",
    telephone: "الهاتف",
    notes: "ملاحظات",
    ajouteLe: "تاريخ التسجيل",
    activite: "النشاط",
    categorie: "الفئة",
    duree: "المدة",
    debut: "البداية",
    fin: "النهاية",
    montant: "المبلغ (د.ت)",
    reste: "المتبقي (د.ت)",
    statut: "الحالة",
    date: "التاريخ",
    mode: "الطريقة",
    libelle: "البيان",
    tarifMensuel: "السعر الشهري (د.ت)",
    tarifAnnuel: "السعر السنوي (د.ت)",
    annule: "ملغى",
    oui: "نعم",
    non: "لا",
    aucun: "لا توجد بيانات",
    enfant: "طفل",
    adulte: "بالغ",
    mensuel: "شهري",
    annuel: "سنوي",
    especes: "نقدًا",
    virement: "تحويل",
    autre: "أخرى",
    categoriesDepense: {
      loyer: "الإيجار",
      salaire_coach: "راتب المدرب",
      energie: "الطاقة",
      entretien: "الصيانة",
      publicite: "الإعلانات",
      materiel: "المعدات",
      autre: "أخرى",
    },
  },
};

function echapperHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

function dateLisible(value: string | null | undefined, langue: LangueInterface): string {
  if (!value) return "";
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(langue === "ar" ? "ar-TN-u-nu-latn" : "fr-TN", {
    timeZone: "Africa/Tunis",
    dateStyle: "medium",
  }).format(date);
}

function montantLisible(value: number | string | null | undefined, langue: LangueInterface): string {
  if (value === null || value === undefined || value === "") return "";
  const montant = Number(value);
  if (!Number.isFinite(montant)) return String(value);
  return new Intl.NumberFormat(langue === "ar" ? "ar-TN-u-nu-latn" : "fr-TN", {
    maximumFractionDigits: 3,
    useGrouping: false,
  }).format(montant);
}

function dateFichier(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Tunis",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function tableau(titre: string, entetes: string[], lignes: unknown[][], aucun: string): string {
  const contenu = lignes.length
    ? lignes.map((ligne) => `<tr>${ligne.map((cellule) => `<td>${echapperHtml(cellule)}</td>`).join("")}</tr>`).join("")
    : `<tr><td class="empty" colspan="${entetes.length}">${echapperHtml(aucun)}</td></tr>`;
  return `<section><h2>${echapperHtml(titre)} <span>(${lignes.length})</span></h2><table><thead><tr>${entetes.map((entete) => `<th>${echapperHtml(entete)}</th>`).join("")}</tr></thead><tbody>${contenu}</tbody></table></section>`;
}

export function creerHtmlRapportSauvegarde(
  donnees: DonneesLocales,
  dateExport = new Date(),
  langue: LangueInterface = getLangueInterface(),
): string {
  const texte = libelles[langue];
  const direction = langue === "ar" ? "rtl" : "ltr";
  const nomMembreParId = new Map(donnees.membres.map((membre) => [membre.id, membre.full_name]));
  const nomActiviteParId = new Map(
    donnees.sections.map((section) => [section.id, nomActiviteAffiche(section.name, langue)]),
  );
  const tarifParId = new Map(donnees.tarifs.map((tarif) => [tarif.id, tarif]));
  const typeMembre = (tarifId: string) => {
    const categorie = tarifParId.get(tarifId)?.category;
    return categorie === "etudiant_enfant" ? texte.enfant : categorie === "adulte" ? texte.adulte : "";
  };
  const formatDateHeure = new Intl.DateTimeFormat(langue === "ar" ? "ar-TN-u-nu-latn" : "fr-TN", {
    timeZone: "Africa/Tunis",
    dateStyle: "long",
    timeStyle: "short",
  }).format(dateExport);
  const sections = [
    tableau(texte.membres, [texte.nom, texte.telephone, texte.notes, texte.ajouteLe],
      donnees.membres.map((membre) => [
        membre.full_name,
        membre.phone,
        membre.notes,
        dateLisible(membre.created_at, langue),
      ]),
      texte.aucun),
    tableau(texte.abonnements, [texte.nom, texte.activite, texte.categorie, texte.duree, texte.debut, texte.fin, texte.montant, texte.reste, texte.statut],
      donnees.abonnements.map((abonnement) => [
        nomMembreParId.get(abonnement.member_id),
        nomActiviteParId.get(abonnement.section_id),
        typeMembre(abonnement.tariff_id),
        abonnement.duration === "annual" ? texte.annuel : texte.mensuel,
        dateLisible(abonnement.start_date, langue),
        dateLisible(abonnement.end_date, langue),
        montantLisible(abonnement.price, langue),
        montantLisible(abonnement.amount_due, langue),
        abonnement.status,
      ]),
      texte.aucun),
    tableau(texte.paiements, [texte.nom, texte.date, texte.montant, texte.mode, texte.annule],
      donnees.paiements.map((paiement) => [
        nomMembreParId.get(paiement.member_id),
        dateLisible(paiement.paid_at, langue),
        montantLisible(paiement.amount, langue),
        paiement.method === "especes" ? texte.especes : paiement.method === "virement" ? texte.virement : texte.autre,
        paiement.cancelled_at ? texte.oui : texte.non,
      ]),
      texte.aucun),
    tableau(texte.depenses, [texte.date, texte.libelle, texte.categorie, texte.activite, texte.montant],
      donnees.depenses.map((depense) => [
        dateLisible(depense.spent_at, langue),
        depense.label,
        texte.categoriesDepense[depense.category] ?? depense.category,
        depense.section_id ? nomActiviteParId.get(depense.section_id) : "",
        montantLisible(depense.amount, langue),
      ]),
      texte.aucun),
    tableau(texte.activitesTarifs,
      [texte.activite, texte.categorie, texte.tarifMensuel, texte.tarifAnnuel],
      donnees.tarifs.map((tarif) => [
        nomActiviteParId.get(tarif.section_id),
        typeMembre(tarif.id),
        montantLisible(tarif.monthly_price, langue),
        montantLisible(tarif.annual_price, langue),
      ]),
      texte.aucun),
  ].join("");
  const fichierTitre = `sauvegarde_salle_${dateFichier(dateExport)}`;

  return `<!doctype html>
<html lang="${langue}" dir="${direction}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${echapperHtml(fichierTitre)}</title>
<style>
@page { size: A4 landscape; margin: 14mm 12mm 16mm; }
* { box-sizing: border-box; }
body { color: #172033; font: 10pt/1.45 Arial, "Noto Naskh Arabic", "Noto Sans Arabic", Tahoma, sans-serif; direction: ${direction}; }
h1 { margin: 0 0 4mm; font-size: 20pt; }
.export-date { color: #44516a; margin: 0 0 8mm; }
h2 { margin: 8mm 0 3mm; padding-bottom: 2mm; border-bottom: 1px solid #aeb8c8; font-size: 14pt; break-after: avoid; }
h2 span { color: #667085; font-size: 10pt; font-weight: normal; }
table { width: 100%; border-collapse: collapse; table-layout: auto; font-size: 9pt; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
th, td { padding: 2mm 2.2mm; border: 1px solid #cbd2dc; text-align: start; vertical-align: top; overflow-wrap: anywhere; }
th { background: #edf1f6 !important; color: #172033; font-weight: 700; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
td.empty { color: #667085; text-align: center; }
section { break-inside: auto; }
@media screen { body { max-width: 1200px; margin: 24px auto; padding: 28px; background: white; } }
</style>
</head>
<body>
<h1>${echapperHtml(texte.titre)}</h1>
<p class="export-date">${echapperHtml(texte.genereLe)} : ${echapperHtml(formatDateHeure)}</p>
${sections}
</body>
</html>`;
}

export function ouvrirImpressionRapport(fenetre: Window, html: string): void {
  fenetre.document.open();
  fenetre.document.write(html);
  fenetre.document.close();
  window.setTimeout(() => {
    if (!fenetre.closed) fenetre.print();
  }, 800);
}
