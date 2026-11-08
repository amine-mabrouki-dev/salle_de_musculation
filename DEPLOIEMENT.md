# Déployer l’application sur Vercel

Ce guide concerne le déploiement du frontend. Il ne demande aucune modification de la base ni l’exécution de migrations Supabase.

## 1. Préparer un dépôt Git privé

1. Créez un dépôt privé sur GitHub, GitLab ou un autre fournisseur pris en charge.
2. Vérifiez que `.env` et `.env.local` ne sont pas ajoutés au dépôt. Le `.gitignore` du projet ignore déjà `.env` et les fichiers `.env.*`, tout en autorisant `.env.example`.
3. Envoyez le code source et le fichier de verrouillage des dépendances (`package-lock.json`) dans le dépôt. N’ajoutez jamais une clé `service_role`, un mot de passe de base de données ou un fichier `.env`.

Les variables `VITE_*` sont intégrées au JavaScript livré au navigateur : utilisez uniquement l’URL Supabase et la clé publique `anon`/`publishable`.

## 2. Importer le projet dans Vercel

1. Dans Vercel, choisissez **Add New → Project**, puis importez le dépôt privé et autorisez son accès.
2. Gardez le répertoire racine du dépôt comme **Root Directory**.
3. Utilisez les réglages suivants :
   - Framework : **Vite** (ou détection automatique)
   - Build command : `npm run build`
   - Output directory : `dist`
   - Version Node.js : **22.x**
4. Vercel lit [vercel.json](./vercel.json), qui réécrit les routes de l’application vers `index.html` et ajoute les en-têtes de sécurité.

## 3. Configurer les variables Supabase par environnement

Dans **Project Settings → Environment Variables**, ajoutez les deux variables ci-dessous. Sélectionnez les environnements séparément et renseignez les valeurs du projet Supabase correspondant :

| Variable | Preview | Production |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | URL du projet Supabase de test | URL du projet Supabase réel |
| `VITE_SUPABASE_ANON_KEY` | Clé publique du projet de test | Clé publique du projet réel |

N’utilisez pas les identifiants de production dans **Preview**. Les clés et URL `VITE_*` sont publiques dans le frontend déployé ; n’y mettez pas de secret. Après tout changement de variable, relancez le déploiement de l’environnement concerné pour reconstruire l’application.

## 4. Déployer et vérifier le site

Lancez un déploiement **Preview** et vérifiez-le avant de fusionner le code vers la branche de production. Une fois la Preview validée, déployez la branche configurée en **Production**. Vercel fournit HTTPS pour les domaines `vercel.app`.

Vérifiez sur chaque URL :

- le site s’ouvre en HTTPS et la connexion du gérant fonctionne ;
- une route interne, par exemple `/membres`, fonctionne aussi après actualisation ;
- les icônes et le manifeste sont accessibles et l’application propose l’installation ;
- le bon environnement Supabase est utilisé (test sur Preview, réel sur Production).

## 5. Installer l’application sur le téléphone

Ouvrez d’abord l’URL HTTPS de production dans le navigateur, puis :

- **Android (Chrome)** : menu ⋮ → **Installer l’application** ou **Ajouter à l’écran d’accueil**.
- **iPhone (Safari)** : bouton **Partager** → **Sur l’écran d’accueil**.

## 6. Tests à faire sur le téléphone

Faites ces vérifications d’abord sur la Preview reliée à Supabase test, puis sur Production :

1. Installer l’application et vérifier son nom et son icône sur l’écran d’accueil.
2. Ouvrir l’application installée, se connecter, puis naviguer entre Accueil, Membres, Abonnements et Rentabilité.
3. Actualiser une page interne et vérifier qu’elle s’ouvre toujours correctement.
4. Vérifier les textes, les boutons et les formulaires sur un écran étroit.
5. Charger l’application en ligne, puis activer le mode avion : l’interface déjà chargée doit rester accessible et signaler l’absence de réseau.
6. Avec un compte de test, vérifier le comportement prévu hors connexion, puis rétablir le réseau et confirmer que les éléments en attente se synchronisent sans doublon.
7. Vérifier les photos, les rappels WhatsApp et la sauvegarde depuis l’appareil.
8. Sur iPhone, vérifier particulièrement l’installation depuis Safari et les marges autour de l’encoche et de la barre d’accueil.

Le service worker généré par `vite-plugin-pwa` met en cache la coque de l’application et ses ressources de build ; la navigation hors connexion revient sur `index.html`, afin de conserver l’interface et ses fonctions hors ligne. Les données disponibles hors connexion dépendent de ce qui a déjà été chargé et des fonctionnalités prévues par l’application.
