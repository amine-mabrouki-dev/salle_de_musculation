# Ordre d'exécution de la correction

## 1. Valider le code avant déploiement

Depuis le dossier du projet :

```powershell
npm test
npm run build
```

Le test de contrainte PostgreSQL ne remplace pas les tests unitaires. Il exige Supabase CLI et une base Supabase locale ou de test :

```powershell
supabase start
npm run test:integration
```

`npm run test:integration` lance `supabase test db`. Il exécute les fichiers SQL de `supabase/tests/`, dont le test réel de la contrainte d'exclusion. Il ne faut pas le lancer contre le projet de production.

## 2. Sauvegarder la base distante

Dans le tableau de bord Supabase, créez et vérifiez une sauvegarde de la base avant toute opération. Ne lancez pas la procédure sur la production sans sauvegarde vérifiée.

La migration du stockage local de l'application crée aussi une copie SQLite dans le dossier privé du navigateur `gym4you-safety-backups` avant toute réécriture d'identifiants.

## 3. Diagnostiquer les chevauchements

Exécutez `diagnostic-chevauchements.sql` dans le SQL Editor. Ce fichier ne contient que des lectures. Gardez le résultat et décidez, ligne par ligne, quel abonnement doit être conservé.

Les dates de fin sont inclusives. Un abonnement qui finit le 12 et un autre qui commence le 13 sont consécutifs, sans chevauchement.

## 4. Prévisualiser le nettoyage

Exécutez `nettoyage-chevauchements.sql` tel quel. Le script affiche les abonnements conservés/à annuler ainsi que le nombre de paiements rattachés aux abonnements à annuler. Il se termine par `ROLLBACK` : aucune modification ne sera conservée.

Ne remplacez `ROLLBACK` par `COMMIT` qu'après revue complète du résultat et validation explicite de chaque paire.

### Limite importante pour les paiements

La migration 012 rend les paiements immuables : une mise à jour directe de `payments.subscription_id` est interdite par le déclencheur `payments_immutable`. Pour cette raison, le script s'arrête sans modifier les abonnements si l'un des abonnements à annuler a des paiements. Corrigez chaque paiement concerné dans l'application avec une annulation auditée, puis créez le paiement de remplacement sur l'abonnement conservé. Relancez ensuite le diagnostic et le nettoyage.

Le script ne désactive pas le déclencheur et ne contourne pas cette règle d'historique.

## 5. Appliquer le nettoyage validé

Après correction des paiements concernés et nouvelle validation de l'aperçu, remplacez le `ROLLBACK` final par `COMMIT`, puis exécutez le script complet dans une transaction. Vérifiez le résultat du `SELECT` final et relancez `diagnostic-chevauchements.sql` : il ne doit retourner aucune paire.

## 6. Appliquer la migration 013

Une fois le diagnostic vide, appliquez `migrations/013_pas_de_chevauchement.sql` via le mécanisme de migration habituel. La migration :

- vérifie d'abord le nombre de chevauchements et s'arrête avec un message explicite s'il en reste ;
- n'ajoute la contrainte que si elle n'existe pas déjà ;
- n'efface aucune ligne et ne modifie aucun paiement ;
- ignore les abonnements dont `deleted_at` est renseigné.

## 7. Déployer et vérifier

Déployez la version de l'application contenant la validation UUID et la migration locale du stockage. Vérifiez ensuite la création, le renouvellement, le mode hors connexion et la reprise de l'outbox sur un compte de test.
