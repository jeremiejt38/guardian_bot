const { CHANNEL_NAMES } = require('../../config');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { t } = require('../../locales');
const { findGuildTextChannelByName } = require('../utils/channels');
const logger = require('../logs/logger');
const { seedSlowModePanel } = require('../moderation/slowModePanel');
const { seedBehaviorPanel } = require('../moderation/behaviorPanel');
const { seedReportPanel } = require('../moderation/reports');
const { seedMembresPanel } = require('../config/membresPanel');
const { seedChannelsPanel } = require('../config/channelsPanel');
const { seedVocauxPanel } = require('../config/vocauxPanel');
const { seedJeuxPanel } = require('../config/jeuxPanel');
const { seedServeursJeuPanel, refreshServerListPanel } = require('../config/serveursJeuPanel');
const { seedRolesPanel } = require('../config/rolesPanel');
const { seedBotPanel } = require('../config/botPanel');
const { seedGuardianPanel } = require('../config/guardianPanel');

async function seedGuildMessages(guild) {
  try {
    // Welcome message
    const welcome = findGuildTextChannelByName(guild, CHANNEL_NAMES.welcome);
    if (welcome && !welcome.lastMessageId) {
      await welcome.send(t('members.welcomePrompt', { member: guild.name }, { guildId: guild.id }));
    }

    // Game updates / changelogs
    const gameUpdates = findGuildTextChannelByName(guild, CHANNEL_NAMES.changelogs);
    if (gameUpdates && !gameUpdates.lastMessageId) {
      await gameUpdates.send(t('setup.gameUpdatesPlaceholder', {}, { guildId: guild.id }) || '🎮 MISES À JOUR DES JEUX\nCe channel affichera les changelogs des jeux suivis.');
    }

    // Suggestions forum placeholder
    const suggestions = findGuildTextChannelByName(guild, CHANNEL_NAMES.suggestions);
    if (suggestions && !suggestions.lastMessageId) {
      await suggestions.send(t('setup.suggestionsPlaceholder', {}, { guildId: guild.id }) || '💡 SUGGESTIONS & IDÉES\nProposez vos idées ici en créant un nouveau post !');
    }

    const voiceCreate = findGuildTextChannelByName(guild, CHANNEL_NAMES.voiceCreate);
    if (voiceCreate) {
      const LEGACY_IDS = ['init.createChannel', 'creer:open'];
      const recent = await voiceCreate.messages.fetch({ limit: 10 }).catch(() => null);
      const botMessages = recent?.filter((m) => m.author.id === guild.client.user.id) ?? new Map();
      const legacyMsg = [...botMessages.values()].find((m) =>
        m.components?.some((row) => row.components?.some((c) => LEGACY_IDS.includes(c.customId)))
      );
      const hasNewPanel = [...botMessages.values()].some((m) =>
        m.components?.some((row) => row.components?.some((c) => c.customId === 'tempvoice:create'))
      );

      if (legacyMsg) {
        await legacyMsg.delete().catch(() => undefined);
      }

      if (!hasNewPanel) {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('tempvoice:create').setLabel(t('tempVoice.createButton', {}, { guildId: guild.id }) || 'Créer un vocal').setStyle(ButtonStyle.Primary)
        );
        await voiceCreate.send({ content: t('tempVoice.panelText', {}, { guildId: guild.id }) || 'Cliquez pour créer un vocal temporaire', components: [row] }).catch(() => undefined);
      }
    }
    await seedSlowModePanel(guild);
    await seedBehaviorPanel(guild);
    await seedReportPanel(guild);
    await seedMembresPanel(guild);
    await seedChannelsPanel(guild);
    await seedVocauxPanel(guild);
    await seedJeuxPanel(guild);
    await seedServeursJeuPanel(guild);
    await refreshServerListPanel(guild);
    await seedRolesPanel(guild);
    await seedBotPanel(guild);
    await seedGuardianPanel(guild);
  } catch (error) {
    logger.error('Failed to seed guild messages', error);
  }
}

async function refreshGuildPanels(guild) {
  const channelNames = [
    CHANNEL_NAMES.welcome,
    CHANNEL_NAMES.changelogs,
    CHANNEL_NAMES.suggestions,
    CHANNEL_NAMES.voiceCreate,
    CHANNEL_NAMES.autoModeration,
    CHANNEL_NAMES.behavior,
    CHANNEL_NAMES.validation,
    CHANNEL_NAMES.membres,
    CHANNEL_NAMES.channelsConfig,
    CHANNEL_NAMES.vocauxConfig,
    CHANNEL_NAMES.jeux,
    CHANNEL_NAMES.serveurs,
    CHANNEL_NAMES.roles,
    CHANNEL_NAMES.guardianConfig,
    CHANNEL_NAMES.guardian,
  ];

  for (const name of channelNames) {
    const channel = findGuildTextChannelByName(guild, name);
    if (!channel) continue;
    try {
      const recent = await channel.messages.fetch({ limit: 10 }).catch(() => null);
      if (!recent) continue;
      const botMessages = [...recent.values()].filter((m) => m.author.id === guild.client.user.id);
      for (const msg of botMessages) {
        await msg.delete().catch(() => {});
      }
    } catch (err) {
      logger.warn(`refreshGuildPanels: failed to clean messages in #${name}`, { guildId: guild.id, error: err.message });
    }
  }

  await seedGuildMessages(guild);
}

module.exports = { seedGuildMessages, refreshGuildPanels };
