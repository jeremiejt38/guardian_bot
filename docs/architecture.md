# 🏗️ Architecture — Guardian Discord Bot


> Canonical KSP validation/architecture source: [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md). This file keeps the detailed per-module documentation (v0.23.9 era).
> Mise à jour : v0.23.9

## Démarrage (`index.js`)

```
index.js
  ├─ initDatabase()       — ouvre la BDD SQLite, crée les tables
  ├─ migrateDatabase()    — applique les migrations versionnées
  ├─ loadCommands()       — charge commands/*.js dans client.commands
  ├─ loadEvents()         — attache events/*.js au client Discord
  └─ client.login()       — connexion à l'API Discord
```

**Intents Discord requis :**
- `Guilds`, `GuildMembers`, `GuildMessages`, `MessageContent`, `GuildVoiceStates`, `AutoModerationExecution`

---

## Structure des dossiers

```
guardian/
├─ index.js               — point d'entrée, bootstrap
├─ config.js              — constantes globales (CATEGORIES, CHANNELS, GRADE_NAMES)
├─ deploy-commands.js     — enregistre les slash commands sur l'API Discord
├─ database/
│   └─ db.js              — init BDD, migrations, helpers setConfig/getConfig
├─ commands/              — slash commands (/help, /admin, /ping, /warn…)
├─ events/                — handlers d'events Discord
├─ locales/               — fichiers i18n (fr, en, es, pt, it, de)
├─ modules/
│   ├─ admin/             — panel admin bot (DM), alertes, auto-update
│   ├─ config/            — panels de configuration in-Discord par module
│   ├─ crypto/            — chiffrement secrets (AES-256-GCM)
│   ├─ games/             — jeux, opt-in, vocaux temporaires, Steam/RAWG
│   ├─ guides/            — génération des channels guides
│   ├─ i18n/              — helper getGuildLanguage + traduction
│   ├─ initialisation/    — setup wizard (9 steps) + discordSettings 🔒
│   ├─ logs/              — logger structuré
│   ├─ members/           — onboarding, promotion, parrainage, expulsion
│   ├─ migrations/        — notifier nouvelles options, migrations channels
│   ├─ moderation/        — sanctions, behavior score, AutoMod, slowMode, reports
│   ├─ notifications/     — DM notifier (alertes catégorisées)
│   ├─ servers/           — serveurs de jeu communautaires
│   └─ utils/             — interactions, rateLimit, roles, channels, scheduling
└─ tests/                 — tests unitaires + E2E
```

---

## Modules — responsabilités

### `admin/`
| Fichier | Rôle |
|---|---|
| `adminPanel.js` | Panel DM interactif (Status / Servers / DB / Notifications) |
| `adminAlerts.js` | Envoi d'alertes DM au BOT_ADMIN_ID |
| `botUpdater.js` | Auto-update via `git pull` + `npm install` + PM2 restart |

### `config/`
Panels de configuration persistants accessibles depuis les channels Discord.
Chaque panel gère un module : `guardianPanel`, `channelsPanel`, `rolesPanel`, `vocauxPanel`, `jeuxPanel`, `membresPanel`, `serveursJeuPanel`, `botPanel`, `configBackup`, `configLogger`, `behaviorPanel`.

### `games/`
| Fichier | Rôle |
|---|---|
| `serverGamesManager.js` | CRUD jeux, channels dédiés, rôles |
| `gameList.js` | Affichage paginé de la gamelist |
| `gamesVocal.js` | Création/suppression vocaux temporaires |
| `optInInteraction.js` | Opt-in/out d'un jeu par un membre |
| `gamesNotification.js` | Changelogs Steam automatiques |
| `steamGamesList.js` | Résolution App ID Steam |
| `rawgApi.js` | Enrichissement RAWG.io (non-Steam) |
| `gameRequests.js` | Demandes d'ajout de jeux par les membres |
| `tempVoiceInteraction.js` | Interactions sur les vocaux temp |

### `initialisation/`
| Fichier | Rôle |
|---|---|
| `setup.js` | Commande `/setup`, déclenchement du wizard |
| `setupFlow.js` | Logic des 9 steps, builders content/components, handlers |
| `setupGames.js` | Gestion des jeux pendant le setup |
| `gradeMapping.js` | Mapping grades ↔ rôles Discord |
| `roleSecurityCheck.js` | Vérification sécurité des rôles avant setup |
| `checkInstall.js` | Détection installation existante |
| `detectInstallContext.js` | Contexte d'installation (nouveau / reinstall) |
| `seeds.js` | Création des channels/catégories Discord |
| `discordSettings.js` 🔒 | Paramètres Discord natifs (AFK, AutoMod, Onboarding…) |

### `members/`
| Fichier | Rôle |
|---|---|
| `newMember.js` | Arrivée d'un nouveau membre (assignation grade Invite) |
| `promotion.js` | Logique de promotion Invite → Membre |
| `promotionRequest.js` | Gestion des demandes de promotion |
| `becomeMemberChannel.js` | Channel `#devenir-membre` éphémère |
| `joinServerChannel.js` | Channel `#rejoindre-notre-serveur` |
| `parrainage.js` | Système de parrainage |
| `expulsion.js` | Expulsion automatique des invités non promus |
| `rulesAcceptance.js` | Acceptation du règlement |

### `moderation/`
| Fichier | Rôle |
|---|---|
| `moderation.js` | Commandes /warn /mute /kick /ban |
| `modLog.js` | Logs de modération dans `#guardian-logs` |
| `behavior.js` | Score comportemental, calcul, seuils |
| `behaviorPanel.js` | Panel de configuration du comportement |
| `autoMod.js` | Intégration AutoMod Discord → behavior score |
| `slowModePanel.js` | Gestion slow mode auto |
| `reports.js` | Système de signalements |

---

## Flux d'un event Discord

```
Discord API
    │
    ▼
events/interactionCreate.js   — router principal
    ├─ slash commands → client.commands.get(name).execute()
    ├─ buttons/selects → dispatch vers le bon module handler
    └─ modals → dispatch vers le bon module handler

events/guildMemberAdd.js      — assignation grade Invite
events/guildMemberUpdate.js   — détection changements de rôles
events/voiceStateUpdate.js    — vocaux temporaires
events/messageCreate.js       — anti-spam, blacklist
events/autoModerationActionExecution.js — behavior score
```

---

## Configuration par guilde (`guild_config`)

Toute la configuration est stockée en BDD sous forme clé/valeur :
```js
setGuildSetting(guildId, 'module', 'key', value)
getGuildSetting(guildId, 'module', 'key', fallback)
```

**Modules de config utilisés :**
`channels`, `roles`, `grades`, `vocal`, `members`, `games`, `moderation`, `discord`, `setup`, `guides`, `notifications`

---

## Premium 🔒

Les features premium sont délimitées par des annotations dans le code :
```js
// @premium-start
... code premium ...
// @premium-end
```

`discordSettings.js` est entièrement premium (exclu du bundle free).
Le script `scripts/build-free.js` supprime tous les blocs annotés pour générer la version free.
