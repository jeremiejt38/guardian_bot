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
  getAutoModConfig, applyAutoModRule, fetchOnboardingState, addOnboardingDefaultChannels,
} = require('../discordSettings');
// @premium-end

function _searchChannelOptions(guild, slot, query) {
  const isVoice = slot.key.startsWith('voice');
  const allChannels = Array.from(guild.channels.cache.values())
    .filter((c) => isVoice ? (c.isVoiceBased && c.isVoiceBased()) : (c.isTextBased && c.isTextBased() && !c.isVoiceBased()));
  const q = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  const scored = allChannels.map((c) => {
    const n = c.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
    let score = 0;
    if (n === q) score = 100;
    else if (n.startsWith(q)) score = 80;
    else if (n.includes(q)) score = 60;
    else if (q && n.split(/[-_\s]/).some((p) => p.startsWith(q))) score = 40;
    return { c, score };
  });
  return scored
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name))
    .map(({ c }) => ({ label: `${c.name}`.slice(0, 25), value: c.id, description: `#${c.name}`.slice(0, 50) }));
}

const channelSearchCache = new Map();

function _searchCacheKey(guildId, userId, slotKey) {
  return `${guildId}:${userId}:${slotKey}`;
}

async function _handleStep3(guildId, interaction) {
  if (interaction.customId.startsWith(`${CUSTOM_IDS.channelSelectPrefix}:`)) {
    const slotKey = interaction.customId.split(':').pop();
    const slot = CHANNEL_SLOTS.find((s) => s.key === slotKey);
    if (slot && interaction.values?.[0] && interaction.values[0] !== 'none') {
      setGuildSetting(guildId, slot.settingSection, slot.settingKey, interaction.values[0]);
    }
    const activeSlots = getActiveSlotsForInstall(guildId, interaction.guild);
    const cursor = getChannelCursor(guildId);
    if (cursor < activeSlots.length - 1) setChannelCursor(guildId, cursor + 1);
    await renderStep(interaction, 3); return true;
  }
  if (interaction.customId.startsWith(`${CUSTOM_IDS.channelSkip}:`)) {
    const action = interaction.customId.split(':').pop();
    const activeSlots = getActiveSlotsForInstall(guildId, interaction.guild);
    const cursor = getChannelCursor(guildId);
    if (action === 'prev') { setChannelCursor(guildId, cursor - 1); await renderStep(interaction, 3); return true; }
    if (action === 'skip') { setChannelCursor(guildId, activeSlots.length - 1); await renderStep(interaction, 3); return true; }
    if (action === 'ignore') {
      const slot = activeSlots[cursor];
      if (slot) {
        addIgnoredChannelSlot(guildId, slot.key);
        setGuildSetting(guildId, slot.settingSection, slot.settingKey, null);
        if (slot.key === 'voiceAfk') {
          setGuildSetting(guildId, 'modules', 'afk_enabled', false);
        }
        if (slot.key === 'moderationLogs') {
          setGuildSetting(guildId, 'modules', 'mod_logs_enabled', false);
        }
      }
      if (cursor < activeSlots.length - 1) { setChannelCursor(guildId, cursor + 1); await renderStep(interaction, 3); }
      else { setGuildSetting(guildId, 'setup', 'step', 4); await renderStep(interaction, 4); }
      return true;
    }
    if (action === 'delete-afk' && slot?.key === 'voiceAfk') {
      const currentId = getGuildSetting(guildId, slot.settingSection, slot.settingKey, null);
      if (currentId && currentId !== 'guardian:create') {
        const ch = interaction.guild?.channels?.cache?.get(currentId);
        if (ch?.deletable) await ch.delete('Désactivation AFK via setup').catch(() => {});
      }
      setGuildSetting(guildId, slot.settingSection, slot.settingKey, null);
      setGuildSetting(guildId, 'channels', 'afk_enabled', false);
      setChannelCursor(guildId, Math.min(cursor + 1, activeSlots.length - 1));
      await renderStep(interaction, 3); return true;
    }
    if (action === 'next') {
      if (typeof interaction.guild?.channels?.fetch === 'function') await interaction.guild.channels.fetch().catch(() => {});
      const currentSlot = activeSlots[cursor];
      if (currentSlot) {
        const existingId = getGuildSetting(guildId, currentSlot.settingSection, currentSlot.settingKey, null);
        if (!existingId || existingId === 'guardian:create') {
          setGuildSetting(guildId, currentSlot.settingSection, currentSlot.settingKey, 'guardian:create');
        }
      }
      if (cursor >= activeSlots.length - 1) {
        const generalSlot = activeSlots.find((s) => s.key === 'general');
        const generalId = generalSlot ? getGuildSetting(guildId, generalSlot.settingSection, generalSlot.settingKey, null) : null;
        if (!generalId || generalId === '') {
          const generalIdx = activeSlots.findIndex((s) => s.key === 'general');
          if (generalIdx >= 0) setChannelCursor(guildId, generalIdx);
          await sendSetupMessage(interaction, '⚠️ Le channel **#général** est requis. Associe-le à un channel existant ou laisse Guardian en créer un.');
          await renderStep(interaction, 3);
          return true;
        }
        const nextStep = 4; setGuildSetting(guildId, 'setup', 'step', nextStep); await renderStep(interaction, nextStep);
      }
      else { setChannelCursor(guildId, cursor + 1); await renderStep(interaction, 3); }
      return true;
    }
  }

  if (interaction.isButton() && interaction.customId.startsWith(`${CUSTOM_IDS.channelSearch}:`) && !interaction.customId.startsWith(`${CUSTOM_IDS.channelSearchSelect}:`)) {
    const slotKey = interaction.customId.split(':').pop();
    const slot = CHANNEL_SLOTS.find((s) => s.key === slotKey);
    if (!slot) { await interaction.deferUpdate().catch(() => {}); return true; }
    const modal = new ModalBuilder()
      .setCustomId(`${CUSTOM_IDS.channelSearchModal}:${slotKey}`)
      .setTitle('Rechercher un salon')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('query')
            .setLabel('Nom du salon')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(64)
            .setPlaceholder('Ex: général, vocal...')
        )
      );
    await interaction.showModal(modal).catch((err) => logger.warn('showModal channelSearch failed', { error: err?.message }));
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith(`${CUSTOM_IDS.channelSearchModal}:`)) {
    const slotKey = interaction.customId.split(':').pop();
    const slot = CHANNEL_SLOTS.find((s) => s.key === slotKey);
    if (!slot) { await interaction.deferUpdate().catch(() => {}); return true; }
    const query = interaction.fields.getTextInputValue('query').trim();
    if (!query) { await replyEphemeral(interaction, 'Recherche vide.'); return true; }
    const results = _searchChannelOptions(interaction.guild, slot, query);
    if (results.length === 0) {
      await replyEphemeral(interaction, `Aucun salon trouvé pour **${query}**.`);
      return true;
    }
    if (results.length === 1) {
      setGuildSetting(guildId, slot.settingSection, slot.settingKey, results[0].value);
      await interaction.deferUpdate().catch(() => {});
      await renderStep(interaction, 3);
      return true;
    }

    const { buildPaginatedSelect } = require('../../utils/paginatedSelect');
    const baseCustomId = `${CUSTOM_IDS.channelSearchSelect}:${slotKey}`;
    channelSearchCache.set(_searchCacheKey(guildId, interaction.user.id, slotKey), results);
    const { rows } = buildPaginatedSelect(
      results,
      baseCustomId,
      `Résultats pour "${query.slice(0, 80)}"`,
      0,
      { minValues: 1, maxValues: 1 }
    );
    await interaction.reply({ content: `**${results.length}** salon(s) trouvé(s), choisis :`, components: rows, ephemeral: true }).catch(() => {});
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith(`${CUSTOM_IDS.channelSearchSelect}:`) && interaction.customId.includes(':page:')) {
    const parts = interaction.customId.split(':');
    const slotKey = parts[parts.length - 3];
    const targetPage = Number(parts[parts.length - 1]);
    const slot = CHANNEL_SLOTS.find((s) => s.key === slotKey);
    if (!slot || Number.isNaN(targetPage)) { await interaction.deferUpdate().catch(() => {}); return true; }
    const results = channelSearchCache.get(_searchCacheKey(guildId, interaction.user.id, slotKey));
    if (!results || results.length === 0) {
      await interaction.update({ content: 'La recherche a expiré, recommence.', components: [] }).catch(() => {});
      return true;
    }
    const { buildPaginatedSelect } = require('../../utils/paginatedSelect');
    const baseCustomId = `${CUSTOM_IDS.channelSearchSelect}:${slotKey}`;
    const { rows } = buildPaginatedSelect(results, baseCustomId, `Résultats`, targetPage, { minValues: 1, maxValues: 1 });
    await interaction.update({ content: `**${results.length}** salon(s) trouvé(s), choisis :`, components: rows });
    return true;
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith(`${CUSTOM_IDS.channelSearchSelect}:`)) {
    const parts = interaction.customId.split(':');
    const slotKey = parts[parts.length - 2];
    const slot = CHANNEL_SLOTS.find((s) => s.key === slotKey);
    if (slot && interaction.values?.[0] && interaction.values[0] !== 'none') {
      setGuildSetting(guildId, slot.settingSection, slot.settingKey, interaction.values[0]);
    }
    await interaction.deferUpdate().catch(() => {});
    await renderStep(interaction, 3);
    return true;
  }

  return false;
}



module.exports = { _handleStep3 };
