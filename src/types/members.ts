export type TarifCategorie = "adulte" | "etudiant_enfant";
export type DureeAbonnement = "monthly" | "annual";
export type StatutAbonnement = "actif" | "bientot" | "expire";
export type ModePaiement = "especes" | "virement" | "autre";
export type CategorieDepense =
  | "loyer"
  | "salaire_coach"
  | "energie"
  | "entretien"
  | "publicite"
  | "materiel"
  | "autre";

export interface SalleSection {
  id: string;
  name: string;
  coach_name: string | null;
  coach_phone: string | null;
  is_active: boolean;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface Tarif {
  id: string;
  section_id: string;
  category: TarifCategorie;
  monthly_price: number | string | null;
  annual_price: number | string | null;
  updated_at?: string;
  deleted_at?: string | null;
  gym_id?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

export interface Abonnement {
  id: string;
  member_id: string;
  section_id: string;
  tariff_id: string;
  duration: DureeAbonnement;
  start_date: string;
  end_date: string;
  price: number | string | null;
  amount_due: number | string;
  status: StatutAbonnement;
  renew_on_payment?: boolean;
  local_created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  gym_id?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

export interface Paiement {
  id: string;
  member_id: string;
  subscription_id: string;
  amount: number | string;
  paid_at: string;
  method: ModePaiement;
  recorded_at: string;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  updated_at?: string;
  deleted_at?: string | null;
  gym_id?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

export interface Membre {
  id: string;
  full_name: string;
  phone: string | null;
  notes: string | null;
  photo_path?: string | null;
  photo_pending_data?: string | null;
  photo_pending_delete_path?: string | null;
  created_at: string;
  updated_at?: string;
  deleted_at?: string | null;
  gym_id?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

export interface MembreComplet extends Membre {
  subscriptions: Abonnement[];
  payments: Paiement[];
}
