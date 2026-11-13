// Module premium — panneau de statut des serveurs Pelican dans un channel dédié.
// Affiche l'état de chaque serveur (embed) + boutons start/stop/restart réservés aux managers+.
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const logger = require('../logs/logger');
const pelican = require('./pelicanApi');
const { getGuildSetting, setGuildSetting } = require('../config/settings');
const { getModerationRoleIds } = require('../../database/db');
const { isPremiumFeatureEnabled } = require('../tier/premiumGateUI');

const CHANNEL_NAME = 'serveurs-status';
const CUSTOM_ID_PREFIX = 'pelican';
const REFRESH_MS = 60_000;
const STATE_ICONS = { running: '🟢', offline: '🔴', starting: '🟡', stopping: '🟡', stopping_later: '🟡' };

function canControl(member) {
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  const modRoleIds = Object.values(getModerationRoleIds(member.guild.id) || {});
  return member.roles?.cache?.some((r) => modRoleIds.includes(r.id));
}

async function fetchServerStates() {
  const servers = await pelican.listServers();
  const states = await Promise.all(servers.map(async (s) => {
    try {
      const r = await pelican.getResources(s.identifier);
      return { ...s, state: r.current_state || 'unknown', uptime: r.resources?.uptime ?? 0 };
    } catch {
      return { ...s, state: 'unknown', uptime: 0 };
    }
  }));
  return states;
}

function buildStatusEmbed(guildId, states) {
  const lines = states.map((s) => {
    const icon = s.suspended ? '⏸️' : (STATE_ICONS[s.state] || '⚪');
    const up = s.state === 'running' && s.uptime ? ` — up ${Math.floor(s.uptime / 3600000)}h` : '';
    return `${icon} **${s.name}** — \`${s.state}${s.suspended ? ' (suspendu)' : ''}\`${up}`;
  });
  return new EmbedBuilder()
    .setTitle('🖥️ Statut des serveurs de jeu')
    .setDescription(lines.join('\n') || '_Aucun serveur_')
    .setColor(0x3498db)
    .setFooter({ text: `Maj ${new Date().toLocaleTimeString('fr-FR')} — boutons réservés managers+` })
    .setTimestamp();
}

function buildPowerRows(states) {
  const rows = [];
  for (const s of states.slice(0, 5)) { // 1 ligne par serveur, max 5 serveurs boutonnables
    const running = s.state === 'running';
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${CUSTOM_ID_PREFIX}:start:${s.identifier}`)
        .setLabel(`▶️ ${s.name.slice(0, 20)}`).setStyle(ButtonStyle.Success).setDisabled(running || s.suspended),
      new ButtonBuilder().setCustomId(`${CUSTOM_ID_PREFIX}:restart:${s.identifier}`)
        .setLabel('🔄').setStyle(ButtonStyle.Primary).setDisabled(!running || s.suspended),
      new ButtonBuilder().setCustomId(`${CUSTOM_ID_PREFIX}:stop:${s.identifier}`)
        .setLabel('⏹️').setStyle(ButtonStyle.Danger).setDisabled(!running || s.suspended),
    ));
  }
  return rows;
}

async function findOrCreateChannel(guild) {
  let channel = guild.channels.cache.find((c) => c.name === CHANNEL_NAME && c.isTextBased());
  if (!channel) {
    channel = await guild.channels.create({
      name: CHANNEL_NAME,
      permissionOverwrites: [
        { id: guild.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
      ],
    });
  }
  return channel;
}

async function refreshStatusMessage(guild) {
  const guildId = guild.id;
  if (!isPremiumFeatureEnabled(guildId) || !pelican.isConfigured()) return;
  const states = await fetchServerStates();
  const channel = await findOrCreateChannel(guild);
  const embed = buildStatusEmbed(guildId, states);
  const components = buildPowerRows(states);

  const msgId = getGuildSetting(guildId, 'pelican', 'status_message_id');
  if (msgId) {
    const msg = await channel.messages.fetch(msgId).catch(() => null);
    if (msg) { await msg.edit({ embeds: [embed], components }); return; }
  }
  const sent = await channel.send({ embeds: [embed], components });
  setGuildSetting(guildId, 'pelican', 'status_message_id', sent.id);
}

async function handlePelicanButton(interaction) {
  const parts = interaction.customId.split(':');
  if (parts[0] !== CUSTOM_ID_PREFIX) return false;
  const [, signal, identifier] = parts;
  if (!pelican.VALID_SIGNALS.has(signal)) return false;

  if (!canControl(interaction.member)) {
    await interaction.reply({ content: '🔒 Actions réservées aux managers+.', ephemeral: true });
    return true;
  }
  await interaction.deferUpdate().catch(() => {});
  try {
    await pelican.power(identifier, signal);
    logger.info(`Pelican power ${signal} on ${identifier} by ${interaction.user.id}`);
  } catch (err) {
    logger.error(`Pelican power ${signal} failed`, err);
    await interaction.followUp({ content: `❌ Échec de l'action ${signal}.`, ephemeral: true }).catch(() => {});
  }
  setTimeout(() => refreshStatusMessage(interaction.guild).catch(() => {}), 4000);
  return true;
}

function startPelicanStatusLoop(client, guardAsync) {
  const tick = guardAsync(async () => {
    if (!pelican.isConfigured()) return;
    for (const guild of client.guilds.cache.values()) {
      await refreshStatusMessage(guild).catch((e) => logger.error(`Pelican refresh ${guild.id}`, e));
    }
  });
  setInterval(tick, REFRESH_MS);
}

module.exports = { refreshStatusMessage, handlePelicanButton, startPelicanStatusLoop, CUSTOM_ID_PREFIX };
