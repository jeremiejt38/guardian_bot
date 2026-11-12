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
  guardian: 'guardian',
  roles: 'roles',
  moderation: 'moderation',
  validation: 'validation',
  moderationLogs: 'moderation',
  gameChannels: 'mes-channels',
  gameList: 'ma-gamelist',
  voiceCreate: 'creer-channel',
  serverList: 'liste-serveurs',
  serverManagement: 'gestion-serveurs',
  configLogs: 'guardian-logs',
  botConfig: 'notifications',
  notifications: 'notifications',
  membres: 'membres',
  channelsConfig: 'modules',
  modules: 'modules',
  guardianConfig: 'guardian-config',
  vocauxConfig: 'vocaux',
  jeux: 'jeux',
  suggestions: 'suggestions',
  annonces: 'annonces',
  serveurs: 'serveurs',
  securityUpdates: 'maj-securite',
  guardianBackup: 'guardian-backup',
  becomeMember: 'devenir-membre',
  joinServer: 'rejoindre-notre-serveur'
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
  GRADE_NAMES
};
