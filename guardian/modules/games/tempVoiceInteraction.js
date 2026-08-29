const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, StringSelectMenuBuilder } = require('discord.js');
const { getDb } = require('../../database/db');
const { CHANNEL_NAMES, GRADE_NAMES, CATEGORIES } = require('../../config');
const { getGuildSetting } = require('../config/settings');
const { getGradeMappings } = require('../initialisation/gradeMapping');
const { findTextChannelByName } = require('../utils/channels');
const { replyEphemeral } = require('../utils/interactions');
const { getGuildGames } = require('./gameList');
const { createTemporaryVoice, trackTempVoice } = require('./gamesVocal');
const { t } = require('../../locales');
const logger = require('../logs/logger');

const IDS = Object.freeze({
  createButton: 'tempvoice:create',
  gameSelect: 'tempvoice:select'
});

// Messages éphémères invitant l'utilisateur à rejoindre son vocal temporaire
const pendingJoinMessages = new Map();

const LEGACY_CREATE_IDS = ['init.createChannel', 'creer:open'];

function getMemberGrade(guildId, userId) {
  const db = getDb();
  const row = db.prepare('SELECT grade FROM members WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  return row?.grade || null;
}

function canCreateTempVoice(guildId, userId, discordMember) {
  const grade = getMemberGrade(guildId, userId);
  if (grade && grade !== GRADE_NAMES.invite) return true;

  if (discordMember) {
    const mappings = getGradeMappings(guildId);
    const nonInviteRoleIds = [
      mappings[GRADE_NAMES.membre],
      mappings[GRADE_NAMES.moderateur],
      mappings[GRADE_NAMES.manager],
      mappings[GRADE_NAMES.owner]
    ].filter(Boolean);
    if (nonInviteRoleIds.some((id) => discordMember.roles?.cache?.has(id))) return true;
  }

  return false;
}

function buildName(prefix, gameName, suffix, index = 0) {
  const base = [prefix || '', gameName || '', suffix || '']
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (index <= 0) {
    return base;
  }

  return `${base} ${index + 1}`;
}

function getNextVoiceName(guild, prefix, gameName, suffix) {
  let index = 0;
  while (index < 100) {
    const candidate = buildName(prefix, gameName, suffix, index);
    const exists = guild.channels.cache.some(
      (channel) => channel.isVoiceBased() && channel.name.toLowerCase() === candidate.toLowerCase()
    );

    if (!exists) {
      return candidate;
    }

    index += 1;
  }

  return `${buildName(prefix, gameName, suffix, 0)}-${Date.now().toString().slice(-4)}`;
}

function buildGameSelect(guildId, games, page = 0) {
  const chatOption = {
    label: t('tempVoice.chatOption', {}, { guildId }) || '💬 Chat — salon sans jeu',
    value: 'chat',
    description: 'Créer un vocal sans jeu spécifique'
  };
  const gameOptions = games.map((game) => ({
    label: game.name,
    value: String(game.game_id)
  }));

  const { buildPaginatedSelect } = require('../utils/paginatedSelect');
  const options = [chatOption, ...gameOptions];
  const { rows } = buildPaginatedSelect(
    options,
    IDS.gameSelect,
    t('tempVoice.selectPlaceholder', {}, { guildId }),
    page,
    { minValues: 1, maxValues: 1 }
  );
  return rows;
}

async function handleTempVoicePage(interaction) {
  const { parsePaginatedCustomId } = require('../utils/paginatedSelect');
  const { targetPage } = parsePaginatedCustomId(interaction.customId);
  if (targetPage === null || Number.isNaN(targetPage)) return true;
  const games = getGuildGames(interaction.guildId);
  await interaction.update({
    content: t('tempVoice.selectPrompt', {}, { guildId: interaction.guildId }),
    components: buildGameSelect(interaction.guildId, games, targetPage)
  });
  return true;
}

async function ensureTempVoicePanelForGuild(guild) {
  const channel = findTextChannelByName(guild, CHANNEL_NAMES.voiceCreate);
  if (!channel) {
    return;
  }

  const recent = await channel.messages.fetch({ limit: 20 }).catch(() => null);
  const hasPanel = recent?.some(
    (message) =>
      message.author.id === guild.client.user.id &&
      message.components.some((row) => row.components.some((component) => component.customId === IDS.createButton))
  );

  if (hasPanel) {
    return;
  }

  const actions = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(IDS.createButton)
      .setStyle(ButtonStyle.Primary)
      .setLabel(t('tempVoice.createButton', {}, { guildId: guild.id }))
  );

  await channel.send({
    content: t('tempVoice.panelText', {}, { guildId: guild.id }),
    components: [actions]
  }).catch((error) => logger.error('Failed to post temp voice panel', error));
}

async function handleTempVoiceInteraction(interaction) {
  if (!interaction.guildId || !interaction.customId) {
    return false;
  }

  if (interaction.isButton() && (interaction.customId === IDS.createButton || LEGACY_CREATE_IDS.includes(interaction.customId))) {
    if (!canCreateTempVoice(interaction.guildId, interaction.user.id, interaction.member)) {
      await replyEphemeral(interaction, t('tempVoice.forbiddenInvite', {}, { guildId: interaction.guildId }));
      return true;
    }

    const games = getGuildGames(interaction.guildId);

    await interaction.reply({
      content: t('tempVoice.selectPrompt', {}, { guildId: interaction.guildId }),
      components: buildGameSelect(interaction.guildId, games, 0),
      ephemeral: true
    });
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith(`${IDS.gameSelect}:page:`)) {
    return handleTempVoicePage(interaction);
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith(`${IDS.gameSelect}:`)) {
    if (!canCreateTempVoice(interaction.guildId, interaction.user.id, interaction.member)) {
      await interaction.update({
        content: t('tempVoice.forbiddenInvite', {}, { guildId: interaction.guildId }),
        components: []
      });
      return true;
    }

    const selectedValue = interaction.values[0];
    const isChat = selectedValue === 'chat';

    let gameName = null;
    if (!isChat) {
      const gameId = Number.parseInt(selectedValue, 10);
      const games = getGuildGames(interaction.guildId);
      const game = games.find((item) => Number(item.game_id) === gameId);
      if (!game) {
        await interaction.update({
          content: t('tempVoice.invalidGame', {}, { guildId: interaction.guildId }),
          components: []
        });
        return true;
      }
      gameName = game.name;
    }

    const prefix = getGuildSetting(interaction.guildId, 'vocal', 'prefix', '🎮');
    const suffix = isChat ? '' : getGuildSetting(interaction.guildId, 'vocal', 'suffix', '— Partie');
    const userLimit = Math.max(0, Number(getGuildSetting(interaction.guildId, 'vocal', 'member_limit', 0)));
    const category = interaction.guild.channels.cache.find(
      (channel) => channel.type === ChannelType.GuildCategory && channel.name === CATEGORIES.vocaux
    );

    const channelName = isChat
      ? getNextVoiceName(interaction.guild, '💬', 'Chat', '')
      : getNextVoiceName(interaction.guild, prefix, gameName, suffix);
    const created = await createTemporaryVoice(interaction.guild, channelName, userLimit, category?.id || null);
    const trackGameId = isChat ? null : Number.parseInt(selectedValue, 10);
    trackTempVoice(created.id, interaction.guildId, trackGameId, interaction.user.id);

    const requester = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (requester?.voice?.channel) {
      await requester.voice.setChannel(created).catch(() => undefined);
      await interaction.update({ content: `✅ ${t('tempVoice.created', { channel: created.name }, { guildId: interaction.guildId })}`, components: [] }).catch(() => {});
    } else {
      try {
        const msg = await interaction.followUp({
          content: `🎙️ ${t('tempVoice.joinPrompt', { channel: `<#${created.id}>` }, { guildId: interaction.guildId })}`,
          ephemeral: true
        });
        pendingJoinMessages.set(`${interaction.user.id}:${created.id}`, msg);
        await interaction.update({ content: '\u200b', components: [] }).catch(() => {});
      } catch (err) {
        logger.warn('tempVoice: failed to send join prompt', { error: err?.message });
        await interaction.update({ content: `✅ ${t('tempVoice.created', { channel: created.name }, { guildId: interaction.guildId })}`, components: [] }).catch(() => {});
      }
    }

    return true;
  }

  return false;
}

module.exports = {
  IDS,
  ensureTempVoicePanelForGuild,
  handleTempVoiceInteraction,
  pendingJoinMessages
};
