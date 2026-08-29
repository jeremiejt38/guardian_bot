'use strict';
const ctx = require('./_sharedContext');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
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
  buildChannelAutoDetectContent, buildChannelAutoDetectComponents,
  addIgnoredChannelSlot, getIgnoredChannelSlots, buildChannelOptions,
  getStep4Config, setStep4Config, cycleReviewerGrade, getStep4VocalConfig,
  cycleVocalPrefix, formatDelay, getStep5Cursor, setStep5Cursor,
  getGamesPage, setGamesPage, ensureAtLeastOneSetupGame, getSteamCycleValue,
  cycleLogsLevel, getStep7Config, setStep7Config,
  buildCommunityCheckContent, buildCommunityCheckComponents, normalizeChannelName,
  getDetectedGames, setDetectedGames, getGameLinkCursor, setGameLinkCursor,
  getGameLinkActiveType, setGameLinkActiveType, detectExistingGameChannels,
  buildGameDetectContent, buildGameDetectComponents, buildGameReviewContent, buildGameReviewComponents,
  buildGameLinkContent, buildGameLinkComponents,
  buildNotifyMembersContent, buildNotifyMembersComponents, sendInstallNotifyDm,
  semverToInt, getPendingNewOptions, buildNewOptionsContent, buildNewOptionsComponents,
  buildNewOptionsDoneContent, buildNewOptionsDoneRow,
} = require('./_sharedContext');
// @premium-start
const {
  AFK_TIMEOUTS, AFK_TIMEOUT_LABELS, AUTOMOD_RULES,
  syncFromDiscord, getAfkConfig, cycleAfkTimeout, applyAfkSettings,
  getSystemChannelConfig, applySystemChannel, getLocaleConfig, syncLocaleToDiscord,
  applyRulesChannel, applyPublicUpdatesChannel, applyDescription,
  getAutoModConfig, applyAutoModRule, disableAutoModRule, fetchOnboardingState, addOnboardingDefaultChannels,
} = require('../discordSettings');
// @premium-end

async function _handleStep8(guildId, interaction) {
  if (interaction.customId.startsWith(`${CUSTOM_IDS.toggleAutoModRule}:`)) {
    await interaction.deferUpdate().catch(() => {});
    const ruleKey = interaction.customId.split(':').pop();
    const automod = getAutoModConfig(guildId);
    const cfg = automod[ruleKey];
    if (!cfg) { await renderStep(interaction, 8); return true; }
    if (cfg.enabled) {
      await disableAutoModRule(interaction.guild, ruleKey);
    } else {
      const words = (() => { const w = getGuildSetting(guildId, 'automod', 'blacklist_words', []); return Array.isArray(w) ? w : []; })();
      await applyAutoModRule(interaction.guild, ruleKey, words);
    }
    await renderStep(interaction, 8); return true;
  }

  if (interaction.customId === CUSTOM_IDS.applyOnboardingChannels) {
    await interaction.deferUpdate().catch(() => {});
    const channelIds = [
      getGuildSetting(guildId, 'channels', 'general_channel_id', null),
      getGuildSetting(guildId, 'channels', 'rules_channel_id', null),
    ].filter((id) => id && id !== 'guardian:create');
    if (channelIds.length > 0 && interaction.guild) {
      const res = await addOnboardingDefaultChannels(interaction.guild, channelIds);
      await sendSetupMessage(interaction, res.ok
        ? `✅ ${res.message || `${channelIds.length} channel(s) ajouté(s).`}`
        : `⚠️ Échec onboarding : ${res.error}`);
    } else {
      await sendSetupMessage(interaction, '⚠️ Aucun channel configuré à ajouter à l\'onboarding.');
    }
    await renderStep(interaction, 8); return true;
  }

  if (interaction.customId === CUSTOM_IDS.discordSettingsSkip) {
    const nextStep = 9;
    setGuildSetting(guildId, 'setup', 'step', nextStep);
    await renderStep(interaction, nextStep); return true;
  }

  return false;
}
// @premium-end



module.exports = { _handleStep8 };
