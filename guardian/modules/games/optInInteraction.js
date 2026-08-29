const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { getDb } = require('../../database/db');
const { CHANNEL_NAMES } = require('../../config');
const { getGuildGames, getMemberGames, setMemberGames } = require('./gameList');
const { replyEphemeral } = require('../utils/interactions');
const { t } = require('../../locales');
const logger = require('../logs/logger');

const IDS = Object.freeze({
  manage: 'games:manage',
  select: 'games:select'
});

function getMemberGrade(guildId, userId) {
  const db = getDb();
  const row = db.prepare('SELECT grade FROM members WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  return row?.grade || null;
}

function canManageGames(guildId, userId) {
  const grade = getMemberGrade(guildId, userId);
  return grade && grade !== 'invite';
}

function toSelectedIds(rows) {
  return new Set(rows.map((row) => Number(row.game_id)));
}

function buildGameSelect(guildId, games, selected, page = 0) {
  const options = games.map((game) => ({
    label: game.name,
    value: String(game.game_id),
    default: selected.has(Number(game.game_id))
  }));

  const { buildPaginatedSelect } = require('../utils/paginatedSelect');
  const { rows } = buildPaginatedSelect(
    options,
    IDS.select,
    t('games.selectPlaceholder', {}, { guildId }),
    page,
    { minValues: 0, maxValues: Math.min(options.length, 25) }
  );
  return rows;
}

async function handleGameOptInPage(interaction) {
  const { parsePaginatedCustomId } = require('../utils/paginatedSelect');
  const { targetPage } = parsePaginatedCustomId(interaction.customId);
  if (targetPage === null || Number.isNaN(targetPage)) return true;
  const games = getGuildGames(interaction.guildId);
  const selected = toSelectedIds(getMemberGames(interaction.guildId, interaction.user.id));
  await interaction.update({
    content: t('games.selectPrompt', {}, { guildId: interaction.guildId }),
    components: buildGameSelect(interaction.guildId, games, selected, targetPage)
  });
  return true;
}

async function syncGameRoles(member, guildGames, previousIds, nextIds) {
  const added = [...nextIds].filter((id) => !previousIds.has(id));
  const removed = [...previousIds].filter((id) => !nextIds.has(id));

  const byId = new Map(guildGames.map((game) => [Number(game.game_id), game]));

  for (const gameId of added) {
    const roleId = byId.get(gameId)?.role_id;
    if (roleId) {
      await member.roles.add(roleId).catch(() => undefined);
    }
  }

  for (const gameId of removed) {
    const roleId = byId.get(gameId)?.role_id;
    if (roleId) {
      await member.roles.remove(roleId).catch(() => undefined);
    }
  }
}

async function ensureGameControlMessage(channel, guildId) {
  if (!channel?.isTextBased()) {
    return;
  }

  const rows = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(IDS.manage)
      .setStyle(ButtonStyle.Primary)
      .setLabel(t('games.manageButton', {}, { guildId }))
  );

  await channel.send({
    content: t('games.panelText', {}, { guildId }),
    components: [rows]
  }).catch((error) => logger.error('Failed to send games control message', error));
}

async function ensureGameOptInPanelsForGuild(guild) {
  const channels = guild.channels.cache.filter(
    (channel) =>
      channel.isTextBased() &&
      (channel.name === CHANNEL_NAMES.gameChannels || channel.name === CHANNEL_NAMES.gameList)
  );

  for (const channel of channels.values()) {
    const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
    const hasPanel = messages?.some((message) => message.author.id === guild.client.user.id && message.components.length > 0);

    if (!hasPanel) {
      await ensureGameControlMessage(channel, guild.id);
    }
  }
}

async function handleGamesInteraction(interaction) {
  if (!interaction.guildId || !interaction.customId) {
    return false;
  }

  if (interaction.isButton() && interaction.customId === IDS.manage) {
    if (!canManageGames(interaction.guildId, interaction.user.id)) {
      await replyEphemeral(interaction, t('games.forbiddenInvite', {}, { guildId: interaction.guildId }));
      return true;
    }

    const games = getGuildGames(interaction.guildId);
    if (!games.length) {
      await replyEphemeral(interaction, t('games.noGamesConfigured', {}, { guildId: interaction.guildId }));
      return true;
    }

    const selected = toSelectedIds(getMemberGames(interaction.guildId, interaction.user.id));
    await interaction.reply({
      content: t('games.selectPrompt', {}, { guildId: interaction.guildId }),
      components: buildGameSelect(interaction.guildId, games, selected, 0),
      ephemeral: true
    });
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith(`${IDS.select}:page:`)) {
    return handleGameOptInPage(interaction);
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith(`${IDS.select}:`)) {
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member) {
      await replyEphemeral(interaction, t('games.memberMissing', {}, { guildId: interaction.guildId }));
      return true;
    }

    const guildGames = getGuildGames(interaction.guildId);
    const allowedIds = new Set(guildGames.map((game) => Number(game.game_id)));
    const nextIds = new Set(
      interaction.values
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => Number.isInteger(value) && allowedIds.has(value))
    );

    const previousRows = getMemberGames(interaction.guildId, interaction.user.id);
    const previousIds = toSelectedIds(previousRows);

    await syncGameRoles(member, guildGames, previousIds, nextIds);
    setMemberGames(interaction.guildId, interaction.user.id, [...nextIds]);

    const gameNames = guildGames
      .filter((game) => nextIds.has(Number(game.game_id)))
      .map((game) => game.name)
      .join(', ');

    await interaction.update({
      content: t('games.selectionSaved', { games: gameNames || t('games.none', {}, { guildId: interaction.guildId }) }, { guildId: interaction.guildId }),
      components: []
    });
    return true;
  }

  return false;
}

module.exports = {
  IDS,
  ensureGameOptInPanelsForGuild,
  handleGamesInteraction
};
