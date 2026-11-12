module.exports = async ({ github, context }) => {
const issues = [

// ════════════════════════════════════════════════════════════
// EPIC A — SCAFFOLDING NODE.JS
// ════════════════════════════════════════════════════════════
{
  title: "Epic A | #1 — Initialiser la structure Node.js du projet",
  labels: ["epic-a-scaffold", "sprint-0"],
  body: `## 🎯 Objectif
Poser le squelette exécutable du bot (sans logique métier).

## 📁 Fichiers à créer/modifier
- \`package.json\`
- \`.gitignore\`
- \`.env.example\`
- \`index.js\`
- \`config.js\`

## ✅ Critères d'acceptation
- \`node index.js\` démarre et se connecte sans erreur
- Structure de dossiers conforme à la spec (\`events/\`, \`commands/\`, \`modules/\`, \`database/\`, \`data/\`)
`,
},
{
  title: "Epic A | #2 — Installer et configurer les dépendances runtime",
  labels: ["epic-a-scaffold", "sprint-0"],
  body: `## 🎯 Objectif
Déclarer Discord.js v14 + SQLite + utilitaires nécessaires.

## 📁 Fichiers à créer/modifier
- \`package.json\`

## ✅ Critères d'acceptation
- \`npm install\` réussit sans erreur
- Dépendances : \`discord.js\`, \`better-sqlite3\`, \`dotenv\`
- devDependencies : \`nodemon\` (ou équivalent pour dev)
`,
},
{
  title: "Epic A | #3 — Mettre en place les scripts npm (run/dev/test/deploy-commands)",
  labels: ["epic-a-scaffold", "sprint-0"],
  body: `## 🎯 Objectif
Standardiser l'exécution multi-environnements.

## 📁 Fichiers à créer/modifier
- \`package.json\`
- \`deploy-commands.js\`

## ✅ Critères d'acceptation
- \`npm start\` → production
- \`npm run dev\` → development (nodemon ou --watch)
- \`npm test\` → node --test
- \`npm run deploy\` → déploiement commandes slash
`,
},
{
  title: "Epic A | #4 — Implémenter la configuration multi-instance via .env",
  labels: ["epic-a-scaffold", "sprint-0"],
  body: `## 🎯 Objectif
Supporter production, development, test avec config isolée.

## 📁 Fichiers à créer/modifier
- \`config.js\`
- \`.env.example\`

## ✅ Critères d'acceptation
- \`NODE_ENV=production\` → token prod, db prod
- \`NODE_ENV=development\` → token dev, db dev
- \`NODE_ENV=test\` → token test, db test
- Toutes les constantes de noms de channels/catégories centralisées ici (zéro string hardcodée ailleurs)
`,
},

// ════════════════════════════════════════════════════════════
// EPIC B — BASE DE DONNÉES SQLITE
// ════════════════════════════════════════════════════════════
{
  title: "Epic B | #5 — Créer la connexion SQLite centralisée",
  labels: ["epic-b-database", "sprint-0"],
  body: `## 🎯 Objectif
Singleton DB + ouverture sécurisée + chemin DB par environnement.

## 📁 Fichiers à créer/modifier
- \`database/db.js\`
- \`config.js\`

## ✅ Critères d'acceptation
- Export d'une instance unique \`db\` (singleton)
- Chemin du fichier \`.db\` variant selon \`NODE_ENV\`
- Ouverture sécurisée (erreur explicite si impossible)
`,
},
{
  title: "Epic B | #6 — Créer le schéma SQL initial (toutes tables Guardian)",
  labels: ["epic-b-database", "sprint-0"],
  body: `## 🎯 Objectif
Créer automatiquement toutes les tables définies dans la spec au premier lancement.

## 📁 Fichiers à créer/modifier
- \`database/db.js\`

## Tables à créer (CREATE TABLE IF NOT EXISTS)
\`guilds\`, \`guild_config\`, \`grades\`, \`games\`, \`member_games\`, \`members\`, \`sanctions\`, \`changelogs_seen\`, \`servers_jeu\`, \`parrainage\`, \`vocal_temp\`

## ✅ Critères d'acceptation
- Idempotent : relancer ne casse pas une DB existante
- Schéma conforme à la spec (types, PKs, valeurs par défaut)
`,
},
{
  title: "Epic B | #7 — Ajouter helpers d'accès DB (get/set config, transactions)",
  labels: ["epic-b-database", "sprint-0"],
  body: `## 🎯 Objectif
Factoriser les accès SQL répétitifs.

## 📁 Fichiers à créer/modifier
- \`database/db.js\`
- \`modules/config/settings.js\` (stub interface)

## Helpers à implémenter
- \`getConfig(guildId, module, key)\` → valeur ou défaut
- \`setConfig(guildId, module, key, value)\`
- \`getGrade(guildId, gradeName)\` → roleId
- \`setGrade(guildId, gradeName, roleId)\`

## ✅ Critères d'acceptation
- Tous les modules utilisent ces helpers (pas de SQL inline répété)
`,
},
{
  title: "Epic B | #8 — Préparer dossier de migrations",
  labels: ["epic-b-database", "sprint-0"],
  body: `## 🎯 Objectif
Poser la stratégie d'évolution DB future sans casser prod.

## 📁 Fichiers à créer/modifier
- \`database/migrations/\` (structure + placeholder \`001_initial.sql\`)
- \`database/db.js\`

## ✅ Critères d'acceptation
- Dossier \`migrations/\` présent avec convention de nommage documentée
- \`db.js\` peut appliquer les migrations manquantes au démarrage (version table)
`,
},

// ════════════════════════════════════════════════════════════
// EPIC C — LOGGING & GESTION D'ERREURS
// ════════════════════════════════════════════════════════════
{
  title: "Epic C | #9 — Créer logger.js (console structurée + niveaux)",
  labels: ["epic-c-logging", "sprint-0"],
  body: `## 🎯 Objectif
Logs uniformes (info/warn/error/debug) dans tout le bot.

## 📁 Fichiers à créer/modifier
- \`modules/logs/logger.js\`

## ✅ Critères d'acceptation
- Export : \`{ log, warn, error, debug, logToDiscord }\`
- Chaque niveau préfixé d'un timestamp ISO et d'une icône
- \`logToDiscord(guild, channelName, embed)\` → poste dans un channel Discord (utilisé pour #logs-mod, #logs-config)
- Jamais de crash silencieux (\`logToDiscord\` catch toutes les erreurs internes)
`,
},
{
  title: "Epic C | #10 — Brancher le logger global au point d'entrée",
  labels: ["epic-c-logging", "sprint-0"],
  body: `## 🎯 Objectif
Capturer erreurs startup et exceptions non gérées.

## 📁 Fichiers à créer/modifier
- \`index.js\`
- \`modules/logs/logger.js\`

## ✅ Critères d'acceptation
- \`process.on('uncaughtException', ...)\` et \`process.on('unhandledRejection', ...)\` loggés via \`logger.error\`
- Erreur de connexion Discord loggée clairement avec conseil de vérification du token
`,
},

// ════════════════════════════════════════════════════════════
// EPIC D — BOOTSTRAP DISCORD & ROUTING ÉVÉNEMENTS
// ════════════════════════════════════════════════════════════
{
  title: "Epic D | #11 — Initialiser le client Discord.js et intents minimaux",
  labels: ["epic-d-bootstrap", "sprint-0"],
  body: `## �� Objectif
Démarrage fiable du bot avec intents/events requis par la spec.

## 📁 Fichiers à créer/modifier
- \`index.js\`

## Intents requis
\`Guilds\`, \`GuildMembers\`, \`GuildMessages\`, \`GuildVoiceStates\`, \`MessageContent\`, \`GuildPresences\`

## ✅ Critères d'acceptation
- Client créé avec exactement les intents nécessaires
- Log "✅ Guardian connecté en tant que [nom]" au ready
`,
},
{
  title: "Epic D | #12 — Mettre en place le chargeur d'événements dynamique",
  labels: ["epic-d-bootstrap", "sprint-0"],
  body: `## 🎯 Objectif
Architecture modulaire events/*.js — chargement dynamique sans import manuel.

## 📁 Fichiers à créer/modifier
- \`index.js\`
- \`events/ready.js\` (stub)
- \`events/guildMemberAdd.js\` (stub)
- \`events/guildMemberRemove.js\` (stub)
- \`events/voiceStateUpdate.js\` (stub)
- \`events/interactionCreate.js\` (stub)
- \`events/messageCreate.js\` (stub)

## ✅ Critères d'acceptation
- Tout fichier ajouté dans \`events/\` est automatiquement chargé
- Chaque fichier exporte \`{ name, once?, execute }\`
`,
},
{
  title: "Epic D | #13 — Déclarer et déployer les commandes slash de modération",
  labels: ["epic-d-bootstrap", "sprint-0"],
  body: `## 🎯 Objectif
Enregistrer /parrainer, /warn, /mute, /kick, /ban, /historique via REST Discord.

## 📁 Fichiers à créer/modifier
- \`deploy-commands.js\`
- \`commands/parrainer.js\` (définition SlashCommandBuilder uniquement)
- \`commands/warn.js\`
- \`commands/mute.js\`
- \`commands/kick.js\`
- \`commands/ban.js\`
- \`commands/historique.js\`
- \`commands/signaler.js\`

## ✅ Critères d'acceptation
- \`npm run deploy\` enregistre toutes les commandes sans erreur
- Chaque fichier commande exporte \`{ data (SlashCommandBuilder), execute }\`
- Les options de chaque commande sont correctement définies (types, required, descriptions FR)
`,
},
{
  title: "Epic D | #14 — Implémenter router interactionCreate (buttons/select/modals/slash)",
  labels: ["epic-d-bootstrap", "sprint-0"],
  body: `## 🎯 Objectif
Point central de dispatch des interactions.

## 📁 Fichiers à créer/modifier
- \`events/interactionCreate.js\`

## ✅ Critères d'acceptation
- Dispatche selon \`interaction.isChatInputCommand()\`, \`isButton()\`, \`isStringSelectMenu()\`, \`isModalSubmit()\`
- Vérifie le grade Guardian avant d'exécuter (sinon reply éphémère 403)
- Toute interaction reçoit une réponse (évite le "Cette interaction a échoué")
- Les erreurs inattendues sont loggées via \`logger.error\`
`,
},

// ════════════════════════════════════════════════════════════
// EPIC E — INITIALISATION SERVEUR (SETUP + CHECKINSTALL)
// ════════════════════════════════════════════════════════════
{
  title: "Epic E | #15 — Implémenter checkInstall au démarrage (ready)",
  labels: ["epic-e-setup", "sprint-1"],
  body: `## 🎯 Objectif
Détecter une guild installée via hash SHA256 du guildId.

## 📁 Fichiers à créer/modifier
- \`modules/initialisation/checkInstall.js\`
- \`events/ready.js\`
- \`database/db.js\`

## ✅ Critères d'acceptation
- Hash SHA256 du guildId (module \`crypto\` natif Node.js)
- Serveur installé → charge config depuis \`guild_config\`
- Serveur non installé → lance le flow de setup
- Appelé pour chaque guild au \`ready\` et à chaque \`guildCreate\`
`,
},
{
  title: "Epic E | #16 — Créer la session de setup privée (guardian-setup)",
  labels: ["epic-e-setup", "sprint-1"],
  body: `## 🎯 Objectif
Initialiser le canal/catégorie réservés à l'Owner Discord du serveur pour le setup guidé.

## 📁 Fichiers à créer/modifier
- \`modules/initialisation/setup.js\`

## ✅ Critères d'acceptation
- Catégorie \`guardian-setup\` créée, visible uniquement par l'Owner Discord (propriétaire du serveur)
- Channel \`#guardian-setup\` créé dans cette catégorie
- Message d'introduction posté avec bouton "▶️ Démarrer le setup"
`,
},
{
  title: "Epic E | #17 — Setup étape 1 : mapping des grades ↔ rôles Discord",
  labels: ["epic-e-setup", "sprint-1"],
  body: `## 🎯 Objectif
Associer ou créer les rôles Discord pour chaque grade Guardian (Invité, Membre, Modérateur, Manager, Owner).

## 📁 Fichiers à créer/modifier
- \`modules/initialisation/setup.js\`
- \`modules/config/settings.js\`

## ✅ Critères d'acceptation
- 5 SelectMenu (un par grade) listant les rôles Discord existants + option "Créer ce rôle"
- Si "Créer ce rôle" : Guardian crée le rôle et le sélectionne automatiquement
- Vérification : un seul membre peut avoir le grade Owner
- Persiste le mapping dans la table \`grades\`
- Impossible de passer à l'étape 2 tant que les 5 grades ne sont pas tous configurés
`,
},
{
  title: "Epic E | #18 — Setup étape 2 : paramètres membres",
  labels: ["epic-e-setup", "sprint-1"],
  body: `## 🎯 Objectif
Collecter et persister les règles d'accueil, de promotion et d'expulsion des membres.

## 📁 Fichiers à créer/modifier
- \`modules/initialisation/setup.js\`
- \`modules/config/settings.js\`

## Paramètres à collecter
- Texte d'accueil Invité (valeur par défaut)
- Règles simplifiées Invité (valeur par défaut)
- Règles complètes Membre+ (valeur par défaut)
- Délai minimum avant demande de promotion (défaut : 48h)
- Bio obligatoire : oui/non
- Parrainage obligatoire : oui/non
- Grade minimum pour traiter les demandes (défaut : Modérateur)
- Délai expulsion auto Invités (défaut : 30 jours, désactivable)

## ✅ Critères d'acceptation
- Modal Discord avec valeurs préremplies par défaut
- Validation des inputs (délai = entier positif, textes non vides)
- Persistance dans \`guild_config\` (module : "membres")
`,
},
{
  title: "Epic E | #19 — Setup étape 3 : ajout jeux serveur",
  labels: ["epic-e-setup", "sprint-1"],
  body: `## 🎯 Objectif
Formulaire séquentiel de création de jeux + options galerie/changelog.

## 📁 Fichiers à créer/modifier
- \`modules/initialisation/setup.js\`
- \`database/db.js\`

## ✅ Critères d'acceptation
- Modal par jeu : nom, AppID Steam (optionnel), galerie oui/non, changelogs oui/non
- Bouton "Ajouter un autre jeu" pour enchaîner plusieurs jeux
- Bouton "Continuer sans jeu" (0 jeux autorisé avec warning)
- Chaque jeu inséré dans la table \`games\`
- AppID Steam validé (numérique si renseigné)
`,
},
{
  title: "Epic E | #20 — Setup étape 4 : toggles modules optionnels",
  labels: ["epic-e-setup", "sprint-1"],
  body: `## 🎯 Objectif
Activer/désactiver les modules globaux initiaux via des boutons toggle.

## 📁 Fichiers à créer/modifier
- \`modules/initialisation/setup.js\`
- \`modules/config/settings.js\`

## Modules à toggler
- Suggestions (#suggestions)
- Liste-serveurs (#liste-serveurs + surveillance IP)
- Statut-bot (#statut-bot)
- AFK vocal
- Game-updates (#game-updates)
- Score comportemental

## ✅ Critères d'acceptation
- État visuel clair (bouton vert = actif, gris = inactif)
- Persistance dans \`guild_config\` (module : "modules")
`,
},
{
  title: "Epic E | #21 — Setup étape 5 : validation récap + installation complète",
  labels: ["epic-e-setup", "sprint-1"],
  body: `## 🎯 Objectif
Afficher le récapitulatif complet, confirmer, puis créer toute la structure Discord.

## 📁 Fichiers à créer/modifier
- \`modules/initialisation/setup.js\`
- \`modules/config/settings.js\`
- \`database/db.js\`

## ✅ Critères d'acceptation
- Embed récapitulatif : grades, paramètres membres, jeux, modules
- Bouton "✅ Confirmer et installer"
- Création complète de la structure Discord (catégories + channels + permissions)
- Suppression de la catégorie \`guardian-setup\`
- Enregistrement \`guilds\` (setup_done=1, setup_hash)
- Message de confirmation dans #bienvenue
`,
},

// ════════════════════════════════════════════════════════════
// EPIC F — CRÉATION STRUCTURE DISCORD
// ════════════════════════════════════════════════════════════
{
  title: "Epic F | #22 — Créer constantes centralisées noms catégories/channels",
  labels: ["epic-f-discord-structure", "sprint-1"],
  body: `## 🎯 Objectif
Zéro string hardcodée dans la logique métier — toutes les constantes dans un fichier centralisé.

## 📁 Fichiers à créer/modifier
- \`config.js\` (ou \`constants.js\` dédié)
- \`modules/initialisation/setup.js\`

## ✅ Critères d'acceptation
- Objet \`CHANNELS\` et \`CATEGORIES\` exporté depuis \`config.js\`
- Tous les modules importent les constantes plutôt que d'écrire les noms en dur
`,
},
{
  title: "Epic F | #23 — Générer catégorie INFORMATIONS + channels de base",
  labels: ["epic-f-discord-structure", "sprint-1"],
  body: `## 🎯 Objectif
Créer la catégorie INFORMATIONS avec ses channels et les permissions correctes par grade.

## 📁 Fichiers à créer/modifier
- \`modules/initialisation/setup.js\`

## Channels à créer
- **#règles** (read-only, Invité voit version simplifiée, Membre+ version complète)
- **#annonces** (type Announcement, écriture Manager+)
- **#bienvenue** (read-only, Guardian uniquement)
- **#faq** (type Forum, posts par défaut)
- **#statut-bot** (read-only, Guardian uniquement, togglable)

## ✅ Critères d'acceptation
- Permissions Discord appliquées correctement pour chaque grade
- #faq prégénéré avec posts par défaut au setup
`,
},
{
  title: "Epic F | #24 — Générer catégorie COMMUNAUTÉ + permissions Invité partielles",
  labels: ["epic-f-discord-structure", "sprint-1"],
  body: `## 🎯 Objectif
Créer la catégorie COMMUNAUTÉ avec les accès partiels Invité sur #général.

## 📁 Fichiers à créer/modifier
- \`modules/initialisation/setup.js\`

## Channels à créer
- **#général** (Invité : lecture 50 derniers msgs uniquement, pas l'historique complet)
- **#game-updates** (read-only, Guardian, togglable)
- **#suggestions** (type Forum, togglable)
- **#liste-serveurs** (read-only, Guardian, togglable)

## ✅ Critères d'acceptation
- Permission \`ReadMessageHistory: false\` pour le rôle Invité sur #général
- Channels togglables masqués (pas supprimés) si module désactivé
`,
},
{
  title: "Epic F | #25 — Générer catégorie VOCAUX + salons permanents",
  labels: ["epic-f-discord-structure", "sprint-1"],
  body: `## 🎯 Objectif
Créer la catégorie VOCAUX avec #créer-un-channel, vocal Général et vocal AFK (si activé).

## 📁 Fichiers à créer/modifier
- \`modules/initialisation/setup.js\`

## Channels à créer
- **#créer-un-channel** (texte, interactions Guardian)
- **Général** (vocal permanent, Invité+)
- **AFK** (vocal permanent, togglable, délai paramétrable)

## ✅ Critères d'acceptation
- Message permanent Guardian dans #créer-un-channel posté au setup
- AFK masqué si module désactivé
`,
},
{
  title: "Epic F | #26 — Générer catégorie MODÉRATION complète",
  labels: ["epic-f-discord-structure", "sprint-1"],
  body: `## 🎯 Objectif
Créer la catégorie MODÉRATION et tous ses channels, visibles uniquement par Modérateur+.

## 📁 Fichiers à créer/modifier
- \`modules/initialisation/setup.js\`

## Channels à créer
- **#général-staff** (texte, Modérateur+)
- **#demandes** (texte, Guardian uniquement en écriture)
- **#logs-mod** (texte, read-only, Guardian)
- **#sanctions** (texte, commandes slash Guardian)
- **#rapports** (texte, Guardian uniquement)
- **Vocal Staff** (vocal permanent, Modérateur+)

## ✅ Critères d'acceptation
- Catégorie invisible aux Invités et Membres
`,
},
{
  title: "Epic F | #27 — Générer catégorie CONFIGURATION (filtrage par grade)",
  labels: ["epic-f-discord-structure", "sprint-1"],
  body: `## 🎯 Objectif
Créer tous les channels de la catégorie CONFIGURATION selon la visibilité par grade.

## 📁 Fichiers à créer/modifier
- \`modules/initialisation/setup.js\`

## Channels par niveau d'accès
- Membre+ : **#mes-channels**, **#ma-gamelist**
- Modérateur+ : **#statut-bot**, **#bot**, **#jeux-serveur**
- Manager+ : **#membres**, **#channels**, **#vocaux**, **#jeux**, **#changelogs**, **#suggestions-config**, **#annonces-config**, **#faq-config**, **#serveurs-jeu**, **#gestion-serveurs**

## ✅ Critères d'acceptation
- Chaque channel a les bonnes permissions de visibilité
- Message permanent Guardian posté dans chaque channel de config
`,
},
{
  title: "Epic F | #28 — Générer channels Owner-only avancés",
  labels: ["epic-f-discord-structure", "sprint-1"],
  body: `## 🎯 Objectif
Créer les channels réservés à l'Owner : #guardian, #comportement, #auto-modération, #rôles, #logs-config.

## 📁 Fichiers à créer/modifier
- \`modules/initialisation/setup.js\`

## ✅ Critères d'acceptation
- Canaux visibles uniquement par le rôle Owner
- Message Guardian posté dans #gestion-serveurs expliquant que c'est un placeholder pour bot Pterodactyl
`,
},
{
  title: "Epic F | #29 — Créer structure par jeu (catégorie + rôle + channels)",
  labels: ["epic-f-discord-structure", "sprint-1"],
  body: `## 🎯 Objectif
Provisioning dynamique d'un jeu : catégorie, rôle opt-in, channels #jeu / #jeu-galerie / #jeu-changelogs.

## 📁 Fichiers à créer/modifier
- \`modules/games/gameList.js\`
- \`modules/initialisation/setup.js\`

## ✅ Critères d'acceptation
- Catégorie [Nom du jeu] créée avec permissions : visible seulement aux membres ayant le rôle jeu + Modérateur+
- #[jeu] toujours créé
- #[jeu]-galerie créé uniquement si galerie activée pour ce jeu
- #[jeu]-changelogs créé uniquement si changelogs activés pour ce jeu
- Fonction réutilisable (utilisée au setup ET lors de l'ajout d'un jeu depuis #jeux-serveur)
`,
},

// ════════════════════════════════════════════════════════════
// EPIC G — MEMBRES (ONBOARDING, PROMOTION, PARRAINAGE, EXPULSION)
// ════════════════════════════════════════════════════════════
{
  title: "Epic G | #30 — guildMemberAdd : assignation auto grade Invité",
  labels: ["epic-g-members", "sprint-2"],
  body: `## 🎯 Objectif
Rôle Invité auto + enregistrement membre en DB à chaque arrivée.

## 📁 Fichiers à créer/modifier
- \`events/guildMemberAdd.js\`
- \`modules/members/newMember.js\`
- \`database/db.js\`

## ✅ Critères d'acceptation
- Rôle Invité assigné dans les 2 secondes suivant l'arrivée
- Membre inséré dans la table \`members\` (grade: 'invite', join_date: ISO8601)
- Gestion d'erreur si le rôle Invité n'existe pas (log + alerte dans #statut-bot)
`,
},
{
  title: "Epic G | #31 — Message d'accueil #bienvenue + DM onboarding",
  labels: ["epic-g-members", "sprint-2"],
  body: `## 🎯 Objectif
Publication du message d'accueil personnalisé dans #bienvenue + envoi DM à l'arrivant.

## 📁 Fichiers à créer/modifier
- \`modules/members/newMember.js\`

## ✅ Critères d'acceptation
- Embed dans #bienvenue : texte personnalisé (depuis config), pseudo+avatar, boutons :
  - "📋 Voir les règles" (éphémère : affiche règles selon grade)
  - "🙋 Faire une demande pour devenir Membre"
- DM au nouvel arrivant : présentation serveur + conditions pour devenir Membre + lien #bienvenue
- Gestion d'erreur si DMs fermés (ne fait pas crasher le bot)
`,
},
{
  title: "Epic G | #32 — Workflow demande promotion (validation délai/bio/parrain)",
  labels: ["epic-g-members", "sprint-2"],
  body: `## 🎯 Objectif
Logique métier complète de vérification des conditions avant soumission au staff.

## 📁 Fichiers à créer/modifier
- \`modules/members/newMember.js\`
- \`modules/config/settings.js\`

## Vérifications dans l'ordre
1. Délai minimum écoulé → message éphémère "Il te reste Xh à attendre" si non
2. Bio requise (si activé) → ouvrir modal "Présente-toi en quelques mots"
3. Parrain requis (si activé) → vérifier table \`parrainage\` en base

## ✅ Critères d'acceptation
- Chaque condition bloquante génère un message éphémère clair avec la raison
- Les conditions sont vérifiées dans l'ordre (pas de vérification suivante si la première échoue)
`,
},
{
  title: "Epic G | #33 — Publication demande dans #demandes (embed + actions staff)",
  labels: ["epic-g-members", "sprint-2"],
  body: `## 🎯 Objectif
Créer la carte de demande dans #demandes avec toutes les informations et les boutons d'action.

## 📁 Fichiers à créer/modifier
- \`modules/members/newMember.js\`
- \`events/interactionCreate.js\`

## ✅ Critères d'acceptation
- Embed : pseudo + avatar, date d'arrivée, durée écoulée, bio (si fournie), parrain (si applicable)
- Boutons : ✅ Accepter | ❌ Refuser | 💬 Répondre
- Seul le grade minimum configuré peut interagir avec les boutons
`,
},
{
  title: "Epic G | #34 — Traitement staff : accepter/refuser/répondre",
  labels: ["epic-g-members", "sprint-2"],
  body: `## 🎯 Objectif
Handlers complets pour les 3 actions staff sur une demande de promotion.

## 📁 Fichiers à créer/modifier
- \`modules/members/newMember.js\`
- \`modules/logs/logger.js\`

## ✅ Critères d'acceptation
- **Accepter** : retirer rôle Invité → assigner rôle Membre → update DB → post #général "Bienvenue !" → log #logs-mod → archiver demande
- **Refuser** : modal raison (optionnelle) → DM invité → log #logs-mod → archiver demande
- **Répondre** : modal message libre → DM invité
- La demande archivée est visuellement marquée (embed edité, boutons désactivés)
`,
},
{
  title: "Epic G | #35 — Commande /parrainer",
  labels: ["epic-g-members", "sprint-2"],
  body: `## 🎯 Objectif
Parrainage contrôlé + persistance DB + notification de l'invité.

## 📁 Fichiers à créer/modifier
- \`commands/parrainer.js\`
- \`modules/members/parrainage.js\`
- \`database/db.js\`

## ✅ Critères d'acceptation
- Utilisateur doit être Membre+ (grade ≥ 2)
- La cible doit être un Invité sur le serveur (grade 1)
- Un Membre ne peut parrainer qu'un seul Invité à la fois
- Enregistrement dans \`parrainage\` (parrain_id, invite_id, date)
- DM à l'invité : "Tu as été parrainé par @pseudo, tu peux maintenant faire ta demande"
`,
},
{
  title: "Epic G | #36 — Job d'expulsion automatique des Invités hors délai",
  labels: ["epic-g-members", "sprint-2"],
  body: `## 🎯 Objectif
Vérification périodique (24h) + kick + DM + log modération des Invités dépassant le délai.

## 📁 Fichiers à créer/modifier
- \`modules/members/expulsion.js\`
- \`events/ready.js\`

## ✅ Critères d'acceptation
- Timer toutes les 24h (lancé depuis \`ready.js\`)
- Requête base : Invités avec join_date dépassant le délai configuré
- DM envoyé avant l'expulsion (message configurable dans guild_config)
- Expulsion via \`GuildMember.kick()\`
- Log dans #logs-mod pour chaque expulsion
- Aucune expulsion si le module est désactivé dans guild_config
`,
},

// ════════════════════════════════════════════════════════════
// EPIC H — GAMELIST & OPT-IN
// ════════════════════════════════════════════════════════════
{
  title: "Epic H | #37 — Message permanent #mes-channels + bouton gestion",
  labels: ["epic-h-gamelist", "sprint-3"],
  body: `## 🎯 Objectif
Interface persistante dans #mes-channels pour la gestion de l'opt-in jeux.

## 📁 Fichiers à créer/modifier
- \`modules/games/gameList.js\`

## ✅ Critères d'acceptation
- Message épinglé (ou re-posté si supprimé) avec embed et bouton "🎮 Gérer mes jeux"
- Message "Aucun jeu disponible sur ce serveur" si la liste est vide
- Visible uniquement aux Membres+ (grade ≥ 2)
`,
},
{
  title: "Epic H | #38 — Multi-select jeux + pré-cochage sélection actuelle",
  labels: ["epic-h-gamelist", "sprint-3"],
  body: `## 🎯 Objectif
UX complète opt-in : SelectMenu multi-select avec les jeux déjà sélectionnés pré-cochés.

## 📁 Fichiers à créer/modifier
- \`modules/games/gameList.js\`
- \`events/interactionCreate.js\`

## ✅ Critères d'acceptation
- \`StringSelectMenuBuilder\` avec \`minValues: 0\`, \`maxValues: nombre de jeux\`
- Options pré-cochées selon \`member_games\` en base
- Gestion de la limite Discord de 25 options (pagination si > 25 jeux)
- Confirmation éphémère : "Tes jeux actifs : [liste]"
`,
},
{
  title: "Epic H | #39 — Diff ajouts/retraits + rôles Discord associés",
  labels: ["epic-h-gamelist", "sprint-3"],
  body: `## 🎯 Objectif
Calculer le diff entre ancienne et nouvelle sélection, puis assigner/retirer les rôles Discord.

## 📁 Fichiers à créer/modifier
- \`modules/games/gameList.js\`

## ✅ Critères d'acceptation
- Calcul du diff : \`ajouts = nouvelle - ancienne\`, \`retraits = ancienne - nouvelle\`
- \`GuildMember.roles.add()\` pour chaque ajout
- \`GuildMember.roles.remove()\` pour chaque retrait
- Mise à jour de \`member_games\` en base (insert ajouts, delete retraits)
`,
},
{
  title: "Epic H | #40 — Synchronisation #ma-gamelist ↔ #mes-channels",
  labels: ["epic-h-gamelist", "sprint-3"],
  body: `## 🎯 Objectif
Les deux interfaces #ma-gamelist et #mes-channels utilisent la même logique et les mêmes données.

## 📁 Fichiers à créer/modifier
- \`modules/games/gameList.js\`

## ✅ Critères d'acceptation
- Message permanent dans #ma-gamelist identique à #mes-channels
- Toute modification dans l'un se reflète dans l'autre (même table \`member_games\`)
- La fonction d'affichage est partagée (DRY)
`,
},
{
  title: "Epic H | #41 — Gestion admin ajout/retrait jeu depuis #jeux-serveur",
  labels: ["epic-h-gamelist", "sprint-3"],
  body: `## 🎯 Objectif
Provisioning/deprovisioning complet d'un jeu depuis l'interface Manager+ dans #jeux-serveur.

## 📁 Fichiers à créer/modifier
- \`modules/games/gameList.js\`
- \`modules/config/settings.js\`

## ✅ Critères d'acceptation
- **Ajout** : modal (nom, AppID Steam, galerie, changelogs) → créer catégorie+channels+rôle Discord → insérer dans \`games\`
- **Retrait** : SelectMenu → supprimer catégorie+channels+rôle Discord → supprimer de \`games\` et \`member_games\`
- Confirmation éphémère après chaque action
`,
},

// ════════════════════════════════════════════════════════════
// EPIC I — VOCAUX TEMPORAIRES
// ════════════════════════════════════════════════════════════
{
  title: "Epic I | #42 — UI #créer-un-channel + sélection du jeu",
  labels: ["epic-i-vocal", "sprint-3"],
  body: `## 🎯 Objectif
Interface de création vocale depuis le bouton et le menu déroulant dans #créer-un-channel.

## 📁 Fichiers à créer/modifier
- \`modules/games/gamesVocal.js\`
- \`events/interactionCreate.js\`

## ✅ Critères d'acceptation
- Message permanent avec bouton "🔊 Créer un vocal"
- Au clic : SelectMenu avec tous les jeux disponibles
- Réservé aux Membres+ (grade ≥ 2)
`,
},
{
  title: "Epic I | #43 — Création vocal temporaire (nom, limite, incrémentation)",
  labels: ["epic-i-vocal", "sprint-3"],
  body: `## 🎯 Objectif
Créer le channel vocal avec nom formaté, limite de membres et numérotation automatique si doublon.

## 📁 Fichiers à créer/modifier
- \`modules/games/gamesVocal.js\`
- \`database/db.js\`

## ✅ Critères d'acceptation
- Format : \`[Préfixe] [Nom du jeu] [Suffixe]\` (config #vocaux)
- Si vocal du même jeu existe déjà : "🎮 Minecraft — Partie 2", "Partie 3", etc.
- Limite de membres appliquée à la création (\`userLimit\`)
- Insérer dans \`vocal_temp\`
- Confirmation éphémère avec lien \`<#channelId>\` vers le vocal créé
`,
},
{
  title: "Epic I | #44 — Suppression auto sur vide avec timer annulable",
  labels: ["epic-i-vocal", "sprint-3"],
  body: `## 🎯 Objectif
Lifecycle complet des vocaux temporaires via voiceStateUpdate : timer de suppression annulable.

## 📁 Fichiers à créer/modifier
- \`events/voiceStateUpdate.js\`
- \`modules/games/gamesVocal.js\`

## ✅ Critères d'acceptation
- Écoute \`voiceStateUpdate\` : détecte quand un vocal temporaire devient vide
- Démarre un timer (délai depuis guild_config, défaut : 5 min)
- Si quelqu'un rejoint avant l'expiration → annuler le timer (Map<channelId, timeout>)
- À l'expiration → supprimer le channel + nettoyer \`vocal_temp\`
- Aucune erreur si le channel a déjà été supprimé manuellement (vérification existence)
`,
},
{
  title: "Epic I | #45 — Nettoyage au redémarrage des vocaux temporaires vides",
  labels: ["epic-i-vocal", "sprint-3"],
  body: `## 🎯 Objectif
Éviter les salons orphelins après un redémarrage du bot.

## 📁 Fichiers à créer/modifier
- \`events/ready.js\`
- \`modules/games/gamesVocal.js\`

## ✅ Critères d'acceptation
- Au \`ready\` : requête tous les \`vocal_temp\` en base
- Pour chaque entrée : vérifier si le channel existe et est vide
- Si vide → supprimer le channel Discord + supprimer de \`vocal_temp\`
- Si non vide → redémarrer le timer de suppression
`,
},

// ════════════════════════════════════════════════════════════
// EPIC J — CHANGELOGS STEAM
// ════════════════════════════════════════════════════════════
{
  title: "Epic J | #46 — Service client Steam API + fallback endpoint",
  labels: ["epic-j-steam", "sprint-4"],
  body: `## 🎯 Objectif
Wrapper d'appel robuste vers l'API Steam avec fallback entre endpoints.

## 📁 Fichiers à créer/modifier
- \`modules/games/gamesNotification.js\`

## Endpoints à essayer dans l'ordre
1. \`ISteamNews/GetNewsForApp/v0002\`
2. \`store.steampowered.com/events/ajaxgetadjacentpartnerevents\` (fallback)

## ✅ Critères d'acceptation
- Timeout configurable (défaut : 5s)
- Si API indisponible → logger l'erreur, retourner \`null\` (ne pas crasher)
- Retourne la liste des news formatée ou \`null\`
`,
},
{
  title: "Epic J | #47 — Détection nouveauté changelog + anti-doublon DB",
  labels: ["epic-j-steam", "sprint-4"],
  body: `## 🎯 Objectif
Comparer le dernier GID (ID news Steam) avec la base et persister les changelogs_seen.

## 📁 Fichiers à créer/modifier
- \`modules/games/gamesNotification.js\`
- \`database/db.js\`

## ✅ Critères d'acceptation
- Comparaison \`gid\` avec \`changelogs_seen.last_changelog_id\`
- Mise à jour de \`changelogs_seen\` après publication
- Un même changelog n'est jamais posté deux fois (même après redémarrage)
`,
},
{
  title: "Epic J | #48 — Publication #jeu-changelogs et #game-updates",
  labels: ["epic-j-steam", "sprint-4"],
  body: `## 🎯 Objectif
Formater et router les nouveaux changelogs vers les bons channels selon les toggles de config.

## 📁 Fichiers à créer/modifier
- \`modules/games/gamesNotification.js\`

## Format du message
- Titre du patch note
- Date de publication (format lisible)
- Résumé tronqué si > 1024 chars + lien "Lire la suite →"
- Lien direct vers le changelog Steam

## ✅ Critères d'acceptation
- Poster dans #[jeu]-changelogs si \`changelog_enabled=1\` pour ce jeu
- Poster dans #game-updates si le module est activé dans guild_config
- Embed bien formaté avec couleur de marque Steam
`,
},
{
  title: "Epic J | #49 — Planification périodique changelogs (fréquence config)",
  labels: ["epic-j-steam", "sprint-4"],
  body: `## 🎯 Objectif
Scheduler stable avec gestion d'erreurs non bloquante.

## 📁 Fichiers à créer/modifier
- \`events/ready.js\`
- \`modules/games/gamesNotification.js\`

## ✅ Critères d'acceptation
- Timer lancé depuis \`ready.js\` avec fréquence lue depuis guild_config (défaut : 60 min)
- Si une itération échoue → logger l'erreur, ne pas arrêter le scheduler
- Export \`startChangelogScheduler(client)\` appelé au ready
`,
},

// ════════════════════════════════════════════════════════════
// EPIC K — MODÉRATION MANUELLE
// ════════════════════════════════════════════════════════════
{
  title: "Epic K | #50 — Implémenter /warn",
  labels: ["epic-k-moderation", "sprint-4"],
  body: `## 🎯 Objectif
Sanction warn + DM membre + log #logs-mod + incrémentation score comportemental.

## 📁 Fichiers à créer/modifier
- \`commands/warn.js\`
- \`modules/moderation/moderation.js\`
- \`modules/moderation/behavior.js\`

## ✅ Critères d'acceptation
- Réservé à Modérateur+ (grade ≥ 3)
- Enregistrement dans \`sanctions\` (type: 'warn', auto: 0)
- Incrémentation \`score_comportement\` dans \`members\`
- DM au membre : raison + qui a appliqué
- Log dans #logs-mod
- Vérification des seuils comportementaux (appel à \`behavior.js\`)
`,
},
{
  title: "Epic K | #51 — Implémenter /mute",
  labels: ["epic-k-moderation", "sprint-4"],
  body: `## 🎯 Objectif
Timeout Discord natif avec parser de durée + planification du log de fin de mute.

## 📁 Fichiers à créer/modifier
- \`commands/mute.js\`
- \`modules/moderation/moderation.js\`

## ✅ Critères d'acceptation
- Parser durée : "1h" → 3600000ms | "30m" → 1800000ms | "1j" → 86400000ms
- \`GuildMember.timeout(durationMs, raison)\`
- Enregistrement dans \`sanctions\` (type: 'mute', duration)
- DM au membre avant le mute
- Log dans #logs-mod au départ + log à la fin du mute
`,
},
{
  title: "Epic K | #52 — Implémenter /kick",
  labels: ["epic-k-moderation", "sprint-4"],
  body: `## 🎯 Objectif
Expulsion contrôlée avec DM avant l'expulsion + journalisation complète.

## 📁 Fichiers à créer/modifier
- \`commands/kick.js\`
- \`modules/moderation/moderation.js\`

## ✅ Critères d'acceptation
- DM au membre avant expulsion (gestion d'erreur si DMs fermés)
- \`GuildMember.kick(raison)\`
- Enregistrement dans \`sanctions\` (type: 'kick')
- Log dans #logs-mod
`,
},
{
  title: "Epic K | #53 — Implémenter /ban",
  labels: ["epic-k-moderation", "sprint-4"],
  body: `## 🎯 Objectif
Bannissement + persistance sanction + logs.

## 📁 Fichiers à créer/modifier
- \`commands/ban.js\`
- \`modules/moderation/moderation.js\`

## ✅ Critères d'acceptation
- \`Guild.bans.create(userId, { reason })\`
- Enregistrement dans \`sanctions\` (type: 'ban')
- Log dans #logs-mod
- Gestion du cas où l'utilisateur a déjà quitté le serveur (ban par ID)
`,
},
{
  title: "Epic K | #54 — Implémenter /historique",
  labels: ["epic-k-moderation", "sprint-4"],
  body: `## 🎯 Objectif
Affichage de l'historique complet des sanctions d'un membre via embed paginé.

## 📁 Fichiers à créer/modifier
- \`commands/historique.js\`
- \`modules/moderation/moderation.js\`

## ✅ Critères d'acceptation
- Réservé à Modérateur+ (grade ≥ 3)
- Requête \`sanctions\` filtrée par guildId + userId
- Embed : type, raison, date, appliqué par, durée (si mute), auto (oui/non)
- Score comportemental actuel affiché en bas de l'embed
- Pagination si > 10 sanctions (boutons Précédent/Suivant)
- "Aucune sanction enregistrée" si historique vide
`,
},

// ════════════════════════════════════════════════════════════
// EPIC L — RAPPORTS MEMBRES
// ════════════════════════════════════════════════════════════
{
  title: "Epic L | #55 — Commande /signaler + modal de signalement",
  labels: ["epic-l-reports", "sprint-4"],
  body: `## 🎯 Objectif
Permettre à tout Membre de signaler un autre membre via un formulaire interactif.

## 📁 Fichiers à créer/modifier
- \`commands/signaler.js\`
- \`modules/moderation/reports.js\`

## ✅ Critères d'acceptation
- Accessible aux Membres+ (grade ≥ 2)
- Modal : "Qui signales-tu ?" (mention/pseudo), "Motif", "Lien/description preuve" (optionnel)
- Validation : champs obligatoires non vides
`,
},
{
  title: "Epic L | #56 — Publication rapport dans #rapports + bouton Traité",
  labels: ["epic-l-reports", "sprint-4"],
  body: `## 🎯 Objectif
Poster le rapport dans #rapports (Modération) avec bouton de traitement.

## 📁 Fichiers à créer/modifier
- \`modules/moderation/reports.js\`

## ✅ Critères d'acceptation
- Embed dans #rapports : qui signale (mention), qui est signalé, motif, preuve, timestamp
- Bouton "✅ Marquer comme traité" (Modérateur+)
- Handler bouton : éditer l'embed (titre "TRAITÉ"), log dans #logs-mod avec qui a traité
`,
},

// ════════════════════════════════════════════════════════════
// EPIC M — AUTO-MODÉRATION
// ════════════════════════════════════════════════════════════
{
  title: "Epic M | #57 — Anti-spam : fenêtre glissante + seuil paramétrable",
  labels: ["epic-m-automod", "sprint-4"],
  body: `## 🎯 Objectif
Détecter et sanctionner automatiquement le spam via une fenêtre glissante paramétrable.

## 📁 Fichiers à créer/modifier
- \`modules/moderation/autoMod.js\`
- \`events/messageCreate.js\`

## ✅ Critères d'acceptation
- Map en mémoire : \`userId → [timestamps des messages]\`
- Nettoyer les timestamps expirés à chaque message (éviter les fuites mémoire)
- Si seuil dépassé (ex: 5 msgs en 3s, paramétrable dans guild_config) :
  - Supprimer les messages en excès
  - Appliquer sanction auto selon behavior.js
  - Log dans #logs-mod
- Modérateur+ exemptés (paramétrable)
`,
},
{
  title: "Epic M | #58 — Slow mode automatique par channel",
  labels: ["epic-m-automod", "sprint-4"],
  body: `## 🎯 Objectif
Activer/désactiver le slow mode Discord natif sur des channels spécifiques depuis #auto-modération.

## 📁 Fichiers à créer/modifier
- \`modules/moderation/autoMod.js\`

## ✅ Critères d'acceptation
- Interface dans #auto-modération : liste des channels + toggle + saisie délai (secondes)
- \`channel.setRateLimitPerUser(délai)\`
- Persistance dans guild_config (survit au redémarrage)
- Désactiver = délai 0
- Valeurs acceptées : 0–21600 secondes (limite Discord)
`,
},
{
  title: "Epic M | #59 — Blacklist de mots (mode silencieux ou avertissement visible)",
  labels: ["epic-m-automod", "sprint-4"],
  body: `## 🎯 Objectif
Détecter les mots blacklistés dans les messages et agir selon le mode configuré.

## 📁 Fichiers à créer/modifier
- \`modules/moderation/autoMod.js\`

## ✅ Critères d'acceptation
- Interface dans #auto-modération : ajouter/retirer des mots, choisir le mode (A ou B)
- Mode A : suppression silencieuse uniquement
- Mode B : suppression + message d'avertissement visible dans le channel (mentionnant le membre)
- Vérification insensible à la casse
- Incrémentation du score comportemental
- Persistance de la blacklist dans guild_config
`,
},

// ════════════════════════════════════════════════════════════
// EPIC N — SCORE COMPORTEMENTAL
// ════════════════════════════════════════════════════════════
{
  title: "Epic N | #60 — Score comportemental : incrémentation et seuils",
  labels: ["epic-n-behavior", "sprint-4"],
  body: `## 🎯 Objectif
Incrémenter le score à chaque sanction et déclencher les sanctions automatiques chaînées selon les seuils configurés.

## 📁 Fichiers à créer/modifier
- \`modules/moderation/behavior.js\`

## ✅ Critères d'acceptation
- Fonction \`incrementScore(guildId, userId, amount)\` : update \`members.score_comportement\`
- Fonction \`checkThresholds(guild, member)\` : comparer score aux seuils configurés → appliquer sanction si dépassé
- Les seuils et actions sont lus depuis guild_config (ex: \`{"3": "mute:1h", "5": "kick", "7": "ban"}\`)
- Chaque déclenchement auto loggé dans #logs-mod avec \`auto=1\` en base
`,
},
{
  title: "Epic N | #61 — Interface #comportement (Owner) : config seuils + consultation + reset",
  labels: ["epic-n-behavior", "sprint-4"],
  body: `## 🎯 Objectif
Permettre à l'Owner de configurer les seuils comportementaux et de gérer les scores membres.

## 📁 Fichiers à créer/modifier
- \`modules/moderation/behavior.js\`
- \`modules/config/settings.js\`

## ✅ Critères d'acceptation
- Interface dans #comportement (Owner uniquement) :
  - Ajouter/modifier/supprimer des seuils (score → sanction)
  - Consulter les scores de tous les membres (tableau paginé)
  - Réinitialiser le score d'un membre (bouton + confirmation)
- Modifications persistées dans guild_config
- Réinitialisation loggée dans #logs-mod
`,
},

// ════════════════════════════════════════════════════════════
// EPIC O — SURVEILLANCE SERVEURS DE JEU
// ════════════════════════════════════════════════════════════
{
  title: "Epic O | #62 — Checker TCP serveur de jeu (timeout 3s + statuts)",
  labels: ["epic-o-servers", "sprint-5"],
  body: `## 🎯 Objectif
Wrapper de connexion TCP robuste pour vérifier le statut d'un serveur de jeu.

## 📁 Fichiers à créer/modifier
- \`modules/servers/serverMonitor.js\`

## ✅ Critères d'acceptation
- Tentative TCP sur IP:port avec timeout 3s max
- Statuts : ✅ En ligne | ❌ Hors ligne | ⚠️ Instable (timeout intermittent)
- Si le jeu expose une API Source Query → récupérer nombre de joueurs (joueurs/max)
- Aucun crash en cas d'erreur réseau
`,
},
{
  title: "Epic O | #63 — Scheduler surveillance + mise à jour embeds #liste-serveurs",
  labels: ["epic-o-servers", "sprint-5"],
  body: `## 🎯 Objectif
Timer toutes les 5 minutes + mise à jour (édition, pas re-post) des embeds dans #liste-serveurs.

## 📁 Fichiers à créer/modifier
- \`modules/servers/serverMonitor.js\`
- \`events/ready.js\`

## ✅ Critères d'acceptation
- Timer toutes les 5 min (lancé depuis ready.js)
- Un embed par serveur surveillé, édité à chaque cycle (persistance du messageId en base)
- Timestamp "Dernière vérification : il y a X min" dans chaque embed
- Mise à jour de \`last_status\` et \`last_check\` dans \`servers_jeu\`
`,
},
{
  title: "Epic O | #64 — Interface #serveurs-jeu (Manager+) : ajouter/retirer un serveur",
  labels: ["epic-o-servers", "sprint-5"],
  body: `## 🎯 Objectif
Permettre aux Manager+ d'ajouter ou retirer des serveurs de jeu surveillés.

## 📁 Fichiers à créer/modifier
- \`modules/servers/serverMonitor.js\`
- \`modules/config/settings.js\`

## ✅ Critères d'acceptation
- Bouton "➕ Ajouter un serveur" → modal : nom, jeu associé, IP, port
- Bouton "❌ Retirer un serveur" → SelectMenu des serveurs enregistrés
- Validation IP/port (format correct, port 1–65535)
- Insérer/supprimer dans \`servers_jeu\`
`,
},

// ════════════════════════════════════════════════════════════
// EPIC P — MODULE SETTINGS (INTERFACES CONFIG)
// ════════════════════════════════════════════════════════════
{
  title: "Epic P | #65 — settings.js : système de messages permanents par channel de config",
  labels: ["epic-p-settings", "sprint-5"],
  body: `## 🎯 Objectif
Poster (et re-poster si supprimé) un message interactif épinglé dans chaque channel de la catégorie CONFIGURATION.

## 📁 Fichiers à créer/modifier
- \`modules/config/settings.js\`

## ✅ Critères d'acceptation
- Fonction \`ensureConfigMessage(guild, channelName, buildEmbed, buildComponents)\`
- Vérifie si le message Guardian existe toujours dans le channel (par messageId persisté en base ou pin)
- Sinon → re-poste le message
- Appelé au ready pour chaque guild installée
`,
},
{
  title: "Epic P | #66 — Interfaces config Membre+ (#mes-channels, #ma-gamelist)",
  labels: ["epic-p-settings", "sprint-5"],
  body: `## 🎯 Objectif
Messages permanents de gestion opt-in jeux dans les channels accessibles aux Membres.

## 📁 Fichiers à créer/modifier
- \`modules/config/settings.js\`
- \`modules/games/gameList.js\`

## ✅ Critères d'acceptation
- #mes-channels et #ma-gamelist ont leur interface interactive (délégation vers gameList.js)
`,
},
{
  title: "Epic P | #67 — Interfaces config Modérateur+ (#bot, #jeux-serveur, #statut-bot)",
  labels: ["epic-p-settings", "sprint-5"],
  body: `## 🎯 Objectif
Interfaces de configuration pour les channels accessibles aux Modérateurs.

## 📁 Fichiers à créer/modifier
- \`modules/config/settings.js\`

## ✅ Critères d'acceptation
- **#statut-bot** : embed temps réel (version, uptime, modules actifs, dernières actions, erreurs récentes) — mis à jour toutes les 5 min
- **#bot** : paramètres généraux du bot (comportement global, messages par défaut)
- **#jeux-serveur** : délégué à \`gameList.js\` (issue #41)
`,
},
{
  title: "Epic P | #68 — Interfaces config Manager+ (#membres, #channels, #vocaux, #jeux, #changelogs, #suggestions-config, etc.)",
  labels: ["epic-p-settings", "sprint-5"],
  body: `## 🎯 Objectif
Implémenter les interfaces interactives pour tous les channels de configuration Manager+.

## 📁 Fichiers à créer/modifier
- \`modules/config/settings.js\`

## Channels à couvrir
- **#membres** : délai promotion, bio, parrainage, texte accueil, règles, grade minimum staff
- **#channels** : toggles modules (AFK, galerie, suggestions, liste-serveurs, statut-bot, game-updates)
- **#vocaux** : préfixe, suffixe, limite membres, délai suppression
- **#jeux** : paramètres par jeu (galerie, changelogs, texte, appID, préfixe/suffixe)
- **#changelogs** : activation globale/par jeu, fréquence, agrégation #game-updates
- **#suggestions-config** : activer/désactiver, grade min post, grade min réaction
- **#annonces-config** : grade min post, template
- **#faq-config** : régénérer posts, ajouter/modifier/supprimer posts

## ✅ Critères d'acceptation
- Toutes les modifications persistées dans guild_config
- Confirmation éphémère après chaque modification
- Valeurs actuelles toujours affichées dans les interfaces
`,
},
{
  title: "Epic P | #69 — Interfaces config Owner (#guardian, #rôles) + logs-config",
  labels: ["epic-p-settings", "sprint-5"],
  body: `## 🎯 Objectif
Interfaces Owner : mapping grades, activation modules, rôles, et traçage des modifications dans #logs-config.

## 📁 Fichiers à créer/modifier
- \`modules/config/settings.js\`

## ✅ Critères d'acceptation
- **#guardian** : re-mapper les grades, activer/désactiver modules entiers, reset partiel/complet (avec confirmation double)
- **#rôles** : modifier nom et couleur des rôles de grade
- **#logs-config** : à chaque modification de config via Guardian → poster : qui, quel paramètre, ancienne valeur → nouvelle valeur, timestamp
- Accessible uniquement à l'Owner (grade 5)
`,
},

// ════════════════════════════════════════════════════════════
// EPIC Q — TESTS
// ════════════════════════════════════════════════════════════
{
  title: "Epic Q | #70 — Tests unitaires : database/db.js (schéma, CRUD, helpers)",
  labels: ["epic-q-tests", "sprint-transverse"],
  body: `## 🎯 Objectif
Couvrir la couche base de données avec des tests unitaires fiables.

## 📁 Fichiers à créer/modifier
- \`tests/database.test.js\`

## ✅ Critères d'acceptation
- Base en mémoire (\`:memory:\`) pour les tests (isolation totale)
- Idempotence de la création des tables
- CRUD sur les tables principales : \`guilds\`, \`games\`, \`members\`, \`sanctions\`
- Tests des helpers : \`getConfig\`, \`setConfig\`, \`getGrade\`, \`setGrade\`
- \`npm test\` passe sans erreur
`,
},
{
  title: "Epic Q | #71 — Tests unitaires : checkInstall + logique promotion + behavior",
  labels: ["epic-q-tests", "sprint-transverse"],
  body: `## 🎯 Objectif
Couvrir la logique métier critique des modules core.

## 📁 Fichiers à créer/modifier
- \`tests/checkInstall.test.js\`
- \`tests/members.test.js\`
- \`tests/behavior.test.js\`

## ✅ Critères d'acceptation
- **checkInstall** : hash SHA256 correct, détection installé/non installé
- **members** : vérification conditions promotion (délai, bio, parrain) avec cas limite
- **behavior** : incrémentation score, déclenchement seuils, réinitialisation
- Interactions Discord mockées (pas de client réel)
- \`npm test\` passe sans erreur
`,
},
{
  title: "Epic Q | #72 — Tests unitaires : autoMod (anti-spam, blacklist, slow mode)",
  labels: ["epic-q-tests", "sprint-transverse"],
  body: `## 🎯 Objectif
Couvrir les algorithmes d'auto-modération.

## 📁 Fichiers à créer/modifier
- \`tests/autoMod.test.js\`

## ✅ Critères d'acceptation
- Anti-spam : fenêtre glissante, seuils, nettoyage mémoire
- Blacklist : détection insensible à la casse, mode A vs B
- Gestion des membres exemptés
- \`npm test\` passe sans erreur
`,
},

// ════════════════════════════════════════════════════════════
// EPIC R — RICH PRESENCE (OPTIONNEL)
// ════════════════════════════════════════════════════════════
{
  title: "Epic R | #73 — [OPTIONNEL] Placeholder Rich Presence / Leaderboard",
  labels: ["epic-r-optionnel", "sprint-optionnel"],
  body: `## ⚠️ MODULE FACULTATIF — À développer EN DERNIER
Ne pas bloquer ni conditionner les autres modules à celui-ci.

## 🎯 Objectif
Créer le fichier placeholder documenté pour le futur module Rich Presence / Leaderboard.

## 📁 Fichiers à créer/modifier
- \`modules/richPresence/richPresence.js\` (placeholder)

## Idée générale (future implémentation)
- Lire la Rich Presence Discord des membres via \`presenceUpdate\`
- Générer un classement des jeux les plus joués sur le serveur
- Stats optionnelles : temps de jeu cumulé, sessions
- Toutes les données sont opt-in (consentement membre requis)
- Channel dédié ou embed mis à jour périodiquement

## ✅ Critères d'acceptation
- Le fichier existe avec les commentaires documentant l'intention
- Clairement marqué [TODO / OPTIONNEL] en en-tête
- N'impacte aucun autre module
`,
},
            ];

            // ── Labels to create ──────────────────────────────────────────────
            const labelDefs = [
{ name: "epic-a-scaffold",           color: "0075ca", description: "Epic A — Scaffolding Node.js" },
{ name: "epic-b-database",            color: "f9d0c4", description: "Epic B — Base de données SQLite" },
{ name: "epic-c-logging",             color: "c5def5", description: "Epic C — Logging & erreurs" },
{ name: "epic-d-bootstrap",           color: "bfd4f2", description: "Epic D — Bootstrap Discord" },
{ name: "epic-e-setup",               color: "e4e669", description: "Epic E — Setup & checkInstall" },
{ name: "epic-f-discord-structure",   color: "fef2c0", description: "Epic F — Structure Discord" },
{ name: "epic-g-members",             color: "d93f0b", description: "Epic G — Membres & onboarding" },
{ name: "epic-h-gamelist",            color: "c2e0c6", description: "Epic H — Gamelist & opt-in" },
{ name: "epic-i-vocal",               color: "d4c5f9", description: "Epic I — Vocaux temporaires" },
{ name: "epic-j-steam",               color: "fbca04", description: "Epic J — Changelogs Steam" },
{ name: "epic-k-moderation",          color: "e11d48", description: "Epic K — Modération manuelle" },
{ name: "epic-l-reports",             color: "f97316", description: "Epic L — Rapports membres" },
{ name: "epic-m-automod",             color: "9333ea", description: "Epic M — Auto-modération" },
{ name: "epic-n-behavior",            color: "7c3aed", description: "Epic N — Score comportemental" },
{ name: "epic-o-servers",             color: "0ea5e9", description: "Epic O — Surveillance serveurs" },
{ name: "epic-p-settings",            color: "84cc16", description: "Epic P — Settings / Config" },
{ name: "epic-q-tests",               color: "22c55e", description: "Epic Q — Tests unitaires" },
{ name: "epic-r-optionnel",           color: "94a3b8", description: "Epic R — Rich Presence (optionnel)" },
{ name: "sprint-0",                   color: "ededed", description: "Sprint 0 — Infrastructure" },
{ name: "sprint-1",                   color: "0075ca", description: "Sprint 1 — Setup & Structure Discord" },
{ name: "sprint-2",                   color: "d93f0b", description: "Sprint 2 — Membres" },
{ name: "sprint-3",                   color: "0052cc", description: "Sprint 3 — Games & Vocaux" },
{ name: "sprint-4",                   color: "5319e7", description: "Sprint 4 — Steam & Modération" },
{ name: "sprint-5",                   color: "006b75", description: "Sprint 5 — Servers & Config" },
{ name: "sprint-transverse",          color: "c5def5", description: "Sprint transverse — Tests" },
{ name: "sprint-optionnel",           color: "f3f4f6", description: "Sprint optionnel — Rich Presence" },
            ];

            // Create labels
            console.log("Creating labels...");
            for (const label of labelDefs) {
try {
  await github.rest.issues.createLabel({
    owner: context.repo.owner,
    repo: context.repo.repo,
    name: label.name,
    color: label.color,
    description: label.description,
  });
  console.log(`✅ Label: ${label.name}`);
} catch (e) {
  if (e.status === 422) {
    console.log(`⏭️  Already exists: ${label.name}`);
  } else {
    console.warn(`⚠️  Label error (${label.name}): ${e.message}`);
  }
}
            }

            // Create issues
            console.log(`\nCreating ${issues.length} issues...`);
            let created = 0;
            for (const issue of issues) {
try {
  const result = await github.rest.issues.create({
    owner: context.repo.owner,
    repo: context.repo.repo,
    title: issue.title,
    body: issue.body,
    labels: issue.labels,
  });
  console.log(`✅ #${result.data.number}: ${issue.title}`);
  created++;
  await new Promise(r => setTimeout(r, 350));
} catch (e) {
  console.error(`❌ Failed: "${issue.title}" — ${e.message}`);
}
            }

            console.log(`\n🎉 Done! Created ${created}/${issues.length} issues.`);
};
