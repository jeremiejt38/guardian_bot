const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const { setConfig, getConfig } = require('../../database/db');
const { isBotAdmin, getBotAdminId, isRunningUnderPM2 } = require('./botUpdater');
const logger = require('../logs/logger');
const { version } = require('../../package.json');
const { getRecapStats } = require('./recapStats');
const os = require('os');

const GLOBAL = '__global__';
const TIMEOUT_MS = 15 * 60 * 1000;

const VIEWS = { statut: 'statut', serveurs: 'serveurs', bdd: 'bdd', notifs: 'notifs', recap: 'recap' };

const timeouts = new Map();

function getPanelMessageId() { return getConfig(GLOBAL, 'admin', 'panel_message_id', null); }
function setPanelMessageId(id) { setConfig(GLOBAL, 'admin', 'panel_message_id', id); }
function getPanelChannelId() { return getConfig(GLOBAL, 'admin', 'panel_channel_id', null); }
function setPanelChannelId(id) { setConfig(GLOBAL, 'admin', 'panel_channel_id', id); }

function getNotifPref(key) { return getConfig(GLOBAL, 'admin_notifs', key, true); }
function setNotifPref(key, val) { setConfig(GLOBAL, 'admin_notifs', key, val); }

const NOTIF_KEYS = [
  { key: 'update',    label: '🔄 MAJ dispo' },
  { key: 'db_error',  label: '🗄️ Erreur BDD' },
  { key: 'crash',     label: '⚠️ Crash' },
  { key: 'offline',   label: '📡 Déconnexion' },
  { key: 'guild_join',label: '➕ Nouveau serveur' },
  { key: 'guild_leave',label: '➖ Serveur retiré' },
  { key: 'unauth',    label: '🔐 Accès non autorisé' },
];

function formatUptime() {
  const s = Math.floor(process.uptime());
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h${m}m` : m > 0 ? `${m}m${sec}s` : `${sec}s`;
}

function formatBytes(b) {
  if (b > 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024).toFixed(1)} KB`;
}

function buildPanelButtons(activeView = null) {
  const mainRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('admin:panel:statut')
      .setLabel('🤖 Statut')
      .setStyle(activeView === VIEWS.statut ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('admin:panel:serveurs')
      .setLabel('🌐 Serveurs')
      .setStyle(activeView === VIEWS.serveurs ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('admin:panel:bdd')
      .setLabel('🗄️ BDD')
      .setStyle(activeView === VIEWS.bdd ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('admin:panel:notifs')
      .setLabel('🔔 Notifs')
      .setStyle(activeView === VIEWS.notifs ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('admin:panel:recap')
      .setLabel('📊 Recap')
      .setStyle(activeView === VIEWS.recap ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );

  const secondRow = new ActionRowBuilder().addComponents(
    activeView
      ? new ButtonBuilder()
          .setCustomId('admin:panel:close')
          .setLabel('✖ Fermer')
          .setStyle(ButtonStyle.Danger)
      : new ButtonBuilder()
          .setCustomId('admin:panel:refresh')
          .setLabel('🔄')
          .setStyle(ButtonStyle.Secondary)
  );

  return [mainRow, secondRow];
}

function baseEmbed() {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🛡️ Guardian — Admin Panel')
    .setTimestamp();
}

function buildClosedContent() {
  return {
    content: '🛡️ **Guardian — Admin Panel**',
    embeds: [],
    components: buildPanelButtons(),
  };
}

function buildStatutContent(client) {
  const mem = process.memoryUsage();
  const ping = client?.ws?.ping ?? -1;
  const embed = baseEmbed()
    .setDescription('🤖 **Statut du bot**')
    .addFields(
      { name: 'Version', value: `\`v${version}\``, inline: true },
      { name: 'Uptime', value: formatUptime(), inline: true },
      { name: 'Ping', value: ping >= 0 ? `${ping}ms` : 'N/A', inline: true },
      { name: 'RAM', value: formatBytes(mem.rss), inline: true },
      { name: 'PM2', value: isRunningUnderPM2() ? '✅ actif' : '❌ inactif', inline: true },
      { name: 'Node.js', value: process.version, inline: true },
      { name: 'OS', value: `${os.type()} ${os.release()}`, inline: false }
    );
  return { content: '', embeds: [embed], components: buildPanelButtons(VIEWS.statut) };
}

function buildServeursContent(client) {
  const guilds = client?.guilds?.cache ?? new Map();
  const embed = baseEmbed()
    .setDescription(`🌐 **${guilds.size} serveur${guilds.size > 1 ? 's' : ''} connecté${guilds.size > 1 ? 's' : ''}**`);
  for (const g of guilds.values()) {
    embed.addFields({ name: g.name, value: `${g.memberCount} membres`, inline: true });
  }
  if (guilds.size === 0) embed.addFields({ name: 'Aucun serveur', value: '*Guardian n\'est sur aucun serveur.*', inline: false });
  return { content: '', embeds: [embed], components: buildPanelButtons(VIEWS.serveurs) };
}

function buildBddContent() {
  const fs = require('fs');
  const path = require('path');
  const dbPath = process.env.DATABASE_PATH ?? './data/guardian.db';
  const absPath = path.resolve(dbPath);
  let sizeStr = 'N/A';
  try {
    const stat = fs.statSync(absPath);
    sizeStr = formatBytes(stat.size);
  } catch {}
  const embed = baseEmbed()
    .setDescription('🗄️ **Base de données**')
    .addFields(
      { name: 'Fichier', value: `\`${absPath}\``, inline: false },
      { name: 'Taille', value: sizeStr, inline: true }
    );
  return { content: '', embeds: [embed], components: buildPanelButtons(VIEWS.bdd) };
}

function buildNotifsContent() {
  const embed = baseEmbed()
    .setDescription('🔔 **Notifications système**');
  for (const n of NOTIF_KEYS) {
    embed.addFields({ name: n.label, value: getNotifPref(n.key) ? '🟢 Actif' : '🔴 Inactif', inline: true });
  }

  const toggleRows = [];
  const chunks = [];
  for (let i = 0; i < NOTIF_KEYS.length; i += 4) chunks.push(NOTIF_KEYS.slice(i, i + 4));
  for (const chunk of chunks) {
    toggleRows.push(new ActionRowBuilder().addComponents(
      ...chunk.map(n => new ButtonBuilder()
        .setCustomId(`admin:notif:toggle:${n.key}`)
        .setLabel(n.label)
        .setStyle(getNotifPref(n.key) ? ButtonStyle.Success : ButtonStyle.Secondary)
      )
    ));
  }

  return { content: '', embeds: [embed], components: [...toggleRows, ...buildPanelButtons(VIEWS.notifs)] };
}

function buildRecapContent() {
  const stats = getRecapStats();
  const embed = baseEmbed()
    .setDescription(`📊 **Recap — 30 derniers jours**`)
    .addFields(
      { name: '👤 Nouveaux membres', value: `${stats.newMemberCount}`, inline: true },
      { name: '🎮 Jeux actifs', value: `${stats.activeGameCount}`, inline: true },
      { name: '🛡️ Incidents modération', value: `${stats.moderationIncidentCount}`, inline: true }
    );
  return { content: '', embeds: [embed], components: buildPanelButtons(VIEWS.recap) };
}

function buildViewContent(view, client) {
  switch (view) {
    case VIEWS.statut: return buildStatutContent(client);
    case VIEWS.serveurs: return buildServeursContent(client);
    case VIEWS.bdd: return buildBddContent();
    case VIEWS.notifs: return buildNotifsContent();
    case VIEWS.recap: return buildRecapContent();
    default: return buildClosedContent();
  }
}

function scheduleTimeout(client, view) {
  if (timeouts.has('panel')) clearTimeout(timeouts.get('panel'));
  const t = setTimeout(async () => {
    timeouts.delete('panel');
    await closePanel(client);
  }, TIMEOUT_MS);
  timeouts.set('panel', t);
}

function cancelTimeout() {
  if (timeouts.has('panel')) { clearTimeout(timeouts.get('panel')); timeouts.delete('panel'); }
}

async function getAdminDmChannel(client) {
  const adminId = getBotAdminId();
  if (!adminId) return null;
  try {
    const user = await client.users.fetch(adminId);
    return await user.createDM();
  } catch { return null; }
}

async function closePanel(client) {
  try {
    const ch = await getAdminDmChannel(client);
    if (!ch) return;
    const msgId = getPanelMessageId();
    if (!msgId) return;
    const msg = await ch.messages.fetch(msgId).catch(() => null);
    if (msg) await msg.edit(buildClosedContent()).catch(() => {});
  } catch (err) {
    logger.warn('adminPanel: closePanel error', err);
  }
}

async function openOrRefreshPanel(client, view = null) {
  try {
    const ch = await getAdminDmChannel(client);
    if (!ch) return null;

    const content = buildViewContent(view, client);
    const existingId = getPanelMessageId();

    if (existingId) {
      const existing = await ch.messages.fetch(existingId).catch(() => null);
      if (existing) {
        await existing.delete().catch(() => {});
      }
    }

    const msg = await ch.send({ ...content, flags: MessageFlags.SuppressNotifications });
    setPanelMessageId(msg.id);
    setPanelChannelId(ch.id);

    if (view) scheduleTimeout(client, view);
    else cancelTimeout();

    return msg;
  } catch (err) {
    logger.error('adminPanel: openOrRefreshPanel error', err);
    return null;
  }
}

async function handlePanelInteraction(interaction, client) {
  if (!isBotAdmin(interaction.user.id)) {
    await interaction.reply({ content: '❌ Accès réservé à l\'administrateur bot.', ephemeral: true }).catch(() => {});
    return true;
  }

  const parts = interaction.customId.split(':');
  const section = parts[2];

  if (section === 'close') {
    await interaction.deferUpdate().catch(() => {});
    cancelTimeout();
    await interaction.message?.edit(buildClosedContent()).catch(() => {});
    return true;
  }

  if (section === 'refresh') {
    const currentView = detectCurrentView(interaction.message?.content);
    await interaction.deferUpdate().catch(() => {});
    const content = buildViewContent(currentView, client);
    await interaction.message?.edit(content).catch(() => {});
    if (currentView) scheduleTimeout(client, currentView);
    return true;
  }

  if (section === 'notif') {
    const key = parts[4];
    const current = getNotifPref(key);
    setNotifPref(key, !current);
    await interaction.deferUpdate().catch(() => {});
    await interaction.message?.edit(buildNotifsContent()).catch(() => {});
    scheduleTimeout(client, VIEWS.notifs);
    return true;
  }

  if (Object.values(VIEWS).includes(section)) {
    await interaction.deferUpdate().catch(() => {});
    const content = buildViewContent(section, client);
    await interaction.message?.edit(content).catch(() => {});
    scheduleTimeout(client, section);
    return true;
  }

  return false;
}

function detectCurrentView(content) {
  if (!content) return null;
  if (content.includes('🤖 Statut bot')) return VIEWS.statut;
  if (content.includes('🌐 Serveurs connectés')) return VIEWS.serveurs;
  if (content.includes('🗄️ Base de données')) return VIEWS.bdd;
  if (content.includes('🔔 Notifications système')) return VIEWS.notifs;
  if (content.includes('📊 Recap')) return VIEWS.recap;
  return null;
}

async function pushPanelToBottom(client, preserveMessageIds = []) {
  try {
    const ch = await getAdminDmChannel(client);
    if (!ch) return;

    const existingId = getPanelMessageId();
    if (existingId && !preserveMessageIds.includes(existingId)) {
      preserveMessageIds.push(existingId);
    }

    const batch = await ch.messages.fetch({ limit: 50 }).catch(() => null);
    if (batch) {
      for (const msg of batch.values()) {
        if (preserveMessageIds.includes(msg.id)) continue;
        await msg.delete().catch(() => {});
      }
    }

    let existingPanel = null;
    if (existingId) {
      existingPanel = await ch.messages.fetch(existingId).catch(() => null);
      if (existingPanel) await existingPanel.delete().catch(() => {});
    }

    const msg = await ch.send({ ...buildClosedContent(), flags: MessageFlags.SuppressNotifications });
    setPanelMessageId(msg.id);
    setPanelChannelId(ch.id);
    cancelTimeout();
  } catch (err) {
    logger.warn('adminPanel: pushPanelToBottom error', err);
  }
}

async function sendAdminDmMessage(client, payload) {
  try {
    const ch = await getAdminDmChannel(client);
    if (!ch) return null;

    const batch = await ch.messages.fetch({ limit: 50 }).catch(() => null);
    const preserve = [];
    if (batch) {
      for (const msg of batch.values()) {
        if (msg.author?.id === client.user?.id && msg.id !== getPanelMessageId()) {
          await msg.delete().catch(() => {});
        }
      }
      const panelId = getPanelMessageId();
      if (panelId) {
        const panel = await ch.messages.fetch(panelId).catch(() => null);
        if (panel) preserve.push(panelId);
      }
    }

    const msg = await ch.send({ ...payload, flags: MessageFlags.SuppressNotifications });
    await pushPanelToBottom(client, [...preserve, msg.id]);
    return msg;
  } catch (err) {
    logger.warn('adminPanel: sendAdminDmMessage error', err);
    return null;
  }
}

module.exports = {
  openOrRefreshPanel,
  handlePanelInteraction,
  pushPanelToBottom,
  sendAdminDmMessage,
  getNotifPref,
  setNotifPref,
  NOTIF_KEYS,
  VIEWS,
};
