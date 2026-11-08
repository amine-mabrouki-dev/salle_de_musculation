# Gym4You

Base d’application mobile-first pour la salle de sport de Moularès. Le projet utilise Vite, React, TypeScript, Tailwind CSS, React Router, Supabase et vite-plugin-pwa.

## Prérequis

- Node.js 20.19+ ou 22.12+
- npm

## Installation et lancement

Installer les dépendances :

```sh
npm install
```

## Configuration Supabase

1. Créer un projet Supabase et ouvrir les paramètres du projet.
2. Créer `.env` à la racine du projet en copiant `.env.example`, puis renseigner l’URL `Project URL` et la clé publique `anon` dans les variables correspondantes :

```powershell
Copy-Item .env.example .env
```

```dotenv
VITE_SUPABASE_URL=https://votre-projet.supabase.co
VITE_SUPABASE_ANON_KEY=votre-cle-publique-anon
VITE_ASSISTANCE_WHATSAPP=216XXXXXXXX
```

`VITE_ASSISTANCE_WHATSAPP` est facultative. Remplacez-la par le numéro de l’assistance avec l’indicatif pays, sans signe `+`, pour activer le bouton WhatsApp dans la page Aide.

Ne jamais placer de clé secrète ou `service_role` dans l’application : les variables `VITE_*` sont intégrées au code client.

3. Dans l’éditeur SQL Supabase, exécuter dans l’ordre les migrations 001 à 011 du dossier [`supabase/migrations`](./supabase/migrations). Les migrations 006 et 008 sont requises pour la synchronisation idempotente des paiements hors connexion et l’affichage correct des abonnements ; la migration 007 impose les durées exactes de 30/365 jours ; la migration 009 ajoute le Karaté et la gestion dynamique des activités ; la migration 010 ajoute les horodatages et suppressions logiques nécessaires à la synchronisation ; la migration 011 ajoute les photos privées des membres. Si votre base a déjà les migrations 001 à 010, exécutez uniquement [`011_member_photos.sql`](./supabase/migrations/011_member_photos.sql).
4. Créer le compte du gérant dans **Authentication > Users**, en activant **Auto Confirm**. Désactiver les inscriptions publiques dans les paramètres d’authentification Supabase. L’application ne propose ni inscription ni création de compte.
5. Après la création du compte gérant, exécuter une seule fois [`012_shared_gym_audit_ledger.sql`](./supabase/migrations/012_shared_gym_audit_ledger.sql). Cette migration crée une salle par utilisateur Auth déjà présent ; pour éviter de créer plusieurs salles initiales, n’ajoutez pas les comptes assistants avant son exécution. Si votre base a déjà la migration 011, exécutez uniquement la migration 012.
6. La migration [`013_pas_de_chevauchement.sql`](./supabase/migrations/013_pas_de_chevauchement.sql) empêche deux abonnements d’un même membre de se chevaucher pour la même activité. Avant de l’appliquer, suivez [`ORDRE_EXECUTION.md`](./supabase/ORDRE_EXECUTION.md) : sauvegarde, diagnostic, correction des chevauchements, puis migration.
6. Redémarrer le serveur de développement après toute modification de `.env`.

### Ajouter un compte assistant

Créez d’abord le compte dans **Authentication > Users** (Auto Confirm activé), puis ouvrez le SQL Editor et remplacez les deux adresses ci-dessous avant d’exécuter cette requête. Elle rattache l’assistant à la salle du gérant avec le rôle `assistant` :

```sql
insert into public.gym_memberships (gym_id, user_id, role, display_name)
select gym.id, assistant.id, 'assistant',
       coalesce(nullif(trim(assistant.raw_user_meta_data ->> 'full_name'), ''), assistant.email, 'Assistant')
from auth.users as assistant
join public.gyms as gym
  on gym.owner_user_id = (select id from auth.users where email = 'gerant@example.com')
where assistant.email = 'assistant@example.com'
on conflict (user_id) do update
set gym_id = excluded.gym_id,
    role = excluded.role,
    display_name = excluded.display_name;
```

Le compte assistant peut gérer les membres et saisir des paiements. Il n’accède ni à Rentabilité ni aux Réglages ; ces restrictions sont aussi appliquées par les politiques RLS. Les paiements et dépenses sont immuables : une correction se fait par une annulation motivée, jamais par modification ou suppression de la ligne d’origine.

## Lancement

Lancer le serveur de développement :

```sh
npm run dev
```

Vérifier la compilation de production et lancer un aperçu local :

```sh
npm run build
npm run preview
```

Exécuter les tests des calculs critiques :

```sh
npm test
```

Le test de la contrainte d'abonnement utilise une vraie base PostgreSQL Supabase locale, pas un mock. Après avoir installé Supabase CLI et lancé `supabase start`, exécutez :

```sh
npm run test:integration
```

Cette commande lance les tests SQL de `supabase/tests/`. N'utilisez pas la base de production pour ces tests.

## Données de démonstration

À exécuter uniquement dans un projet Supabase de test, après les migrations 001 à 009 et avec exactement un utilisateur Auth :

1. Dans **Supabase > SQL Editor**, ouvrez ou collez le contenu complet de [`supabase/seed-demo.sql`](./supabase/seed-demo.sql), puis exécutez-le en une seule fois (ne lancez pas les requêtes séparément, car elles partagent des tables temporaires). Le seed est rejouable, conserve les tarifs de la table `tariffs` et marque les membres avec `[DÉMO]` dans leurs notes ainsi que les dépenses avec `[DÉMO]` dans leur libellé.
2. Pour retirer le jeu de données, ouvrez le SQL Editor, exécutez [`supabase/clean-demo.sql`](./supabase/clean-demo.sql). Le nettoyage supprime les membres et dépenses marqués `[DÉMO]` ainsi que leurs abonnements et paiements liés ; il ne touche pas aux membres ou dépenses sans ce préfixe.

Le seed fournit 40 membres (18 Musculation, 10 Femmes, 7 Kick-boxing, 5 Karaté), dont des étudiants et trois enfants au Karaté, ainsi que deux membres avec deux abonnements. Il permet de tester :

- 4 abonnements expirés depuis 1 à 20 jours et 6 arrivant à échéance dans 0 à 7 jours ;
- un abonnement annuel expirant dans 15 jours, et six abonnements annuels au total ;
- trois abonnements avec un reste à payer ;
- des paiements en espèces majoritaires et quelques virements, sur les six derniers mois ;
- les revenus, le profit, le seuil de rentabilité, les dépenses récurrentes par catégorie et les achats ponctuels de matériel ; les versements annuels progressent légèrement et sont réduits en juillet/août pour simuler le creux estival, avec un mois à faible marge.

Les prix fictifs qui remplacent un tarif `null` ne sont stockés que dans les abonnements de démonstration : le catalogue `tariffs` reste inchangé. Le seed ne crée ni sections ni tarifs et refuse de s’exécuter si les quatre activités ne sont pas présentes et actives. Ne l’exécutez pas dans une base contenant des données réelles.

## Organisation

- `src/pages` : pages Accueil, Membres, Abonnements et Rentabilité.
- `src/components` : composants partagés, dont la navigation inférieure.
- `src/lib` : client Supabase.
- `src/hooks` : hooks React partagés.
- `src/types` : types TypeScript partagés.
- `supabase/migrations` : tables, politiques RLS, données initiales et opérations sécurisées sur les membres et abonnements.

Les composants visuels communs (`Panel`, `StatusChip`, `FilterChips`, `BottomSheet`, `Toast` et `EmptyState`) se trouvent dans `src/components`. Le fond d’ambiance par défaut est `public/fond-salle.jpg` ; la photo choisie dans les réglages est optimisée puis conservée dans le bucket privé Supabase Storage.

Les pages Accueil, Membres, Abonnements et Rentabilité permettent le suivi des relances, des fiches, des formules, des paiements, des renouvellements, des revenus et des dépenses. La rentabilité fournit un indicateur de gestion, pas un document comptable ; le seuil de rentabilité est estimé à partir du tarif mensuel moyen. Les abonnements annuels sont comptés au mois de leur encaissement, sans étalement sur 12 mois. Les tarifs et les coachs se configurent dans Réglages et sont synchronisés localement avant leur envoi à Supabase. Le modèle WhatsApp, la photo de la salle et le mot de passe restent gérés en ligne. La PWA est configurée avec vite-plugin-pwa.

## Installation PWA et mode hors connexion

- Sur Android, ouvrez l’application dans un navigateur compatible et utilisez le bouton **Installer** lorsqu’il apparaît, ou l’option d’installation du menu du navigateur.
- Sur iPhone/iPad, ouvrez l’application dans Safari, touchez **Partager**, puis **Ajouter à l’écran d’accueil**.
- Le service worker met en cache l’application. Les données des sections, tarifs, membres, abonnements, paiements, dépenses et annulations sont lues depuis SQLite WASM dans un Web Worker, stocké dans OPFS avec le VFS `opfs-sahpool`. Le navigateur est invité à conserver ce stockage. Si OPFS n’est pas disponible, l’application utilise IndexedDB et affiche un avertissement.
- Le stockage local versionne son schéma. Lors de la conversion d’anciens identifiants non UUID, l’application crée une copie de sécurité avant la réécriture transactionnelle des lignes, références, journaux et demandes de synchronisation.
- Les écritures sont d’abord enregistrées localement et ajoutées à l’outbox. À la reconnexion, l’application envoie les modifications dans l’ordre, puis récupère les lignes modifiées depuis Supabase. Les suppressions sont synchronisées par `deleted_at` ; les identifiants sont créés côté client. Les conflits sont journalisés dans la base locale et la version portant le `updated_at` le plus récent est conservée.
- L’indicateur de synchronisation reste visible, affiche les modifications en attente et les erreurs, et propose une relance. La synchronisation démarre à l’ouverture, à la reconnexion et toutes les deux minutes. Un bouton **Synchroniser maintenant** est aussi disponible dans Réglages.
- Dans **Réglages > Sauvegarde**, **Télécharger une sauvegarde** produit un fichier `.sqlite` et un `.zip` de CSV UTF-8 avec BOM pour Excel. Sur un appareil compatible, les deux fichiers peuvent être envoyés via le partage natif. Rangez le fichier sur Google Drive ou envoyez-le-vous sur WhatsApp et gardez au moins les trois dernières sauvegardes. L’accueil rappelle de sauvegarder si aucune sauvegarde n’a été faite depuis plus de 30 jours.
- Pour restaurer, choisissez un fichier `.sqlite` exporté par Gym4You, vérifiez l’aperçu puis confirmez. La restauration télécharge d’abord une copie automatique de l’état actuel et fusionne les lignes : pour un même identifiant, la modification la plus récente est conservée. Les changements importés sont ajoutés à la file de synchronisation.
- Les photos des membres sont facultatives et privées. Appliquez [`011_member_photos.sql`](./supabase/migrations/011_member_photos.sql) après la migration 010. Choisissez une photo lors de l’ajout ou de la modification d’un membre ; l’envoi ou la suppression nécessite une connexion Internet. Les photos s’affichent dans la liste et la fiche membre, avec les initiales en remplacement si aucune photo n’est disponible.
- Avant la déconnexion, l’application avertit si des modifications ne sont pas encore envoyées. Elle demande ensuite confirmation avant d’effacer la copie personnelle de cet appareil ; si elle est conservée, elle sera disponible à la prochaine connexion sur ce navigateur.
- Appliquer [`010_sync.sql`](./supabase/migrations/010_sync.sql) dans **Supabase > SQL Editor** après les migrations 001 à 009. Dans le navigateur, charger l’application une première fois en ligne, créer ou modifier une donnée, couper le réseau et vérifier que les pages affichent toujours la copie locale et que les saisies sont conservées. Rétablir le réseau, utiliser **Synchroniser maintenant**, puis vérifier que les modifications apparaissent dans Supabase et que l’indicateur revient à zéro.

Pour préparer le déploiement Supabase/Vercel, consulter le [guide de déploiement](./DEPLOIEMENT.md).

## Vérification périodique de Supabase

Le workflow GitHub Actions [keepalive.yml](./.github/workflows/keepalive.yml) appelle l’endpoint de santé Supabase toutes les 72 heures environ (`0 0 */3 * *`, UTC) et peut aussi être lancé manuellement depuis **Actions > Supabase keepalive > Run workflow**. Une réponse HTTP en erreur, un délai dépassé ou un secret manquant fait échouer visiblement l’exécution.

Pour le configurer dans GitHub, ouvrez le dépôt puis **Settings > Secrets and variables > Actions > New repository secret** et créez ces deux secrets :

- `SUPABASE_URL` : URL HTTPS du projet (par exemple `https://votre-projet.supabase.co`).
- `SUPABASE_ANON_KEY` : clé publique `anon`/publishable du projet.

N’utilisez jamais la clé `service_role` : elle n’est ni nécessaire ni adaptée à ce contrôle. Après une exécution manuelle, vérifiez dans le tableau de bord Supabase que l’activité ou la requête est bien comptée. Ce ping vérifie la disponibilité de l’API ; il ne remplace ni les sauvegardes ni une utilisation réelle de l’application.
