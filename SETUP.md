# Mise en place — Inscription des chauffeurs avec validation manuelle par email, verrouillée par appareil

## 0. Le tarif : 12 € / 365 jours
- Le prix et votre RIB (Patrice Gachard) sont déjà affichés directement sur l'écran d'inscription de l'app, dans `index.html`.
- Le chauffeur effectue le virement de 12€ avant ou juste après s'être inscrit, en indiquant son nom + prénom en référence.
- L'email que vous recevez à chaque inscription rappelle de vérifier ce virement avant de cliquer "Approuver".
- Dès l'approbation, l'accès est valable **365 jours** à partir de ce moment-là (pas de la date d'inscription).
- Passé ce délai, la connexion est automatiquement bloquée avec le message "Votre accès a expiré" — le chauffeur doit vous recontacter pour renouveler (nouveau virement).

## Ce que ça fait
- Chaque chauffeur crée lui-même son compte depuis l'app : nom, prénom, téléphone, email, mot de passe (tous obligatoires — aucun accès possible s'il en manque un).
- **Vous recevez un email avec deux boutons "✅ Approuver" / "❌ Refuser".** Rien ne se passe tant que vous n'avez pas cliqué sur l'un des deux.
- Si vous approuvez : un code à 6 chiffres est aussitôt envoyé par email au chauffeur, qu'il saisit dans l'app pour finaliser son accès.
- Si vous refusez : le compte est bloqué, le chauffeur est prévenu par email.
- Ce n'est qu'à la validation du code que le compte est verrouillé sur l'appareil du chauffeur (impossible de l'utiliser ailleurs ensuite).
- Une fois connecté, l'app retient l'appareil : le chauffeur n'a plus jamais besoin de ressaisir ses identifiants à chaque ouverture.
- Vous pouvez révoquer un compte ou le libérer pour un nouvel appareil à tout moment (ex. chauffeur qui change de téléphone).

**Important** : ceci contrôle l'accès à VOTRE app hébergée. Ça ne rend pas le code source invisible — quelqu'un avec des connaissances techniques peut toujours consulter le HTML/JS via l'inspecteur du navigateur. Ce système empêche en revanche efficacement qu'un même compte serve sur plusieurs téléphones, vous laisse approuver chaque chauffeur un par un, et vous donne ses coordonnées pour pouvoir le recontacter.

## 1. Créer un projet Supabase (gratuit)
1. Allez sur supabase.com, créez un compte et un nouveau projet
2. Dans l'onglet **SQL Editor**, exécutez :

```sql
create table activation_accounts (
  email text primary key,
  password_hash text not null,
  first_name text not null,
  last_name text not null,
  phone text not null,
  used boolean default false,
  approved boolean default false,
  revoked boolean default false,
  device_id text,
  pending_device_id text,
  approval_token text,
  activation_code text,
  code_expires_at timestamptz,
  access_expires_at timestamptz,
  activated_at timestamptz,
  note text,
  created_at timestamptz default now()
);

create table driver_days (
  email text not null,
  date date not null,
  embauche text,
  conduite_min integer default 0,
  travail_min integer default 0,
  pause_min integer default 0,
  amplitude_min integer default 0,
  service_used_min integer default 0,
  rep_type text,
  updated_at timestamptz default now(),
  primary key (email, date)
);
```

Si vous aviez déjà créé la table avant cette mise à jour, ajoutez plutôt les nouvelles colonnes :
```sql
alter table activation_accounts
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists phone text,
  add column if not exists pending_device_id text,
  add column if not exists approved boolean default false,
  add column if not exists approval_token text,
  add column if not exists activation_code text,
  add column if not exists code_expires_at timestamptz,
  add column if not exists access_expires_at timestamptz;

create table if not exists driver_days (
  email text not null,
  date date not null,
  embauche text,
  conduite_min integer default 0,
  travail_min integer default 0,
  pause_min integer default 0,
  amplitude_min integer default 0,
  service_used_min integer default 0,
  rep_type text,
  updated_at timestamptz default now(),
  primary key (email, date)
);
```

3. Dans **Project Settings → API**, notez :
   - `Project URL` → variable `SUPABASE_URL`
   - `service_role` key (⚠️ pas la clé "anon") → variable `SUPABASE_SERVICE_KEY`

## 2. Créer un compte Resend (gratuit, pour les emails de notification)
1. Allez sur resend.com, créez un compte
2. Récupérez une clé API → variable `RESEND_API_KEY`
3. Pour commencer sans configurer votre propre domaine, vous pouvez utiliser l'expéditeur de test `onboarding@resend.dev` (déjà la valeur par défaut dans le code)

## 3. Déployer sur Netlify (pas en Drag & Drop — il faut un vrai site)
1. Mettez ce dossier complet dans un dépôt GitHub (ou utilisez `netlify deploy` en ligne de commande depuis ce dossier)
2. Sur netlify.com, créez un nouveau site à partir de ce dépôt
3. Dans **Site settings → Environment variables**, ajoutez :

| Variable | Valeur |
|---|---|
| `SUPABASE_URL` | (étape 1) |
| `SUPABASE_SERVICE_KEY` | (étape 1) |
| `ADMIN_SECRET` | un mot de passe long que vous inventez, gardez-le secret |
| `RESEND_API_KEY` | (étape 2) |
| `RESEND_FROM` | `RSE Transport <onboarding@resend.dev>` (ou votre propre domaine plus tard) |
| `ADMIN_NOTIFY_EMAIL` | `rse2patoo@gmail.com` |

4. Déployez. Votre app sera accessible à une URL du type `https://votre-site.netlify.app`

## 4. Utilisation par les chauffeurs
1. Le chauffeur ouvre l'app, va sur l'onglet **"Créer un compte"**, renseigne nom, prénom, téléphone, email et mot de passe
2. Vous recevez immédiatement un email avec ses coordonnées et deux boutons : **Approuver** / **Refuser**
3. Vous cliquez sur **Approuver** (depuis votre téléphone ou ordinateur, directement dans l'email) — un code à 6 chiffres part aussitôt au chauffeur
4. Le chauffeur saisit ce code dans l'app, qui se verrouille alors sur son téléphone

Ensuite, l'app ne redemande plus rien : elle se souvient de l'appareil et rouvre directement sur l'écran de la journée.

S'il change de téléphone ou perd l'accès, il utilise l'onglet **"Se connecter"** avec les mêmes identifiants une fois que vous avez libéré son compte (étape 5).

## 5. Gérer les chauffeurs — panneau admin
Depuis la version actuelle, un vrai panneau web remplace les commandes : ouvrez `https://votre-site.netlify.app/admin.html`, entrez votre `ADMIN_SECRET`, et vous obtenez la liste de tous les chauffeurs avec un bouton par action : **Renouveler**, **Nouvel appareil**, **Révoquer/Réactiver**, **Historique** (jusqu'à 366 jours de conduite conservés côté serveur).

Les commandes en ligne de commande restent disponibles si besoin (ex. scripts automatisés) :
```bash
curl -X POST https://votre-site.netlify.app/.netlify/functions/manage-account \
  -H "Content-Type: application/json" \
  -d '{"adminSecret":"VOTRE_ADMIN_SECRET","email":"chauffeur1@exemple.fr","action":"revoke"}'
```
Actions possibles : `revoke`, `unrevoke`, `reset-device`, `renew`.

## 5bis. Sauvegarde automatique des journées (protection des données)
Chaque jour, l'app envoie automatiquement un résumé de la journée du chauffeur (conduite, travail, pause, amplitude) sur le serveur — à chaque changement d'état (Conduite/Pause/Travail) et toutes les 5 minutes. **Côté serveur (admin), 366 jours sont conservés par chauffeur** (nettoyage automatique au-delà, consultation sur 1 an via le bouton "Historique"). **Côté téléphone (chauffeur), l'app garde 30 jours** en local pour ses propres calculs (56h/90h de conduite notamment).

Ça protège contre la perte de données si un téléphone est perdu, cassé, ou réinitialisé — le compte et l'historique récent restent sur le serveur, indépendamment de l'appareil.

## 6. (Optionnel) Créer un compte manuellement vous-même
Si besoin, vous pouvez encore créer un compte à la place d'un chauffeur (ex. par téléphone) :
```bash
curl -X POST https://votre-site.netlify.app/.netlify/functions/generate-accounts \
  -H "Content-Type: application/json" \
  -d '{"adminSecret":"VOTRE_ADMIN_SECRET","email":"chauffeur1@exemple.fr","note":"créé par téléphone"}'
```
Réponse : `{"email":"chauffeur1@exemple.fr","password":"a1b2c3d4e5f6"}` → transmettez ce mot de passe au chauffeur, il se connectera ensuite via l'onglet "Se connecter" (mais attention : cette voie ne demande pas nom/prénom/téléphone, à compléter manuellement dans Supabase si besoin).

## 7. Installer PWABuilder
Une fois le site en ligne sur Netlify, utilisez son URL `https://votre-site.netlify.app` sur pwabuilder.com comme avant.
