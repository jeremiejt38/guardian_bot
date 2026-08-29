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
  getGamesPage, setGamesPage, getGamesLayoutMode, setGamesLayoutMode, ensureAtLeastOneSetupGame, getSteamCycleValue,
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

async function _handleStep6(guildId, interaction) {
  const setEditorSubstep = () => setGuildSetting(guildId, 'setup', 'games_substep', 'edit');
  if (interaction.customId === CUSTOM_IDS.gamePagePrev) {
    setGamesPage(guildId, getGamesPage(guildId) - 1);
    setEditorSubstep();
    await renderStep(interaction, 6); return true;
  }
  if (interaction.customId === CUSTOM_IDS.gamePageNext) {
    setGamesPage(guildId, getGamesPage(guildId) + 1);
    setEditorSubstep();
    await renderStep(interaction, 6); return true;
  }

  if (interaction.customId === CUSTOM_IDS.addGame) {
    const modal = new ModalBuilder()
      .setCustomId(CUSTOM_IDS.addGameModal)
      .setTitle('Ajouter un jeu');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('name').setLabel('Nom du jeu')
          .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(64)
          .setPlaceholder('Ex: Counter-Strike 2, Minecraft...')
      )
    );
    await interaction.showModal(modal).catch((err) => logger.warn('showModal failed (addGame)', { error: err?.message })); return true;
  }

  if (interaction.isModalSubmit() && interaction.customId === CUSTOM_IDS.addGameModal) {
    const name = interaction.fields.getTextInputValue('name').trim();
    const galerieEnabled = false;
    const changelogEnabled = true;
    let steamResult = null;
    let deferredReply = false;
    try {
      await interaction.deferReply({ ephemeral: true });
      deferredReply = true;
    } catch (err) {
      logger.warn('addGameModal: deferReply failed', { error: err?.message });
    }
    try {
      const encoded = encodeURIComponent(name);
      const res = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encoded}&l=french&cc=FR`);
      if (res.ok) {
        const data = await res.json();
        steamResult = data.items?.[0] || null;
        logger.info('Steam search', { name, found: steamResult?.name || null, id: steamResult?.id || null });
      } else {
        logger.warn('Steam search non-ok', { status: res.status, name });
      }
    } catch (err) {
      logger.error('Steam search error', { error: err?.message, name });
    }

    let game;
    try {
      game = addSetupGame(guildId, {
        name: steamResult?.name || name,
        steam_app_id: steamResult ? String(steamResult.id) : null,
        galerie_enabled: galerieEnabled,
        changelog_enabled: changelogEnabled
      });
      logger.info('Game added', { guildId, name: game.name, steam_app_id: game.steam_app_id });
    } catch (err) {
      logger.error('addSetupGame failed', { error: err?.message, guildId, name });
      if (deferredReply) await interaction.editReply({ content: '❌ Impossible d\'ajouter ce jeu (nom en doublon ?).' }).catch(() => {});
      return true;
    }
    const confirmMsg = [
      `✅ **Jeu ajouté : ${game.name}**`,
      game.steam_app_id ? `> Trouvé sur Steam : ID \`${game.steam_app_id}\`` : '> Jeu non Steam — le suivi des mises à jour Steam ne sera pas disponible.',
      '',
      'Tu peux modifier ce jeu à tout moment avec le bouton ✏️.'
    ].filter(Boolean).join('\n');
    try {
      const sent = await interaction.channel.send({ content: confirmMsg });
      if (sent?.deletable !== false) setTimeout(() => sent?.delete().catch(() => {}), 5000);
    } catch (err) {
      logger.error('addGameModal: channel.send failed', { error: err?.message });
    }
    if (deferredReply) await interaction.deleteReply().catch(() => {});
    setGuildSetting(guildId, 'setup', 'games_substep', 'edit');
    const wizardMsg = await interaction.channel.messages.fetch({ limit: 20 })
      .then((msgs) => msgs.find((m) => m.author?.id === interaction.client?.user?.id && m.components?.length > 0))
      .catch((err) => { logger.error('addGameModal: fetch wizard msg failed', { error: err?.message }); return null; });
    if (wizardMsg) {
      const fakeIx = { guildId, guild: interaction.guild, message: wizardMsg, channel: interaction.channel, deferUpdate: async () => {} };
      await renderStep(fakeIx, 6).catch((err) => logger.error('addGameModal: renderStep failed', { error: err?.message }));
    } else {
      logger.warn('addGameModal: wizard message not found in channel, cannot re-render step 6');
    }
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId?.startsWith(`${CUSTOM_IDS.addGameConfirmModal}:`)) {
    const name = interaction.fields.getTextInputValue('name').trim();
    const steamId = interaction.fields.getTextInputValue('steam_id').trim() || null;
    let deferredReply = false;
    try { await interaction.deferReply({ ephemeral: true }); deferredReply = true; } catch {}
    let game;
    try {
      game = addSetupGame(guildId, { name, steam_app_id: steamId, galerie_enabled: false, changelog_enabled: true });
      logger.info('Game added (non-Steam)', { guildId, name: game.name, steam_app_id: game.steam_app_id });
    } catch (err) {
      logger.error('addGameConfirmModal: addSetupGame failed', { error: err?.message });
      if (deferredReply) await interaction.editReply({ content: '❌ Impossible d\'ajouter ce jeu (nom en doublon ?).' }).catch(() => {});
      return true;
    }
    const confirmMsg = [
      `✅ **Jeu ajouté : ${game.name}**`,
      game.steam_app_id ? `> Steam ID : \`${game.steam_app_id}\`` : '> Jeu non Steam — le suivi des mises à jour Steam ne sera pas disponible.',
      '',
      'Tu peux modifier ce jeu à tout moment avec le bouton ✏️.'
    ].join('\n');
    try { const sent = await interaction.channel.send({ content: confirmMsg }); if (sent?.deletable !== false) setTimeout(() => sent?.delete().catch(() => {}), 5000); } catch {}
    setGuildSetting(guildId, 'setup', 'games_substep', 'edit');
    const wizardMsg = await interaction.channel.messages.fetch({ limit: 20 })
      .then((msgs) => msgs.find((m) => m.author?.id === interaction.client?.user?.id && m.components?.length > 0))
      .catch(() => null);
    if (wizardMsg) {
      const fakeIx = { guildId, guild: interaction.guild, message: wizardMsg, channel: interaction.channel, deferUpdate: async () => {} };
      await renderStep(fakeIx, 6).catch(() => {});
    }
    if (deferredReply) await interaction.deleteReply().catch(() => {});
    return true;
  }

  if (interaction.isButton() && interaction.customId?.startsWith(`${CUSTOM_IDS.editGamePrefix}:`)) {
    const gameId = Number(interaction.customId.split(':').pop());
    const games = listSetupGames(guildId);
    const game = games.find((g) => g.game_id === gameId);
    if (!game) { await interaction.deferUpdate().catch(() => {}); return true; }
    const modal = new ModalBuilder()
      .setCustomId(`${CUSTOM_IDS.editGameModal}:${gameId}`)
      .setTitle(`Modifier : ${game.name.slice(0, 40)}`);
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('name').setLabel('Nom du jeu')
          .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(64)
          .setValue(game.name)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('steam_id').setLabel('Steam ID (vider = jeu non Steam)')
          .setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(20)
          .setValue(game.steam_app_id || '')
          .setPlaceholder('Ex: 730 pour CS2 — laisser vide si non Steam')
      )
    );
    await interaction.showModal(modal).catch((err) => logger.warn('showModal failed (editGame)', { error: err?.message })); return true;
  }

  if (interaction.isModalSubmit() && interaction.customId?.startsWith(`${CUSTOM_IDS.editGameModal}:`)) {
    const gameId = Number(interaction.customId.split(':').pop());
    const name = interaction.fields.getTextInputValue('name').trim();
    const steamId = interaction.fields.getTextInputValue('steam_id').trim() || null;
    const existingGame = listSetupGames(guildId).find((g) => g.game_id === gameId);
    const galerie = Boolean(existingGame?.galerie_enabled);
    const changelog = Boolean(existingGame?.changelog_enabled);
    try {
      updateSetupGame(guildId, gameId, { name, steam_app_id: steamId, galerie_enabled: galerie, changelog_enabled: changelog });
      logger.info('Game updated', { guildId, gameId, name });
    } catch (err) {
      logger.error('updateSetupGame failed', { error: err?.message, guildId, gameId });
    }
    let deferredReply = false;
    try { await interaction.deferReply({ ephemeral: true }); deferredReply = true; } catch {}
    setGuildSetting(guildId, 'setup', 'games_substep', 'edit');
    const wizardMsg = await interaction.channel.messages.fetch({ limit: 20 })
      .then((msgs) => msgs.find((m) => m.author?.id === interaction.client?.user?.id && m.components?.length > 0))
      .catch(() => null);
    if (wizardMsg) {
      const fakeIx = { guildId, guild: interaction.guild, message: wizardMsg, channel: interaction.channel, deferUpdate: async () => {} };
      await renderStep(fakeIx, 6).catch((err) => logger.error('editGameModal: renderStep failed', { error: err?.message }));
    }
    if (deferredReply) await interaction.deleteReply().catch(() => {});
    return true;
  }

  if (interaction.customId?.startsWith(`${CUSTOM_IDS.toggleGameGallery}:`)) {
    const gameId = Number(interaction.customId.split(':').pop());
    const game = listSetupGames(guildId).find((g) => g.game_id === gameId);
    if (game) { updateSetupGame(guildId, gameId, { ...game, galerie_enabled: !game.galerie_enabled }); }
    setEditorSubstep(); await renderStep(interaction, 6); return true;
  }
  if (interaction.customId?.startsWith(`${CUSTOM_IDS.toggleGameChangelog}:`)) {
    const gameId = Number(interaction.customId.split(':').pop());
    const game = listSetupGames(guildId).find((g) => g.game_id === gameId);
    if (game) { updateSetupGame(guildId, gameId, { ...game, changelog_enabled: !game.changelog_enabled }); }
    setEditorSubstep(); await renderStep(interaction, 6); return true;
  }
  if (interaction.customId?.startsWith(`${CUSTOM_IDS.toggleGameText}:`)) {
    const gameId = Number(interaction.customId.split(':').pop());
    const game = listSetupGames(guildId).find((g) => g.game_id === gameId);
    if (game) { updateSetupGame(guildId, gameId, { ...game, text_channel_enabled: !game.text_channel_enabled }); }
    setEditorSubstep(); await renderStep(interaction, 6); return true;
  }
  if (interaction.customId?.startsWith(`${CUSTOM_IDS.deleteGamePrefix}:`)) {
    const gameId = Number(interaction.customId.split(':').pop());
    const db = require('../../database/db').getDb();
    db.prepare('DELETE FROM games WHERE guild_id = ? AND game_id = ?').run(guildId, gameId);
    setEditorSubstep(); await renderStep(interaction, 6); return true;
  }

  if (interaction.customId === CUSTOM_IDS.clearAllGames) {
    const db = require('../../database/db').getDb();
    db.prepare('DELETE FROM games WHERE guild_id = ?').run(guildId);
    setGuildSetting(guildId, 'setup', 'detected_games', null);
    setGamesPage(guildId, 0);
    setEditorSubstep(); await renderStep(interaction, 6); return true;
  }

  if (interaction.customId === CUSTOM_IDS.toggleGameLayoutMode) {
    const { rebuildGameLayout } = require('../../games/gameList');
    const current = getGamesLayoutMode(guildId);
    const next = current === 'by-game' ? 'by-type' : 'by-game';
    try {
      await interaction.deferUpdate().catch(() => {});
      await rebuildGameLayout(interaction.guild, next).catch((err) => {
        logger.error('toggleGameLayoutMode: rebuildGameLayout failed', { error: err?.message, guildId });
      });
    } catch (err) {
      logger.error('toggleGameLayoutMode error', { error: err?.message, guildId });
    }
    setEditorSubstep(); await renderStep(interaction, 6); return true;
  }

  return false;
}



module.exports = { _handleStep6 };
