const { getDb, getModerationRoleIds } = require('../../database/db');
const {
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');
const { findCategoryByName, findGuildTextChannelByName } = require('../utils/channels');
const { getGuildSetting, setGuildSetting } = require('../config/settings');
const { t } = require('../i18n');
const logger = require('../logs/logger');

const GAME_TYPE_CATEGORIES = {
  text: '🎮 Jeux — Texte',
  galerie: '🖼️ Jeux — Galerie',
  changelog: '📢 Jeux — Updates'
};

function buildGameChannelTopics(gameName) {
  return {
    text: `💬 Discussion et organisation autour de ${gameName}`,
    galerie: `🖼️ Screenshots et contenu visuel de ${gameName}`,
    changelog: `📢 Mises à jour Steam de ${gameName}`
  };
}

function toChannelSlug(name) {
  return String(name || 'jeu')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

async function ensureGameRole(guild, game) {
  if (game.role_id) {
    const role = guild.roles.cache.get(game.role_id);
    if (role) {
      return role;
    }
  }

  const existingByName = guild.roles.cache.find((role) => role.name === game.name);
  if (existingByName) {
    return existingByName;
  }

  return guild.roles.create({
    name: game.name,
    mentionable: true,
    reason: `Guardian game opt-in role for ${game.name}`
  });
}

async function ensureCategory(guild, gameName, permissionOverwrites, existingId) {
  const existingById = existingId ? guild.channels.cache.get(existingId) : null;
  if (existingById?.type === ChannelType.GuildCategory) {
    await existingById.edit({ permissionOverwrites });
    return existingById;
  }

  const existingByName = findCategoryByName(guild, gameName);
  if (existingByName) {
    await existingByName.edit({ permissionOverwrites });
    return existingByName;
  }

  return guild.channels.create({
    name: gameName,
    type: ChannelType.GuildCategory,
    permissionOverwrites
  });
}

async function ensureTextChannel(guild, parentId, channelName, permissionOverwrites, existingId, topic) {
  const existingById = existingId ? guild.channels.cache.get(existingId) : null;
  if (existingById?.type === ChannelType.GuildText) {
    const editPayload = { parent: parentId, permissionOverwrites };
    if (topic) editPayload.topic = topic;
    await existingById.edit(editPayload);
    logger.info('ensureTextChannel updated existing by id', { guildId: guild.id, channelId: existingById.id, name: channelName, topic: topic || null, hasTopicChanged: existingById.topic !== topic });
    return existingById;
  }

  const existingByName = findGuildTextChannelByName(guild, channelName, parentId)
    ?? findGuildTextChannelByName(guild, channelName);
  if (existingByName) {
    const editPayload = { parent: parentId, permissionOverwrites };
    if (topic) editPayload.topic = topic;
    await existingByName.edit(editPayload);
    logger.info('ensureTextChannel updated existing by name', { guildId: guild.id, channelId: existingByName.id, name: channelName, topic: topic || null, hasTopicChanged: existingByName.topic !== topic });
    return existingByName;
  }

  const createPayload = {
    name: channelName,
    type: ChannelType.GuildText,
    parent: parentId,
    permissionOverwrites
  };
  if (topic) createPayload.topic = topic;
  const created = await guild.channels.create(createPayload);
  logger.info('ensureTextChannel created', { guildId: guild.id, channelId: created.id, name: channelName, topic: topic || null });
  return created;
}

function getGamesLayoutMode(guildId) {
  return getGuildSetting(guildId, 'games', 'layout_mode', 'by-type');
}

function getTypeCategoryIds(guildId) {
  return getGuildSetting(guildId, 'games', 'type_category_ids', {});
}

function setTypeCategoryIds(guildId, ids) {
  setGuildSetting(guildId, 'games', 'type_category_ids', ids);
}

function buildGamePermissions(guild, gameRoleId, moderationRoleIds) {
  const permissions = [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }];

  if (gameRoleId) {
    permissions.push({
      id: gameRoleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
    });
  }

  for (const roleId of moderationRoleIds) {
    permissions.push({
      id: roleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
    });
  }

  return permissions;
}

async function ensureTypeCategories(guild, permissions) {
  const stored = getTypeCategoryIds(guild.id);
  const ids = {};

  for (const type of Object.keys(GAME_TYPE_CATEGORIES)) {
    const name = GAME_TYPE_CATEGORIES[type];
    const existingById = stored[type] ? guild.channels.cache.get(stored[type]) : null;
    if (existingById?.type === ChannelType.GuildCategory) {
      await existingById.edit({ permissionOverwrites: permissions });
      ids[type] = existingById.id;
      continue;
    }

    const existingByName = findCategoryByName(guild, name);
    if (existingByName) {
      await existingByName.edit({ permissionOverwrites: permissions });
      ids[type] = existingByName.id;
      continue;
    }

    const created = await guild.channels.create({
      name,
      type: ChannelType.GuildCategory,
      permissionOverwrites: permissions
    });
    ids[type] = created.id;
  }

  setTypeCategoryIds(guild.id, ids);
  return ids;
}

async function provisionGameStructure(guild, game) {
  logger.info('provisionGameStructure start', { guildId: guild.id, gameId: game.game_id, name: game.name, layout: getGamesLayoutMode(guild.id) });
  const db = getDb();
  const moderationRoleIds = getModerationRoleIds(guild.id);
  const gameRole = await ensureGameRole(guild, game);
  const permissions = buildGamePermissions(guild, gameRole?.id, moderationRoleIds);
  const slug = toChannelSlug(game.name);
  const layoutMode = getGamesLayoutMode(guild.id);

  let categoryId = game.category_id || null;
  let typeCategoryIds = null;

  if (layoutMode === 'by-game') {
    const category = await ensureCategory(guild, game.name, permissions, game.category_id);
    categoryId = category.id;
  } else {
    typeCategoryIds = await ensureTypeCategories(guild, permissions);
  }

  const gameTopics = buildGameChannelTopics(game.name);
  logger.info('provisionGameStructure topics', { guildId: guild.id, gameId: game.game_id, text: gameTopics.text, galerie: gameTopics.galerie, changelog: gameTopics.changelog });
  const textEnabled = game.text_channel_enabled === undefined || Number(game.text_channel_enabled) !== 0;
  let textChannelId = game.channel_text_id || null;

  // Si un channel texte existe déjà (même non géré par Guardian), on applique tout de même son topic.
  if (!textEnabled && gameTopics.text) {
    const existingTextById = textChannelId ? guild.channels.cache.get(textChannelId) : null;
    const existingTextByName = findGuildTextChannelByName(guild, slug);
    const existingText = existingTextById ?? existingTextByName;
    if (existingText?.type === ChannelType.GuildText) {
      try {
        await existingText.edit({ topic: gameTopics.text });
      } catch (error) {
        logger.warn('provisionGameStructure could not update topic on existing text channel', { guildId: guild.id, gameId: game.game_id, channelId: existingText.id, error: error.message });
      }
    }
  }

  if (textEnabled) {
    try {
      const parentId = layoutMode === 'by-game' ? categoryId : typeCategoryIds?.text;
      const textChannel = await ensureTextChannel(guild, parentId, slug, permissions, game.channel_text_id, gameTopics.text);
      textChannelId = textChannel.id;
      logger.info('provisionGameStructure text channel ensured', { guildId: guild.id, gameId: game.game_id, channelId: textChannelId, parentId });
    } catch (error) {
      logger.error('provisionGameStructure text channel failed', { guildId: guild.id, gameId: game.game_id, error: error.message });
    }
  }

  let galerieChannelId = game.channel_galerie_id || null;
  if (Number(game.galerie_enabled) === 1) {
    try {
      const parentId = layoutMode === 'by-game' ? categoryId : typeCategoryIds?.galerie;
      const galerieChannel = await ensureTextChannel(
        guild,
        parentId,
        `${slug}-galerie`,
        permissions,
        game.channel_galerie_id,
        gameTopics.galerie
      );
      galerieChannelId = galerieChannel.id;
      logger.info('provisionGameStructure galerie channel ensured', { guildId: guild.id, gameId: game.game_id, channelId: galerieChannelId, parentId });
    } catch (error) {
      logger.error('provisionGameStructure galerie channel failed', { guildId: guild.id, gameId: game.game_id, error: error.message });
    }
  }

  let changelogChannelId = game.channel_changelog_id || null;
  if (Number(game.changelog_enabled) === 1) {
    try {
      const parentId = layoutMode === 'by-game' ? categoryId : typeCategoryIds?.changelog;
      const changelogChannel = await ensureTextChannel(
        guild,
        parentId,
        `${slug}-changelogs`,
        permissions,
        game.channel_changelog_id,
        gameTopics.changelog
      );
      changelogChannelId = changelogChannel.id;
      logger.info('provisionGameStructure changelog channel ensured', { guildId: guild.id, gameId: game.game_id, channelId: changelogChannelId, parentId });
    } catch (error) {
      logger.error('provisionGameStructure changelog channel failed', { guildId: guild.id, gameId: game.game_id, error: error.message });
    }
  }

  try {
    db.prepare(
      `UPDATE games
       SET role_id = ?, category_id = ?, channel_text_id = ?, channel_galerie_id = ?, channel_changelog_id = ?
       WHERE guild_id = ? AND game_id = ?`
    ).run(
      gameRole?.id || null,
      layoutMode === 'by-game' ? categoryId : null,
      textChannelId,
      galerieChannelId,
      changelogChannelId,
      guild.id,
      game.game_id
    );
    logger.info('provisionGameStructure db updated', { guildId: guild.id, gameId: game.game_id, textChannelId, galerieChannelId, changelogChannelId });
  } catch (error) {
    logger.error('provisionGameStructure db update failed', { guildId: guild.id, gameId: game.game_id, error: error.message });
  }
}

function setGamesLayoutMode(guildId, mode) {
  const valid = mode === 'by-game' ? 'by-game' : 'by-type';
  setGuildSetting(guildId, 'games', 'layout_mode', valid);
  return valid;
}

async function rebuildGameLayout(guild, newMode) {
  setGamesLayoutMode(guild.id, newMode);
  if (newMode === 'by-game') {
    const stored = getTypeCategoryIds(guild.id);
    for (const id of Object.values(stored)) {
      const cat = guild.channels.cache.get(id);
      if (cat?.type === ChannelType.GuildCategory) {
        await cat.delete('Guardian: passage en mode categorie par jeu').catch(() => {});
      }
    }
    setTypeCategoryIds(guild.id, {});
  } else {
    const db = getDb();
    const games = db.prepare('SELECT game_id FROM games WHERE guild_id = ?').all(guild.id);
    for (const game of games) {
      const row = db.prepare('SELECT category_id FROM games WHERE guild_id = ? AND game_id = ?').get(guild.id, game.game_id);
      if (row?.category_id) {
        const cat = guild.channels.cache.get(row.category_id);
        if (cat?.type === ChannelType.GuildCategory) {
          await cat.delete('Guardian: passage en mode categorie par type').catch(() => {});
        }
      }
    }
    db.prepare('UPDATE games SET category_id = NULL WHERE guild_id = ?').run(guild.id);
  }
  await provisionGuildGameStructures(guild);
}

async function provisionGuildGameStructures(guild) {
  const db = getDb();
  const games = db
    .prepare(
      `SELECT game_id, guild_id, name, role_id, channel_text_id, channel_galerie_id, channel_changelog_id,
              category_id, galerie_enabled, changelog_enabled, text_channel_enabled
       FROM games WHERE guild_id = ? ORDER BY game_id ASC`
    )
    .all(guild.id);

  for (const game of games) {
    try {
      await provisionGameStructure(guild, game);
    } catch (error) {
      logger.error(`Failed to provision game structure for ${game.name}`, error);
    }
  }
}

function getGuildGames(guildId) {
  const db = getDb();
  return db.prepare('SELECT game_id, name, role_id FROM games WHERE guild_id = ? ORDER BY name').all(guildId);
}

function getMemberGames(guildId, userId) {
  const db = getDb();
  return db.prepare('SELECT game_id FROM member_games WHERE guild_id = ? AND user_id = ?').all(guildId, userId);
}

function setMemberGames(guildId, userId, gameIds) {
  const db = getDb();
  const tx = db.transaction((ids) => {
    db.prepare('DELETE FROM member_games WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
    const insert = db.prepare('INSERT INTO member_games (guild_id, user_id, game_id) VALUES (?, ?, ?)');
    for (const gameId of ids) {
      insert.run(guildId, userId, gameId);
    }
  });

  tx(gameIds);
}

function buildGamesEmbed(guildId, userId) {
  const games = getGuildGames(guildId);
  const selectedIds = new Set(getMemberGames(guildId, userId).map((row) => row.game_id));
  const lines = games.length
    ? games.map((game) => `• ${selectedIds.has(game.game_id) ? '✅' : '➖'} ${game.name}`).join('\n')
    : t(guildId, 'games.noneConfigured');

  return new EmbedBuilder()
    .setTitle(t(guildId, 'games.title'))
    .setDescription(lines);
}

function buildGameSelectRow(guildId, userId, page = 0) {
  const games = getGuildGames(guildId);
  const selectedIds = new Set(getMemberGames(guildId, userId).map((row) => String(row.game_id)));
  const { buildPaginatedSelect } = require('../utils/paginatedSelect');

  if (games.length === 0) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId('gamelist:select:0')
      .setPlaceholder(t(guildId, 'games.selectPlaceholder'))
      .setMinValues(0)
      .setMaxValues(1)
      .addOptions([{ label: t(guildId, 'games.noneAvailable'), value: 'none' }]);
    return [new ActionRowBuilder().addComponents(menu)];
  }

  const options = games.map((game) => ({
    label: game.name,
    value: String(game.game_id),
    default: selectedIds.has(String(game.game_id))
  }));

  const { rows } = buildPaginatedSelect(
    options,
    'gamelist:select',
    t(guildId, 'games.selectPlaceholder'),
    page,
    { minValues: 0, maxValues: Math.min(options.length, 25) }
  );
  return rows;
}

function buildOpenButtonRow(guildId = null) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('gamelist:open')
      .setLabel(t(guildId, 'games.openButton'))
      .setStyle(ButtonStyle.Primary)
  );
}

async function handleOpenGameList(interaction, page = 0) {
  const embed = buildGamesEmbed(interaction.guildId, interaction.user.id);
  const rows = buildGameSelectRow(interaction.guildId, interaction.user.id, page);
  await interaction.reply({
    embeds: [embed],
    components: rows,
    ephemeral: true
  });
}

async function handleGameListSelection(interaction) {
  const values = interaction.values.filter((value) => value !== 'none');
  const selectedIds = values.map((value) => Number.parseInt(value, 10)).filter((value) => Number.isFinite(value));
  setMemberGames(interaction.guildId, interaction.user.id, selectedIds);

  const { parsePaginatedCustomId } = require('../utils/paginatedSelect');
  const { page } = parsePaginatedCustomId(interaction.customId);
  const embed = buildGamesEmbed(interaction.guildId, interaction.user.id);
  const rows = buildGameSelectRow(interaction.guildId, interaction.user.id, page);
  await interaction.update({
    embeds: [embed],
    components: rows
  });
}

async function handleGameListPage(interaction) {
  const { parsePaginatedCustomId } = require('../utils/paginatedSelect');
  const { targetPage } = parsePaginatedCustomId(interaction.customId);
  if (targetPage === null || Number.isNaN(targetPage)) return;
  const embed = buildGamesEmbed(interaction.guildId, interaction.user.id);
  const rows = buildGameSelectRow(interaction.guildId, interaction.user.id, targetPage);
  await interaction.update({ embeds: [embed], components: rows });
}

module.exports = {
  provisionGameStructure,
  provisionGuildGameStructures,
  rebuildGameLayout,
  setGamesLayoutMode,
  buildGameChannelTopics,
  getGuildGames,
  getMemberGames,
  setMemberGames,
  buildOpenButtonRow,
  handleOpenGameList,
  handleGameListSelection,
  handleGameListPage
};
