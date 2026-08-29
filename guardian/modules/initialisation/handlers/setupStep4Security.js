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

async function _handleStep4Security(guildId, interaction) {
  if (interaction.customId === CUSTOM_IDS.editWelcomeText) {
    const current = getStep4Config(guildId).welcomeText;
    const modal = new ModalBuilder().setCustomId(CUSTOM_IDS.welcomeModal).setTitle('Message de bienvenue')
      .addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('text')
          .setLabel('Variables: {username}, {servername}, {delay}')
          .setStyle(TextInputStyle.Paragraph).setValue(current).setRequired(false).setMaxLength(500)
      ));
    await interaction.showModal(modal).catch((err) => logger.warn('showModal failed (welcome)', { error: err?.message })); return true;
  }
  if (interaction.isModalSubmit() && interaction.customId === CUSTOM_IDS.welcomeModal) {
    const text = interaction.fields.getTextInputValue('text').trim();
    setGuildSetting(guildId, 'members', 'welcome_text', text);
    await renderStep(interaction, 4); return true;
  }

  if (interaction.customId === CUSTOM_IDS.editJoinPresentation) {
    const current = getStep4Config(guildId).joinServerPresentation;
    const modal = new ModalBuilder().setCustomId(CUSTOM_IDS.joinPresentationModal).setTitle('Présentation #rejoindre-notre-serveur')
      .addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('text')
          .setLabel('Pourquoi rejoindre votre serveur ? (Manager/Owner)')
          .setStyle(TextInputStyle.Paragraph).setValue(current).setRequired(false).setMaxLength(1000)
          .setPlaceholder('Décrivez votre communauté, ses valeurs, ce que les membres y trouvent…')
      ));
    await interaction.showModal(modal).catch((err) => logger.warn('showModal failed (joinPresentation)', { error: err?.message })); return true;
  }

  if (interaction.isModalSubmit() && interaction.customId === CUSTOM_IDS.joinPresentationModal) {
    const text = interaction.fields.getTextInputValue('text').trim();
    setGuildSetting(guildId, 'joinserver', 'presentation', text || null);
    const { seedJoinServerChannel } = require('../members/joinServerChannel');
    const { findChannelByName } = require('../utils/channels');
    const { CHANNELS } = require('../../config');
    const ch = findChannelByName(interaction.guild, CHANNELS.joinServer);
    if (ch) await seedJoinServerChannel(ch, interaction.guild).catch(() => {});
    await renderStep(interaction, 4); return true;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === CUSTOM_IDS.selectOwnerMember) {
    const memberId = interaction.values[0];
    if (memberId === 'none') { await interaction.deferUpdate().catch(() => {}); return true; }
    setGuildSetting(guildId, 'setup', 'pending_owner_id', memberId);
    await interaction.deferUpdate().catch(() => {});
    const members = await interaction.guild.members.fetch().catch(() => null);
    const nonBots = members ? [...members.filter((m) => !m.user.bot).values()].slice(0, 25) : [];
    const mappings = getGradeMappings(guildId);
    const ownerRoleId = mappings[GRADE_NAMES.owner];
    const inviterId = getGuildSetting(guildId, 'setup', 'inviter_id', null);
    const sorted = inviterId
      ? [...nonBots].sort((a, b) => (a.id === inviterId ? -1 : b.id === inviterId ? 1 : 0))
      : nonBots;
    const options = sorted.map((m) => {
      let tag = '';
      if (m.id === memberId) tag = '✅ Sélectionné — ';
      else if (m.id === inviterId) tag = '⭐ A invité le bot — ';
      return {
        label: (m.nickname || m.user.displayName || m.user.username).slice(0, 25),
        value: m.id,
        description: (tag + `@${m.user.username}`).slice(0, 50)
      };
    });
    const selectedMember = nonBots.find((m) => m.id === memberId);
    const selectedName = selectedMember ? (selectedMember.nickname || selectedMember.user.displayName || selectedMember.user.username) : memberId;
    const ownerRoleMention = ownerRoleId ? `<@&${ownerRoleId}>` : '**Owner**';
    const selectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(CUSTOM_IDS.selectOwnerMember)
        .setPlaceholder(`Sélectionné : ${selectedName.slice(0, 40)}`)
        .setMinValues(1).setMaxValues(1)
        .addOptions(options.length ? options : [{ label: 'Aucun membre', value: 'none' }])
    );
    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CUSTOM_IDS.confirmOwner}:${memberId}`)
        .setLabel(`✅ Confirmer ${selectedName.slice(0, 30)} comme Owner`)
        .setStyle(ButtonStyle.Success)
    );
    await interaction.editReply({
      content: [
        `## 👑 Confirmation de l'Owner`,
        '',
        `Le rôle ${ownerRoleMention} sera attribué à **${selectedName}**.`,
        '',
        '> ⚠️ **L\'Owner aura tous les droits Guardian sur ce serveur** : gestion des grades, modération, configuration complète.',
        '> Confirme le membre Owner avant de continuer.'
      ].join('\n'),
      components: [selectRow, confirmRow]
    }).catch(() => {});
    return true;
  }

  if (interaction.customId.startsWith(`${CUSTOM_IDS.confirmOwner}:`)) {
    const memberId = interaction.customId.split(':').pop();
    await interaction.deferUpdate().catch(() => {});
    const mappings = getGradeMappings(guildId);
    const ownerRoleId = mappings[GRADE_NAMES.owner];
    if (ownerRoleId && interaction.guild) {
      try {
        const allMembers = await interaction.guild.members.fetch().catch(() => null);
        if (allMembers) {
          for (const [, m] of allMembers) {
            if (!m.user.bot && m.roles.cache.has(ownerRoleId) && m.id !== memberId) {
              await m.roles.remove(ownerRoleId, 'Guardian setup — retrait Owner précédent').catch(() => {});
            }
          }
        }
        const member = await interaction.guild.members.fetch(memberId);
        await member.roles.add(ownerRoleId, 'Guardian setup — attribution rôle Owner');
        setGuildSetting(guildId, 'setup', 'owner_id', memberId);
      } catch (err) {
        logger.error('Failed to assign owner role', err);
      }
    }
    const guild = interaction.guild;
    try {
      const ownerRoleForPos = guild?.roles?.cache?.get(ownerRoleId);
      const botRole = guild?.members?.me?.roles?.botRole;
      if (ownerRoleForPos && botRole && botRole.position <= ownerRoleForPos.position) {
        await guild.roles.setPositions([
          { role: botRole.id, position: ownerRoleForPos.position + 1 }
        ]).catch((err) => logger.warn(`[setup] reposition bot role failed: ${err?.message}`));
      }
    } catch {}
    const mappingsForSecurity = getGradeMappings(guildId);
    const guardianRoleIds = Object.values(mappingsForSecurity).filter(Boolean);
    const { dangerous, unused } = analyzeNonGuardianRoles(guild, guardianRoleIds);
    const _s = (key, vars) => t(key, vars || {}, { guildId });
    const acknowledgedOnEntry = new Set(getGuildSetting(guildId, 'setup', 'security_acknowledged', []));
    const hasIssues = dangerous.length > 0 || unused.length > 0;
    const alreadyAllResolved = hasIssues && !hasUnresolvedIssues(dangerous, unused, acknowledgedOnEntry);
    if (!hasIssues || alreadyAllResolved) {
      await advanceToStep2AfterSecurity(interaction, guildId);
    } else {
      const securityContent = buildSecurityCheckContent(dangerous, unused, _s, acknowledgedOnEntry);
      const rows = buildSecurityComponents(dangerous, unused, _s, acknowledgedOnEntry);
      await interaction.editReply({ content: securityContent, components: rows }).catch(() => {});
    }
    return true;
  }

  if (interaction.customId === CUSTOM_IDS.securityContinue) {
    const mappingsForSecCont = getGradeMappings(guildId);
    const guardianIdsForCont = Object.values(mappingsForSecCont).filter(Boolean);
    const { dangerous: dCont, unused: uCont } = analyzeNonGuardianRoles(interaction.guild, guardianIdsForCont);
    const acknowledgedCont = new Set(getGuildSetting(guildId, 'setup', 'security_acknowledged', []));
    if (hasUnresolvedIssues(dCont, uCont, acknowledgedCont)) {
      const modal = new ModalBuilder()
        .setCustomId(CUSTOM_IDS.securityConfirmModal)
        .setTitle(t('roleSecurity.modalTitle', {}, { guildId }).slice(0, 45));
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('confirmWord')
            .setLabel(t('roleSecurity.modalLabel', {}, { guildId }).slice(0, 45))
            .setStyle(TextInputStyle.Short)
            .setPlaceholder(t('roleSecurity.modalConfirmWord', {}, { guildId }))
            .setRequired(true)
        )
      );
      await interaction.showModal(modal).catch(() => {});
    } else {
      await interaction.deferUpdate().catch(() => {});
      await advanceToStep2AfterSecurity(interaction, guildId);
    }
    return true;
  }

  if (interaction.customId === CUSTOM_IDS.securityConfirmModal) {
    const confirmWord = interaction.fields?.getTextInputValue('confirmWord')?.trim().toUpperCase();
    const expected = t('roleSecurity.modalConfirmWord', {}, { guildId }).toUpperCase();
    if (confirmWord !== expected) {
      await replyEphemeral(interaction, t('roleSecurity.modalInvalid', {}, { guildId }));
      return true;
    }
    await interaction.deferUpdate().catch(() => {});
    await advanceToStep2AfterSecurity(interaction, guildId);
    return true;
  }

  if (interaction.customId.startsWith(`${CUSTOM_IDS.securityRoleAction}:`)) {
    const roleId = interaction.customId.split(':').pop();
    const role = interaction.guild?.roles.cache.get(roleId);
    const msg = role ? t('roleSecurity.modifyEphemeral', { name: role.name }, { guildId }) : null;
    const saved = getGuildSetting(guildId, 'setup', 'security_acknowledged', []);
    const acknowledged = new Set([...saved, roleId]);
    setGuildSetting(guildId, 'setup', 'security_acknowledged', [...acknowledged]);
    const guild = interaction.guild;
    const mappingsRA = getGradeMappings(guildId);
    const guardianIdsRA = Object.values(mappingsRA).filter(Boolean);
    const { dangerous: dRA, unused: uRA } = analyzeNonGuardianRoles(guild, guardianIdsRA);
    const _ra = (key, vars) => t(key, vars || {}, { guildId });
    const allDone = !hasUnresolvedIssues(dRA, uRA, acknowledged);
    const secContent = buildSecurityCheckContent(dRA, uRA, _ra, acknowledged);
    if (!secContent || allDone) {
      await interaction.deferUpdate().catch(() => {});
      await advanceToStep2AfterSecurity(interaction, guildId);
    } else {
      await interaction.update({ content: secContent, components: buildSecurityComponents(dRA, uRA, _ra, acknowledged) }).catch(() => {
        interaction.deferUpdate().catch(() => {});
      });
      if (msg) await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
    }
    return true;
  }

  if (interaction.customId.startsWith(`${CUSTOM_IDS.securityDeleteUnused}:`)) {
    const roleId = interaction.customId.split(':').pop();
    await interaction.deferUpdate().catch(() => {});
    const guild = interaction.guild;
    if (guild) await guild.roles.fetch().catch(() => {});
    const roleToDelete = guild?.roles.cache.get(roleId);
    if (roleToDelete) await roleToDelete.delete('Guardian setup — suppression rôle inutilisé').catch(() => {});
    if (guild) await guild.roles.fetch().catch(() => {});
    const mappingsDU = getGradeMappings(guildId);
    const guardianIdsDU = Object.values(mappingsDU).filter(Boolean);
    const acknowledged = new Set(getGuildSetting(guildId, 'setup', 'security_acknowledged', []));
    const { dangerous, unused } = analyzeNonGuardianRoles(guild, guardianIdsDU);
    const _sd = (key, vars) => t(key, vars || {}, { guildId });
    const securityContent = buildSecurityCheckContent(dangerous, unused, _sd, acknowledged);
    if (securityContent) {
      await interaction.editReply({ content: securityContent, components: buildSecurityComponents(dangerous, unused, _sd, acknowledged) }).catch(() => {});
    } else {
      await advanceToStep2AfterSecurity(interaction, guildId);
    }
    return true;
  }

  if (interaction.customId.startsWith(`${CUSTOM_IDS.securityKeepUnused}:`)) {
    const roleId = interaction.customId.split(':').pop();
    await interaction.deferUpdate().catch(() => {});
    const guild = interaction.guild;
    const mappingsKU = getGradeMappings(guildId);
    const guardianIdsKU = Object.values(mappingsKU).filter(Boolean);
    const acknowledged = new Set(getGuildSetting(guildId, 'setup', 'security_acknowledged', []));
    acknowledged.add(roleId);
    setGuildSetting(guildId, 'setup', 'security_acknowledged', [...acknowledged]);
    const { dangerous, unused: remainingUnused } = analyzeNonGuardianRoles(guild, [...guardianIdsKU, roleId]);
    const _sk = (key, vars) => t(key, vars || {}, { guildId });
    const securityContent = buildSecurityCheckContent(dangerous, remainingUnused, _sk, acknowledged);
    if (securityContent) {
      await interaction.editReply({ content: securityContent, components: buildSecurityComponents(dangerous, remainingUnused, _sk, acknowledged) }).catch(() => {});
    } else {
      await advanceToStep2AfterSecurity(interaction, guildId);
    }
    return true;
  }

  if (interaction.customId === CUSTOM_IDS.securityDeleteAllUnused) {
    await interaction.deferUpdate().catch(() => {});
    const guild = interaction.guild;
    if (guild) await guild.roles.fetch().catch((e) => logger.warn(`[security] fetch roles failed: ${e?.message}`));
    const mappingsDA = getGradeMappings(guildId);
    const guardianIdsDA = Object.values(mappingsDA).filter(Boolean);
    const { unused: allUnused } = analyzeNonGuardianRoles(guild, guardianIdsDA);
    let deleteFailed = false;
    for (const r of allUnused) {
      const role = guild?.roles.cache.get(r.id);
      if (role) {
        await role.delete('Guardian setup — suppression rôles inutilisés').catch((err) => {
          logger.warn(`[security] delete ${r.name} FAILED: ${err?.message} (code: ${err?.code})`);
          if (err?.code === 50013) deleteFailed = true;
        });
      }
    }
    if (deleteFailed) {
      await interaction.followUp({ content: t('roleSecurity.deletePermissionError', {}, { guildId }), ephemeral: true }).catch(() => {});
    }
    if (guild) await guild.roles.fetch().catch(() => {});
    const acknowledged = new Set(getGuildSetting(guildId, 'setup', 'security_acknowledged', []));
    const { dangerous: dangerousAfter, unused: unusedAfter } = analyzeNonGuardianRoles(guild, guardianIdsDA);
    const _da = (key, vars) => t(key, vars || {}, { guildId });
    const securityContent = buildSecurityCheckContent(dangerousAfter, unusedAfter, _da, acknowledged);
    if (securityContent) {
      await interaction.editReply({ content: securityContent, components: buildSecurityComponents(dangerousAfter, unusedAfter, _da, acknowledged) }).catch(() => {});
    } else {
      await advanceToStep2AfterSecurity(interaction, guildId);
    }
    return true;
  }

  return false;
}



module.exports = { _handleStep4Security };
