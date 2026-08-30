# Guardian - Mapping specification -> codebase

## Core bootstrap
- Entrypoint and Discord client: `guardian/index.js`
- Environment and constants: `guardian/config.js`
- Slash registration: `guardian/deploy-commands.js`

## Data and schema
- SQLite initialization and schema: `guardian/database/db.js`
- Current schema versioning: table `schema_version` (v1)

## Events
- Ready lifecycle and timers: `guardian/events/ready.js`
- Member join/leave hooks: `guardian/events/guildMemberAdd.js`, `guardian/events/guildMemberRemove.js`
- Interaction router: `guardian/events/interactionCreate.js`
- Message automod hook: `guardian/events/messageCreate.js`
- Temporary voice lifecycle hook: `guardian/events/voiceStateUpdate.js`

## Modules by specification section
- Initialization and install check:
  - `guardian/modules/initialisation/checkInstall.js`
  - `guardian/modules/initialisation/setup.js`
- Members and sponsorship:
  - `guardian/modules/members/newMember.js`
  - `guardian/modules/members/expulsion.js`
  - `guardian/modules/members/parrainage.js`
- Games and opt-in:
  - `guardian/modules/games/gameList.js`
  - `guardian/modules/games/gamesVocal.js`
  - `guardian/modules/games/gamesNotification.js`
- Moderation:
  - `guardian/modules/moderation/moderation.js`
  - `guardian/modules/moderation/autoMod.js`
  - `guardian/modules/moderation/reports.js`
  - `guardian/modules/moderation/behavior.js`
- Server monitoring:
  - `guardian/modules/servers/serverMonitor.js`
- Settings storage:
  - `guardian/modules/config/settings.js`
- Logs:
  - `guardian/modules/logs/logger.js`
- Rich presence / opt-in activity tracking and leaderboard:
  - `guardian/modules/richPresence/richPresence.js`
  - `guardian/events/presenceUpdate.js`
  - `guardian/commands/richPresence.js`

## Slash commands currently wired
- `guardian/commands/parrainer.js`
- `guardian/commands/warn.js`
- `guardian/commands/mute.js`
- `guardian/commands/kick.js`
- `guardian/commands/ban.js`
- `guardian/commands/historique.js`
- `guardian/commands/richPresence.js`

## Coverage status snapshot
- Implemented foundation:
  - DB schema and persistence primitives
  - Setup area creation and install marking
  - Basic member onboarding and invite tracking
  - Moderation commands persistence
  - Changelog polling and anti-duplicate storage
  - Server TCP monitor storage update
- Partial or missing vs spec:
  - Full interactive setup steps 1->5
  - Grade-based permission enforcement middleware
  - Complete i18n/locales system for all user-facing strings
  - Full request workflow (invite->member accept/refuse/reply)
  - Discord UI components for config channels and permanent control panels
  - Advanced behavior-score thresholds and configurable policies
  - Rich presence optional module (still placeholder)
