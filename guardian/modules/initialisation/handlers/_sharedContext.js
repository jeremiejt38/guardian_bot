'use strict';

/**
 * setupHandlers.js
 * Sous-handlers et dispatcher extraits de setupFlow.js.
 */
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, StringSelectMenuBuilder,
  TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { GRADE_NAMES } = require('../../../config');
const { matchGameFromChannelName, generateNonSteamId, isNonSteamId, GENERIC_CHANNEL_NAMES } = require('../../games/steamGamesList');
const { analyzeNonGuardianRoles, buildSecurityCheckContent, hasUnresolvedIssues } = require('../roleSecurityCheck');
const { getGuildSetting, setGuildSetting } = require('../../config/settings');
const { replyEphemeral } = require('../../utils/interactions');
const { CUSTOM_IDS, TOTAL_STEPS } = require('../setupConstants');
const { ORDERED_GRADES, REQUIRED_GRADES, setGradeRole, getGradeMappings, validateStepOneMappings } = require('../gradeMapping');
const { listSetupGames, addSetupGame, removeLastSetupGame, updateSetupGame } = require('../setupGames');
const { t } = require('../../../locales');
const logger = require('../../logs/logger');
// @premium-start
const {
  AFK_TIMEOUTS, AFK_TIMEOUT_LABELS, AUTOMOD_RULES,
  syncFromDiscord, getAfkConfig, cycleAfkTimeout, applyAfkSettings,
  getSystemChannelConfig, applySystemChannel, getLocaleConfig, syncLocaleToDiscord,
  applyRulesChannel, applyPublicUpdatesChannel, applyDescription,
  getAutoModConfig, applyAutoModRule, fetchOnboardingState, addOnboardingDefaultChannels,
} = require('../discordSettings');
// @premium-end

const _s = require('../setupSteps');
const _gd = require('../setupGamesDetect');
const _gr = require('../setupGrades');
const _sec = require('../setupSecurity');
const _notif = require('../setupNotifications');
const _render = require('../setupRender');

const { CHANNEL_SLOTS, getChannelCursor, setChannelCursor, isCommunityGuild, SYSCHANNEL_CHOICES, SYSCHANNEL_LABELS, VOCAL_PREFIX_CYCLE, GAMES_PAGE_SIZE, LOGS_LEVELS } = _s;
const { GAMELINK_TYPE_LABELS, GAMELINK_LINKABLE_TYPES } = _gd;

const gradeLabel = (g) => _gr.gradeLabel(g);
const getGradeCursor = (guildId) => _gr.getGradeCursor(guildId);
const setGradeCursor = (guildId, c) => _gr.setGradeCursor(guildId, c);
const getCurrentStep = (guildId) => _gr.getCurrentStep(guildId);
const boolText = (v, gid) => _gr.boolText(v, gid);
const onOff = (f) => _gr.onOff(f);
const onOffDot = (f) => _gr.onOffDot(f);
const buildNavRow = (guildId, step) => _gr.buildNavRow(guildId, step);
const buildRoleOptions = (guild, id) => _gr.buildRoleOptions(guild, id);
const hasMapableRoles = (guild) => _gr.hasMapableRoles(guild);
const getRolesAutoCreated = (guildId) => _gr.getRolesAutoCreated(guildId);
const getGradeRenameMap = (guildId) => _gr.getGradeRenameMap(guildId);
const setGradeRenameName = (guildId, grade, name) => _gr.setGradeRenameName(guildId, grade, name);
const isFreshInstall = (guildId) => _gr.isFreshInstall(guildId);

function _ctx() {
  return {
    CUSTOM_IDS, TOTAL_STEPS, CHANNEL_SLOTS,
    gradeLabel, buildNavRow, buildRoleOptions,
    getGradeCursor, getRolesAutoCreated, hasMapableRoles, getGradeRenameMap,
    isCommunityGuild, getChannelCursor, isFreshInstall,
    onOff, onOffDot,
  };
}

const renderStep = (interaction, step) => _render.renderStep(interaction, step, _ctx());
const buildStepPayload = async (guildId, guild, step) => _render.buildStepPayload(guildId, guild, step, _ctx());
const sendSetupMessage = (interaction, content) => _render.sendSetupMessage(interaction, content);
const createRolesAutoHelper = (interaction, guild, guildId) => _gr.createRolesAutoHelper(interaction, guild, guildId, renderStep);
const detectDuplicateGradeRoles = (guild) => _gr.detectDuplicateGradeRoles(guild);
const autoPositionChannelCursor = (guildId, guild) => _gr.autoPositionChannelCursor(guildId, guild);
const explainStepOneValidation = (guildId, v) => _sec.explainStepOneValidation(guildId, v, gradeLabel);
const advanceToStep2AfterSecurity = (interaction, guildId) => _sec.advanceToStep2AfterSecurity(interaction, guildId, buildStepPayload);
const buildSecurityComponents = (d, u, _, r) => _sec.buildSecurityComponents(d, u, _, r);
const getStep2Config = (guildId) => _s.getStep2Config(guildId);
const setStep2Config = (guildId, c) => _s.setStep2Config(guildId, c);
const getActiveSlotsForInstall = (guildId, guild) => _s.getActiveSlotsForInstall(guildId, guild, CHANNEL_SLOTS, isCommunityGuild);
const autoDetectGuardianChannels = (guild) => _s.autoDetectGuardianChannels(guild, CHANNEL_SLOTS);
const getCachedAutoDetectedChannels = (guildId, guild) => _s.getCachedAutoDetectedChannels(guildId, guild, CHANNEL_SLOTS);
const invalidateAutoDetectedChannels = (guildId) => _s.invalidateAutoDetectedChannels(guildId);
const buildChannelAutoDetectContent = (guildId, guild) => _s.buildChannelAutoDetectContent(guildId, guild, _ctx());
const buildChannelAutoDetectComponents = () => _s.buildChannelAutoDetectComponents(CUSTOM_IDS);
const addIgnoredChannelSlot = (guildId, k) => _s.addIgnoredChannelSlot(guildId, k);
const getIgnoredChannelSlots = (guildId) => _s.getIgnoredChannelSlots(guildId);
const buildChannelOptions = (guild, slot) => _s.buildChannelOptions(guild, slot);
const buildStep3ChannelsContent = (guildId, guild) => _s.buildStep3ChannelsContent(guildId, guild, _ctx());
const buildStep3ChannelsComponents = (guildId, guild) => _s.buildStep3ChannelsComponents(guildId, guild, _ctx());
const getStep4Config = (guildId, guild) => _s.getStep4Config(guildId, guild);
const setStep4Config = (guildId, c) => _s.setStep4Config(guildId, c);
const cycleReviewerGrade = (g) => _s.cycleReviewerGrade(g);
const getStep4VocalConfig = (guildId) => _s.getStep4VocalConfig(guildId);
const cycleVocalPrefix = (c) => _s.cycleVocalPrefix(c);
const formatDelay = (m) => _s.formatDelay(m);
const getStep5Cursor = (guildId) => _s.getStep5Cursor(guildId);
const setStep5Cursor = (guildId, c) => _s.setStep5Cursor(guildId, c);
const getGamesPage = (guildId) => _s.getGamesPage(guildId);
const setGamesPage = (guildId, p) => _s.setGamesPage(guildId, p);
const getGamesLayoutMode = (guildId) => _s.getGamesLayoutMode(guildId);
const setGamesLayoutMode = (guildId, m) => _s.setGamesLayoutMode(guildId, m);
const ensureAtLeastOneSetupGame = (guildId) => _s.ensureAtLeastOneSetupGame(guildId);
const getSteamCycleValue = (v) => _s.getSteamCycleValue(v);
const cycleLogsLevel = (c) => _s.cycleLogsLevel(c);
const getStep7Config = (guildId) => _s.getStep7Config(guildId);
const setStep7Config = (guildId, c) => _s.setStep7Config(guildId, c);
const buildCommunityCheckContent = (guildId, guild) => _s.buildCommunityCheckContent(guildId, guild, _ctx());
const buildCommunityCheckComponents = () => _s.buildCommunityCheckComponents(CUSTOM_IDS);
const normalizeChannelName = (name) => _s.normalizeChannelName(name);
const getDetectedGames = (guildId) => _gd.getDetectedGames(guildId);
const setDetectedGames = (guildId, g) => _gd.setDetectedGames(guildId, g);
const getGameLinkCursor = (guildId) => _gd.getGameLinkCursor(guildId);
const setGameLinkCursor = (guildId, v) => _gd.setGameLinkCursor(guildId, v);
const getGameReviewPage = (guildId) => _gd.getGameReviewPage(guildId);
const setGameReviewPage = (guildId, v) => _gd.setGameReviewPage(guildId, v);
const MAX_REVIEW_GAMES = _gd.MAX_REVIEW_GAMES;
const getGameLinkActiveType = (guildId) => _gd.getGameLinkActiveType(guildId);
const setGameLinkActiveType = (guildId, tp) => _gd.setGameLinkActiveType(guildId, tp);
const detectExistingGameChannels = (guild) => _gd.detectExistingGameChannels(guild);
const buildGameDetectContent = (guildId, guild) => _gd.buildGameDetectContent(guildId, guild, TOTAL_STEPS);
const buildGameDetectComponents = (guild) => _gd.buildGameDetectComponents(guild, CUSTOM_IDS);
const buildGameReviewContent = (guildId) => _gd.buildGameReviewContent(guildId);
const buildGameReviewComponents = (guildId) => _gd.buildGameReviewComponents(guildId, CUSTOM_IDS);
const buildGameLinkContent = (guildId) => _gd.buildGameLinkContent(guildId);
const buildGameLinkComponents = (guildId, guild) => _gd.buildGameLinkComponents(guildId, guild, buildNavRow, 6);
const buildNotifyMembersContent = (guildId) => _notif.buildNotifyMembersContent(guildId);
const buildNotifyMembersComponents = () => _notif.buildNotifyMembersComponents(CUSTOM_IDS);
const sendInstallNotifyDm = (member, guildId) => _notif.sendInstallNotifyDm(member, guildId);
const semverToInt = (v) => _notif.semverToInt(v);
const getPendingNewOptions = (guildId, guild) => _notif.getPendingNewOptions(guildId, guild, CHANNEL_SLOTS, getActiveSlotsForInstall);
const buildNewOptionsContent = (guildId, guild) => _notif.buildNewOptionsContent(guildId, guild, CHANNEL_SLOTS, getActiveSlotsForInstall);
const buildNewOptionsComponents = (guildId, guild) => _notif.buildNewOptionsComponents(guildId, guild, CUSTOM_IDS, CHANNEL_SLOTS, getActiveSlotsForInstall);
const buildNewOptionsDoneContent = () => _notif.buildNewOptionsDoneContent();
const buildNewOptionsDoneRow = () => _notif.buildNewOptionsDoneRow(CUSTOM_IDS);


module.exports = {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
  GRADE_NAMES, matchGameFromChannelName, generateNonSteamId, isNonSteamId, GENERIC_CHANNEL_NAMES,
  analyzeNonGuardianRoles, buildSecurityCheckContent, hasUnresolvedIssues,
  getGuildSetting, setGuildSetting, replyEphemeral,
  CUSTOM_IDS, TOTAL_STEPS,
  ORDERED_GRADES, REQUIRED_GRADES, setGradeRole, getGradeMappings, validateStepOneMappings,
  listSetupGames, addSetupGame, removeLastSetupGame, updateSetupGame,
  t, logger,
  CHANNEL_SLOTS, getChannelCursor, setChannelCursor, isCommunityGuild,
  SYSCHANNEL_CHOICES, SYSCHANNEL_LABELS, VOCAL_PREFIX_CYCLE, GAMES_PAGE_SIZE, LOGS_LEVELS,
  GAMELINK_TYPE_LABELS, GAMELINK_LINKABLE_TYPES,
  gradeLabel, getGradeCursor, setGradeCursor, getCurrentStep, boolText, onOff, onOffDot,
  buildNavRow, buildRoleOptions, hasMapableRoles, getRolesAutoCreated, getGradeRenameMap, setGradeRenameName, isFreshInstall,
  _ctx, renderStep, buildStepPayload, sendSetupMessage,
  createRolesAutoHelper, detectDuplicateGradeRoles, autoPositionChannelCursor,
  explainStepOneValidation, advanceToStep2AfterSecurity, buildSecurityComponents,
  getStep2Config, setStep2Config, getActiveSlotsForInstall, autoDetectGuardianChannels,
  getCachedAutoDetectedChannels, invalidateAutoDetectedChannels,
  buildChannelAutoDetectContent, buildChannelAutoDetectComponents,
  addIgnoredChannelSlot, getIgnoredChannelSlots, buildChannelOptions,
  buildStep3ChannelsContent, buildStep3ChannelsComponents,
  getStep4Config, setStep4Config, cycleReviewerGrade, getStep4VocalConfig,
  cycleVocalPrefix, formatDelay, getStep5Cursor, setStep5Cursor,
  getGamesPage, setGamesPage, getGamesLayoutMode, setGamesLayoutMode, ensureAtLeastOneSetupGame, getSteamCycleValue,
  cycleLogsLevel, getStep7Config, setStep7Config,
  buildCommunityCheckContent, buildCommunityCheckComponents, normalizeChannelName,
  getDetectedGames, setDetectedGames, getGameLinkCursor, setGameLinkCursor,
  getGameReviewPage, setGameReviewPage, MAX_REVIEW_GAMES,
  getGameLinkActiveType, setGameLinkActiveType, detectExistingGameChannels,
  buildGameDetectContent, buildGameDetectComponents, buildGameReviewContent, buildGameReviewComponents,
  buildGameLinkContent, buildGameLinkComponents,
  buildNotifyMembersContent, buildNotifyMembersComponents, sendInstallNotifyDm,
  semverToInt, getPendingNewOptions, buildNewOptionsContent, buildNewOptionsComponents,
  buildNewOptionsDoneContent, buildNewOptionsDoneRow,
};
