const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { getDb } = require('../../database/db');
const { GRADE_NAMES } = require('../../config');
const { getGradeMappings } = require('../initialisation/gradeMapping');
const { findTextChannelByName } = require('../utils/channels');
const { replyEphemeral } = require('../utils/interactions');
const { memberHasAnyRole } = require('../utils/roles');
const { t } = require('../../locales');
const logger = require('../logs/logger');
const { buildGameChannelTopics } = require('./gameList');

const IDS = Object.freeze({
  addButton: 'servergames:add',
  removeButton: 'servergames:remove',
  addModal: 'servergames:add:modal',
  removeSelect: 'servergames:remove:select'
});

function normalizeChannelName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90) || 'jeu';
}

function parseBooleanValue(raw, fallback = false) {
  const value = String(raw || '').trim().toLowerCase();
  if (['1', 'true', 'oui', 'on', 'yes', 'y'].includes(value)) {
    return true;
  }
  if (['0', 'false', 'non', 'off', 'no', 'n'].includes(value)) {
    return false;
  }
  return fallback;
}

function getManagerRoleIds(guildId) {
  const mappings = getGradeMappings(guildId);
  return [
    mappings[GRADE_NAMES.moderateur],
    mappings[GRADE_NAMES.manager],
    mappings[GRADE_NAMES.owner]
  ].filter(Boolean);
}

function canManageServerGames(member, guildId) {
  const mappings = getGradeMappings(guildId);
  const managerRole = mappings[GRADE_NAMES.manager];
  const ownerRole = mappings[GRADE_NAMES.owner];

  if (!member || !managerRole || !ownerRole) {
    return false;
  }

  return memberHasAnyRole(member, [managerRole, ownerRole]);
}

function getGames(guildId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT game_id, name, steam_app_id, role_id, category_id, channel_text_id, channel_galerie_id, channel_changelog_id,
              galerie_enabled, changelog_enabled
       FROM games
       WHERE guild_id = ?
       ORDER BY name`
    )
    .all(guildId);
}

function getGameById(guildId, gameId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT game_id, name, steam_app_id, role_id, category_id, channel_text_id, channel_galerie_id, channel_changelog_id,
              galerie_enabled, changelog_enabled
       FROM games
       WHERE guild_id = ? AND game_id = ?`
    )
    .get(guildId, gameId);
}

function insertGame(guildId, payload) {
  const db = getDb();
  db.prepare(
    `INSERT INTO games (
      guild_id, name, steam_app_id, rawg_id, role_id, channel_text_id, channel_galerie_id, channel_changelog_id, category_id,
      galerie_enabled, changelog_enabled
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    guildId,
    payload.name,
    payload.steamAppId,
    payload.rawgId ?? null,
    payload.roleId,
    payload.channelTextId,
    payload.channelGalerieId,
    payload.channelChangelogId,
    payload.categoryId,
    payload.galerieEnabled ? 1 : 0,
    payload.changelogEnabled ? 1 : 0
  );
}

function deleteGame(guildId, gameId) {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM member_games WHERE guild_id = ? AND game_id = ?').run(guildId, gameId);
    db.prepare('DELETE FROM changelogs_seen WHERE game_id = ?').run(gameId);
    db.prepare('DELETE FROM games WHERE guild_id = ? AND game_id = ?').run(guildId, gameId);
  });

  tx();
}

async function ensureServerGamesPanelForGuild(guild) {
  const channel = findTextChannelByName(guild, 'jeux-serveur');
  if (!channel) {
    return;
  }

  const recent = await channel.messages.fetch({ limit: 30 }).catch(() => null);
  const hasPanel = recent?.some(
    (message) =>
      message.author.id === guild.client.user.id &&
      message.components.some((row) => row.components.some((component) => component.customId === IDS.addButton))
  );

  if (hasPanel) {
    return;
  }

  const actions = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(IDS.addButton)
      .setStyle(ButtonStyle.Primary)
      .setLabel(t('serverGames.addButton', {}, { guildId: guild.id })),
    new ButtonBuilder()
      .setCustomId(IDS.removeButton)
      .setStyle(ButtonStyle.Danger)
      .setLabel(t('serverGames.removeButton', {}, { guildId: guild.id }))
  );

  await channel.send({
    content: t('serverGames.panelText', {}, { guildId: guild.id }),
    components: [actions]
  }).catch((error) => logger.error('Failed to send server games panel', error));
}

function buildGameCategoryOverwrites(guild, gameRoleId) {
  const managerRoles = getManagerRoleIds(guild.id);

  return [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: gameRoleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages]
    },
    ...managerRoles.map((roleId) => ({
      id: roleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages]
    }))
  ];
}

async function createDiscordResourcesForGame(guild, gameName, galerieEnabled, changelogEnabled) {
  const normalized = normalizeChannelName(gameName);
  const topics = buildGameChannelTopics(gameName);

  const role = await guild.roles.create({
    name: gameName.slice(0, 100),
    reason: `Guardian game role for ${gameName}`
  });

  const category = await guild.channels.create({
    name: gameName.slice(0, 100),
    type: ChannelType.GuildCategory,
    permissionOverwrites: buildGameCategoryOverwrites(guild, role.id)
  });

  const text = await guild.channels.create({
    name: normalized,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: topics.text
  });

  let galerie = null;
  if (galerieEnabled) {
    galerie = await guild.channels.create({
      name: `${normalized}-galerie`.slice(0, 100),
      type: ChannelType.GuildText,
      parent: category.id,
      topic: topics.galerie
    });
  }

  let changelog = null;
  if (changelogEnabled) {
    changelog = await guild.channels.create({
      name: `${normalized}-changelogs`.slice(0, 100),
      type: ChannelType.GuildText,
      parent: category.id,
      topic: topics.changelog
      // Read-only for members; bot still has ManageChannel permission.
    });

    const managerRoles = getManagerRoleIds(guild.id);
    await changelog.permissionOverwrites.set([
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: role.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.SendMessages]
      },
      ...managerRoles.map((roleId) => ({
        id: roleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.SendMessages]
      }))
    ]);
  }

  return {
    role,
    category,
    text,
    galerie,
    changelog
  };
}

async function destroyDiscordResourcesForGame(guild, game) {
  if (game.category_id) {
    const category = await guild.channels.fetch(game.category_id).catch(() => null);
    if (category?.type === ChannelType.GuildCategory) {
      for (const child of category.children.cache.values()) {
        await child.delete('Guardian game removed').catch(() => undefined);
      }
      await category.delete('Guardian game removed').catch(() => undefined);
    }
  }

  for (const channelId of [game.channel_text_id, game.channel_galerie_id, game.channel_changelog_id]) {
    if (!channelId) {
      continue;
    }
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (channel) {
      await channel.delete('Guardian game removed').catch(() => undefined);
    }
  }

  if (game.role_id) {
    const role = await guild.roles.fetch(game.role_id).catch(() => null);
    if (role) {
      await role.delete('Guardian game removed').catch(() => undefined);
    }
  }
}

function buildRemoveSelect(guildId, games, page = 0) {
  const options = games.map((game) => ({
    label: game.name,
    value: String(game.game_id)
  }));

  const { buildPaginatedSelect } = require('../utils/paginatedSelect');
  const { rows } = buildPaginatedSelect(
    options,
    IDS.removeSelect,
    t('serverGames.removeSelectPlaceholder', {}, { guildId }),
    page,
    { minValues: 1, maxValues: 1 }
  );
  return rows;
}

async function handleServerGamesPage(interaction) {
  const { parsePaginatedCustomId } = require('../utils/paginatedSelect');
  const { targetPage } = parsePaginatedCustomId(interaction.customId);
  if (targetPage === null || Number.isNaN(targetPage)) return true;
  const games = listServerGames(interaction.guildId);
  await interaction.update({
    content: t('serverGames.removeSelectPrompt', {}, { guildId: interaction.guildId }),
    components: buildRemoveSelect(interaction.guildId, games, targetPage)
  });
  return true;
}

async function handleServerGamesInteraction(interaction) {
  if (!interaction.guildId || !interaction.customId) {
    return false;
  }

  if (interaction.isButton() && interaction.customId === IDS.addButton) {
    if (!canManageServerGames(interaction.member, interaction.guildId)) {
      await replyEphemeral(interaction, t('serverGames.forbidden', {}, { guildId: interaction.guildId }));
      return true;
    }

    const modal = new ModalBuilder()
      .setCustomId(IDS.addModal)
      .setTitle(t('serverGames.addModalTitle', {}, { guildId: interaction.guildId }));

    const nameInput = new TextInputBuilder()
      .setCustomId('name')
      .setLabel(t('serverGames.addModalName', {}, { guildId: interaction.guildId }))
      .setStyle(TextInputStyle.Short)
      .setMaxLength(80)
      .setRequired(true);

    const appIdInput = new TextInputBuilder()
      .setCustomId('appid')
      .setLabel(t('serverGames.addModalAppId', {}, { guildId: interaction.guildId }))
      .setStyle(TextInputStyle.Short)
      .setMaxLength(20)
      .setRequired(false);

    const galerieInput = new TextInputBuilder()
      .setCustomId('galerie')
      .setLabel(t('serverGames.addModalGalerie', {}, { guildId: interaction.guildId }))
      .setStyle(TextInputStyle.Short)
      .setValue('oui')
      .setRequired(false);

    const changelogInput = new TextInputBuilder()
      .setCustomId('changelog')
      .setLabel(t('serverGames.addModalChangelog', {}, { guildId: interaction.guildId }))
      .setStyle(TextInputStyle.Short)
      .setValue('oui')
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(nameInput),
      new ActionRowBuilder().addComponents(appIdInput),
      new ActionRowBuilder().addComponents(galerieInput),
      new ActionRowBuilder().addComponents(changelogInput)
    );

    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isButton() && interaction.customId === IDS.removeButton) {
    if (!canManageServerGames(interaction.member, interaction.guildId)) {
      await replyEphemeral(interaction, t('serverGames.forbidden', {}, { guildId: interaction.guildId }));
      return true;
    }

    const games = getGames(interaction.guildId);
    if (!games.length) {
      await replyEphemeral(interaction, t('serverGames.noGames', {}, { guildId: interaction.guildId }));
      return true;
    }

    await interaction.reply({
      content: t('serverGames.removeSelectPrompt', {}, { guildId: interaction.guildId }),
      components: buildRemoveSelect(interaction.guildId, games, 0),
      ephemeral: true
    });
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith(`${IDS.removeSelect}:page:`)) {
    return handleServerGamesPage(interaction);
  }

  if (interaction.isModalSubmit() && interaction.customId === IDS.addModal) {
    if (!canManageServerGames(interaction.member, interaction.guildId)) {
      await replyEphemeral(interaction, t('serverGames.forbidden', {}, { guildId: interaction.guildId }));
      return true;
    }

    const name = interaction.fields.getTextInputValue('name').trim();
    const appId = interaction.fields.getTextInputValue('appid').trim() || null;
    const galerieEnabled = parseBooleanValue(interaction.fields.getTextInputValue('galerie'), true);
    const changelogEnabled = parseBooleanValue(interaction.fields.getTextInputValue('changelog'), true);

    const existing = getGames(interaction.guildId).find((game) => game.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      await replyEphemeral(interaction, t('serverGames.alreadyExists', { name }, { guildId: interaction.guildId }));
      return true;
    }

    try {
      const resources = await createDiscordResourcesForGame(interaction.guild, name, galerieEnabled, changelogEnabled);

      insertGame(interaction.guildId, {
        name,
        steamAppId: appId,
        roleId: resources.role.id,
        channelTextId: resources.text.id,
        channelGalerieId: resources.galerie?.id || null,
        channelChangelogId: resources.changelog?.id || null,
        categoryId: resources.category.id,
        galerieEnabled,
        changelogEnabled
      });

      await replyEphemeral(interaction, t('serverGames.created', { name }, { guildId: interaction.guildId }));
    } catch (error) {
      logger.error('Failed to create server game', error);
      await replyEphemeral(interaction, t('serverGames.creationFailed', {}, { guildId: interaction.guildId }));
    }

    return true;
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith(`${IDS.removeSelect}:`)) {
    if (!canManageServerGames(interaction.member, interaction.guildId)) {
      await replyEphemeral(interaction, t('serverGames.forbidden', {}, { guildId: interaction.guildId }));
      return true;
    }

    const gameId = Number.parseInt(interaction.values[0], 10);
    if (!Number.isInteger(gameId)) {
      await interaction.update({
        content: t('serverGames.invalidSelection', {}, { guildId: interaction.guildId }),
        components: []
      });
      return true;
    }

    const game = getGameById(interaction.guildId, gameId);
    if (!game) {
      await interaction.update({
        content: t('serverGames.notFound', {}, { guildId: interaction.guildId }),
        components: []
      });
      return true;
    }

    try {
      await destroyDiscordResourcesForGame(interaction.guild, game);
      deleteGame(interaction.guildId, gameId);

      await interaction.update({
        content: t('serverGames.deleted', { name: game.name }, { guildId: interaction.guildId }),
        components: []
      });
    } catch (error) {
      logger.error('Failed to remove server game', error);
      await interaction.update({
        content: t('serverGames.deletionFailed', {}, { guildId: interaction.guildId }),
        components: []
      });
    }

    return true;
  }

  return false;
}

module.exports = {
  IDS,
  insertGame,
  ensureServerGamesPanelForGuild,
  handleServerGamesInteraction
};
