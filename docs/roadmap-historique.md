# Roadmap Guardian_Discord_Bot

_Mise à jour : 2026-08-29_

## Vue d’ensemble des issues
- Issues **fermées** : **44**
- Issues **ouvertes** : **27**

## Phase 1 — Fondations (globalement terminé)
Basé sur les issues historiques (#4 à #16).

Statut:
- ✅ Structure Node.js et dépendances de base
- ✅ Initialisation Discord client + loader events/commands
- ✅ Configuration multi-instance `.env`
- ✅ `logger.js` structuré présent dans `guardian/modules/logs/logger.js`

## Phase 2 — Onboarding & setup (partiellement terminé)
Basé sur Epic E/G.

Statut:
- ✅ Setup initial privé et check install (issues #15/#16 fermées)
- ✅ `guildMemberAdd` + assignation Invité (issue #31 fermée)
- ✅ `/parrainer` et job expulsion invités (issues #36/#37 fermées)
- 🔄 Workflow complet de promotion Invité → Membre à finaliser/fiabiliser

## Phase 3 — Jeux & vocaux temporaires (partiellement terminé)
Basé sur Epic H/I/J/F.

Statut:
- ✅ Persistance DB jeux / opt-in et vocaux temporaires (plusieurs issues fermées H/I)
- ✅ Nettoyage auto des vocaux temporaires
- ✅ Génération des catégories/channels Discord finalisée (Epic F fermé)
- ✅ Changelog Steam automatique (module `gamesNotification`)

## Phase 4 — Modération (partiellement terminé)
Basé sur Epic K/L/M/N.

Statut:
- ✅ Commandes `/warn`, `/mute`, `/kick`, `/ban` (issues #51→#54 fermées)
- ✅ Anti-spam de base (issue #58 fermée)
- ✅ Commande `/historique` avec pagination
- ✅ Panneau slow mode auto (`slowModePanel.js`)
- ✅ Panneau comportement owner (`behaviorPanel.js`)

## Phase 5 — Configuration par grade (terminé)
Basé sur Epic P.

Statut:
- ✅ Interfaces de configuration par grade fermées (#66, #67, #68, #69, #70)

## Phase 6 — Qualité & stabilisation (partiellement terminé)
Basé sur Epic Q/R.

Statut:
- ✅ Couverture tests unitaires étendue (178 tests passent)
- 🔄 Module Rich Presence optionnel ouvert (#74) — pas implémenté

## Phase 7 — Commands & admin recap (v0.27)
- ✅ Permission startup check via DM
- ✅ `/status` guild command
- ✅ `/setup resume`
- ✅ Recap tab in bot admin panel

## Phase 8 — Free/premium split & deployment (v0.28 – v0.29)
- ✅ Free/premium build gating (`/premium`, `/license` locking)
- ✅ Guild data export/import for migration
- ✅ Stable CommonJS SQLite export/import
- ✅ Hetzner deployment scripts
- ✅ Multi-env support (`--env=dev|beta|prod`)

## Phase 9 — Stabilisation du setup et migrations (v0.30.x)

Basé sur les Epic de setup robustifié et migrations versionnées.

Statut:
- ✅ Pagination automatique des menus > 25 éléments (`paginatedSelect`)
- ✅ Migrations DB/Discord versionnées automatiques + refresh des panels
- ✅ Config-games refresh et topics i18n sur tous les channels
- ✅ Setup plus robuste (messages normaux, auto-position, curseur d'étapes)
- ✅ Suggestions et vocaux temporaires améliorés
- ✅ Module Rich Presence opt-in : suivi des activités, consentement, classement (`/rich-presence`)

## Backlog prioritaire (prochaines étapes recommandées)

> Note : les issues GitHub du repo privé sont actuellement toutes fermées. Les items ci-dessous
> correspondent aux pistes restantes identifiées dans la roadmap, à valider avec le besoin métier.

1. Poursuivre l'amélioration de la robustesse du setup et des migrations versionnées.
2. Étoffer la couverture de tests sur les nouveaux modules v0.30.x
   (`paginatedSelect`, `versionedMigrations`, `setupGamesDetect`).
3. Documenter le fonctionnement des nouveaux modules dans `docs/architecture.md`.
