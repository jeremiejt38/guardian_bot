# GUARDIAN — Cahier des Charges v2

> **Version** : 2.0  
> **Date** : 2026-06-30  
> **Statut** : Spécification finale approuvée  
> **Auteur** : Spécifications dérivées des décisions utilisateur

---

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 CONTEXTE & OBJECTIF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Table des matières

[TODO: Add anchor links]

---

Guardian est un bot Discord de gestion de serveur orienté Gaming, développé en JavaScript (Node.js) avec Discord.js v14.
Il résout un problème concret : un serveur gaming avec 20+ catégories
de jeux visibles par tout le monde, des channels vocaux statiques vides,
aucun système de filtrage et des nouveaux membres perdus dès l'arrivée.

Guardian remplace cette organisation chaotique par :
- Un système d'opt-in par jeu (seuls les jeux choisis apparaissent)
- Des channels vocaux temporaires créés à la demande
- Un flow d'accueil guidé pour les nouveaux arrivants
- Une modération assistée par le bot
- Une configuration centralisée par grade

Le bot est compatible multi-serveur (config isolée par guildId). Une seule instance, un seul token, un seul `.env`.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👥 HIÉRARCHIE DES GRADES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Guardian fonctionne avec 5 grades fixes, mappés sur des rôles Discord
configurés lors du setup. Des rôles intermédiaires sur le serveur
n'impactent pas Guardian. Un membre sans aucun rôle Guardian n'a
aucun accès (Grade 0 implicite).

**Grades disponibles** : Invité, Membre, Modérateur, Manager, Owner.
**AUCUN grade avec le suffixe "+" n'existe dans Guardian.**

Grade 1 — Invité
  - Assigné automatiquement à l'arrivée sur le serveur
  - Accès : #règles (version simplifiée), #annonces, #bienvenue, #faq
  - Peut lire #général (50 derniers messages uniquement, pas l'historique)
  - Peut rejoindre le vocal Général
  - Peut soumettre une demande de promotion Invité → Membre
  - Ne peut PAS accéder aux channels jeux, modération, configuration
  - Expulsion automatique configurable (délai sans promotion, désactivable)

Grade 2 — Membre
  - Accès à la communauté complète
  - Peut faire l'opt-in de ses jeux via Guardian (#mes-channels)
  - Voit uniquement les catégories des jeux qu'il a sélectionnés
  - Peut créer un channel vocal temporaire depuis #créer-un-channel
  - Peut parrainer un Invité via /parrainer <pseudo>
  - Peut poster dans #suggestions, #général, et les channels de jeux opt-in
  - Accès aux channels de config personnels : #mes-channels, #ma-gamelist

Grade 3 — Modérateur
  - Tous les accès Membre
  - Peut accepter ou refuser les demandes Invité → Membre dans #demandes
  - Peut accepter ou refuser les demandes d'ajout de jeu dans #demandes
  - Peut appliquer des sanctions (warn, mute, kick, ban)
  - Accès à la catégorie Modération : #général-staff, #demandes, #logs-mod,
    #sanctions, Vocal Staff
  - Accès aux channels de config : #statut-bot, #bot, #jeux-serveur

Grade 4 — Manager
  - Tous les accès Modérateur
  - Accès à tous les channels de configuration avancés (voir section CONFIG)
  - Peut activer/désactiver des modules du bot
  - Peut gérer la liste des jeux officiels du serveur
  - Peut modifier les paramètres channels, vocaux, jeux, changelogs, etc.

Grade 5 — Owner
  - Accès total sans restriction
  - Seul à accéder aux channels : #guardian, #comportement,
    #auto-modération, #rôles, #logs-config
  - Configure le mapping grades ↔ rôles Discord
  - Reçoit une notification DM si un rôle Guardian est supprimé
  - Un seul Owner par serveur (vérifié lors du setup)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🗂️ STRUCTURE COMPLÈTE DU SERVEUR DISCORD

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 SYSTÈME DE SCORE COMPORTEMENTAL
(Module Comportement, Owner)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Chaque membre a un score comportemental stocké en base (DB).

**Valeurs par défaut (TOUTES configurables et désactivables individuellement)** :

| Paramètre | Valeur |
|-----------|--------|
| Score maximum | 350 points |
| Score par défaut (nouveau membre) | 200 points |
| Seuil d'alerte | < 150 points |
| Seuil de restriction (mute Discord) | < 100 points |
| Seuil de sanction (kick/tempban) | < 50 points |
| Score plancher | 0 points |

**Diminution du score (Infractions)** :

| Catégorie | Exemples | Perte par défaut |
|-----------|----------|------------------|
| Mineure (automatisé) | Spam textuel, majuscules abusives, ghost ping | -5 à -10 pts |
| Modérée (automatisé/signalé) | Insultes, langage inapproprié | -15 à -25 pts |
| Grave (signalé) | Harcèlement, contenus illégaux | -100 à -150 pts |
| Récidive < 24h | Infraction identique dans les 24h | Multiplicateur x2 |

Toutes les valeurs sont configurables et désactivables individuellement.

**Augmentation passive** :
- +5 points tous les 3 jours sans infraction (configurable)
- Score plancher passif à 150 points (configurable)

**Discord Boost** :
- +50 points UNIQUES à l'activation du boost Nitro
- **AUCUN retrait** du bonus en cas d'expiration du boost

**Actions des modérateurs** :
- Bonus manuels configurables via commandes de modération


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Toutes les catégories et channels ci-dessous sont créés automatiquement
par Guardian lors du setup final (Étape 5).
Les channels "désactivables" sont cachés (pas supprimés) si le module
est désactivé — ils peuvent être réactivés depuis la config.

────────────────────────────────────────
📁 INFORMATIONS
Catégorie visible par : Invité, Membre, Modérateur, Manager, Owner
────────────────────────────────────────

#règles
  Type     : Texte, read-only
  Visible  : Invité, Membre, Modérateur, Manager, Owner
  Écriture : Personne (géré uniquement par Guardian)
  Fonction : Invité voit une version simplifiée des règles.
             Membre et supérieur voient la version complète.
             Les deux versions sont personnalisables dans la config (#membres).

Annonces
  Type     : Annonce, read-only
  Visible  : Invité, Membre, Modérateur, Manager, Owner
  Écriture : Manager, Owner uniquement
  Fonction : Canal officiel des annonces du serveur.

#bienvenue
  Type     : Texte, read-only
  Visible  : Invité, Membre, Modérateur, Manager, Owner
  Écriture : Guardian uniquement (automatique)
  Fonction : Message d'accueil posté par Guardian à chaque nouvel arrivant.
             Contient le texte personnalisable + bouton "Faire une demande"
             pour accéder au statut Membre.

#faq
  Type     : Forum
  Visible  : Invité, Membre, Modérateur, Manager, Owner
  Écriture : Guardian (posts par défaut au setup) + Manager/Owner (manuel)
  Fonction : Questions fréquentes du serveur. Prégénérée par Guardian
             au setup avec des posts par défaut. Modifiable dans #faq (config).

#statut-bot
  Type     : Texte, read-only
  Visible  : Invité, Membre, Modérateur, Manager, Owner
  Écriture : Guardian uniquement
  Fonction : Statut en temps réel de Guardian : version, uptime, modules
             actifs, dernières actions exécutées. Désactivable dans #channels.

────────────────────────────────────────
📁 COMMUNAUTÉ
Catégorie visible par : Membre, Modérateur, Manager, Owner
(Invité : accès partiel à #général uniquement)
────────────────────────────────────────

#général
  Type     : Texte
  Visible  : Invité (lecture partielle), Membre, Modérateur, Manager, Owner
  Écriture : Membre, Modérateur, Manager, Owner
  Fonction : Chat général du serveur. L'Invité peut lire les 50 derniers
             messages uniquement — pas l'historique complet.

#game-updates
  Type     : Texte, read-only
  Visible  : Membre, Modérateur, Manager, Owner
  Écriture : Guardian uniquement
  Fonction : Agrège automatiquement les changelogs Steam de tous les jeux
             activés sur le serveur. Chaque nouveau patch note y est posté
             avec titre, date, résumé et lien Steam.
             Désactivable dans #changelogs (config).

#suggestions
  Type     : Forum
  Visible  : Membre, Modérateur, Manager, Owner
  Écriture : Membre, Modérateur, Manager, Owner
  Fonction : Forum de suggestions communautaires. Les membres créent des
             posts, les autres peuvent réagir/commenter.
             Droits de post et réaction paramétrables dans #suggestions (config).
             Module désactivable.

#liste-serveurs
  Type     : Texte, read-only
  Visible  : Membre, Modérateur, Manager, Owner
  Écriture : Guardian uniquement
  Fonction : Affiche le statut en temps réel des serveurs de jeu enregistrés.
             Guardian teste chaque IP:port toutes les 5 minutes.
             Affiche : nom, jeu, IP:port, statut (✅ En ligne / ❌ Hors ligne /
             ⚠️ Instable), nombre de joueurs connectés si l'API du jeu
             le permet. Module désactivable.

────────────────────────────────────────
📁 VOCAUX
────────────────────────────────────────

#créer-un-channel
  Type     : Texte
  Visible  : Membre, Modérateur, Manager, Owner
  Écriture : Membre, Modérateur, Manager, Owner (interactions Guardian)
  Fonction : Interface Guardian pour créer un vocal temporaire.
             Le membre sélectionne un jeu via menu déroulant.
             Guardian crée le vocal dans cette catégorie.

Général
  Type     : Vocal permanent
  Visible  : Invité, Membre, Modérateur, Manager, Owner
  Fonction : Channel vocal ouvert à tous, permanent.

AFK
  Type     : Vocal permanent
  Visible  : Invité, Membre, Modérateur, Manager, Owner
  Fonction : Channel AFK Discord standard. Délai paramétrable dans #vocaux.
             Désactivable dans #channels (config).

[Préfixe] [Nom du jeu] [Suffixe]
  Type     : Vocal temporaire (généré dynamiquement par Guardian)
  Visible  : Membre, Modérateur, Manager, Owner
  Fonction : Créé à la demande depuis #créer-un-channel.
             Supprimé automatiquement X minutes après être vide.
             Plusieurs vocaux du même jeu peuvent coexister simultanément
             (incrémentation numérique automatique si nécessaire).
             Préfixe, suffixe, limite de membres et délai de suppression
             paramétrables dans #vocaux (config).

────────────────────────────────────────
📁 [NOM DU JEU] — Répété pour chaque jeu activé
Visible uniquement par les membres ayant fait l'opt-in pour ce jeu
+ Modérateur, Manager, Owner (toujours visibles)
────────────────────────────────────────

#[nom-du-jeu]
  Type     : Texte
  Visible  : Membres opt-in ce jeu, Modérateur, Manager, Owner
  Écriture : Membre, Modérateur, Manager, Owner
  Fonction : Chat général dédié au jeu.

#[nom-du-jeu]-galerie
  Type     : Texte (médias uniquement)
  Visible  : Membres opt-in ce jeu, Modérateur, Manager, Owner
  Écriture : Membre, Modérateur, Manager, Owner
  Fonction : Partage de screenshots et souvenirs de jeu.
             Activable/désactivable par jeu dans #jeux (config).

#[nom-du-jeu]-changelogs
  Type     : Texte, read-only
  Visible  : Membres opt-in ce jeu, Modérateur, Manager, Owner
  Écriture : Guardian uniquement
  Fonction : Changelogs Steam automatiques pour ce jeu spécifique.
             Également agrégés dans #game-updates.
             Activable/désactivable par jeu dans #jeux (config).

────────────────────────────────────────
📁 MODÉRATION
Catégorie visible par : Modérateur, Manager, Owner uniquement
────────────────────────────────────────

#général-staff
  Type     : Texte
  Visible  : Modérateur, Manager, Owner
  Écriture : Modérateur, Manager, Owner
  Fonction : Discussion interne du staff. Espace de coordination.

#demandes
  Type     : Texte
  Visible  : Modérateur, Manager, Owner
  Écriture : Guardian uniquement (les demandes arrivent automatiquement)
  Fonction : Reçoit les demandes de promotion Invité → Membre.
             Chaque demande affiche : pseudo, avatar, date d'arrivée,
             durée depuis l'arrivée, bio (si requise), parrain (si applicable).
             Boutons : ✅ Accepter / ❌ Refuser / 💬 Répondre (modal pour
             envoyer un message au demandeur).
             Le grade minimum pour traiter les demandes est paramétrable
             (défaut : Modérateur).

#logs-mod
  Type     : Texte, read-only
  Visible  : Modérateur, Manager, Owner
  Écriture : Guardian uniquement
  Fonction : Logs de modération : arrivées, départs, sanctions appliquées,
             promotions acceptées/refusées, expulsions automatiques d'Invités,
             rapports traités. Les événements affichés sont sélectionnables
             dans #logs-config (Owner).

#sanctions
  Type     : Texte
  Visible  : Modérateur, Manager, Owner
  Écriture : Modérateur, Manager, Owner (via commandes slash Guardian)
  Fonction : Appliquer des sanctions via les commandes /warn /mute /kick /ban.
             Guardian affiche l'historique des sanctions par membre.
             Chaque sanction incrémente le score comportemental du membre.
             Les sanctions automatiques (depuis autoMod) y sont également
             loguées.

#rapports
  Type     : Texte
  Visible  : Modérateur, Manager, Owner
  Écriture : Guardian uniquement (formulaires soumis par les membres)
  Fonction : Reçoit les signalements des membres via formulaire interactif
             (modal Guardian). Affiche : qui signale, qui est signalé,
             motif, preuves. Bouton "Marquer comme traité".

Vocal Staff
  Type     : Vocal permanent
  Visible  : Modérateur, Manager, Owner
  Fonction : Réunions internes du staff.

────────────────────────────────────────
📁 CONFIGURATION
Catégorie visible selon le grade — filtrée par Guardian
────────────────────────────────────────

--- VISIBLE PAR : Membre, Modérateur, Manager, Owner ---

#mes-channels
  Type     : Texte
  Visible  : Membre, Modérateur, Manager, Owner
  Écriture : Via interactions Guardian uniquement (boutons/menus)
  Fonction : Le membre gère ici ses channels visibles par jeu.
             Guardian affiche un menu interactif multi-select avec
             la liste des jeux disponibles sur le serveur.
             Cocher un jeu = afficher sa catégorie de channels.
             Décocher = cacher. Persisté en base de données.

#ma-gamelist
  Type     : Texte
  Visible  : Membre, Modérateur, Manager, Owner
  Écriture : Via interactions Guardian uniquement
  Fonction : Le membre gère sa liste de jeux personnelle suivis.
             Affiche les jeux suivis, permet d'en ajouter/retirer.
             Lié à #mes-channels (opt-in synchronisé).

--- VISIBLE PAR : Modérateur, Manager, Owner ---

#statut-bot
  Type     : Texte, read-only
  Visible  : Modérateur, Manager, Owner
  Écriture : Guardian uniquement
  Fonction : Tableau de bord Guardian en temps réel : version du bot,
             uptime, modules actifs/inactifs, dernières actions exécutées,
             erreurs récentes. Désactivable dans #channels.

#bot
  Type     : Texte
  Visible  : Modérateur, Manager, Owner
  Écriture : Via interactions Guardian
  Fonction : Paramètres généraux de Guardian : comportement global,
             messages par défaut, langue (v2). Interface interactive.

#jeux-serveur
  Type     : Texte
  Visible  : Modérateur, Manager, Owner
  Écriture : Modérateur, Manager, Owner via Guardian
  Fonction : Liste officielle des jeux disponibles sur le serveur.
             Ajouter un jeu → Guardian crée automatiquement la catégorie
             et les channels associés.
             Retirer un jeu → Guardian supprime la catégorie et retire
             le jeu de tous les profils membres.

--- VISIBLE PAR : Manager, Owner ---

#membres
  Type     : Texte
  Visible  : Manager, Owner
  Écriture : Via interactions Guardian
  Fonction : Paramètres d'accueil et de promotion des membres :
             - Délai minimum avant de pouvoir soumettre une demande de
               promotion (défaut : 48h, paramétrable)
             - Bio obligatoire ou non pour la demande (si oui : modal affiché)
             - Parrainage obligatoire ou non (si oui : /parrainer requis avant)
             - Texte d'accueil personnalisable (affiché dans #bienvenue)
             - Version simplifiée des règles (affichée aux Invités dans #règles)
             - Version complète des règles (affichée aux Membres+ dans #règles)
             - Grade minimum requis pour accepter une demande (défaut : Modérateur)
             - Délai d'expulsion automatique des Invités sans promotion
               (paramétrable, désactivable)

#channels
  Type     : Texte
  Visible  : Manager, Owner
  Écriture : Via interactions Guardian
  Fonction : Activer/désactiver des channels et modules globaux :
             - Channel AFK (vocal)
             - Channel galerie par jeu
             - Module suggestions (#suggestions)
             - Module liste-serveurs (#liste-serveurs)
             - Module statut-bot (#statut-bot)
             Les channels désactivés sont cachés (pas supprimés).

#vocaux
  Type     : Texte
  Visible  : Manager, Owner
  Écriture : Via interactions Guardian
  Fonction : Paramètres des channels vocaux temporaires :
             - Préfixe du nom du vocal (ex: "🎮")
             - Suffixe du nom du vocal (ex: "— Partie")
             - Limite maximale de membres par vocal temporaire
             - Délai avant suppression automatique si vide (en minutes)

#jeux
  Type     : Texte
  Visible  : Manager, Owner
  Écriture : Via interactions Guardian
  Fonction : Paramètres fins par jeu individuel :
             - Activer/désactiver le channel galerie
             - Activer/désactiver les changelogs automatiques
             - Activer/désactiver le channel texte de discussion
             - AppID Steam associé au jeu (pour les changelogs)
             - Préfixe/suffixe des noms de channels pour ce jeu

#changelogs
  Type     : Texte
  Visible  : Manager, Owner
  Écriture : Via interactions Guardian
  Fonction : Configuration des changelogs Steam :
             - Activation globale ou par jeu
             - Fréquence de vérification (en minutes, défaut : 60)
             - Agrégation dans #game-updates : oui/non
             - Format des messages de changelog (titre, résumé, lien)

#suggestions-config
  Type     : Texte
  Visible  : Manager, Owner
  Écriture : Via interactions Guardian
  Fonction : Paramètres du forum suggestions :
             - Activer/désactiver le module
             - Grade minimum pour créer un post (défaut : Membre)
             - Grade minimum pour réagir (défaut : Membre)

#annonces-config
  Type     : Texte
  Visible  : Manager, Owner
  Écriture : Via interactions Guardian
  Fonction : Paramètres du channel #annonces :
             - Grade minimum pour poster (défaut : Manager)
             - Format des annonces (template personnalisable)

#faq-config
  Type     : Texte
  Visible  : Manager, Owner
  Écriture : Via interactions Guardian
  Fonction : Gestion du forum FAQ :
             - Régénérer les posts par défaut
             - Ajouter/modifier/supprimer des posts manuellement

#serveurs-jeu
  Type     : Texte
  Visible  : Manager, Owner
  Écriture : Via interactions Guardian
  Fonction : Gestion de la liste des serveurs de jeu surveillés :
             - Ajouter un serveur (nom, jeu associé, IP, port)
             - Retirer un serveur de la surveillance
             - Consulter les résultats des derniers tests de connexion
             ⚠️ La gestion Pterodactyl (démarrage/arrêt) est prévue pour
             un bot séparé — Guardian ne l'implémente PAS.
             Le channel #gestion-serveurs est prévu dans la structure
             mais reste un placeholder documenté pour le bot Pterodactyl.

#gestion-serveurs
  Type     : Texte
  Visible  : Manager, Owner
  Écriture : N/A (placeholder)
  Fonction : Réservé à l'intégration future d'un bot Pterodactyl séparé.
             Guardian crée ce channel mais n'y poste rien.
             Affiche un message explicatif au setup.

--- VISIBLE PAR : Owner uniquement ---

#guardian
  Type     : Texte
  Visible  : Owner uniquement
  Écriture : Via interactions Guardian
  Fonction : Configuration globale de Guardian :
             - Mapping grades Guardian ↔ rôles Discord du serveur
             - Activation/désactivation de modules entiers
             - Réinitialisation partielle (config seulement) ou complète
               (réinstallation totale avec confirmation)

#comportement
  Type     : Texte
  Visible  : Owner uniquement
  Écriture : Via interactions Guardian
  Fonction : Système de score comportemental :
             - Définir les seuils de déclenchement (ex : 3 warns = mute 1h)
             - Définir les sanctions automatiques associées à chaque seuil
             - Consulter les scores actuels de tous les membres
             - Réinitialiser le score d'un membre manuellement

#auto-modération
  Type     : Texte
  Visible  : Owner uniquement
  Écriture : Via interactions Guardian
  Fonction : Règles de modération automatique :
             - Anti-spam : seuil de messages par seconde (paramétrable)
               → Sanction automatique selon les règles définies dans #comportement
             - Slow mode automatique : activable par channel, délai paramétrable
             - Blacklist de mots : liste personnalisable
               → Comportement paramétrable :
                  a) Suppression silencieuse uniquement
                  b) Suppression + avertissement visible dans le channel

#rôles
  Type     : Texte
  Visible  : Owner uniquement
  Écriture : Via interactions Guardian
  Fonction : Gestion des rôles Discord liés à Guardian :
             - Modifier le nom de chaque rôle de grade
             - Modifier la couleur de chaque rôle
             - Voir les permissions actuellement associées

#logs-config
  Type     : Texte, read-only
  Visible  : Owner uniquement
  Écriture : Guardian uniquement
  Fonction : Historique complet de toutes les modifications de configuration
             effectuées via Guardian sur ce serveur (qui, quoi, quand).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚙️ MODULES DU BOT — DÉTAIL COMPLET
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Chaque module est indépendant. Désactiver un module ne casse pas
les autres. Toutes les interactions utilisateur passent par des
composants Discord : boutons, SelectMenu, modals.
Jamais de commandes texte (préfixe). Les commandes slash sont
réservées aux actions de modération uniquement.
Les messages de retour sont éphémères sauf indication contraire.

────────────────────────────────────────
MODULE 1 — INITIALISATION
Fichiers : modules/initialisation/setup.js
           modules/initialisation/checkInstall.js
────────────────────────────────────────

Déclenché : au premier lancement du bot sur un nouveau serveur,
            ou manuellement depuis #guardian (Owner) pour réinitialiser.

Vérification d'installation existante (checkInstall.js) :
- Au démarrage, Guardian vérifie en base si le guildId est déjà installé
  (hash SHA256 du guildId stocké dans la table `guilds`)
- Si installé → chargement normal de la config
- Si non installé → lancement du flow de setup

Flow de setup (setup.js) :
Guardian crée une catégorie privée "guardian-setup" et un channel
"guardian-setup" visible uniquement par le propriétaire Discord du serveur.

  Étape 1 — Mapping des grades
    Guardian affiche un menu pour associer chaque grade (Invité, Membre,
    Modérateur, Manager, Owner) à un rôle Discord existant.
    Si un rôle n'existe pas : bouton "Créer ce rôle" → Guardian le crée.
    Vérification : un seul membre peut avoir le grade Owner.

  Étape 2 — Paramètres membres
    - Texte d'accueil Invité (champ texte, valeur par défaut fournie)
    - Texte règles simplifiées pour Invité (valeur par défaut fournie)
    - Texte règles complètes pour Membre (valeur par défaut fournie)
    - Délai minimum avant demande de promotion (défaut : 48h)
    - Bio obligatoire : oui/non
    - Parrainage obligatoire : oui/non
    - Grade minimum pour traiter les demandes de promotion (défaut : Modérateur)
    - Délai expulsion automatique des Invités (défaut : 30 jours, désactivable)

  Étape 3 — Jeux du serveur
    Guardian affiche un formulaire pour ajouter les jeux disponibles.
    Pour chaque jeu :
    - Nom du jeu (texte libre)
    - AppID Steam (optionnel, pour les changelogs automatiques)
    - Activer galerie : oui/non
    - Activer changelogs : oui/non
    Plusieurs jeux peuvent être ajoutés en séquence.

  Étape 4 — Modules optionnels
    Guardian affiche des toggles pour activer/désactiver :
    - Module suggestions (#suggestions)
    - Module liste-serveurs (#liste-serveurs + surveillance IP)
    - Module statut-bot (#statut-bot)
    - Module AFK (vocal AFK)
    - Module game-updates (#game-updates)
    - Module score comportemental

  Étape 5 — Validation & création
    Guardian affiche un récapitulatif complet de la configuration.
    Bouton "✅ Confirmer et installer".
    Guardian crée toute la structure channels/catégories/rôles.
    La catégorie "guardian-setup" est supprimée.
    Un message de confirmation est posté dans #bienvenue.
    L'installation est enregistrée en base (hash SHA256 du guildId).

────────────────────────────────────────
MODULE 2 — NOUVEAUX MEMBRES
Fichiers : modules/members/newMember.js
           modules/members/expulsion.js
           modules/members/parrainage.js
────────────────────────────────────────

Événement : guildMemberAdd

À l'arrivée d'un nouveau membre (newMember.js) :
1. Guardian assigne automatiquement le rôle Invité
2. Guardian poste un message dans #bienvenue :
   - Texte d'accueil personnalisé (configuré au setup)
   - Bouton "📋 Voir les règles"
   - Bouton "🙋 Faire une demande pour devenir Membre"
3. Guardian envoie un DM à l'Invité :
   - Présentation du serveur
   - Explications pour devenir Membre (conditions configurées)
   - Lien vers #bienvenue

Demande de promotion Invité → Membre :
L'Invité clique sur "🙋 Faire une demande" (dans #bienvenue ou son DM).

Guardian vérifie dans l'ordre :
  ✓ Délai minimum écoulé depuis l'arrivée (ex: 48h)
    → Si non : message éphémère "Tu dois attendre encore X heures"
  ✓ Bio requise (si activé dans config)
    → Si oui : Guardian ouvre un modal "Présente-toi en quelques mots"
  ✓ Parrain requis (si activé dans config)
    → Guardian vérifie en base qu'un Membre a utilisé /parrainer pour cet Invité
    → Si aucun parrain : message éphémère explicatif

Si toutes les conditions sont remplies :
  → Guardian poste dans #demandes (Modération) :
    - Pseudo + avatar de l'Invité
    - Date d'arrivée + durée écoulée
    - Bio (si fournie)
    - Parrain (pseudo + mention, si applicable)
    - Boutons : ✅ Accepter | ❌ Refuser | 💬 Répondre

Traitement par le staff :
  Si ✅ Accepter :
    - Guardian retire le rôle Invité, assigne le rôle Membre
    - Guardian poste une confirmation dans #général : "Bienvenue @pseudo !"
    - Guardian log l'action dans #logs-mod
    - La demande dans #demandes est archivée (marquée traitée)

  Si ❌ Refuser :
    - Guardian ouvre un modal pour saisir une raison (optionnelle)
    - Guardian notifie l'Invité en DM avec la raison
    - Guardian log l'action dans #logs-mod

  Si 💬 Répondre :
    - Guardian ouvre un modal pour saisir un message libre
    - Le message est envoyé en DM à l'Invité
    - Utile pour demander des précisions avant de décider

Commande /parrainer (parrainage.js) :
  Usage : /parrainer <pseudo_invité>
  Disponible pour : Membre, Modérateur, Manager, Owner
  - Guardian vérifie que la cible est bien un Invité sur le serveur
  - Guardian vérifie qu'un Membre ne parraine qu'un seul Invité à la fois
  - Enregistre en base : parrain_id, invité_id, date
  - Notifie l'Invité en DM qu'il a été parrainé et peut faire sa demande

Expulsion automatique des Invités (expulsion.js) :
  - Guardian vérifie périodiquement (toutes les 24h) les Invités
  - Si un Invité dépasse le délai configuré sans être promu :
    → Guardian l'expulse du serveur
    → Guardian log l'action dans #logs-mod
    → Guardian envoie un DM à l'Invité expulsé (message configurable)
  - Désactivable dans #membres (config)

────────────────────────────────────────
MODULE 3 — GAMELIST & OPT-IN
Fichier : modules/games/gameList.js
────────────────────────────────────────

Canaux concernés : #mes-channels, #ma-gamelist (Configuration)

Depuis #mes-channels (Membre) :
1. Guardian affiche un message permanent avec un bouton "🎮 Gérer mes jeux"
2. Au clic : Guardian affiche un SelectMenu multi-select avec tous les jeux
   disponibles sur le serveur (liste depuis la base de données)
3. Les jeux déjà sélectionnés sont pré-cochés
4. Le membre soumet sa sélection
5. Guardian calcule les différences (ajouts / retraits)
6. Pour chaque ajout : Guardian assigne le rôle Discord associé au jeu
7. Pour chaque retrait : Guardian retire le rôle Discord associé au jeu
8. Les channels de jeux sont visibles/cachés via les permissions de rôle Discord
9. La sélection est persistée en base (table member_games)
10. Confirmation éphémère : liste des jeux maintenant actifs

Structure par jeu dans Discord (gérée automatiquement) :
  Catégorie : [Nom du jeu]
  Channels créés selon config :
    - #[nom-du-jeu] (toujours créé)
    - #[nom-du-jeu]-galerie (si galerie activée pour ce jeu)
    - #[nom-du-jeu]-changelogs (si changelogs activés pour ce jeu)
  Rôle Discord créé : "[Nom du jeu]" — assigné aux membres opt-in
  Permissions : seuls les membres avec le rôle voient la catégorie
  Exception : Modérateur, Manager, Owner voient toujours toutes les catégories

Depuis #ma-gamelist :
- Affichage de la liste des jeux suivis par le membre
- Même fonctionnalité que #mes-channels (interfaces synchronisées)

Ajout/retrait d'un jeu par un Manager/Owner (depuis #jeux-serveur) :
  Ajout → Guardian crée la catégorie + channels + rôle associé
  Retrait → Guardian supprime la catégorie + channels + rôle
            et met à jour les profils membres concernés en base

────────────────────────────────────────
MODULE 4 — VOCAUX TEMPORAIRES
Fichier : modules/games/gamesVocal.js
Événement : voiceStateUpdate
────────────────────────────────────────

Depuis #créer-un-channel (Membre) :
1. Guardian affiche un message permanent avec bouton "🔊 Créer un vocal"
2. Au clic : Guardian affiche un SelectMenu avec les jeux disponibles
3. Le membre sélectionne un jeu
4. Guardian crée le channel vocal dans la catégorie VOCAUX :
   Format : [Préfixe] [Nom du jeu] [Suffixe]
   Exemple avec config par défaut : "🎮 Minecraft — Partie"
5. Si un vocal du même jeu existe déjà : incrémentation automatique
   Exemple : "🎮 Minecraft — Partie 2"
6. Limite de membres : définie dans #vocaux (config), appliquée à la création
7. Guardian confirme en éphémère avec un lien vers le vocal créé

Suppression automatique :
- Guardian écoute voiceStateUpdate
- Quand un vocal temporaire devient vide : Guardian démarre un timer
- Si toujours vide après X minutes (paramétrable, défaut : 5 min) :
  Guardian supprime le channel
- Si quelqu'un rejoint avant la fin du timer : timer annulé

Règles supplémentaires :
- Seuls les Membres+ peuvent créer un vocal temporaire
- Les vocaux temporaires sont identifiables en base (table vocal_temp)
- Un vocal temporaire est supprimé au redémarrage du bot s'il est vide

────────────────────────────────────────
MODULE 5 — CHANGELOGS STEAM
Fichier : modules/games/gamesNotification.js
────────────────────────────────────────

Déclenché : timer automatique (fréquence paramétrable dans #changelogs, défaut : 60 min)

Pour chaque jeu ayant un AppID Steam configuré :
1. Guardian appelle l'API Steam :
   https://store.steampowered.com/events/ajaxgetadjacentpartnerevents/
   ou ISteamNews/GetNewsForApp selon disponibilité
2. Guardian compare le dernier gid (ID de news) avec celui stocké en base
   (table changelogs_seen)
3. Si nouveau changelog détecté :
   a) Guardian formate le message :
      - Titre du patch note
      - Date de publication
      - Résumé (tronqué si trop long, avec lien "Lire la suite")
      - Lien direct vers le changelog Steam
   b) Si le channel #[jeu]-changelogs est activé :
      → Guardian poste dans ce channel
   c) Si #game-updates est activé :
      → Guardian poste également dans #game-updates
4. Guardian met à jour changelogs_seen en base avec le dernier gid

Anti-doublon : Guardian ne poste jamais deux fois le même changelog.
Gestion d'erreur : si l'API Steam est indisponible, Guardian réessaie
au prochain cycle sans crasher.

────────────────────────────────────────
MODULE 6 — MODÉRATION
Fichiers : modules/moderation/moderation.js
           modules/moderation/autoMod.js
           modules/moderation/reports.js
           modules/moderation/behavior.js
────────────────────────────────────────

Modération manuelle (moderation.js) :
Commandes slash disponibles pour Modérateur, Manager, Owner :

  /warn <membre> <raison>
    - Enregistre un avertissement en base (table sanctions)
    - Incrémente le score comportemental du membre
    - Notifie le membre en DM
    - Log dans #logs-mod
    - Vérifie les seuils comportementaux → sanction auto si dépassé

  /mute <membre> <durée> <raison>
    - Durée format : "1h", "30m", "1j"
    - Applique le timeout Discord natif (GuildMember.timeout())
    - Enregistre en base
    - Notifie le membre en DM
    - Log dans #logs-mod
    - Guardian planifie la levée du mute et log la fin

  /kick <membre> <raison>
    - Expulse le membre du serveur
    - Enregistre en base
    - Notifie le membre en DM avant l'expulsion
    - Log dans #logs-mod

  /ban <membre> <raison>
    - Bannit le membre du serveur
    - Enregistre en base
    - Log dans #logs-mod

Historique des sanctions :
  /historique <membre>
    - Disponible pour Modérateur
    - Guardian affiche via embed l'historique complet des sanctions
      d'un membre : type, raison, date, appliqué par, durée (si mute)

Rapports membres (reports.js) :
  Tout Membre peut signaler via le bouton "🚨 Signaler" (accessible
  depuis un message Guardian ou une commande /signaler) :
  - Guardian ouvre un modal :
    - Qui signales-tu ? (mention ou pseudo)
    - Motif du signalement
    - Lien ou description de la preuve (optionnel)
  - Guardian poste dans #rapports (Modération) avec bouton "✅ Traité"
  - Log dans #logs-mod quand marqué traité

Auto-modération (autoMod.js) :
  Écoute messageCreate pour chaque message entrant.

  Anti-spam :
    - Guardian compte les messages par utilisateur sur une fenêtre glissante
    - Si seuil dépassé (ex: 5 messages en 3 secondes, paramétrable) :
      → Suppression des messages en excès
      → Sanction automatique selon règles #comportement
      → Log dans #logs-mod

  Slow mode automatique :
    - Activable par channel depuis #auto-modération
    - Guardian applique un délai Discord natif au channel (channel.rateLimitPerUser)

  Blacklist de mots :
    - Liste personnalisable depuis #auto-modération
    - Guardian vérifie chaque message (insensible à la casse)
    - Si mot blacklisté détecté :
      Mode a) Suppression silencieuse uniquement
      Mode b) Suppression + avertissement public dans le channel
    - Incrémente le score comportemental

Score comportemental (behavior.js) :
  - Chaque sanction (warn, mute, kick + sanctions auto) incrémente le score
  - Des seuils déclenchent des sanctions automatiques chaînées
    (configurables dans #comportement) :
    Exemple : score 3 → mute 1h | score 5 → kick | score 7 → ban
  - Guardian log chaque déclenchement automatique dans #logs-mod
  - Score consultable dans #sanctions par le staff

────────────────────────────────────────
MODULE 7 — SURVEILLANCE SERVEURS DE JEU
Fichier : modules/servers/serverMonitor.js
────────────────────────────────────────

Déclenché : timer toutes les 5 minutes (event ready → setInterval)

Pour chaque serveur enregistré dans la table servers_jeu :
1. Guardian tente une connexion TCP sur IP:port
2. Si le jeu expose une API de statut (ex: Source Query pour serveurs Source) :
   Guardian récupère également le nombre de joueurs
3. Statuts possibles :
   ✅ En ligne — X/Y joueurs (si disponible)
   ❌ Hors ligne
   ⚠️ Instable (timeout intermittent)
4. Guardian met à jour le message dans #liste-serveurs :
   - Un message embed par serveur, mis à jour (pas re-posté)
   - Dernière vérification : timestamp
5. Persistance du statut dans la table servers_jeu (last_status, last_check)

Gestion des erreurs : timeout de connexion = 3 secondes max.
Si erreur réseau → statut "⚠️ Instable" sans faire crasher le bot.

⚠️ IMPORTANT : Guardian ne démarre/arrête PAS les serveurs.
Le channel #gestion-serveurs est un placeholder pour un bot Pterodactyl
séparé. Guardian y poste uniquement un message explicatif au setup.

────────────────────────────────────────
MODULE 8 — RICH PRESENCE & LEADERBOARD [OPTIONNEL]
Fichier : modules/richPresence/richPresence.js
────────────────────────────────────────

⚠️ MODULE FACULTATIF — À développer en dernier.
Ne PAS bloquer ou conditionner les autres modules à celui-ci.
Laisser le fichier en placeholder documenté dans le repo.

Idée générale (à spécifier lors du développement futur) :
- Guardian lit la Rich Presence Discord des membres en temps réel
  via presenceUpdate
- Génère un classement des jeux les plus joués sur le serveur
- Affiche des stats optionnelles : temps de jeu cumulé, sessions, etc.
- Channel dédié ou embed mis à jour périodiquement
- Toutes les données sont opt-in (membre consent à être tracké)

────────────────────────────────────────
MODULE 9 — SETTINGS
Fichier : modules/config/settings.js
────────────────────────────────────────

Guardian affiche dans chaque channel de la catégorie Configuration
une interface interactive permanente (message épinglé ou re-posté
si supprimé) composée de boutons et menus Discord.

Règles du module settings :
- Toutes les modifications sont loguées dans #logs-config (Owner)
  avec : qui a modifié, quel paramètre, ancienne valeur, nouvelle valeur
- Les messages dans les channels de config sont éphémères par défaut
- Après chaque modification, Guardian confirme en éphémère
- Guardian rafraîchit l'interface sans nécessiter de commande

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💾 STOCKAGE DES DONNÉES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Base de données : SQLite via better-sqlite3
Raison : léger, sans serveur externe, pas de dépendance réseau,
suffisant pour des serveurs gaming communautaires.
Architecture prévue pour migration future vers PostgreSQL si besoin.
Fichier : data/guardian.db (dans .gitignore)

Tables :

guilds
  guild_id TEXT PRIMARY KEY
  setup_done INTEGER DEFAULT 0
  setup_hash TEXT              -- SHA256 du guildId, vérifie l'installation
  owner_id TEXT
  language TEXT DEFAULT 'fr'  -- v2

guild_config
  guild_id TEXT
  module TEXT                  -- nom du module (ex: "gamelist", "vocal")
  key TEXT                     -- nom du paramètre
  value TEXT                   -- valeur sérialisée
  PRIMARY KEY (guild_id, module, key)

grades
  guild_id TEXT
  grade_name TEXT              -- 'invite' | 'membre' | 'moderateur' | 'manager' | 'owner'
  role_id TEXT
  PRIMARY KEY (guild_id, grade_name)

games
  game_id INTEGER PRIMARY KEY AUTOINCREMENT
  guild_id TEXT
  name TEXT
  steam_app_id TEXT            -- null si pas de Steam
  role_id TEXT                 -- rôle Discord pour l'opt-in
  channel_text_id TEXT
  channel_galerie_id TEXT      -- null si désactivé
  channel_changelog_id TEXT    -- null si désactivé
  category_id TEXT
  galerie_enabled INTEGER DEFAULT 0
  changelog_enabled INTEGER DEFAULT 1

member_games
  guild_id TEXT
  user_id TEXT
  game_id INTEGER
  PRIMARY KEY (guild_id, user_id, game_id)

members
  guild_id TEXT
  user_id TEXT
  grade TEXT                   -- grade actuel Guardian
  join_date TEXT               -- ISO8601
  bio TEXT
  parrain_id TEXT              -- null si pas de parrain
  score_comportement INTEGER DEFAULT 0
  PRIMARY KEY (guild_id, user_id)

sanctions
  sanction_id INTEGER PRIMARY KEY AUTOINCREMENT
  guild_id TEXT
  user_id TEXT
  type TEXT                    -- 'warn' | 'mute' | 'kick' | 'ban'
  reason TEXT
  applied_by TEXT              -- user_id du modérateur
  timestamp TEXT               -- ISO8601
  duration TEXT                -- null sauf pour mute (ex: "1h")
  auto INTEGER DEFAULT 0       -- 1 si sanction automatique

changelogs_seen
  game_id INTEGER PRIMARY KEY
  last_changelog_id TEXT       -- dernier gid Steam vu

servers_jeu
  server_id INTEGER PRIMARY KEY AUTOINCREMENT
  guild_id TEXT
  name TEXT
  game TEXT
  ip TEXT
  port INTEGER
  last_status TEXT             -- 'online' | 'offline' | 'unstable'
  last_check TEXT              -- ISO8601

parrainage
  guild_id TEXT
  parrain_id TEXT
  invite_id TEXT
  date TEXT                    -- ISO8601
  PRIMARY KEY (guild_id, invite_id)

vocal_temp
  channel_id TEXT PRIMARY KEY
  guild_id TEXT
  game_id INTEGER
  created_by TEXT
  created_at TEXT              -- ISO8601

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏗️ ARCHITECTURE DES FICHIERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

guardian/
├── .env                          # DISCORD_TOKEN, NODE_ENV, CLIENT_ID
├── .env.example                  # Template vide sans secrets
├── .gitignore                    # node_modules, .env, data/guardian.db
├── package.json
├── index.js                      # Point d'entrée : init client, charge events
├── config.js                     # Lecture .env, export constantes globales
├── deploy-commands.js            # Déploiement commandes slash Discord
│
├── database/
│   ├── db.js                     # Connexion SQLite, init/création tables
│   └── migrations/               # Scripts de migration (évolutions futures)
│
├── modules/
│   ├── initialisation/
│   │   ├── setup.js              # Flow setup guidé, étapes 1 à 9
│   │   └── checkInstall.js       # Vérifie si guildId déjà installé (hash SHA256)
│   │
│   ├── members/
│   │   ├── newMember.js          # Accueil Invité, flow demande promotion
│   │   ├── expulsion.js          # Expulsion auto Invités hors délai
│   │   └── parrainage.js         # Logique commande /parrainer
│   │
│   ├── games/
│   │   ├── gameList.js           # Opt-in jeux, gestion rôles/channels/catégories
│   │   ├── gamesVocal.js         # Vocaux temporaires : création + suppression auto
│   │   └── gamesNotification.js  # Changelogs Steam via API, anti-doublon
│   │
│   ├── moderation/
│   │   ├── moderation.js         # Sanctions manuelles + historique
│   │   ├── autoMod.js            # Anti-spam, blacklist, slow mode auto
│   │   ├── reports.js            # Signalements membres
│   │   └── behavior.js           # Score comportemental, seuils, sanctions auto
│   │
│   ├── servers/
│   │   └── serverMonitor.js      # Surveillance IP:port toutes les 5 minutes
│   │
│   ├── config/
│   │   └── settings.js           # Lecture/écriture paramètres depuis guild_config
│   │
│   ├── logs/
│   │   └── logger.js             # Système de logs Guardian (console + #logs-mod)
│   │
│   └── richPresence/
│       └── richPresence.js       # [OPTIONNEL] Placeholder leaderboard Rich Presence
│
├── events/
│   ├── ready.js                  # Bot prêt : vérif installs, lancement timers
│   ├── guildMemberAdd.js         # Nouvel arrivant → rôle Invité + message
│   ├── guildMemberRemove.js      # Départ → log dans #logs-mod
│   ├── voiceStateUpdate.js       # Gestion cycle de vie vocaux temporaires
│   ├── interactionCreate.js      # Router : boutons, SelectMenu, modals, slash
│   └── messageCreate.js          # Auto-modération des messages entrants
│
├── commands/
│   ├── parrainer.js              # /parrainer <pseudo>
│   ├── warn.js                   # /warn <membre> <raison>
│   ├── mute.js                   # /mute <membre> <durée> <raison>
│   ├── kick.js                   # /kick <membre> <raison>
│   ├── ban.js                    # /ban <membre> <raison>
│   └── historique.js             # /historique <membre>
│
└── data/
    └── guardian.db               # Base SQLite (dans .gitignore)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 RÈGLES DE DÉVELOPPEMENT — À RESPECTER ABSOLUMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Architecture :
- Chaque module est indépendant : désactiver un module ne casse pas les autres
- La config de chaque serveur est isolée par guildId (multi-serveur natif)
- Guardian vérifie toujours les permissions et le grade avant toute action
- Utiliser des constantes nommées pour tous les noms de channels et catégories
  (ne jamais hardcoder une string de channel dans la logique métier)
- **Internationalisation** : TOUT le texte visible est dans les fichiers locales (jamais hardcodé)
- **Système de migrations de schéma** avec table schema_version

Interactions Discord :
- TOUTES les interactions utilisateur passent par des composants Discord :
  boutons (ButtonBuilder), menus déroulants (StringSelectMenuBuilder), modals
- Les commandes slash sont RÉSERVÉES aux actions de modération uniquement
- Zéro commandes texte avec préfixe (ex: !commande)
- Les messages de retour utilisateur sont éphémères (ephemeral: true) par défaut
- Exception : les messages publics voulus (confirmations dans #général, etc.)

Sécurité & qualité :
- Aucun token, clé API, ou secret hardcodé dans le code
- Toutes les erreurs sont catchées (try/catch) et loguées via logger.js
- Jamais d'erreur silencieuse
- Valider les inputs utilisateur (modals, commandes) avant traitement

Ordre de développement suggéré :
  1. database/db.js (tables SQLite)
  2. modules/initialisation/ (setup + checkInstall)
  3. events/ready.js
  4. modules/members/ (newMember, expulsion, parrainage)
  5. modules/games/gameList.js (opt-in)
  6. modules/games/gamesVocal.js (vocaux temporaires)
  7. modules/games/gamesNotification.js (changelogs Steam)
  8. modules/moderation/ (moderation, autoMod, reports, behavior)
  9. modules/servers/serverMonitor.js
  10. modules/config/settings.js
  11. modules/richPresence/richPresence.js [OPTIONNEL — en dernier]
