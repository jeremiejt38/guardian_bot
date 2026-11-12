'use strict';

/**
 * suggestions.js
 * Module de gestion du forum de suggestions avec statuts — feature premium.
 */

const { MessageFlags } = require('discord.js');
const { isPremiumFeatureEnabled } = require('../tier/premiumGateUI');
const { getGuildSetting } = require('../config/settings');
const { CHANNELS } = require('../../config');

function isSuggestionThread(thread) {
  const parent = thread.parent;
  if (!parent) return false;
  const suggestionsEnabled = getGuildSetting(thread.guildId, 'channels', 'suggestions_enabled', true);
  if (!suggestionsEnabled) return false;
  return parent.name?.toLowerCase() === CHANNELS.suggestions?.toLowerCase();
}

// @premium-start
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { GRADE_NAMES } = require('../../config');
const { getGradeMappings } = require('../initialisation/gradeMapping');
const logger = require('../logs/logger');

const STATUSES = Object.freeze({
  pending: { label: '⏳ En attente', emoji: '⏳', style: ButtonStyle.Secondary },
  inprogress: { label: '🔄 En cours', emoji: '🔄', style: ButtonStyle.Primary },
  accepted: { label: '✅ Acceptée', emoji: '✅', style: ButtonStyle.Success },
  rejected: { label: '❌ Rejetée', emoji: '❌', style: ButtonStyle.Danger },
});

const STATUS_KEYS = Object.keys(STATUSES);

const IDS = Object.freeze({
  statusPrefix: 'suggestions:status:',
});

function buildStatusCustomId(status, threadId) {
  return `${IDS.statusPrefix}${status}:${threadId}`;
}

function canManageSuggestions(member, guildId) {
  const mappings = getGradeMappings(guildId);
  const ownerRoleId = mappings[GRADE_NAMES.owner];
  const managerRoleId = mappings[GRADE_NAMES.manager];
  return (
    (ownerRoleId && member.roles.cache.has(ownerRoleId)) ||
    (managerRoleId && member.roles.cache.has(managerRoleId))
  );
}

function buildStatusRow(threadId, currentStatus = 'pending') {
  const buttons = STATUS_KEYS.map((key) => {
    const s = STATUSES[key];
    return new ButtonBuilder()
      .setCustomId(buildStatusCustomId(key, threadId))
      .setLabel(s.label)
      .setStyle(s.style)
      .setDisabled(key === currentStatus);
  });
  return new ActionRowBuilder().addComponents(...buttons);
}

async function handleNewSuggestionThreadPremium(thread) {
  if (!isSuggestionThread(thread)) return;
  try {
    const row = buildStatusRow(thread.id, 'pending');
    await thread.send({
      content: [
        `📋 **Gestion de la suggestion** — *réservé aux modérateurs*`,
        `> Utilisez les boutons ci-dessous pour mettre à jour le statut de cette suggestion.`,
        `> Statut actuel : ${STATUSES.pending.label}`,
      ].join('\n'),
      components: [row],
    });
  } catch (err) {
    logger.warn('handleNewSuggestionThread: failed to send status message', { error: err?.message });
  }
}

async function handleSuggestionInteractionPremium(interaction) {
  if (!canManageSuggestions(interaction.member, interaction.guildId)) {
    await interaction.reply({ content: '❌ Seuls les modérateurs peuvent gérer les suggestions.', flags: MessageFlags.Ephemeral });
    return true;
  }

  const parts = interaction.customId.slice(IDS.statusPrefix.length).split(':');
  const newStatus = parts[0];
  const threadId = parts.slice(1).join(':');

  if (!STATUS_KEYS.includes(newStatus)) return false;

  const statusInfo = STATUSES[newStatus];
  const row = buildStatusRow(threadId, newStatus);

  try {
    await interaction.update({
      content: [
        `📋 **Gestion de la suggestion** — *réservé aux modérateurs*`,
        `> Utilisez les boutons ci-dessous pour mettre à jour le statut de cette suggestion.`,
        `> Statut actuel : ${statusInfo.label}`,
        `> Mis à jour par <@${interaction.user.id}>`,
      ].join('\n'),
      components: [row],
    });

    const thread = interaction.channel;
    if (thread?.isThread?.()) {
      const parent = thread.parent;
      if (parent?.availableTags?.length > 0) {
        const matchingTag = parent.availableTags.find(
          (tag) => tag.emoji?.name === statusInfo.emoji || tag.name?.toLowerCase().includes(newStatus)
        );
        if (matchingTag) {
          await thread.setAppliedTags([matchingTag.id]).catch(() => {});
        }
      }
    }
  } catch (err) {
    logger.warn('handleSuggestionInteraction: update failed', { error: err?.message });
  }

  return true;
}
// @premium-end

async function handleNewSuggestionThread(thread) {
  if (!isPremiumFeatureEnabled(thread.guildId)) return;
  // @premium-start
  await handleNewSuggestionThreadPremium(thread);
  // @premium-end
}

async function handleSuggestionInteraction(interaction) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId?.startsWith('suggestions:status:')) return false;

  if (!isPremiumFeatureEnabled(interaction.guildId)) {
    await interaction.reply({ content: '🔒 Cette feature est disponible en **Guardian Premium** uniquement.', flags: MessageFlags.Ephemeral });
    return true;
  }

  // @premium-start
  return await handleSuggestionInteractionPremium(interaction);
  // @premium-end
}

module.exports = {
  isSuggestionThread,
  handleNewSuggestionThread,
  handleSuggestionInteraction,
};

// @premium-start
module.exports = {
  ...module.exports,
  IDS,
  STATUSES,
  STATUS_KEYS,
  buildStatusRow,
  buildStatusCustomId,
  canManageSuggestions,
};
// @premium-end
