const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType
} = require('discord.js');
const { CHANNELS, GRADE_NAMES } = require('../../config');
const { isNonSteamId } = require('../games/steamGamesList');
const { provisionGameStructure } = require('../games/gameList');
const { t } = require('../i18n');
const { replyEphemeral } = require('../utils/interactions');
const { findTextChannelByName } = require('../utils/channels');
const { getGuildSetting, setGuildSetting } = require('./settings');
const { getGradeMappings } = require('../initialisation/gradeMapping');
const { logConfigChange } = require('./configLogger');
const { getDb } = require('../../database/db');
const logger = require('../logs/logger');

const CHANGELOGS_IDS = Object.freeze({
  toggleGlobal: 'changelogs:toggle:global',
  toggleAggregate: 'changelogs:toggle:aggregate',
  editFrequency: 'changelogs:edit:frequency',
  frequencyModal: 'changelogs:modal:frequency'
});

const IDS = Object.freeze({
  addGame:       'jeux:add',
  editMenu:      'jeux:edit:menu',
  deleteMenu:    'jeux:delete:menu',
  selectEdit:    'jeux:select:edit',
  selectDelete:  'jeux:select:delete',
  addGameModal:  'jeux:modal:add',
  editName:      'jeux:edit:name:',
  nameModal:     'jeux:modal:name:',
  editSteamId:   'jeux:edit:steamid:',
  steamIdModal:  'jeux:modal:steamid:',
  toggleText:    'jeux:toggle:text:',
  toggleGalerie: 'jeux:toggle:galerie:',
  toggleChangelog:'jeux:toggle:changelog:',
  toggleForum:   'jeux:toggle:forum:',
  confirmDelete: 'jeux:confirm:delete:',
  linkChannels:  'jeux:link:channels:',
  linkType:      'jeux:link:type:',
  linkChannel:   'jeux:link:channel:',
  linkDone:      'jeux:link:done:',
  defaultText:   'jeux:default:text',
  defaultGalerie:'jeux:default:galerie',
  defaultChangelog:'jeux:default:changelog',
  defaultForum:  'jeux:default:forum',
});

function hasManagerGrade(member, guildId) {
  const mappings = getGradeMappings(guildId);
  return [GRADE_NAMES.manager, GRADE_NAMES.owner].some(
    (g) => mappings[g] && member.roles.cache.has(mappings[g])
  );
}

function getGamesForGuild(guildId) {
  return getDb().prepare('SELECT * FROM games WHERE guild_id = ?').all(guildId);
}

function buildChangelogsSectionContent(guildId) {
  const enabled = getGuildSetting(guildId, 'changelogs', 'enabled', true);
  const aggregate = getGuildSetting(guildId, 'changelogs', 'aggregate_game_updates', true);
  const frequency = getGuildSetting(guildId, 'changelogs', 'frequency_minutes', 60);
  return [
    `\n**${t(guildId, 'config.changelogs.title')}**`,
    `• **${t(guildId, 'config.changelogs.enabled')}** : ${enabled ? '✅' : '❌'}`,
    `• **${t(guildId, 'config.changelogs.aggregate')}** : ${aggregate ? '✅' : '❌'}`,
    `• **${t(guildId, 'config.changelogs.frequency')}** : ${frequency} min`
  ].join('\n');
}

function buildPanelContent(guildId) {
  const games = getGamesForGuild(guildId);
  const lines = [`**${t(guildId, 'config.jeux.title')}**\n`];
  if (games.length === 0) {
    lines.push(t(guildId, 'config.jeux.noGames'));
  } else {
    for (const g of games) {
      lines.push(`• **${g.name}** — Texte: ${g.text_channel_enabled ? '✅' : '❌'} | Galerie: ${g.galerie_enabled ? '✅' : '❌'} | Changelog: ${g.changelog_enabled ? '✅' : '❌'} | Forum: ${g.forum_enabled ? '✅' : '❌'}`);
      if (g.steam_app_id && !isNonSteamId(g.steam_app_id)) {
        lines.push(`  -# *Steam AppID: ${g.steam_app_id}*`);
      } else {
        lines.push(`  -# *Non-Steam (ID: ${g.game_id})*`);
      }
    }
  }
  lines.push(`\n${t(guildId, 'config.jeux.hint')}`);
  lines.push(buildChangelogsSectionContent(guildId));
  return lines.join('\n');
}

function buildMainPanelRow(guildId) {
  const games = getGamesForGuild(guildId);
  const hasGames = games.length > 0;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(IDS.addGame).setLabel('➕ Ajouter un jeu').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(IDS.editMenu).setLabel('✏️ Modifier un jeu').setStyle(ButtonStyle.Primary).setDisabled(!hasGames),
    new ButtonBuilder().setCustomId(IDS.deleteMenu).setLabel('🗑️ Supprimer un jeu').setStyle(ButtonStyle.Danger).setDisabled(!hasGames)
  );
}

function buildChangelogsRow(guildId) {
  const enabled = getGuildSetting(guildId, 'changelogs', 'enabled', true);
  const aggregate = getGuildSetting(guildId, 'changelogs', 'aggregate_game_updates', true);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(CHANGELOGS_IDS.toggleGlobal).setLabel(`Changelogs: ${enabled ? 'ON' : 'OFF'}`).setStyle(enabled ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CHANGELOGS_IDS.toggleAggregate).setLabel(`#game-updates: ${aggregate ? 'ON' : 'OFF'}`).setStyle(aggregate ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CHANGELOGS_IDS.editFrequency).setLabel(t(guildId, 'config.changelogs.editFrequency')).setStyle(ButtonStyle.Primary)
  );
}

function buildGameDefaultsRow(guildId) {
  const text = getGuildSetting(guildId, 'games', 'default_text_channel_enabled', false);
  const galerie = getGuildSetting(guildId, 'games', 'default_galerie_enabled', false);
  const changelog = getGuildSetting(guildId, 'games', 'default_changelog_enabled', false);
  const forum = getGuildSetting(guildId, 'games', 'default_forum_enabled', false);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(IDS.defaultText).setLabel(`💬 Texte: ${text ? 'ON' : 'OFF'}`).setStyle(text ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(IDS.defaultGalerie).setLabel(`🖼️ Galerie: ${galerie ? 'ON' : 'OFF'}`).setStyle(galerie ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(IDS.defaultChangelog).setLabel(`📢 Changelog: ${changelog ? 'ON' : 'OFF'}`).setStyle(changelog ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(IDS.defaultForum).setLabel(`🗂️ Forum: ${forum ? 'ON' : 'OFF'}`).setStyle(forum ? ButtonStyle.Success : ButtonStyle.Secondary)
  );
}

function buildComponents(guildId) {
  return [buildMainPanelRow(guildId), buildChangelogsRow(guildId), buildGameDefaultsRow(guildId)];
}

async function seedJeuxPanel(guild) {
  const channel = findTextChannelByName(guild, CHANNELS.jeux);
  if (!channel) return;
  const msgs = await channel.messages.fetch({ limit: 5 }).catch(() => null);
  const hasPanel = msgs?.some((m) => m.author.id === guild.client.user.id && m.components.length > 0);
  if (hasPanel) return;
  const guildId = guild.id;
  await channel.send({ content: buildPanelContent(guildId), components: buildComponents(guildId) }).catch(() => undefined);
}

async function refreshJeuxPanel(guild) {
  const channel = findTextChannelByName(guild, CHANNELS.jeux);
  if (!channel) return;
  const msgs = await channel.messages.fetch({ limit: 5 }).catch(() => null);
  const panel = msgs?.find((m) => m.author.id === guild.client.user.id && m.components.length >= 0);
  if (!panel) return;
  const guildId = guild.id;
  await panel.edit({ content: buildPanelContent(guildId), components: buildComponents(guildId) }).catch(() => undefined);
}

function buildGameEditRows(gameId, game) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${IDS.editName}${gameId}`).setLabel('✏️ Modifier le nom').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`${IDS.editSteamId}${gameId}`).setLabel('🔑 Modifier Steam ID').setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${IDS.toggleText}${gameId}`).setLabel(`Texte: ${game.text_channel_enabled ? 'ON' : 'OFF'}`).setStyle(game.text_channel_enabled ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${IDS.toggleGalerie}${gameId}`).setLabel(`Galerie: ${game.galerie_enabled ? 'ON' : 'OFF'}`).setStyle(game.galerie_enabled ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${IDS.toggleChangelog}${gameId}`).setLabel(`Changelog: ${game.changelog_enabled ? 'ON' : 'OFF'}`).setStyle(game.changelog_enabled ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${IDS.toggleForum}${gameId}`).setLabel(`Forum: ${game.forum_enabled ? 'ON' : 'OFF'}`).setStyle(game.forum_enabled ? ButtonStyle.Success : ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${IDS.linkChannels}${gameId}`).setLabel('🔗 Lier les channels').setStyle(ButtonStyle.Primary)
    )
  ];
}

const GAMELINK_TYPE_LABELS = Object.freeze({
  text:      { icon: '💬', label: 'Chat texte' },
  changelog: { icon: '📢', label: 'Annonces/Updates' },
  galerie:   { icon: '🖼️', label: 'Galerie' }
});
const GAMELINK_LINKABLE_TYPES = ['text', 'galerie', 'changelog'];

const gameLinkStates = new Map();

function getLinkStateKey(guildId, userId, gameId) {
  return `${guildId}:${userId}:${gameId}`;
}

function getUsedChannelIdsForType(guildId, excludeGameId, type) {
  const db = getDb();
  const column = type === 'text' ? 'channel_text_id' : type === 'galerie' ? 'channel_galerie_id' : 'channel_changelog_id';
  const rows = db.prepare(`SELECT ${column} AS id FROM games WHERE guild_id = ? AND game_id != ? AND ${column} IS NOT NULL`).all(guildId, excludeGameId);
  return new Set(rows.map((r) => r.id));
}

function buildLinkContent(game, state, guild) {
  const lines = [
    `## 🔗 Lier les channels — **${game.name}**`,
    '',
    'Associe les channels existants à ce jeu. Une fois lié, le channel sera déplacé dans la catégorie gérée par Guardian.',
    ''
  ];
  for (const type of GAMELINK_LINKABLE_TYPES) {
    const { icon, label } = GAMELINK_TYPE_LABELS[type];
    const linkedId = state[type];
    const linkedName = linkedId ? guild?.channels?.cache?.get(linkedId)?.name || linkedId : null;
    const active = state.activeType === type ? ' ◀ en cours' : '';
    lines.push(`> ${icon} **${label}** : ${linkedName ? `✅ \`#${linkedName}\`` : '❌ *non lié*'}${active}`);
  }
  return lines.join('\n');
}

function buildLinkComponents(interaction, game, state, page = 0) {
  const guild = interaction.guild;
  const rows = [];
  const typeButtons = GAMELINK_LINKABLE_TYPES.map((type) => {
    const { icon, label } = GAMELINK_TYPE_LABELS[type];
    const linked = !!state[type];
    const isActive = state.activeType === type;
    return new ButtonBuilder()
      .setCustomId(`${IDS.linkType}${game.game_id}:${type}`)
      .setLabel(`${icon} ${label}${linked ? ' ✅' : ''}`)
      .setStyle(isActive ? ButtonStyle.Primary : (linked ? ButtonStyle.Success : ButtonStyle.Secondary));
  });
  rows.push(new ActionRowBuilder().addComponents(...typeButtons));

  if (state.activeType) {
    const type = state.activeType;
    const allowedTypes = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
    const usedIds = getUsedChannelIdsForType(guild.id, game.game_id, type);
    let candidates = Array.from(guild.channels.cache.values())
      .filter((c) => allowedTypes.includes(c.type) && !usedIds.has(c.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({ label: c.name.slice(0, 25), value: c.id, description: `#${c.name}`.slice(0, 50) }));

    if (state[type]) {
      candidates.unshift({ label: '❌ Délier ce channel', value: 'unlink', description: 'Supprimer le lien actuel' });
    }

    if (candidates.length > 0) {
      const { buildPaginatedSelect } = require('../utils/paginatedSelect');
      const baseCustomId = `${IDS.linkChannel}${game.game_id}:${type}`;
      const { rows: selectRows } = buildPaginatedSelect(
        candidates,
        baseCustomId,
        `${GAMELINK_TYPE_LABELS[type].icon} Choisir le channel ${GAMELINK_TYPE_LABELS[type].label}`,
        page,
        { minValues: 1, maxValues: 1 }
      );
      rows.push(...selectRows);
    }
  }

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${IDS.linkDone}${game.game_id}`).setLabel('✅ Terminer').setStyle(ButtonStyle.Success)
  ));
  return rows;
}

async function handleJeuxInteraction(interaction) {
  const { customId, guildId } = interaction;
  if (!customId?.startsWith('jeux:')) return false;

  if (!hasManagerGrade(interaction.member, guildId)) {
    await replyEphemeral(interaction, t(guildId, 'config.managerOnly'));
    return true;
  }

  // ── Ajouter un jeu ──────────────────────────────────────────────────────
  if (interaction.isButton() && customId === IDS.addGame) {
    const modal = new ModalBuilder()
      .setCustomId(IDS.addGameModal)
      .setTitle('Ajouter un jeu')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('name').setLabel('Nom du jeu').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('steam_app_id').setLabel('Steam AppID (optionnel)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(20)
        )
      );
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isModalSubmit() && customId === IDS.addGameModal) {
    const name = interaction.fields.getTextInputValue('name').trim();
    const steamAppId = interaction.fields.getTextInputValue('steam_app_id').trim() || null;
    const defaultText = getGuildSetting(guildId, 'games', 'default_text_channel_enabled', false) ? 1 : 0;
    const defaultGalerie = getGuildSetting(guildId, 'games', 'default_galerie_enabled', false) ? 1 : 0;
    const defaultChangelog = getGuildSetting(guildId, 'games', 'default_changelog_enabled', false) ? 1 : 0;
    const defaultForum = getGuildSetting(guildId, 'games', 'default_forum_enabled', false) ? 1 : 0;
    getDb().prepare('INSERT INTO games (guild_id, name, steam_app_id, galerie_enabled, changelog_enabled, text_channel_enabled, forum_enabled) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      guildId, name, steamAppId, defaultGalerie, defaultChangelog, defaultText, defaultForum
    );
    await logConfigChange(interaction.guild, interaction.user.id, 'game.add', null, { name, steamAppId });
    await refreshJeuxPanel(interaction.guild);
    await replyEphemeral(interaction, `✅ Jeu **${name}** ajouté.`);
    return true;
  }

function buildPaginatedGameSelect(games, baseCustomId, placeholder, page = 0) {
  const { buildPaginatedSelect } = require('../utils/paginatedSelect');
  const options = games.map((g) => ({ label: g.name, value: String(g.game_id) }));
  const { rows } = buildPaginatedSelect(options, baseCustomId, placeholder, page, { minValues: 1, maxValues: 1 });
  return rows;
}

async function handleGameSelectPage(interaction, baseCustomId, placeholder) {
  const { parsePaginatedCustomId } = require('../utils/paginatedSelect');
  const { targetPage } = parsePaginatedCustomId(interaction.customId);
  if (targetPage === null || Number.isNaN(targetPage)) return true;
  const games = getGamesForGuild(interaction.guildId);
  await interaction.update({
    content: placeholder,
    components: buildPaginatedGameSelect(games, baseCustomId, placeholder, targetPage)
  });
  return true;
}

  // ── Modifier un jeu ─────────────────────────────────────────────────────
  if (interaction.isButton() && customId === IDS.editMenu) {
    const games = getGamesForGuild(guildId);
    if (games.length === 0) { await replyEphemeral(interaction, t(guildId, 'config.jeux.noGames')); return true; }
    await interaction.reply({
      content: 'Quel jeu souhaitez-vous modifier ?',
      components: buildPaginatedGameSelect(games, IDS.selectEdit, 'Choisir un jeu…', 0),
      ephemeral: true
    });
    return true;
  }

  if (interaction.isButton() && customId.startsWith(`${IDS.selectEdit}:page:`)) {
    return handleGameSelectPage(interaction, IDS.selectEdit, 'Quel jeu souhaitez-vous modifier ?');
  }

  if (interaction.isStringSelectMenu() && customId.startsWith(`${IDS.selectEdit}:`)) {
    const gameId = Number(interaction.values[0]);
    const game = getDb().prepare('SELECT * FROM games WHERE game_id = ?').get(gameId);
    if (!game) { await replyEphemeral(interaction, t(guildId, 'config.jeux.notFound')); return true; }
    await interaction.reply({
      content: `**${game.name}** — que souhaitez-vous modifier ?`,
      components: buildGameEditRows(gameId, game),
      ephemeral: true
    });
    return true;
  }

  if (interaction.isButton() && customId.startsWith(IDS.linkChannels)) {
    const gameId = Number(customId.slice(IDS.linkChannels.length));
    const game = getDb().prepare('SELECT * FROM games WHERE game_id = ?').get(gameId);
    if (!game) { await replyEphemeral(interaction, t(guildId, 'config.jeux.notFound')); return true; }
    const key = getLinkStateKey(guildId, interaction.user.id, gameId);
    gameLinkStates.set(key, {
      text: game.channel_text_id,
      galerie: game.channel_galerie_id,
      changelog: game.channel_changelog_id,
      activeType: null
    });
    await interaction.reply({
      content: buildLinkContent(game, gameLinkStates.get(key), interaction.guild),
      components: buildLinkComponents(interaction, game, gameLinkStates.get(key), 0),
      ephemeral: true
    });
    return true;
  }

  if (interaction.isButton() && customId.startsWith(IDS.linkType)) {
    const parts = customId.slice(IDS.linkType.length).split(':');
    const gameId = Number(parts[0]);
    const type = parts[1];
    const game = getDb().prepare('SELECT * FROM games WHERE game_id = ?').get(gameId);
    if (!game) { await replyEphemeral(interaction, t(guildId, 'config.jeux.notFound')); return true; }
    await interaction.deferUpdate().catch(() => {});
    const key = getLinkStateKey(guildId, interaction.user.id, gameId);
    const state = gameLinkStates.get(key) || { text: null, galerie: null, changelog: null, activeType: null };
    state.activeType = state.activeType === type ? null : type;
    gameLinkStates.set(key, state);
    await interaction.editReply({
      content: buildLinkContent(game, state, interaction.guild),
      components: buildLinkComponents(interaction, game, state, 0)
    }).catch(() => {});
    return true;
  }

  if (interaction.isButton() && customId.startsWith(IDS.linkChannel) && customId.includes(':page:')) {
    const parts = customId.slice(IDS.linkChannel.length).split(':');
    const gameId = Number(parts[0]);
    const type = parts[1];
    const targetPage = Number(parts[parts.length - 1]);
    const game = getDb().prepare('SELECT * FROM games WHERE game_id = ?').get(gameId);
    if (!game || Number.isNaN(targetPage)) { await interaction.deferUpdate().catch(() => {}); return true; }
    const key = getLinkStateKey(guildId, interaction.user.id, gameId);
    const state = gameLinkStates.get(key) || { text: null, galerie: null, changelog: null, activeType: type };
    state.activeType = type;
    await interaction.deferUpdate().catch(() => {});
    await interaction.editReply({
      content: buildLinkContent(game, state, interaction.guild),
      components: buildLinkComponents(interaction, game, state, targetPage)
    }).catch(() => {});
    return true;
  }

  if (interaction.isStringSelectMenu() && customId.startsWith(IDS.linkChannel)) {
    const parts = customId.slice(IDS.linkChannel.length).split(':');
    const gameId = Number(parts[0]);
    const type = parts[1];
    const currentPage = Number(parts[2] || 0);
    const value = interaction.values[0];
    const game = getDb().prepare('SELECT * FROM games WHERE game_id = ?').get(gameId);
    if (!game) { await replyEphemeral(interaction, t(guildId, 'config.jeux.notFound')); return true; }
    await interaction.deferUpdate().catch(() => {});

    const key = getLinkStateKey(guildId, interaction.user.id, gameId);
    const state = gameLinkStates.get(key) || { text: null, galerie: null, changelog: null, activeType: type };

    const column = type === 'text' ? 'channel_text_id' : type === 'galerie' ? 'channel_galerie_id' : 'channel_changelog_id';
    const flagColumn = type === 'text' ? 'text_channel_enabled' : type === 'galerie' ? 'galerie_enabled' : 'changelog_enabled';
    const linkedId = value === 'unlink' ? null : value;

    getDb().prepare(`UPDATE games SET ${column} = ?, ${flagColumn} = ? WHERE game_id = ?`).run(linkedId, linkedId ? 1 : 0, gameId);
    state[type] = linkedId;
    gameLinkStates.set(key, state);

    const updatedGame = getDb().prepare('SELECT * FROM games WHERE game_id = ?').get(gameId);
    if (linkedId) {
      await provisionGameStructure(interaction.guild, updatedGame).catch((err) => logger.warn(`jeuxPanel: provisionGameStructure failed — ${err.message}`));
    }
    await logConfigChange(interaction.guild, interaction.user.id, `game.${game.name}.${column}`, game[column], linkedId);
    await refreshJeuxPanel(interaction.guild);
    await interaction.editReply({
      content: buildLinkContent(updatedGame, state, interaction.guild),
      components: buildLinkComponents(interaction, updatedGame, state, currentPage)
    }).catch(() => {});
    return true;
  }

  if (interaction.isButton() && customId.startsWith(IDS.linkDone)) {
    const gameId = Number(customId.slice(IDS.linkDone.length));
    const game = getDb().prepare('SELECT * FROM games WHERE game_id = ?').get(gameId);
    if (!game) { await replyEphemeral(interaction, t(guildId, 'config.jeux.notFound')); return true; }
    await interaction.deferUpdate().catch(() => {});
    const key = getLinkStateKey(guildId, interaction.user.id, gameId);
    gameLinkStates.delete(key);
    await interaction.editReply({ content: `✅ Lien des channels terminé pour **${game.name}**.`, components: [] }).catch(() => {});
    return true;
  }

  if (interaction.isButton() && customId.startsWith(IDS.editName)) {
    const gameId = Number(customId.slice(IDS.editName.length));
    const modal = new ModalBuilder().setCustomId(`${IDS.nameModal}${gameId}`).setTitle('Modifier le nom du jeu')
      .addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('name').setLabel('Nouveau nom').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50)
      ));
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isModalSubmit() && customId.startsWith(IDS.nameModal)) {
    const gameId = Number(customId.slice(IDS.nameModal.length));
    const name = interaction.fields.getTextInputValue('name').trim();
    const game = getDb().prepare('SELECT * FROM games WHERE game_id = ?').get(gameId);
    if (!game) { await replyEphemeral(interaction, t(guildId, 'config.jeux.notFound')); return true; }
    getDb().prepare('UPDATE games SET name = ? WHERE game_id = ?').run(name, gameId);
    await logConfigChange(interaction.guild, interaction.user.id, `game.${game.name}.name`, game.name, name);
    await refreshJeuxPanel(interaction.guild);
    await replyEphemeral(interaction, `✅ Nom mis à jour : **${name}**`);
    return true;
  }

  if (interaction.isButton() && customId.startsWith(IDS.editSteamId)) {
    const gameId = Number(customId.slice(IDS.editSteamId.length));
    const modal = new ModalBuilder().setCustomId(`${IDS.steamIdModal}${gameId}`).setTitle(t(guildId, 'config.jeux.steamModalTitle'))
      .addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('appid').setLabel('Steam AppID').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(20)
      ));
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isModalSubmit() && customId.startsWith(IDS.steamIdModal)) {
    const gameId = Number(customId.slice(IDS.steamIdModal.length));
    const appId = interaction.fields.getTextInputValue('appid').trim() || null;
    const game = getDb().prepare('SELECT * FROM games WHERE game_id = ?').get(gameId);
    if (!game) { await replyEphemeral(interaction, t(guildId, 'config.jeux.notFound')); return true; }
    getDb().prepare('UPDATE games SET steam_app_id = ? WHERE game_id = ?').run(appId, gameId);
    await logConfigChange(interaction.guild, interaction.user.id, `game.${game.name}.steam_app_id`, game.steam_app_id, appId);
    await refreshJeuxPanel(interaction.guild);
    await replyEphemeral(interaction, t(guildId, 'config.jeux.steamUpdated', { name: game.name, appId: appId || 'N/A' }));
    return true;
  }

  if (interaction.isButton() && customId.startsWith(IDS.toggleText)) {
    const gameId = Number(customId.slice(IDS.toggleText.length));
    const game = getDb().prepare('SELECT * FROM games WHERE game_id = ?').get(gameId);
    if (!game) { await replyEphemeral(interaction, t(guildId, 'config.jeux.notFound')); return true; }
    await interaction.deferUpdate().catch(() => {});
    const newVal = game.text_channel_enabled ? 0 : 1;
    getDb().prepare('UPDATE games SET text_channel_enabled = ? WHERE game_id = ?').run(newVal, gameId);
    await logConfigChange(interaction.guild, interaction.user.id, `game.${game.name}.text_channel_enabled`, game.text_channel_enabled, newVal);
    await refreshJeuxPanel(interaction.guild);
    const updated = getDb().prepare('SELECT * FROM games WHERE game_id = ?').get(gameId);
    if (newVal) {
      logger.info('jeuxPanel: toggle text ON, calling provisionGameStructure', { guildId, gameId });
      await provisionGameStructure(interaction.guild, updated).catch((err) => logger.warn(`jeuxPanel: provisionGameStructure failed — ${err.message}`));
    }
    await interaction.editReply({ content: `**${game.name}** — que souhaitez-vous modifier ?`, components: buildGameEditRows(gameId, updated) }).catch(() => {});
    return true;
  }

  if (interaction.isButton() && customId.startsWith(IDS.toggleGalerie)) {
    const gameId = Number(customId.slice(IDS.toggleGalerie.length));
    const game = getDb().prepare('SELECT * FROM games WHERE game_id = ?').get(gameId);
    if (!game) { await replyEphemeral(interaction, t(guildId, 'config.jeux.notFound')); return true; }
    await interaction.deferUpdate().catch(() => {});
    const newVal = game.galerie_enabled ? 0 : 1;
    getDb().prepare('UPDATE games SET galerie_enabled = ? WHERE game_id = ?').run(newVal, gameId);
    await logConfigChange(interaction.guild, interaction.user.id, `game.${game.name}.galerie_enabled`, game.galerie_enabled, newVal);
    await refreshJeuxPanel(interaction.guild);
    const updated = getDb().prepare('SELECT * FROM games WHERE game_id = ?').get(gameId);
    if (newVal) await provisionGameStructure(interaction.guild, updated).catch((err) => logger.warn(`jeuxPanel: provisionGameStructure failed — ${err.message}`));
    await interaction.editReply({ content: `**${game.name}** — que souhaitez-vous modifier ?`, components: buildGameEditRows(gameId, updated) }).catch(() => {});
    return true;
  }

  if (interaction.isButton() && customId.startsWith(IDS.toggleChangelog)) {
    const gameId = Number(customId.slice(IDS.toggleChangelog.length));
    const game = getDb().prepare('SELECT * FROM games WHERE game_id = ?').get(gameId);
    if (!game) { await replyEphemeral(interaction, t(guildId, 'config.jeux.notFound')); return true; }
    await interaction.deferUpdate().catch(() => {});
    const newVal = game.changelog_enabled ? 0 : 1;
    getDb().prepare('UPDATE games SET changelog_enabled = ? WHERE game_id = ?').run(newVal, gameId);
    await logConfigChange(interaction.guild, interaction.user.id, `game.${game.name}.changelog_enabled`, game.changelog_enabled, newVal);
    await refreshJeuxPanel(interaction.guild);
    const updated = getDb().prepare('SELECT * FROM games WHERE game_id = ?').get(gameId);
    if (newVal) await provisionGameStructure(interaction.guild, updated).catch((err) => logger.warn(`jeuxPanel: provisionGameStructure failed — ${err.message}`));
    await interaction.editReply({ content: `**${game.name}** — que souhaitez-vous modifier ?`, components: buildGameEditRows(gameId, updated) }).catch(() => {});
    return true;
  }

  if (interaction.isButton() && customId.startsWith(IDS.toggleForum)) {
    const gameId = Number(customId.slice(IDS.toggleForum.length));
    const game = getDb().prepare('SELECT * FROM games WHERE game_id = ?').get(gameId);
    if (!game) { await replyEphemeral(interaction, t(guildId, 'config.jeux.notFound')); return true; }
    await interaction.deferUpdate().catch(() => {});
    const newVal = game.forum_enabled ? 0 : 1;
    getDb().prepare('UPDATE games SET forum_enabled = ? WHERE game_id = ?').run(newVal, gameId);
    await logConfigChange(interaction.guild, interaction.user.id, `game.${game.name}.forum_enabled`, game.forum_enabled, newVal);
    await refreshJeuxPanel(interaction.guild);
    const updated = getDb().prepare('SELECT * FROM games WHERE game_id = ?').get(gameId);
    await interaction.editReply({ content: `**${game.name}** — que souhaitez-vous modifier ?`, components: buildGameEditRows(gameId, updated) }).catch(() => {});
    return true;
  }

  // ── Supprimer un jeu ────────────────────────────────────────────────────
  if (interaction.isButton() && customId === IDS.deleteMenu) {
    const games = getGamesForGuild(guildId);
    if (games.length === 0) { await replyEphemeral(interaction, t(guildId, 'config.jeux.noGames')); return true; }
    await interaction.reply({
      content: 'Quel jeu souhaitez-vous supprimer ?',
      components: buildPaginatedGameSelect(games, IDS.selectDelete, 'Choisir un jeu…', 0),
      ephemeral: true
    });
    return true;
  }

  if (interaction.isButton() && customId.startsWith(`${IDS.selectDelete}:page:`)) {
    return handleGameSelectPage(interaction, IDS.selectDelete, 'Quel jeu souhaitez-vous supprimer ?');
  }

  if (interaction.isStringSelectMenu() && customId.startsWith(`${IDS.selectDelete}:`)) {
    const gameId = Number(interaction.values[0]);
    const game = getDb().prepare('SELECT * FROM games WHERE game_id = ?').get(gameId);
    if (!game) { await replyEphemeral(interaction, t(guildId, 'config.jeux.notFound')); return true; }
    await interaction.reply({
      content: `⚠️ Confirmer la suppression de **${game.name}** ? Cette action est irréversible.`,
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${IDS.confirmDelete}${gameId}`).setLabel('🗑️ Confirmer suppression').setStyle(ButtonStyle.Danger)
      )],
      ephemeral: true
    });
    return true;
  }

  if (interaction.isButton() && customId.startsWith(IDS.confirmDelete)) {
    const gameId = Number(customId.slice(IDS.confirmDelete.length));
    const game = getDb().prepare('SELECT * FROM games WHERE game_id = ?').get(gameId);
    if (!game) { await replyEphemeral(interaction, t(guildId, 'config.jeux.notFound')); return true; }
    getDb().prepare('DELETE FROM member_games WHERE guild_id = ? AND game_id = ?').run(guildId, gameId);
    getDb().prepare('DELETE FROM changelogs_seen WHERE game_id = ?').run(gameId);
    getDb().prepare('DELETE FROM games WHERE game_id = ?').run(gameId);
    await logConfigChange(interaction.guild, interaction.user.id, `game.${game.name}.deleted`, null, null);
    await refreshJeuxPanel(interaction.guild);
    await replyEphemeral(interaction, `✅ Jeu **${game.name}** supprimé.`);
    return true;
  }

  if (interaction.isButton() && customId === CHANGELOGS_IDS.toggleGlobal) {
    const current = getGuildSetting(guildId, 'changelogs', 'enabled', true);
    setGuildSetting(guildId, 'changelogs', 'enabled', !current);
    await logConfigChange(interaction.guild, interaction.user.id, 'changelogs.enabled', current, !current);
    await refreshJeuxPanel(interaction.guild);
    await replyEphemeral(interaction, t(guildId, 'config.changelogs.toggled', { state: !current ? 'ON' : 'OFF' }));
    return true;
  }

  if (interaction.isButton() && customId === CHANGELOGS_IDS.toggleAggregate) {
    const current = getGuildSetting(guildId, 'changelogs', 'aggregate_game_updates', true);
    setGuildSetting(guildId, 'changelogs', 'aggregate_game_updates', !current);
    await logConfigChange(interaction.guild, interaction.user.id, 'changelogs.aggregate_game_updates', current, !current);
    await refreshJeuxPanel(interaction.guild);
    await replyEphemeral(interaction, t(guildId, 'config.changelogs.aggregateToggled', { state: !current ? 'ON' : 'OFF' }));
    return true;
  }

  if (interaction.isButton() && customId === CHANGELOGS_IDS.editFrequency) {
    const modal = new ModalBuilder().setCustomId(CHANGELOGS_IDS.frequencyModal).setTitle(t(guildId, 'config.changelogs.editFrequency'))
      .addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('minutes').setLabel(t(guildId, 'config.changelogs.frequencyLabel'))
          .setStyle(TextInputStyle.Short).setPlaceholder('60').setRequired(true).setMaxLength(4)
      ));
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isModalSubmit() && customId === CHANGELOGS_IDS.frequencyModal) {
    const raw = interaction.fields.getTextInputValue('minutes').trim();
    const minutes = Number.parseInt(raw, 10);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 1440) {
      await replyEphemeral(interaction, t(guildId, 'config.changelogs.invalidFrequency'));
      return true;
    }
    const old = getGuildSetting(guildId, 'changelogs', 'frequency_minutes', 60);
    setGuildSetting(guildId, 'changelogs', 'frequency_minutes', minutes);
    await logConfigChange(interaction.guild, interaction.user.id, 'changelogs.frequency_minutes', old, minutes);
    await refreshJeuxPanel(interaction.guild);
    await replyEphemeral(interaction, t(guildId, 'config.changelogs.frequencyUpdated', { minutes: String(minutes) }));
    return true;
  }

  // ── Paramètres par défaut à l'ajout d'un jeu ─────────────────────────────
  if (interaction.isButton() && customId === IDS.defaultText) {
    const current = getGuildSetting(guildId, 'games', 'default_text_channel_enabled', false);
    setGuildSetting(guildId, 'games', 'default_text_channel_enabled', !current);
    await logConfigChange(interaction.guild, interaction.user.id, 'games.default_text_channel_enabled', current, !current);
    await refreshJeuxPanel(interaction.guild);
    await replyEphemeral(interaction, `💬 Texte par défaut : **${!current ? 'ON' : 'OFF'}**`);
    return true;
  }

  if (interaction.isButton() && customId === IDS.defaultGalerie) {
    const current = getGuildSetting(guildId, 'games', 'default_galerie_enabled', false);
    setGuildSetting(guildId, 'games', 'default_galerie_enabled', !current);
    await logConfigChange(interaction.guild, interaction.user.id, 'games.default_galerie_enabled', current, !current);
    await refreshJeuxPanel(interaction.guild);
    await replyEphemeral(interaction, `🖼️ Galerie par défaut : **${!current ? 'ON' : 'OFF'}**`);
    return true;
  }

  if (interaction.isButton() && customId === IDS.defaultChangelog) {
    const current = getGuildSetting(guildId, 'games', 'default_changelog_enabled', false);
    setGuildSetting(guildId, 'games', 'default_changelog_enabled', !current);
    await logConfigChange(interaction.guild, interaction.user.id, 'games.default_changelog_enabled', current, !current);
    await refreshJeuxPanel(interaction.guild);
    await replyEphemeral(interaction, `📢 Changelog par défaut : **${!current ? 'ON' : 'OFF'}**`);
    return true;
  }

  if (interaction.isButton() && customId === IDS.defaultForum) {
    const current = getGuildSetting(guildId, 'games', 'default_forum_enabled', false);
    setGuildSetting(guildId, 'games', 'default_forum_enabled', !current);
    await logConfigChange(interaction.guild, interaction.user.id, 'games.default_forum_enabled', current, !current);
    await refreshJeuxPanel(interaction.guild);
    await replyEphemeral(interaction, `🗂️ Forum par défaut : **${!current ? 'ON' : 'OFF'}**`);
    return true;
  }

  return false;
}

module.exports = { seedJeuxPanel, refreshJeuxPanel, handleJeuxInteraction };
