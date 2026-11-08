const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const UUID_FIELDS = [
  "id",
  "user_id",
  "gym_id",
  "created_by",
  "updated_by",
  "cancelled_by",
  "member_id",
  "subscription_id",
  "section_id",
  "tariff_id",
  "payment_id",
  "expense_id",
] as const;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function cartographierIdentifiantsInvalides(
  identifiants: { table: string; id: string }[],
  creerUuid: () => string = () => crypto.randomUUID(),
): Map<string, Map<string, string>> {
  const cartographie = new Map<string, Map<string, string>>();
  for (const { table, id } of identifiants) {
    if (isUuid(id)) continue;
    let parTable = cartographie.get(table);
    if (!parTable) {
      parTable = new Map<string, string>();
      cartographie.set(table, parTable);
    }
    if (!parTable.has(id)) parTable.set(id, creerUuid());
  }
  return cartographie;
}

export function verifierIdentifiantsLigne<T extends object>(
  value: T,
  message = "Identifiant invalide",
): void {
  const row = value as Record<string, unknown>;
  for (const field of UUID_FIELDS) {
    const value = row[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string" || !isUuid(value)) throw new Error(message);
  }
  if (!isUuid(row.id)) throw new Error(message);
}

export function remplacerReferencesLegacy(
  table: string,
  row: Record<string, unknown>,
  idByTable: ReadonlyMap<string, ReadonlyMap<string, string>>,
): Record<string, unknown> {
  const result = { ...row };
  const targets: Record<string, string> = {
    member_id: "members",
    subscription_id: "subscriptions",
    section_id: "sections",
    tariff_id: "tariffs",
    payment_id: "payments",
    expense_id: "expenses",
  };

  const ownId = idByTable.get(table)?.get(String(row.id));
  if (ownId) result.id = ownId;
  for (const [field, target] of Object.entries(targets)) {
    const value = result[field];
    if (typeof value !== "string") continue;
    const replacement = idByTable.get(target)?.get(value);
    if (replacement) result[field] = replacement;
  }
  return result;
}
