const net = require('net');
const { EmbedBuilder } = require('discord.js');
const { getDb } = require('../../database/db');
const { CHANNEL_NAMES } = require('../../config');
const { getGuildSetting } = require('../config/settings');
const { resolveTextChannel } = require('../utils/channels');
const { createGuildRunTracker } = require('../utils/scheduling');
const { guardAsync } = require('../utils/intervalGuard');
const logger = require('../logs/logger');
const { queryPlayers } = require('./gameQuery');
const pelican = require('./pelicanApi');

const runTracker = createGuildRunTracker();

function checkTcpServer(ip, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;

    const settle = (status) => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(status);
      }
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => settle('online'));
    socket.once('timeout', () => settle('unstable'));
    socket.once('error', () => settle('offline'));
    socket.connect(port, ip);
  });
}

function renderStatus(status) {
  if (status === 'online') {
    return '✅ En ligne';
  }
  if (status === 'unstable') {
    return '⚠️ Instable';
  }
  return '❌ Hors ligne';
}

function resolveServerListChannel(guild) {
  const configuredId = getGuildSetting(guild.id, 'channels', 'server_list_channel_id', null);
  return resolveTextChannel(guild, configuredId, CHANNEL_NAMES.serverList, () => {
    logger.warn(`Configured server list channel not found for guild ${guild.id}, fallback by name`);
  });
}

async function buildMemberContent(server, status, checkedAtIso) {
  const emoji = status === 'online' ? '\u{1F7E2}' : status === 'offline' ? '\u{1F534}' : '\u{1F7E1}';
  const lines = [`${emoji} **${server.name}** — ${server.game}`, `Statut : ${renderStatus(status)}`];
  if (status === 'online') {
    const players = await queryPlayers(server.ip, server.port).catch(() => null);
    lines.push(`Joueurs : ${players ? `${players.players}${players.max != null ? '/' + players.max : ''}` : 'n/a'}`);
    lines.push(`Adresse : ||\`${server.ip}:${server.port}\`||`);
    if (server.password) lines.push(`Mot de passe : ||\`${server.password}\`||`);
  }
  lines.push(`Vérifié : ${new Date(checkedAtIso).toLocaleString('fr-FR')}`);
  return lines.join('\n');
}
function buildPowerComponents(server) {
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  const row = new ActionRowBuilder();
  if (server.pelican_identifier && server.last_status !== 'online') {
    row.addComponents(new ButtonBuilder()
      .setCustomId(`pelican:start:${server.pelican_identifier}`)
      .setLabel('▶️ Démarrer')
      .setStyle(ButtonStyle.Success));
  } else if (server.last_status === 'online') {
    row.addComponents(new ButtonBuilder()
      .setCustomId(`server:copy:${server.server_id}`)
      .setLabel('Copier IP')
      .setStyle(ButtonStyle.Secondary));
  } else return [];
  return [row];
}

async function upsertStatusMessage(channel, server, status, checkedAtIso) {
  const db = getDb();
  const content = await buildMemberContent(server, status, checkedAtIso);

  if (server.status_message_id) {
    const existing = await channel.messages.fetch(server.status_message_id).catch(() => null);
    if (existing) {
      await existing.edit({ content, embeds: [], components: buildPowerComponents(server) });
      return;
    }

    logger.warn(`Status message not found for server_id=${server.server_id}, creating a new one`);
  }

  const components = buildPowerComponents(server);
  const created = await channel.send({ content, components });
  db.prepare('UPDATE servers_jeu SET status_message_id = ? WHERE server_id = ?').run(created.id, server.server_id);
}

async function monitorServers(client) {
  const db = getDb();
  const servers = db
    .prepare('SELECT server_id, guild_id, name, game, ip, port, status_message_id, pelican_identifier FROM servers_jeu')
    .all();
  const now = new Date().toISOString();

  const serversByGuild = new Map();
  for (const server of servers) {
    const list = serversByGuild.get(server.guild_id) || [];
    list.push(server);
    serversByGuild.set(server.guild_id, list);
  }

  const nowMs = Date.now();

  for (const [guildId, guildServers] of serversByGuild) {
    const intervalMinutes = Math.max(1, Number(getGuildSetting(guildId, 'servers', 'monitor_interval_minutes', 5)));
    if (!runTracker.shouldRun(guildId, nowMs, intervalMinutes)) {
      continue;
    }

    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      continue;
    }
    await guild.channels.fetch().catch(() => {});

    const statusChannel = await resolveServerListChannel(guild);

    let statusChanged = false;
    for (const server of guildServers) {
      // Serveur lié à Pelican -> l'API fait foi (le ping TCP vers l'IP publique
      // échoue en hairpin depuis le host) ; sinon ping TCP classique.
      let status;
      if (server.pelican_identifier && pelican.isConfigured()) {
        const r = await pelican.getResources(server.pelican_identifier).catch(() => null);
        const st = r?.current_state;
        status = st === 'running' ? 'online' : (st === 'starting' || st === 'stopping') ? 'unstable' : 'offline';
      } else {
        status = await checkTcpServer(server.ip, Number(server.port));
      }
      if (server.last_status !== status) statusChanged = true;
      db.prepare('UPDATE servers_jeu SET last_status = ?, last_check = ? WHERE server_id = ?').run(status, now, server.server_id);

      if (!statusChannel) {
        continue;
      }

      await upsertStatusMessage(statusChannel, server, status, now).catch((error) => {
        logger.error(`Failed status message update for server_id=${server.server_id}`, error);
      });
    }

    // La liste membre se re-rend dès qu'un serveur change d'état,
    // que le changement vienne d'un bouton Discord ou de l'extérieur.
    if (statusChanged) {
      const { refreshServerListPanel } = require('../config/serveursJeuPanel');
      await refreshServerListPanel(guild).catch((e) => logger.warn(`Guild ${guildId}: auto-refresh liste-serveurs failed: ${e.message}`));
    }

    runTracker.markRun(guildId, nowMs);
  }
}

function startServerMonitor(client, intervalMs = 60 * 1000) {
  return setInterval(
    guardAsync(async () => {
      await monitorServers(client).catch((error) => logger.error('Server monitor cycle failure', error));
    }),
    intervalMs
  );
}

module.exports = {
  checkTcpServer,
  monitorServers,
  startServerMonitor
};
