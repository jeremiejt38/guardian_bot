const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { CHANNELS, GRADE_NAMES } = require('../../config');
const { t } = require('../i18n');
const { replyEphemeral } = require('../utils/interactions');
const { findTextChannelByName } = require('../utils/channels');
const { getGradeMappings } = require('../initialisation/gradeMapping');
const { logConfigChange } = require('./configLogger');
const { getDb } = require('../../database/db');
const logger = require('../logs/logger');
const { queryPlayers } = require('../servers/gameQuery');

const IDS = Object.freeze({
  gameSelect:    'serveurs-jeu:game-select',
  addModalPrefix:'serveurs-jeu:modal:add:',
  removePrefix:  'serveurs-jeu:remove:',
  approvePrefix: 'servers:approve:',
  rejectPrefix:  'servers:reject:',
  addFlow:       'svj:add',
  editMenu:      'svj:edit:menu',
  deleteMenu:    'svj:delete:menu',
  selectGame:    'svj:select:game',
  pageGame:      'svj:page:game:',
  selectEdit:    'svj:select:edit',
  pageEdit:      'svj:page:edit:',
  editInfo:          'svj:edit:info:',
  editModal:          'svj:modal:edit:',
  toggleText:         'svj:toggle:text:',
  toggleGalerie:      'svj:toggle:galerie:',
  toggleChangelog:    'svj:toggle:changelog:',
  toggleForum:        'svj:toggle:forum:',
  selectDelete:       'svj:select:delete',
  pageDelete:         'svj:page:delete:',
  confirmDelete:      'svj:confirm:delete:',
  modalConfirmDelete: 'svj:modal:confirmdelete:',
});

function buildServerEditRows(serverId, server) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${IDS.editInfo}${serverId}`).setLabel('✏️ Modifier infos').setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${IDS.toggleText}${serverId}`).setLabel(`Texte: ${server.text_channel_enabled ? 'ON' : 'OFF'}`).setStyle(server.text_channel_enabled ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${IDS.toggleGalerie}${serverId}`).setLabel(`Galerie: ${server.galerie_enabled ? 'ON' : 'OFF'}`).setStyle(server.galerie_enabled ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${IDS.toggleChangelog}${serverId}`).setLabel(`Changelog: ${server.changelog_enabled ? 'ON' : 'OFF'}`).setStyle(server.changelog_enabled ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${IDS.toggleForum}${serverId}`).setLabel(`Forum: ${server.forum_enabled ? 'ON' : 'OFF'}`).setStyle(server.forum_enabled ? ButtonStyle.Success : ButtonStyle.Secondary)
    )
  ];
}

function hasManagerGrade(member, guildId) {
  const mappings = getGradeMappings(guildId);
  return [GRADE_NAMES.manager, GRADE_NAMES.owner].some(
    (g) => mappings[g] && member.roles.cache.has(mappings[g])
  );
}

function getServers(guildId) {
  return getDb().prepare("SELECT * FROM servers_jeu WHERE guild_id = ? ORDER BY (last_status = 'online') DESC, game, name").all(guildId);
}

function statusEmoji(status) {
  if (status === 'online') return '✅';
  if (status === 'offline') return '❌';
  if (status === 'unstable') return '⚠️';
  return '❓';
}

function buildPanelContent(guildId) {
  const servers = getServers(guildId);
  const lines = [`**${t(guildId, 'config.serveursJeu.title')}**\n`];
  if (servers.length === 0) {
    lines.push(t(guildId, 'config.serveursJeu.noServers'));
  } else {
    for (const s of servers) {
      const status = s.last_status === 'online' ? '🟢' : s.last_status === 'offline' ? '🔴' : s.last_status === 'unstable' ? '🟡' : '⚪';
      lines.push(`${status} **${s.name}** — *${s.game}* — \`${s.ip}:${s.port}\``);
      const lastCheck = s.last_check ? `Dernière vérif : ${s.last_check}` : 'Jamais vérifié';
      lines.push(`  -# *${lastCheck}*`);
    }
  }
  lines.push(`\n${t(guildId, 'config.serveursJeu.hint')}`);
  return lines.join('\n');
}

function getGuildGames(guildId) {
  return getDb().prepare('SELECT game_id, name FROM games WHERE guild_id = ? ORDER BY name').all(guildId);
}

function buildRows(guildId) {
  const servers = getServers(guildId);
  const hasServers = servers.length > 0;
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(IDS.addFlow).setLabel('➕ Ajouter un serveur').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(IDS.editMenu).setLabel('✏️ Modifier un serveur').setStyle(ButtonStyle.Primary).setDisabled(!hasServers),
      new ButtonBuilder().setCustomId(IDS.deleteMenu).setLabel('🗑️ Supprimer un serveur').setStyle(ButtonStyle.Danger).setDisabled(!hasServers)
    )
  ];
}

async function seedServeursJeuPanel(guild) {
  const channel = findTextChannelByName(guild, CHANNELS.serveurs);
  if (!channel) return;
  const msgs = await channel.messages.fetch({ limit: 5 }).catch(() => null);
  const hasPanel = msgs?.some((m) => m.author.id === guild.client.user.id && m.components.length > 0);
  if (hasPanel) return;
  const guildId = guild.id;
  await channel.send({ content: buildPanelContent(guildId), components: buildRows(guildId) }).catch(() => undefined);
}

async function refreshServeursJeuPanel(guild) {
  const channel = findTextChannelByName(guild, CHANNELS.serveurs);
  if (!channel) return;
  const msgs = await channel.messages.fetch({ limit: 5 }).catch(() => null);
  const panel = msgs?.find((m) => m.author.id === guild.client.user.id && m.components.length > 0);
  if (!panel) return;
  const guildId = guild.id;
  await panel.edit({ content: buildPanelContent(guildId), components: buildRows(guildId) }).catch(() => undefined);
}

async function refreshServerListPanel(guild) {
  const channel = findTextChannelByName(guild, CHANNELS.serverList);
  if (!channel) {
    logger.warn(`Guild ${guild.id}: channel '${CHANNELS.serverList}' introuvable — refreshServerListPanel annulé`);
    return;
  }
  const guildId = guild.id;
  const servers = getServers(guildId).filter((s) => s.approved);

  const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  const botMsgs = msgs?.filter((m) => m.author.id === guild.client.user.id) ?? new Map();
  for (const m of botMsgs.values()) await m.delete().catch(() => {});

  if (servers.length === 0) {
    await channel.send({ content: '**🖥️ Serveurs de jeu disponibles**\n_Aucun serveur configuré pour le moment._' }).catch((e) => logger.warn(`Guild ${guildId}: liste-serveurs send failed: ${e.message}`));
    return;
  }

  await channel.send({ content: '**🖥️ Serveurs de jeu disponibles**' }).catch(() => {});

  for (const s of servers) {
    const online = s.last_status === 'online';
    const emoji = online ? '🟢' : s.last_status === 'offline' ? '🔴' : '⚪';
    // Infos de connexion visibles seulement quand le serveur tourne.
    const lines = [`${emoji} **${s.name}** — ${s.game}`, `> Statut : ${online ? 'en ligne' : 'hors ligne'}`];
    if (s.description) lines.push(`> _${s.description}_`);
    if (online) {
      const players = await queryPlayers(s.ip, s.port).catch(() => null);
      lines.push(`> Joueurs : ${players ? `${players.players}${players.max != null ? '/' + players.max : ''}` : 'n/a'}`);
      lines.push(`> IP : ||\`${s.ip}:${s.port}\`||`);
      if (s.password) lines.push(`> 🔑 Mot de passe : ||${s.password}||`);
    }
    const content = lines.join('\n');
    const row = new ActionRowBuilder();
    if (!online && s.pelican_identifier) {
      row.addComponents(new ButtonBuilder()
        .setCustomId(`pelican:start:${s.pelican_identifier}`)
        .setLabel('▶️ Démarrer')
        .setStyle(ButtonStyle.Success));
    } else if (online) {
      row.addComponents(new ButtonBuilder()
        .setCustomId(`server:copy:${s.server_id}`)
        .setLabel('Copier IP')
        .setStyle(ButtonStyle.Secondary));
    }
    await channel.send({ content, components: row.components.length ? [row] : [] }).catch((e) => logger.warn(`Guild ${guildId}: liste-serveurs entry failed: ${e.message}`));
  }
  logger.info(`Guild ${guildId}: liste-serveurs refreshed — ${servers.length} serveur(s)`);
}

async function handleServeursJeuInteraction(interaction) {
  const { customId, guildId } = interaction;

  if (interaction.isButton() && customId?.startsWith('server:copy:')) {
    const serverId = Number(customId.slice('server:copy:'.length));
    const server = getDb().prepare('SELECT ip, port FROM servers_jeu WHERE server_id = ?').get(serverId);
    if (!server) { await replyEphemeral(interaction, '❌ Serveur introuvable.'); return true; }
    await replyEphemeral(interaction, `\`${server.ip}:${server.port}\``);
    return true;
  }

  if (!customId?.startsWith('serveurs-jeu:') && !customId?.startsWith('servers:approve:') && !customId?.startsWith('servers:reject:') && !customId?.startsWith('svj:')) return false;

  if (!hasManagerGrade(interaction.member, guildId)) {
    await replyEphemeral(interaction, t(guildId, 'config.managerOnly'));
    return true;
  }

  // ── Flow Ajouter ─────────────────────────────────────────────────────
  if (interaction.isButton() && customId === IDS.addFlow) {
    const games = getGuildGames(guildId);
    if (games.length === 0) { await replyEphemeral(interaction, t(guildId, 'config.serveursJeu.noGames')); return true; }
    const page = 0;
    const options = games.slice(page * 25, page * 25 + 25).map((g) => ({ label: g.name.slice(0, 100), value: String(g.game_id), description: `Ajouter un serveur pour ${g.name}`.slice(0, 100) }));
    const components = [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(IDS.selectGame).setPlaceholder('Choisir un jeu…').addOptions(options)
    )];
    if (games.length > 25) {
      components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${IDS.pageGame}0`).setLabel('◀ Précédent').setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId(`${IDS.pageGame}1`).setLabel('Suivant ▶').setStyle(ButtonStyle.Secondary)
      ));
    }
    await replyEphemeral(interaction, { content: 'Pour quel jeu ajouter un serveur ?', components });
    return true;
  }

  if (interaction.isButton() && customId.startsWith(IDS.pageGame)) {
    const page = Number(customId.slice(IDS.pageGame.length));
    const games = getGuildGames(guildId);
    const options = games.slice(page * 25, page * 25 + 25).map((g) => ({ label: g.name.slice(0, 100), value: String(g.game_id) }));
    const components = [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(IDS.selectGame).setPlaceholder('Choisir un jeu…').addOptions(options)
    ), new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${IDS.pageGame}${page - 1}`).setLabel('◀ Précédent').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
      new ButtonBuilder().setCustomId(`${IDS.pageGame}${page + 1}`).setLabel('Suivant ▶').setStyle(ButtonStyle.Secondary).setDisabled((page + 1) * 25 >= games.length)
    )];
    await interaction.update({ content: 'Pour quel jeu ajouter un serveur ?', components });
    return true;
  }

  if (interaction.isStringSelectMenu() && customId === IDS.selectGame) {
    const gameId = interaction.values?.[0];
    const game = getDb().prepare('SELECT game_id, name FROM games WHERE guild_id = ? AND game_id = ?').get(guildId, gameId);
    if (!game) { await replyEphemeral(interaction, t(guildId, 'config.serveursJeu.notFound')); return true; }
    const modal = new ModalBuilder()
      .setCustomId(`${IDS.addModalPrefix}${game.game_id}`)
      .setTitle(t(guildId, 'config.serveursJeu.addModalTitle'))
      .addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel(t(guildId, 'config.serveursJeu.nameLabel')).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50).setValue(game.name)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ip').setLabel(t(guildId, 'config.serveursJeu.ipLabel')).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setPlaceholder('Ex: 192.168.1.1 ou play.monserveur.com')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('port').setLabel(t(guildId, 'config.serveursJeu.portLabel')).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(6).setPlaceholder('Ex: 25565')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('password').setLabel(t(guildId, 'config.serveursJeu.passwordLabel')).setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100).setPlaceholder(t(guildId, 'config.serveursJeu.passwordPlaceholder')))
      );
    await interaction.showModal(modal);
    return true;
  }

  // ancien select game (rétrocompat)
  if (interaction.isStringSelectMenu() && customId === IDS.gameSelect) {
    const gameId = interaction.values?.[0];
    const game = getDb().prepare('SELECT game_id, name FROM games WHERE guild_id = ? AND game_id = ?').get(guildId, gameId);
    if (!game) { await replyEphemeral(interaction, t(guildId, 'config.serveursJeu.notFound')); return true; }
    const modal = new ModalBuilder()
      .setCustomId(`${IDS.addModalPrefix}${game.game_id}`)
      .setTitle(t(guildId, 'config.serveursJeu.addModalTitle'))
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('name').setLabel(t(guildId, 'config.serveursJeu.nameLabel')).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50).setValue(game.name)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('ip').setLabel(t(guildId, 'config.serveursJeu.ipLabel')).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setPlaceholder('Ex: 192.168.1.1 ou play.monserveur.com')
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('port').setLabel(t(guildId, 'config.serveursJeu.portLabel')).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(6).setPlaceholder('Ex: 25565')
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('password').setLabel(t(guildId, 'config.serveursJeu.passwordLabel')).setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100).setPlaceholder(t(guildId, 'config.serveursJeu.passwordPlaceholder'))
        )
      );
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isModalSubmit() && customId?.startsWith(IDS.addModalPrefix)) {
    const gameId = customId.slice(IDS.addModalPrefix.length);
    const game = getDb().prepare('SELECT game_id, name FROM games WHERE guild_id = ? AND game_id = ?').get(guildId, gameId);
    const gameName = game?.name ?? 'Inconnu';
    const name = interaction.fields.getTextInputValue('name').trim();
    const ip = interaction.fields.getTextInputValue('ip').trim();
    const portRaw = interaction.fields.getTextInputValue('port').trim();
    const password = interaction.fields.getTextInputValue('password').trim() || null;
    const port = Number.parseInt(portRaw, 10);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      await replyEphemeral(interaction, t(guildId, 'config.serveursJeu.invalidPort'));
      return true;
    }

    getDb().prepare(
      'INSERT INTO servers_jeu (guild_id, name, game, ip, port, password, approved) VALUES (?, ?, ?, ?, ?, ?, 1)'
    ).run(guildId, name, gameName, ip, port, password);

    await logConfigChange(interaction.guild, interaction.user.id, 'servers_jeu.add', null, { name, game: gameName, ip, port, hasPassword: !!password });
    await refreshServeursJeuPanel(interaction.guild);
    await refreshServerListPanel(interaction.guild);
    await replyEphemeral(interaction, t(guildId, 'config.serveursJeu.added', { name }));
    return true;
  }

  if (interaction.isButton() && customId.startsWith(IDS.removePrefix)) {
    const serverId = Number(customId.slice(IDS.removePrefix.length));
    const server = getDb().prepare('SELECT * FROM servers_jeu WHERE server_id = ?').get(serverId);
    if (!server) { await replyEphemeral(interaction, t(guildId, 'config.serveursJeu.notFound')); return true; }
    getDb().prepare('DELETE FROM servers_jeu WHERE server_id = ?').run(serverId);
    await logConfigChange(interaction.guild, interaction.user.id, 'servers_jeu.remove', { name: server.name }, null);
    await refreshServeursJeuPanel(interaction.guild);
    await replyEphemeral(interaction, t(guildId, 'config.serveursJeu.removed', { name: server.name }));
    return true;
  }

  // ── Flow Modifier ────────────────────────────────────────────────────
  if (interaction.isButton() && customId === IDS.editMenu) {
    const servers = getServers(guildId);
    if (servers.length === 0) { await replyEphemeral(interaction, t(guildId, 'config.serveursJeu.noServers')); return true; }
    const options = servers.slice(0, 25).map((s) => ({ label: s.name.slice(0, 100), value: String(s.server_id), description: `${s.game} — ${s.ip}:${s.port}`.slice(0, 100) }));
    const components = [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(IDS.selectEdit).setPlaceholder('Choisir un serveur…').addOptions(options)
    )];
    if (servers.length > 25) {
      components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${IDS.pageEdit}0`).setLabel('◀ Précédent').setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId(`${IDS.pageEdit}1`).setLabel('Suivant ▶').setStyle(ButtonStyle.Secondary)
      ));
    }
    await replyEphemeral(interaction, { content: 'Quel serveur souhaitez-vous modifier ?', components });
    return true;
  }

  if (interaction.isButton() && customId.startsWith(IDS.pageEdit)) {
    const page = Number(customId.slice(IDS.pageEdit.length));
    const servers = getServers(guildId);
    const options = servers.slice(page * 25, page * 25 + 25).map((s) => ({ label: s.name.slice(0, 100), value: String(s.server_id) }));
    const components = [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(IDS.selectEdit).setPlaceholder('Choisir un serveur…').addOptions(options)
    ), new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${IDS.pageEdit}${page - 1}`).setLabel('◀ Précédent').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
      new ButtonBuilder().setCustomId(`${IDS.pageEdit}${page + 1}`).setLabel('Suivant ▶').setStyle(ButtonStyle.Secondary).setDisabled((page + 1) * 25 >= servers.length)
    )];
    await interaction.update({ content: 'Quel serveur souhaitez-vous modifier ?', components });
    return true;
  }

  if (interaction.isStringSelectMenu() && customId === IDS.selectEdit) {
    const serverId = interaction.values?.[0];
    const server = getDb().prepare('SELECT * FROM servers_jeu WHERE server_id = ?').get(serverId);
    if (!server) { await replyEphemeral(interaction, t(guildId, 'config.serveursJeu.notFound')); return true; }
    await replyEphemeral(interaction, { content: `**${server.name}** — que souhaitez-vous modifier ?`, components: buildServerEditRows(serverId, server) });
    return true;
  }

  if (interaction.isButton() && customId.startsWith(IDS.editInfo)) {
    const serverId = customId.slice(IDS.editInfo.length);
    const server = getDb().prepare('SELECT * FROM servers_jeu WHERE server_id = ?').get(serverId);
    if (!server) { await replyEphemeral(interaction, t(guildId, 'config.serveursJeu.notFound')); return true; }
    const modal = new ModalBuilder()
      .setCustomId(`${IDS.editModal}${serverId}`)
      .setTitle(t(guildId, 'config.serveursJeu.editModalTitle'))
      .addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel(t(guildId, 'config.serveursJeu.nameLabel')).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50).setValue(server.name)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ip').setLabel(t(guildId, 'config.serveursJeu.ipLabel')).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setValue(server.ip)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('port').setLabel(t(guildId, 'config.serveursJeu.portLabel')).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(6).setValue(String(server.port))),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('password').setLabel(t(guildId, 'config.serveursJeu.passwordLabel')).setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100).setValue(server.password || ''))
      );
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isButton() && customId.startsWith(IDS.toggleText)) {
    const serverId = customId.slice(IDS.toggleText.length);
    const server = getDb().prepare('SELECT * FROM servers_jeu WHERE server_id = ?').get(serverId);
    if (!server) { await replyEphemeral(interaction, t(guildId, 'config.serveursJeu.notFound')); return true; }
    const newVal = server.text_channel_enabled ? 0 : 1;
    getDb().prepare('UPDATE servers_jeu SET text_channel_enabled = ? WHERE server_id = ?').run(newVal, serverId);
    const updated = getDb().prepare('SELECT * FROM servers_jeu WHERE server_id = ?').get(serverId);
    await interaction.update({ content: `**${server.name}** — que souhaitez-vous modifier ?`, components: buildServerEditRows(serverId, updated) });
    return true;
  }

  if (interaction.isButton() && customId.startsWith(IDS.toggleGalerie)) {
    const serverId = customId.slice(IDS.toggleGalerie.length);
    const server = getDb().prepare('SELECT * FROM servers_jeu WHERE server_id = ?').get(serverId);
    if (!server) { await replyEphemeral(interaction, t(guildId, 'config.serveursJeu.notFound')); return true; }
    const newVal = server.galerie_enabled ? 0 : 1;
    getDb().prepare('UPDATE servers_jeu SET galerie_enabled = ? WHERE server_id = ?').run(newVal, serverId);
    const updated = getDb().prepare('SELECT * FROM servers_jeu WHERE server_id = ?').get(serverId);
    await interaction.update({ content: `**${server.name}** — que souhaitez-vous modifier ?`, components: buildServerEditRows(serverId, updated) });
    return true;
  }

  if (interaction.isButton() && customId.startsWith(IDS.toggleChangelog)) {
    const serverId = customId.slice(IDS.toggleChangelog.length);
    const server = getDb().prepare('SELECT * FROM servers_jeu WHERE server_id = ?').get(serverId);
    if (!server) { await replyEphemeral(interaction, t(guildId, 'config.serveursJeu.notFound')); return true; }
    const newVal = server.changelog_enabled ? 0 : 1;
    getDb().prepare('UPDATE servers_jeu SET changelog_enabled = ? WHERE server_id = ?').run(newVal, serverId);
    const updated = getDb().prepare('SELECT * FROM servers_jeu WHERE server_id = ?').get(serverId);
    await interaction.update({ content: `**${server.name}** — que souhaitez-vous modifier ?`, components: buildServerEditRows(serverId, updated) });
    return true;
  }

  if (interaction.isButton() && customId.startsWith(IDS.toggleForum)) {
    const serverId = customId.slice(IDS.toggleForum.length);
    const server = getDb().prepare('SELECT * FROM servers_jeu WHERE server_id = ?').get(serverId);
    if (!server) { await replyEphemeral(interaction, t(guildId, 'config.serveursJeu.notFound')); return true; }
    const newVal = server.forum_enabled ? 0 : 1;
    getDb().prepare('UPDATE servers_jeu SET forum_enabled = ? WHERE server_id = ?').run(newVal, serverId);
    const updated = getDb().prepare('SELECT * FROM servers_jeu WHERE server_id = ?').get(serverId);
    await interaction.update({ content: `**${server.name}** — que souhaitez-vous modifier ?`, components: buildServerEditRows(serverId, updated) });
    return true;
  }

  if (interaction.isModalSubmit() && customId.startsWith(IDS.editModal)) {
    const serverId = customId.slice(IDS.editModal.length);
    const server = getDb().prepare('SELECT * FROM servers_jeu WHERE server_id = ?').get(serverId);
    if (!server) { await replyEphemeral(interaction, t(guildId, 'config.serveursJeu.notFound')); return true; }
    const name = interaction.fields.getTextInputValue('name').trim();
    const ip = interaction.fields.getTextInputValue('ip').trim();
    const portRaw = interaction.fields.getTextInputValue('port').trim();
    const password = interaction.fields.getTextInputValue('password').trim() || null;
    const port = Number.parseInt(portRaw, 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) { await replyEphemeral(interaction, t(guildId, 'config.serveursJeu.invalidPort')); return true; }
    getDb().prepare('UPDATE servers_jeu SET name = ?, ip = ?, port = ?, password = ? WHERE server_id = ?').run(name, ip, port, password, serverId);
    await logConfigChange(interaction.guild, interaction.user.id, 'servers_jeu.update', { name: server.name }, { name, ip, port, hasPassword: !!password });
    await refreshServeursJeuPanel(interaction.guild);
    await refreshServerListPanel(interaction.guild);
    await replyEphemeral(interaction, t(guildId, 'config.serveursJeu.updated', { name }));
    return true;
  }

  // ── Flow Supprimer ───────────────────────────────────────────────────
  if (interaction.isButton() && customId === IDS.deleteMenu) {
    const servers = getServers(guildId);
    if (servers.length === 0) { await replyEphemeral(interaction, t(guildId, 'config.serveursJeu.noServers')); return true; }
    const options = servers.slice(0, 25).map((s) => ({ label: s.name.slice(0, 100), value: String(s.server_id), description: `${s.game} — ${s.ip}:${s.port}`.slice(0, 100) }));
    const components = [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(IDS.selectDelete).setPlaceholder('Choisir un serveur…').addOptions(options)
    )];
    if (servers.length > 25) {
      components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${IDS.pageDelete}0`).setLabel('◀ Précédent').setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId(`${IDS.pageDelete}1`).setLabel('Suivant ▶').setStyle(ButtonStyle.Secondary)
      ));
    }
    await replyEphemeral(interaction, { content: 'Quel serveur souhaitez-vous supprimer ?', components });
    return true;
  }

  if (interaction.isButton() && customId.startsWith(IDS.pageDelete)) {
    const page = Number(customId.slice(IDS.pageDelete.length));
    const servers = getServers(guildId);
    const options = servers.slice(page * 25, page * 25 + 25).map((s) => ({ label: s.name.slice(0, 100), value: String(s.server_id) }));
    const components = [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(IDS.selectDelete).setPlaceholder('Choisir un serveur…').addOptions(options)
    ), new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${IDS.pageDelete}${page - 1}`).setLabel('◀ Précédent').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
      new ButtonBuilder().setCustomId(`${IDS.pageDelete}${page + 1}`).setLabel('Suivant ▶').setStyle(ButtonStyle.Secondary).setDisabled((page + 1) * 25 >= servers.length)
    )];
    await interaction.update({ content: 'Quel serveur souhaitez-vous supprimer ?', components });
    return true;
  }

  if (interaction.isStringSelectMenu() && customId === IDS.selectDelete) {
    const serverId = interaction.values?.[0];
    const server = getDb().prepare('SELECT * FROM servers_jeu WHERE server_id = ?').get(serverId);
    if (!server) { await replyEphemeral(interaction, t(guildId, 'config.serveursJeu.notFound')); return true; }
    const modal = new ModalBuilder()
      .setCustomId(`${IDS.modalConfirmDelete}${serverId}`)
      .setTitle('Confirmer la suppression')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('confirm')
            .setLabel(`Tapez le nom du serveur pour confirmer`)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder(server.name)
            .setRequired(true)
        )
      );
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isModalSubmit() && customId.startsWith(IDS.modalConfirmDelete)) {
    const serverId = customId.slice(IDS.modalConfirmDelete.length);
    const server = getDb().prepare('SELECT * FROM servers_jeu WHERE server_id = ?').get(serverId);
    if (!server) { await replyEphemeral(interaction, t(guildId, 'config.serveursJeu.notFound')); return true; }
    const confirmValue = interaction.fields.getTextInputValue('confirm').trim();
    if (confirmValue.toLowerCase() !== server.name.toLowerCase()) {
      await replyEphemeral(interaction, `❌ Nom incorrect. Tapez exactement : **${server.name}**`);
      return true;
    }
    getDb().prepare('DELETE FROM servers_jeu WHERE server_id = ?').run(serverId);
    await logConfigChange(interaction.guild, interaction.user.id, 'servers_jeu.remove', { name: server.name }, null);
    await refreshServeursJeuPanel(interaction.guild);
    await refreshServerListPanel(interaction.guild);
    await replyEphemeral(interaction, t(guildId, 'config.serveursJeu.removed', { name: server.name }));
    return true;
  }

  if (interaction.isButton() && customId.startsWith(IDS.approvePrefix)) {
    const serverId = Number(customId.slice(IDS.approvePrefix.length));
    const server = getDb().prepare('SELECT * FROM servers_jeu WHERE server_id = ?').get(serverId);
    if (!server) { await replyEphemeral(interaction, t(guildId, 'config.serveursJeu.notFound')); return true; }
    getDb().prepare('UPDATE servers_jeu SET approved = 1 WHERE server_id = ?').run(serverId);
    await refreshServeursJeuPanel(interaction.guild);
    await refreshServerListPanel(interaction.guild);
    await replyEphemeral(interaction, t(guildId, 'servers.approved', { user: interaction.user.tag }));
    return true;
  }

  if (interaction.isButton() && customId.startsWith(IDS.rejectPrefix)) {
    const serverId = Number(customId.slice(IDS.rejectPrefix.length));
    const server = getDb().prepare('SELECT * FROM servers_jeu WHERE server_id = ?').get(serverId);
    if (!server) { await replyEphemeral(interaction, t(guildId, 'config.serveursJeu.notFound')); return true; }
    getDb().prepare('DELETE FROM servers_jeu WHERE server_id = ?').run(serverId);
    await refreshServeursJeuPanel(interaction.guild);
    await refreshServerListPanel(interaction.guild);
    await replyEphemeral(interaction, t(guildId, 'servers.rejected', { user: interaction.user.tag }));
    return true;
  }

  return false;
}

module.exports = { seedServeursJeuPanel, refreshServeursJeuPanel, refreshServerListPanel, handleServeursJeuInteraction };
