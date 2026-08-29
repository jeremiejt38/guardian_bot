'use strict';
const ctx = require('./_sharedContext');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
  GRADE_NAMES, matchGameFromChannelName, generateNonSteamId, isNonSteamId, GENERIC_CHANNEL_NAMES,
  analyzeNonGuardianRoles, buildSecurityCheckContent, hasUnresolvedIssues,
  getGuildSetting, setGuildSetting, replyEphemeral,
  CUSTOM_IDS, TOTAL_STEPS,
  ORDERED_GRADES, REQUIRED_GRADES, setGradeRole, getGradeMappings, validateStepOneMappings,
  invalidateAutoDetectedChannels, getCachedAutoDetectedChannels,
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
  buildStep3ChannelsContent, buildStep3ChannelsComponents,
  getStep4Config, setStep4Config, cycleReviewerGrade, getStep4VocalConfig,
  cycleVocalPrefix, formatDelay, getStep5Cursor, setStep5Cursor,
  getGamesPage, setGamesPage, ensureAtLeastOneSetupGame, getSteamCycleValue,
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

function findAnnounceChannel(guild, preferredNames = ['bienvenue', 'general', 'faq']) {
  if (!guild?.channels?.cache) return null;
  const candidates = [...guild.channels.cache.values()]
    .filter((c) => c.isTextBased?.() && !c.isDMBased?.() && !c.isThread?.())
    .sort((a, b) => {
      const ai = preferredNames.indexOf(a.name);
      const bi = preferredNames.indexOf(b.name);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.position - b.position;
    });
  return candidates[0] || null;
}

function isChannelStillInGuild(guild, channel) {
  return Boolean(channel?.id && guild?.channels?.cache?.has(channel.id));
}

async function _handleNavAndTransitions(guildId, interaction) {
  if (interaction.customId === CUSTOM_IDS.back) {
    const currentStep = getCurrentStep(guildId);
    const prevStep = Math.max(1, currentStep - 1);
    setGuildSetting(guildId, 'setup', 'step', prevStep);
    // Reset sécurité / owner si on revient au step 1
    if (prevStep === 1) {
      setGuildSetting(guildId, 'setup', 'owner_id', null);
      invalidateAutoDetectedChannels(guildId);
      logger.info('[setupNav] back to step 1 — reset owner_id + channel autodetect cache');
    }
    await renderStep(interaction, prevStep);
    return true;
  }

  if (interaction.customId === CUSTOM_IDS.next) {
    const currentStep = getCurrentStep(guildId);

    if (currentStep === 1 && interaction.guild) {
      const guild = interaction.guild;
      if (guild.roles?.fetch) await guild.roles.fetch().catch(() => {});
      const validation = validateStepOneMappings(guild);
      if (!validation.ok && validation.reason !== 'owner_cardinality' && validation.reason !== 'owner_role_missing') {
        await sendSetupMessage(interaction, explainStepOneValidation(guildId, validation));
        return true;
      }
      await interaction.deferUpdate().catch(() => {});
      const members = await guild.members.fetch().catch(() => null);
      const nonBots = members ? [...members.filter((m) => !m.user.bot).values()].slice(0, 25) : [];
      const mappings = getGradeMappings(guildId);
      const ownerRoleId = mappings[GRADE_NAMES.owner];
      const ownerRole = ownerRoleId ? guild.roles.cache.get(ownerRoleId) : null;
      const currentOwnerMember = ownerRole
        ? guild.members.cache.find((m) => m.roles.cache.has(ownerRoleId) && !m.user.bot)
        : null;
      const inviterId = getGuildSetting(guildId, 'setup', 'inviter_id', null);
      const suggestedId = currentOwnerMember?.id ?? inviterId ?? null;
      const sorted = inviterId
        ? [...nonBots].sort((a, b) => (a.id === inviterId ? -1 : b.id === inviterId ? 1 : 0))
        : nonBots;
      const options = sorted.map((m) => {
        let tag = '';
        if (m.id === currentOwnerMember?.id) tag = '👑 Owner actuel — ';
        else if (m.id === inviterId) tag = '⭐ A invité le bot — ';
        return {
          label: (m.nickname || m.user.displayName || m.user.username).slice(0, 25),
          value: m.id,
          description: (tag + `@${m.user.username}`).slice(0, 50)
        };
      });
      const ownerRoleMention = ownerRoleId ? `<@&${ownerRoleId}>` : '**Owner**';
      const preSelectedId = currentOwnerMember?.id ?? null;
      const preSelectedMember = preSelectedId ? nonBots.find((m) => m.id === preSelectedId) : null;
      const preSelectedName = preSelectedMember
        ? (preSelectedMember.nickname || preSelectedMember.user.displayName || preSelectedMember.user.username)
        : null;
      const selectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(CUSTOM_IDS.selectOwnerMember)
          .setPlaceholder(preSelectedName
            ? `Owner actuel : ${preSelectedName.slice(0, 40)}`
            : inviterId && sorted[0]?.id === inviterId
              ? `Suggéré : ${(sorted[0].nickname || sorted[0].user.displayName || sorted[0].user.username).slice(0, 35)}`
              : 'Choisir le membre Owner')
          .setMinValues(1).setMaxValues(1)
          .addOptions(options.length ? options : [{ label: 'Aucun membre', value: 'none' }])
      );
      const confirmBtn = new ButtonBuilder()
        .setCustomId(preSelectedId
          ? `${CUSTOM_IDS.confirmOwner}:${preSelectedId}`
          : `${CUSTOM_IDS.confirmOwner}:none`)
        .setLabel(preSelectedName
          ? `✅ Confirmer ${preSelectedName.slice(0, 28)} comme Owner`
          : '✅ Confirmer le membre Owner')
        .setStyle(ButtonStyle.Success)
        .setDisabled(!preSelectedId);
      const confirmRow = new ActionRowBuilder().addComponents(confirmBtn);
      await interaction.channel.send({
        content: [
          `## 👑 Confirmation de l'Owner`,
          '',
          preSelectedName
            ? `Le rôle ${ownerRoleMention} est actuellement attribué à **${preSelectedName}**.`
            : `Aucun membre n'a encore le rôle ${ownerRoleMention}.`,
          '',
          '> ⚠️ **L\'Owner aura tous les droits Guardian sur ce serveur** : gestion des grades, modération, configuration complète.',
          '> Confirme ou modifie le membre Owner avant de continuer.'
        ].join('\n'),
        components: [selectRow, confirmRow]
      });
      return true;
    }

    const nextStep = Math.min(currentStep + 1, TOTAL_STEPS);
    if (nextStep === 6) {
      setGuildSetting(guildId, 'setup', 'step', 6);
      if (!getGuildSetting(guildId, 'setup', 'games_substep', null)) {
        setGuildSetting(guildId, 'setup', 'games_substep', 'detect');
      }
      await renderStep(interaction, 6); return true;
    }
    if (nextStep === 3 && interaction.guild) {
      await interaction.deferUpdate().catch(() => {});
      if (!isCommunityGuild(interaction.guild)) {
        await interaction.editReply({
          content: buildCommunityCheckContent(guildId, interaction.guild) + '\n\u200b',
          components: buildCommunityCheckComponents()
        }).catch(() => {});
        return true;
      }
      await interaction.editReply({
        content: buildStep3ChannelsContent(guildId, interaction.guild) + '\n\u200b',
        components: buildStep3ChannelsComponents(guildId, interaction.guild)
      }).catch(() => {});
      return true;
    }
    setGuildSetting(guildId, 'setup', 'step', nextStep);
    if (nextStep === 3) autoPositionChannelCursor(guildId, interaction.guild);
    await renderStep(interaction, nextStep);
    return true;
  }

  if (interaction.customId === CUSTOM_IDS.communityCheckRetry) {
    await interaction.deferUpdate().catch(() => {});
    if (interaction.guild) await interaction.guild.fetch().catch(() => {});
    if (isCommunityGuild(interaction.guild)) {
      setGuildSetting(guildId, 'setup', 'step', 3);
      autoPositionChannelCursor(guildId, interaction.guild);
      await renderStep(interaction, 3);
    } else {
      await interaction.editReply({
        content: buildCommunityCheckContent(guildId, interaction.guild) + '\n\u200b',
        components: buildCommunityCheckComponents()
      }).catch(() => {});
    }
    return true;
  }

  if (interaction.customId === CUSTOM_IDS.communityCheckHelp) {
    await interaction.reply({
      content: [
        '**Activer le mode Communautaire Discord :**',
        '',
        '1. Sur ton serveur Discord, clique sur le nom du serveur en haut à gauche.',
        '2. Sélectionne **Paramètres du serveur** (roue dentée).',
        '3. Dans la colonne de gauche, clique sur **Activer la communauté** (sous Engagement).',
        '4. Clique sur **Commencer**, puis choisis :',
        '   - **Sécurité** : active la vérification par e-mail (recommandé).',
        '   - **Règles** : désigne un salon existant comme salon des règles, ou crées-en un nouveau.',
        '   - **Mises à jour de la communauté** : désigne un salon existant, ou crées-en un nouveau.',
        '5. Valide avec **Terminer**.',
        '',
        'Une fois fait, reviens ici et clique sur **🔄 Vérifier à nouveau**.',
        '',
        '⏭️ Tu peux aussi cliquer sur **Continuer sans activer** — Guardian fonctionnera sans les fonctionnalités communautaires.'
      ].join('\n'),
      ephemeral: true
    }).catch(() => {});
    return true;
  }

  if (interaction.customId === CUSTOM_IDS.communityCheckContinue) {
    await interaction.deferUpdate().catch(() => {});
    await interaction.editReply({
      content: buildGameDetectContent(guildId, interaction.guild) + '\n\u200b',
      components: buildGameDetectComponents(interaction.guild)
    }).catch(() => {});
    return true;
  }

  if (interaction.customId === CUSTOM_IDS.gameDetectAdopt) {
    await interaction.deferUpdate().catch(() => {});
    const games = detectExistingGameChannels(interaction.guild);
    setDetectedGames(guildId, games);
    setGameReviewPage(guildId, 0);
    if (getCurrentStep(guildId) === 6) {
      setGuildSetting(guildId, 'setup', 'games_substep', 'review');
      await renderStep(interaction, 6); return true;
    }
    await interaction.editReply({
      content: buildGameReviewContent(guildId) + '\n\u200b',
      components: buildGameReviewComponents(guildId)
    }).catch(() => {});
    return true;
  }

  if (interaction.customId === CUSTOM_IDS.gameReviewPrev) {
    await interaction.deferUpdate().catch(() => {});
    const page = getGameReviewPage(guildId);
    if (page > 0) setGameReviewPage(guildId, page - 1);
    setGuildSetting(guildId, 'setup', 'games_substep', 'review');
    await renderStep(interaction, 6); return true;
  }

  if (interaction.customId === CUSTOM_IDS.gameReviewContinue) {
    await interaction.deferUpdate().catch(() => {});
    const games = getDetectedGames(guildId);
    const page = getGameReviewPage(guildId);
    const totalPages = Math.max(1, Math.ceil(games.length / MAX_REVIEW_GAMES));
    if (page + 1 < totalPages) {
      setGameReviewPage(guildId, page + 1);
      setGuildSetting(guildId, 'setup', 'games_substep', 'review');
      await renderStep(interaction, 6); return true;
    }
    setGameLinkCursor(guildId, 0);
    setGameLinkActiveType(guildId, null);
    for (const g of games) {
      const existing = listSetupGames(guildId).find((sg) => sg.name.toLowerCase() === (g.steamName || g.baseName).toLowerCase());
      if (!existing) addSetupGame(guildId, { name: g.steamName || g.baseName, steam_app_id: g.steamAppId || null });
    }
    setGameReviewPage(guildId, 0);
    if (getCurrentStep(guildId) === 6) {
      if (games.length === 0) {
        setGuildSetting(guildId, 'setup', 'games_substep', 'edit');
      } else {
        setGuildSetting(guildId, 'setup', 'games_substep', 'link');
      }
      await renderStep(interaction, 6); return true;
    }
    if (games.length === 0) {
      setGuildSetting(guildId, 'setup', 'step', 3);
      setChannelCursor(guildId, 0);
      const detectedC = getCachedAutoDetectedChannels(guildId, interaction.guild, CHANNEL_SLOTS);
      const slotsC = getActiveSlotsForInstall(guildId, interaction.guild);
      const anyFoundC = slotsC.some((s) => detectedC[s.key]);
      if (anyFoundC && !getGuildSetting(guildId, 'setup', 'channel_autodetect_done', false)) {
        await interaction.editReply({
          content: buildChannelAutoDetectContent(guildId, interaction.guild) + '\n\u200b',
          components: buildChannelAutoDetectComponents()
        }).catch(() => {});
      } else {
        await renderStep(interaction, 3);
      }
    } else {
      await interaction.editReply({
        content: buildGameLinkContent(guildId) + '\n\u200b',
        components: buildGameLinkComponents(guildId, interaction.guild)
      }).catch(() => {});
    }
    return true;
  }

  if (interaction.customId === CUSTOM_IDS.gameReviewAdd) {
    const modal = new ModalBuilder()
      .setCustomId(CUSTOM_IDS.gameReviewAddModal)
      .setTitle('Ajouter un jeu')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('name')
            .setLabel('Nom du jeu')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(80)
            .setPlaceholder('Ex: Minecraft, Valorant…')
        )
      );
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId === CUSTOM_IDS.gameReviewAddModal) {
    await interaction.deferUpdate().catch(() => {});
    const name = interaction.fields.getTextInputValue('name').trim();
    let games = getDetectedGames(guildId);
    if (name) {
      const steamMatch = matchGameFromChannelName(name);
      games.push({ baseName: name, channels: [], steamName: steamMatch?.name ?? null, steamAppId: steamMatch?.appid ?? null });
      setDetectedGames(guildId, games);
    }
    const lastPage = Math.max(0, Math.ceil(games.length / MAX_REVIEW_GAMES) - 1);
    setGameReviewPage(guildId, lastPage);
    if (getCurrentStep(guildId) === 6) {
      setGuildSetting(guildId, 'setup', 'games_substep', 'review');
      await renderStep(interaction, 6); return true;
    }
    await interaction.editReply({
      content: buildGameReviewContent(guildId) + '\n\u200b',
      components: buildGameReviewComponents(guildId)
    }).catch(() => {});
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith(CUSTOM_IDS.gameReviewRemovePrefix)) {
    await interaction.deferUpdate().catch(() => {});
    const idx = Number(interaction.customId.slice(CUSTOM_IDS.gameReviewRemovePrefix.length));
    const games = getDetectedGames(guildId);
    games.splice(idx, 1);
    setDetectedGames(guildId, games);
    if (getCurrentStep(guildId) === 6) {
      if (games.length === 0) setGuildSetting(guildId, 'setup', 'games_substep', 'detect');
      else setGuildSetting(guildId, 'setup', 'games_substep', 'review');
      await renderStep(interaction, 6); return true;
    }
    await interaction.editReply({
      content: buildGameReviewContent(guildId) + '\n\u200b',
      components: buildGameReviewComponents(guildId)
    }).catch(() => {});
    return true;
  }

  if (interaction.customId === CUSTOM_IDS.gameDetectSkip) {
    await interaction.deferUpdate().catch(() => {});
    if (getCurrentStep(guildId) === 6) {
      setGuildSetting(guildId, 'setup', 'games_substep', 'edit');
      await renderStep(interaction, 6); return true;
    }
    setGuildSetting(guildId, 'setup', 'step', 3);
    setChannelCursor(guildId, 0);
    const detected = getCachedAutoDetectedChannels(guildId, interaction.guild, CHANNEL_SLOTS);
    const slots = getActiveSlotsForInstall(guildId, interaction.guild);
    const anyFound = slots.some((s) => detected[s.key]);
    if (anyFound && !getGuildSetting(guildId, 'setup', 'channel_autodetect_done', false)) {
      await interaction.editReply({
        content: buildChannelAutoDetectContent(guildId, interaction.guild) + '\n\u200b',
        components: buildChannelAutoDetectComponents()
      }).catch(() => {});
    } else {
      await renderStep(interaction, 3);
    }
    return true;
  }

  if (interaction.customId === CUSTOM_IDS.channelAutoDetectAccept) {
    await interaction.deferUpdate().catch(() => {});
    const detected = getCachedAutoDetectedChannels(guildId, interaction.guild, CHANNEL_SLOTS);
    const slots = getActiveSlotsForInstall(guildId, interaction.guild);
    for (const slot of slots) {
      if (detected[slot.key]) setGuildSetting(guildId, slot.settingSection, slot.settingKey, detected[slot.key]);
    }
    setGuildSetting(guildId, 'setup', 'channel_autodetect_done', true);
    autoPositionChannelCursor(guildId, interaction.guild);
    await renderStep(interaction, 3);
    return true;
  }

  if (interaction.customId === CUSTOM_IDS.channelAutoDetectSkip) {
    await interaction.deferUpdate().catch(() => {});
    setGuildSetting(guildId, 'setup', 'channel_autodetect_done', true);
    await renderStep(interaction, 3);
    return true;
  }

  if (interaction.customId.startsWith(`${CUSTOM_IDS.gameLinkTypeSelect}:`)) {
    const parts = interaction.customId.split(':');
    const selectedType = parts[parts.length - 1];
    const currentActive = getGameLinkActiveType(guildId);
    setGameLinkActiveType(guildId, currentActive === selectedType ? null : selectedType);
    await interaction.deferUpdate().catch(() => {});
    if (getCurrentStep(guildId) === 6) {
      setGuildSetting(guildId, 'setup', 'games_substep', 'link');
      await renderStep(interaction, 6); return true;
    }
    await interaction.editReply({
      content: buildGameLinkContent(guildId) + '\n\u200b',
      components: buildGameLinkComponents(guildId, interaction.guild)
    }).catch(() => {});
    return true;
  }

  if (interaction.customId.startsWith(`${CUSTOM_IDS.gameLinkChannelPrefix}:`)) {
    const parts = interaction.customId.split(':');
    const gameCursor = Number(parts[parts.length - 2]);
    const channelType = parts[parts.length - 1];
    const channelId = interaction.values?.[0];
    if (channelId) {
      const games = getDetectedGames(guildId);
      const game = games[gameCursor];
      if (game) {
        let ch = game.channels.find((c) => c.type === channelType);
        if (!ch) {
          const channelName = interaction.guild?.channels.cache.get(channelId)?.name || channelId;
          ch = { id: channelId, name: channelName, type: channelType };
          game.channels.push(ch);
        }
        ch.linkedId = channelId;
        ch.linkedName = interaction.guild?.channels.cache.get(channelId)?.name || channelId;
        setDetectedGames(guildId, games);
        const setupGame = listSetupGames(guildId).find((sg) => sg.name.toLowerCase() === game.baseName.toLowerCase());
        if (setupGame) {
          const patch = {};
          if (channelType === 'galerie') patch.galerie_enabled = 1;
          if (channelType === 'changelog') patch.changelog_enabled = 1;
          if (channelType === 'text') patch.text_channel_enabled = 1;
          if (Object.keys(patch).length) updateSetupGame(guildId, setupGame.game_id, patch);
        }
      }
    }
    const allLinked = (() => {
      const games = getDetectedGames(guildId);
      const parts2 = interaction.customId.split(':');
      const gc = Number(parts2[parts2.length - 2]);
      const game = games[gc];
      return game ? game.channels.every((c) => c.linkedId) : false;
    })();
    if (allLinked) {
      const games = getDetectedGames(guildId);
      const parts2 = interaction.customId.split(':');
      const gc = Number(parts2[parts2.length - 2]);
      const nextGc = gc + 1;
      if (nextGc < games.length) {
        setGuildSetting(guildId, 'setup', 'gamelink_cursor', nextGc);
      }
    }
    await interaction.deferUpdate().catch(() => {});
    if (getCurrentStep(guildId) === 6) {
      setGuildSetting(guildId, 'setup', 'games_substep', 'link');
      await renderStep(interaction, 6); return true;
    }
    await interaction.editReply({
      content: buildGameLinkContent(guildId) + '\n\u200b',
      components: buildGameLinkComponents(guildId, interaction.guild)
    }).catch(() => {});
    return true;
  }

  if (interaction.customId === CUSTOM_IDS.gameLinkNext || interaction.customId === CUSTOM_IDS.gameLinkSkip) {
    await interaction.deferUpdate().catch(() => {});
    const games = getDetectedGames(guildId);
    const cursor = getGameLinkCursor(guildId);
    setGameLinkActiveType(guildId, null);
    if (cursor < games.length - 1) {
      setGameLinkCursor(guildId, cursor + 1);
      if (getCurrentStep(guildId) === 6) {
        setGuildSetting(guildId, 'setup', 'games_substep', 'link');
        await renderStep(interaction, 6); return true;
      }
      await interaction.editReply({
        content: buildGameLinkContent(guildId) + '\n\u200b',
        components: buildGameLinkComponents(guildId, interaction.guild)
      }).catch(() => {});
    } else {
      if (getCurrentStep(guildId) === 6) {
        setGuildSetting(guildId, 'setup', 'games_substep', 'edit');
        await renderStep(interaction, 6); return true;
      }
      setGuildSetting(guildId, 'setup', 'step', 3);
      setChannelCursor(guildId, 0);
      const detectedGL = getCachedAutoDetectedChannels(guildId, interaction.guild, CHANNEL_SLOTS);
      const slotsGL = getActiveSlotsForInstall(guildId, interaction.guild);
      const anyFoundGL = slotsGL.some((s) => detectedGL[s.key]);
      if (anyFoundGL && !getGuildSetting(guildId, 'setup', 'channel_autodetect_done', false)) {
        await interaction.editReply({
          content: buildChannelAutoDetectContent(guildId, interaction.guild) + '\n\u200b',
          components: buildChannelAutoDetectComponents()
        }).catch(() => {});
      } else {
        await renderStep(interaction, 3);
      }
    }
    return true;
  }

  // ── Nouvelles options MAJ ──────────────────────────────────────────────────
  if (interaction.customId === CUSTOM_IDS.newOptionsNext) {
    const pending = getPendingNewOptions(guildId, interaction.guild);
    const cursor = getGuildSetting(guildId, 'setup', 'new_options_cursor', 0);
    const next = cursor + 1;
    if (next >= pending.length) {
      setGuildSetting(guildId, 'setup', 'new_options_done', 1);
      await interaction.message?.edit({ content: buildNewOptionsDoneContent(guildId), components: [buildNewOptionsDoneRow(guildId)] }).catch(() => {});
      await interaction.deferUpdate().catch(() => {});
    } else {
      setGuildSetting(guildId, 'setup', 'new_options_cursor', next);
      await interaction.message?.edit({ content: buildNewOptionsContent(guildId, interaction.guild), components: buildNewOptionsComponents(guildId, interaction.guild) }).catch(() => {});
      await interaction.deferUpdate().catch(() => {});
    }
    return true;
  }

  if (interaction.customId === CUSTOM_IDS.newOptionsSkip) {
    setGuildSetting(guildId, 'setup', 'new_options_done', 1);
    await interaction.message?.edit({ content: buildNewOptionsDoneContent(guildId), components: [buildNewOptionsDoneRow(guildId)] }).catch(() => {});
    await interaction.deferUpdate().catch(() => {});
    return true;
  }

  if (interaction.customId === CUSTOM_IDS.finalize) {
    if (getCurrentStep(guildId) < TOTAL_STEPS) {
      await sendSetupMessage(interaction, t('setup.finalizeNotReady', {}, { guildId }));
      return true;
    }
    if (!interaction.guild) return true;

    // Intercept : nouvelles options à configurer ?
    const pending = getPendingNewOptions(guildId, interaction.guild);
    const newOptionsDone = getGuildSetting(guildId, 'setup', 'new_options_done', 0);
    if (pending.length > 0 && !newOptionsDone) {
      setGuildSetting(guildId, 'setup', 'new_options_cursor', 0);
      await interaction.message?.edit({
        content: buildNewOptionsContent(guildId, interaction.guild),
        components: buildNewOptionsComponents(guildId, interaction.guild)
      }).catch(() => {});
      await interaction.deferUpdate().catch(() => {});
      return true;
    }

    // Intercept : proposition de notifier les membres existants ?
    const notifyDone = getGuildSetting(guildId, 'setup', 'notify_members_done', 0);
    if (!notifyDone) {
      setGuildSetting(guildId, 'setup', 'notify_members_done', 1);
      await interaction.message?.edit({
        content: buildNotifyMembersContent(guildId),
        components: buildNotifyMembersComponents()
      }).catch(() => {});
      await interaction.deferUpdate().catch(() => {});
      return true;
    }

    await interaction.deferUpdate().catch(() => {});
    try {
      const { completeGuildSetup } = require('../setup');
      const { recordInstallVersion } = require('../../migrations/channelMigrations');
      const { saveConfigBackup } = require('../../config/configBackup');
      const { version } = require('../../../package.json');
      await completeGuildSetup(interaction.guild);
      recordInstallVersion(guildId, version);
      await saveConfigBackup(interaction.guild);
      if (interaction.channel?.send) {
        await interaction.channel.send({ content: t('setup.finalized', {}, { guildId }) });
      }
    } catch (error) {
      logger.error('Failed to complete guild setup', error);
      if (interaction.channel?.send) {
        await interaction.channel.send({ content: t('setup.validationGenericError', {}, { guildId }) });
      }
    }
    return true;
  }

  if (interaction.customId === CUSTOM_IDS.notifyMembersYes || interaction.customId === CUSTOM_IDS.notifyMembersNo) {
    await interaction.deferUpdate().catch(() => {});
    setGuildSetting(guildId, 'setup', 'finalizing', true);
    await interaction.message?.edit({
      content: '## ⏳ Installation en cours\n\nMerci de patienter pendant que Guardian finalise la configuration de ton serveur.\n\n> Cette opération peut prendre plusieurs minutes selon la taille de ton serveur et les fonctionnalités activées.',
      components: []
    }).catch(() => {});

    if (interaction.customId === CUSTOM_IDS.notifyMembersYes && interaction.guild) {
      const members = await interaction.guild.members.fetch().catch(() => null);
      if (members) {
        let sent = 0;
        for (const member of members.values()) {
          if (member.user.bot) continue;
          await sendInstallNotifyDm(member, guildId);
          sent++;
        }
        logger.info(`Guild ${guildId}: install notify DMs sent to ${sent} members`);
      }
    }

    const user = await interaction.client.users.fetch(interaction.user.id).catch(() => null);
    if (user) {
      await user.send(`✅ La configuration de **${interaction.guild?.name || 'ton serveur'}** est en cours de finalisation par Guardian. Tu recevras une confirmation quand c'est terminé.`).catch(() => {});
    }

    const { completeGuildSetup } = require('../setup');
    const { recordInstallVersion } = require('../../migrations/channelMigrations');
    const { saveConfigBackup } = require('../../config/configBackup');
    const { version } = require('../../../package.json');
    const setupChannel = interaction.channel;
    const announceChannel = findAnnounceChannel(interaction.guild);
    try {
      await completeGuildSetup(interaction.guild);
      recordInstallVersion(guildId, version);
      await saveConfigBackup(interaction.guild);
      // completeGuildSetup supprime le channel setup via cleanupSetupArea ;
      // on envoie donc la confirmation dans un channel existant.
      const target = isChannelStillInGuild(interaction.guild, setupChannel) ? setupChannel : announceChannel;
      if (target?.send) {
        await target.send({ content: t('setup.finalized', {}, { guildId }) });
      }
      if (user) {
        await user.send(`🎉 Guardian est installé sur **${interaction.guild?.name || 'ton serveur'}** !`).catch(() => {});
      }
      setGuildSetting(guildId, 'setup', 'finalizing', false);
    } catch (error) {
      logger.error('Failed to complete guild setup after notify', error);
      setGuildSetting(guildId, 'setup', 'finalizing', false);
      const target = isChannelStillInGuild(interaction.guild, setupChannel) ? setupChannel : announceChannel;
      if (target?.send) {
        await target.send({ content: '❌ Une erreur est survenue pendant la finalisation. Vérifie les permissions et réessaie.' }).catch(() => {});
      }
      if (user) {
        await user.send(`❌ La finalisation de Guardian sur **${interaction.guild?.name || 'ton serveur'}** a échoué.`).catch(() => {});
      }
      return true;
    }

    return true;
  }

  if (interaction.customId === CUSTOM_IDS.prereleaseConfirm) {
    await interaction.deferUpdate().catch(() => {});
    const { version, prerelease } = require('../../../package.json');
    setGuildSetting(guildId, 'bot', 'last_version', version);
    setGuildSetting(guildId, 'bot', 'prerelease_pending', null);
    const confirmed = [
      `## ✅ Mise à jour confirmée — **v${version}** ${prerelease ? '*(test)*' : ''}`,
      ``,
      `Guardian a été mis à jour sur **${interaction.guild?.name}**.`,
      `> La configuration est préservée. Merci d'avoir validé cette version de test.`
    ].join('\n');
    await interaction.message?.edit({ content: confirmed, components: [] }).catch(() => {});
    return true;
  }

  if (interaction.customId === CUSTOM_IDS.prereleaseSkip) {
    await interaction.deferUpdate().catch(() => {});
    const { version } = require('../../../package.json');
    setGuildSetting(guildId, 'bot', 'prerelease_skipped', version);
    const skipped = [
      `## ⏭️ Mise à jour ignorée — v${version} *(test)*`,
      ``,
      `Guardian continue de fonctionner avec la version précédente.`,
      `> Dès que cette version sera stable, la mise à jour s'appliquera automatiquement.`
    ].join('\n');
    await interaction.message?.edit({ content: skipped, components: [] }).catch(() => {});
    return true;
  }

  return false;
}

// ─── Dispatcher principal ────────────────────────────────────────────────────

async function handleSetupInteraction(interaction) {
  const guildId = interaction.guildId;
  if (!guildId) return false;
  if (!interaction.customId || !interaction.customId.startsWith('setup:')) return false;

  const setupOwnerId = getGuildSetting(guildId, 'setup', 'owner_id', null);
  if (setupOwnerId && interaction.user.id !== setupOwnerId) {
    if (interaction.isRepliable()) await replyEphemeral(interaction, t('setup.forbiddenNotOwner', {}, { guildId }));
    return true;
  }

  if (interaction.locale && !getGuildSetting(guildId, 'i18n', 'language', null)) {
    const { detectLanguageFromLocale: _dlfl, setGuildLanguage: _sgl } = require('../i18n');
    _sgl(guildId, _dlfl(interaction.locale));
  }

  return (
    await _handleStep1(guildId, interaction) ||
    await _handleStep2(guildId, interaction) ||
    await _handleStep3(guildId, interaction) ||
    await _handleStep4(guildId, interaction) ||
    await _handleStep5(guildId, interaction) ||
    await _handleStep6(guildId, interaction) ||
    await _handleStep7(guildId, interaction) ||
    await _handleStep4Security(guildId, interaction) ||
    await _handleStep8(guildId, interaction) ||
    await _handleNavAndTransitions(guildId, interaction)
  );
}


module.exports = { _handleNavAndTransitions };
