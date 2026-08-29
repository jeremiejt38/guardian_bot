const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { GRADE_NAMES, CHANNELS, CATEGORIES } = require('../../config');
const { matchGameFromChannelName, generateNonSteamId, isNonSteamId, GENERIC_CHANNEL_NAMES } = require('../games/steamGamesList');
const { analyzeNonGuardianRoles, buildSecurityCheckContent, hasUnresolvedIssues } = require('./roleSecurityCheck');
const { getGuildSetting, setGuildSetting } = require('../config/settings');
const { replyEphemeral } = require('../utils/interactions');
const _notif = require('./setupNotifications');
const _gamesDetect = require('./setupGamesDetect');
const _steps = require('./setupSteps');
const { CUSTOM_IDS, TOTAL_STEPS } = require('./setupConstants');
const _render = require('./setupRender');
const _grades = require('./setupGrades');
const _security = require('./setupSecurity');
const {
  ORDERED_GRADES,
  REQUIRED_GRADES,
  setGradeRole,
  getGradeMappings,
  validateStepOneMappings
} = require('./gradeMapping');
const {
  listSetupGames,
  addSetupGame,
  removeLastSetupGame,
  updateSetupGame
} = require('./setupGames');
const { t } = require('../../locales');
const logger = require('../logs/logger');
// @premium-start
const {
  AFK_TIMEOUTS,
  AFK_TIMEOUT_LABELS,
  AUTOMOD_RULES,
  syncFromDiscord,
  getAfkConfig,
  cycleAfkTimeout,
  applyAfkSettings,
  getSystemChannelConfig,
  applySystemChannel,
  getLocaleConfig,
  syncLocaleToDiscord,
  applyRulesChannel,
  applyPublicUpdatesChannel,
  applyDescription,
  getAutoModConfig,
  applyAutoModRule,
  fetchOnboardingState,
  addOnboardingDefaultChannels,
} = require('./discordSettings');
// @premium-end

const sendSetupMessage = (interaction, content) => _render.sendSetupMessage(interaction, content);

// ─── Délégations grades ────────────────────────────────────────────────────────
const { GRADE_LABELS, ROLE_COLORS } = _grades;
const gradeLabel = (g) => _grades.gradeLabel(g);
const getGradeCursor = (guildId) => _grades.getGradeCursor(guildId);
const setGradeCursor = (guildId, c) => _grades.setGradeCursor(guildId, c);
const getCurrentStep = (guildId) => _grades.getCurrentStep(guildId);
const boolText = (v, g) => _grades.boolText(v, g);
const onOff = (f) => _grades.onOff(f);
const onOffDot = (f) => _grades.onOffDot(f);
const buildNavRow = (guildId, step) => _grades.buildNavRow(guildId, step);
const buildRoleOptions = (guild, id) => _grades.buildRoleOptions(guild, id);
const hasMapableRoles = (guild) => _grades.hasMapableRoles(guild);
const getRolesAutoCreated = (guildId) => _grades.getRolesAutoCreated(guildId);
const getGradeRenameMap = (guildId) => _grades.getGradeRenameMap(guildId);
const setGradeRenameName = (guildId, grade, name) => _grades.setGradeRenameName(guildId, grade, name);
const isFreshInstall = (guildId) => _grades.isFreshInstall(guildId);

// ─── Imports depuis setupSteps.js ────────────────────────────────────────────
const { CHANNEL_SLOTS, getChannelCursor, setChannelCursor, isCommunityGuild } = _steps;

// ─── Builders steps 1-9 — Délégués à setupSteps.js ──────────────────────────

function _ctx() {
  return {
    CUSTOM_IDS, TOTAL_STEPS, CHANNEL_SLOTS,
    gradeLabel, buildNavRow, buildRoleOptions,
    getGradeCursor, getRolesAutoCreated, hasMapableRoles, getGradeRenameMap,
    isCommunityGuild, getChannelCursor, isFreshInstall,
    onOff, onOffDot,
  };
}

const buildStepOneContent = (guildId, guild) => _steps.buildStepOneContent(guildId, guild, _ctx());
const buildStepOneComponents = (guildId, guild) => _steps.buildStepOneComponents(guildId, guild, _ctx());

const getStep2Config = (guildId) => _steps.getStep2Config(guildId);
const setStep2Config = (guildId, config) => _steps.setStep2Config(guildId, config);
const { SYSCHANNEL_CHOICES, SYSCHANNEL_LABELS } = _steps;
const buildStep2Content = (guildId, guild) => _steps.buildStep2Content(guildId, guild, _ctx());
const buildStep2Components = (guildId, guild) => _steps.buildStep2Components(guildId, guild, _ctx());

const getActiveSlotsForInstall = (guildId, guild) => _steps.getActiveSlotsForInstall(guildId, guild, CHANNEL_SLOTS, isCommunityGuild);
const normalizeChannelName = (name) => _steps.normalizeChannelName(name);
const autoDetectGuardianChannels = (guild) => _steps.autoDetectGuardianChannels(guild, CHANNEL_SLOTS);
const buildChannelAutoDetectContent = (guildId, guild) => _steps.buildChannelAutoDetectContent(guildId, guild, _ctx());
const buildChannelAutoDetectComponents = () => _steps.buildChannelAutoDetectComponents(CUSTOM_IDS);
const getIgnoredChannelSlots = (guildId) => _steps.getIgnoredChannelSlots(guildId);
const addIgnoredChannelSlot = (guildId, slotKey) => _steps.addIgnoredChannelSlot(guildId, slotKey);
const buildChannelOptions = (guild, slot) => _steps.buildChannelOptions(guild, slot);
const buildStep3ChannelsContent = (guildId, guild) => _steps.buildStep3ChannelsContent(guildId, guild, _ctx());
const buildStep3ChannelsComponents = (guildId, guild) => _steps.buildStep3ChannelsComponents(guildId, guild, _ctx());

const getStep4Config = (guildId, guild) => _steps.getStep4Config(guildId, guild);
const setStep4Config = (guildId, config) => _steps.setStep4Config(guildId, config);
const cycleReviewerGrade = (currentGrade) => _steps.cycleReviewerGrade(currentGrade);
const buildStep4Content = (guildId, guild) => _steps.buildStep4Content(guildId, guild, _ctx());
const buildStep4Components = (guildId, guild) => _steps.buildStep4Components(guildId, guild, _ctx());

const getStep4VocalConfig = (guildId) => _steps.getStep4VocalConfig(guildId);
const { VOCAL_PREFIX_CYCLE } = _steps;
const cycleVocalPrefix = (current) => _steps.cycleVocalPrefix(current);
const formatDelay = (minutes) => _steps.formatDelay(minutes);
const buildStep5VocalContent = (guildId) => _steps.buildStep5VocalContent(guildId, _ctx());
const buildStep5VocalComponents = (guildId) => _steps.buildStep5VocalComponents(guildId, _ctx());

const getStep5Cursor = (guildId) => _steps.getStep5Cursor(guildId);
const setStep5Cursor = (guildId, cursor) => _steps.setStep5Cursor(guildId, cursor);
const { GAMES_PAGE_SIZE } = _steps;
const getGamesPage = (guildId) => _steps.getGamesPage(guildId);
const setGamesPage = (guildId, page) => _steps.setGamesPage(guildId, page);
const ensureAtLeastOneSetupGame = (guildId) => _steps.ensureAtLeastOneSetupGame(guildId);
const getSteamCycleValue = (value) => _steps.getSteamCycleValue(value);
const buildStep6Content_Games = (guildId) => _steps.buildStep6Content_Games(guildId, null, _ctx());
const buildStep6Components_Games = (guildId) => _steps.buildStep6Components_Games(guildId, null, _ctx());

const { LOGS_LEVELS } = _steps;
const cycleLogsLevel = (current) => _steps.cycleLogsLevel(current);
const getStep7Config = (guildId) => _steps.getStep7Config(guildId);
const setStep7Config = (guildId, config) => _steps.setStep7Config(guildId, config);
const buildStep7Content = (guildId) => _steps.buildStep7Content(guildId, _ctx());
const buildStep7Components = (guildId) => _steps.buildStep7Components(guildId, _ctx());

// @premium-start
const buildStep8DiscordContent = (guildId, guild) => _steps.buildStep8DiscordContent(guildId, guild, _ctx());
const buildStep8DiscordComponents = (guildId, guild) => _steps.buildStep8DiscordComponents(guildId, guild, _ctx());
// @premium-end

const buildStep9Summary = (guildId) => _steps.buildStep9Summary(guildId, _ctx());
const buildStep9Components = (guildId) => _steps.buildStep9Components(guildId, _ctx());

const buildCommunityCheckContent = (guildId, guild) => _steps.buildCommunityCheckContent(guildId, guild, _ctx());
const buildCommunityCheckComponents = () => _steps.buildCommunityCheckComponents(CUSTOM_IDS);

const createRolesAutoHelper = (interaction, guild, guildId) => _grades.createRolesAutoHelper(interaction, guild, guildId, renderStep);
const detectDuplicateGradeRoles = (guild) => _grades.detectDuplicateGradeRoles(guild);


const autoPositionChannelCursor = (guildId, guild) => _grades.autoPositionChannelCursor(guildId, guild);


// ── Détection jeux existants ──────────────────────────────────────────────────
// Délégué à setupGamesDetect.js

const normalizeGameSlug = (name) => _gamesDetect.normalizeGameSlug(name);
const detectExistingGameChannels = (guild) => _gamesDetect.detectExistingGameChannels(guild);
const getDetectedGames = (guildId) => _gamesDetect.getDetectedGames(guildId);
const setDetectedGames = (guildId, games) => _gamesDetect.setDetectedGames(guildId, games);
const getGameLinkCursor = (guildId) => _gamesDetect.getGameLinkCursor(guildId);
const setGameLinkCursor = (guildId, v) => _gamesDetect.setGameLinkCursor(guildId, v);
const buildGameDetectContent = (guildId, guild) => _gamesDetect.buildGameDetectContent(guildId, guild, TOTAL_STEPS);
const buildGameDetectComponents = (guild) => _gamesDetect.buildGameDetectComponents(guild, CUSTOM_IDS);
const buildGameReviewContent = (guildId) => _gamesDetect.buildGameReviewContent(guildId);
const buildGameReviewComponents = (guildId) => _gamesDetect.buildGameReviewComponents(guildId, CUSTOM_IDS);
const { GAMELINK_TYPE_LABELS, GAMELINK_LINKABLE_TYPES } = _gamesDetect;
const getGameLinkActiveType = (guildId) => _gamesDetect.getGameLinkActiveType(guildId);
const setGameLinkActiveType = (guildId, type) => _gamesDetect.setGameLinkActiveType(guildId, type);
const buildGameLinkContent = (guildId) => _gamesDetect.buildGameLinkContent(guildId);
const buildGameLinkComponents = (guildId, guild) => _gamesDetect.buildGameLinkComponents(guildId, guild, CUSTOM_IDS, buildNavRow);



const buildStepPayload = async (guildId, guild, step) => _render.buildStepPayload(guildId, guild, step, _ctx());

const renderStep = (interaction, step) => _render.renderStep(interaction, step, _ctx());

const startWizardInChannel = (interaction) => _render.startWizardInChannel(interaction, {
  ..._ctx(),
  setGradeCursor, setChannelCursor, autoPositionChannelCursor, getActiveSlotsForInstall,
});

const explainStepOneValidation = (guildId, validation) => _security.explainStepOneValidation(guildId, validation, gradeLabel);
const advanceToStep2AfterSecurity = (interaction, guildId) => _security.advanceToStep2AfterSecurity(interaction, guildId, buildStepPayload);
const buildSecurityComponents = (dangerous, unused, _, resolvedIds) => _security.buildSecurityComponents(dangerous, unused, _, resolvedIds);


// ─── Handlers + Dispatcher — Délégués à setupHandlers.js ─────────────────────
const { handleSetupInteraction } = require('./setupHandlers');


// ─── Notification membres à l'installation ───────────────────────────────────
// Délégué à setupNotifications.js

const buildNotifyMembersContent = (guildId) => _notif.buildNotifyMembersContent(guildId);
const buildNotifyMembersComponents = () => _notif.buildNotifyMembersComponents(CUSTOM_IDS);
const sendInstallNotifyDm = (member, guildId) => _notif.sendInstallNotifyDm(member, guildId);

// ─── Nouvelles options MAJ helpers ───────────────────────────────────────────
// Délégué à setupNotifications.js

const semverToInt = (v) => _notif.semverToInt(v);
const getPendingNewOptions = (guildId, guild) => _notif.getPendingNewOptions(guildId, guild, CHANNEL_SLOTS, getActiveSlotsForInstall);
const buildNewOptionsContent = (guildId, guild) => _notif.buildNewOptionsContent(guildId, guild, CHANNEL_SLOTS, getActiveSlotsForInstall);
const buildNewOptionsComponents = (guildId, guild) => _notif.buildNewOptionsComponents(guildId, guild, CUSTOM_IDS, CHANNEL_SLOTS, getActiveSlotsForInstall);
const buildNewOptionsDoneContent = () => _notif.buildNewOptionsDoneContent();
const buildNewOptionsDoneRow = () => _notif.buildNewOptionsDoneRow(CUSTOM_IDS);

async function resumeWizard(interaction) {
  const { TOTAL_STEPS } = require('./setupConstants');
  const savedStep = Number(getGuildSetting(interaction.guildId, 'setup', 'step', 0));
  const step = (savedStep >= 1 && savedStep <= TOTAL_STEPS) ? savedStep : 1;
  const payload = await buildStepPayload(interaction.guildId, interaction.guild, step, _ctx());
  if (interaction.channel?.send) {
    await interaction.channel.send(payload);
  } else {
    throw new Error('resumeWizard: no channel available');
  }
}

module.exports = {
  CUSTOM_IDS,
  handleSetupInteraction,
  startWizardInChannel,
  resumeWizard,
};
