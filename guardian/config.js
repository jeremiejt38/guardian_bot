const path = require('path');
const { loadEnv } = require('./modules/utils/envLoader');

loadEnv();

const NODE_ENV = process.env.NODE_ENV || 'production';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

if (!DISCORD_TOKEN) {
  throw new Error('DISCORD_TOKEN is not set in .env');
}

const CATEGORIES = Object.freeze({
  setup: 'guardian-setup',
  informations: '📋 Informations',
  communaute: '🌐 Communauté',
  guides: '📚 Guides',
  vocaux: '🔊 Salons Vocaux',
  moderation: '🛡️ Modération',
  configuration: '⚙️ Configuration'
});

const CHANNELS = Object.freeze({
  setup: 'setup',
  welcome: 'bienvenue',
  rules: 'regles',
  faq: 'faq',
  requests: 'demandes',
  general: 'general',
  voiceGeneral: 'general-vocal',
  voiceAfk: 'afk',
  reports: 'signalements',
  autoModeration: 'auto-moderation',
  behavior: 'comportement',
  guardian: 'staff',
  roles: 'staff',
  moderation: 'staff',
  validation: 'validation',
  moderationLogs: 'moderation-logs',
  gameChannels: 'gamelist-chan',
  gameList: 'gamelist-chan',
  voiceCreate: 'creer-channel',
  serverList: 'liste-serveurs',
  serverManagement: 'gestion-serveurs',
  configLogs: 'guardian-logs',
  botConfig: 'guardian-config',
  notifications: 'guardian-config',
  membres: 'guardian-config',
  channelsConfig: 'guardian-config',
  modules: 'guardian-config',
  guardianConfig: 'guardian-config',
  vocauxConfig: 'guardian-config',
  jeux: 'guardian-config',
  suggestions: 'suggestions',
  annonces: 'annonces',
  serveurs: 'guardian-config',
  securityUpdates: 'maj-securite',
  guardianBackup: 'guardian-logs',
  becomeMember: 'devenir-membre',
  joinServer: 'rejoindre-notre-serveur'
});

// Migration de consolidation : quand un canal porte encore un ancien nom,
// il est renommé en place (sauf si le nouveau nom est déjà pris).
const LEGACY_CHANNEL_RENAMES = Object.freeze({
  'guardian-config': ['membres', 'modules', 'vocaux', 'jeux', 'serveurs', 'notifications'],
  staff: ['guardian', 'roles'],
  'moderation-logs': ['moderation'],
  'gamelist-chan': ['mes-channels', 'ma-gamelist'],
  'guardian-logs': ['guardian-backup']
});

const CHANNEL_NAMES = Object.freeze({
  setupCategory: CATEGORIES.setup,
  setupChannel: CHANNELS.setup,
  welcome: CHANNELS.welcome,
  rules: CHANNELS.rules,
  faq: CHANNELS.faq,
  requests: CHANNELS.requests,
  general: CHANNELS.general,
  voiceGeneral: CHANNELS.voiceGeneral,
  voiceAfk: CHANNELS.voiceAfk,
  reports: CHANNELS.reports,
  autoModeration: CHANNELS.autoModeration,
  behavior: CHANNELS.behavior,
  guardian: CHANNELS.guardian,
  roles: CHANNELS.roles,
  moderation: CHANNELS.moderation,
  validation: CHANNELS.validation,
  moderationLogs: CHANNELS.moderationLogs,
  gameChannels: CHANNELS.gameChannels,
  gameList: CHANNELS.gameList,
  voiceCreate: CHANNELS.voiceCreate,
  serverList: CHANNELS.serverList,
  serverManagement: CHANNELS.serverManagement,
  configLogs: CHANNELS.configLogs,
  botConfig: CHANNELS.botConfig,
  notifications: CHANNELS.notifications,
  membres: CHANNELS.membres,
  channelsConfig: CHANNELS.channelsConfig,
  modules: CHANNELS.modules,
  guardianConfig: CHANNELS.guardianConfig,
  vocauxConfig: CHANNELS.vocauxConfig,
  jeux: CHANNELS.jeux,
  suggestions: CHANNELS.suggestions,
  annonces: CHANNELS.annonces,
  serveurs: CHANNELS.serveurs,
  securityUpdates: CHANNELS.securityUpdates,
  becomeMember: CHANNELS.becomeMember,
  joinServer: CHANNELS.joinServer
});

const GRADE_NAMES = Object.freeze({
  invite: 'invite',
  membre: 'membre',
  moderateur: 'moderateur',
  manager: 'manager',
  owner: 'owner'
});

module.exports = {
  NODE_ENV,
  DISCORD_TOKEN,
  CLIENT_ID: process.env.CLIENT_ID,
  DATABASE_PATH: (() => {
    const p = process.env.DATABASE_PATH || './data/guardian.db';
    return p === ':memory:' ? ':memory:' : path.resolve(process.cwd(), p);
  })(),
  CATEGORIES,
  CHANNELS,
  CHANNEL_NAMES,
  LEGACY_CHANNEL_RENAMES,
  GRADE_NAMES
};
