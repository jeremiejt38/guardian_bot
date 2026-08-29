const { sendAdminDmMessage, getNotifPref } = require('./adminPanel');
const { getBotAdminId } = require('./botUpdater');
const logger = require('../logs/logger');

let _client = null;

function initAlerts(client) {
  _client = client;
}

async function sendAdminAlert(type, content) {
  if (!getNotifPref(type)) return;
  const adminId = getBotAdminId();
  if (!adminId || !_client) return;
  try {
    await sendAdminDmMessage(_client, typeof content === 'string' ? { content } : content);
  } catch (err) {
    logger.error('adminAlerts: sendAdminAlert error', err);
  }
}

async function alertUpdate(fromVersion, toVersion) {
  await sendAdminAlert('update', [
    `## 🔄 Mise à jour disponible — v${fromVersion} → **v${toVersion}**`,
    `> Une nouvelle version de Guardian est prête.`,
    `📋 https://github.com/${process.env.GITHUB_FREE_REPO ?? 'jeremiejt38/Guardian_Discord_Bot_Free'}/releases`
  ].join('\n'));
}

async function alertDbError(message) {
  await sendAdminAlert('db_error', [
    `## 🗄️ Erreur base de données`,
    `\`\`\`\n${String(message).slice(0, 800)}\n\`\`\``
  ].join('\n'));
}

async function alertCrash(error) {
  await sendAdminAlert('crash', [
    `## ⚠️ Erreur critique Guardian`,
    `\`\`\`\n${String(error?.stack || error).slice(0, 800)}\n\`\`\``
  ].join('\n'));
}

async function alertGuildJoin(guild) {
  await sendAdminAlert('guild_join', [
    `## ➕ Nouveau serveur — **${guild.name}**`,
    `• ID : \`${guild.id}\``,
    `• Membres : ${guild.memberCount}`,
  ].join('\n'));
}

async function alertGuildLeave(guild) {
  await sendAdminAlert('guild_leave', [
    `## ➖ Serveur retiré — **${guild.name}**`,
    `• ID : \`${guild.id}\``,
  ].join('\n'));
}

async function alertUnauthorized(userId, action) {
  await sendAdminAlert('unauth', [
    `## 🔐 Tentative accès non autorisé`,
    `• User ID : \`${userId}\``,
    `• Action : \`${action}\``,
  ].join('\n'));
}

module.exports = {
  initAlerts,
  alertUpdate,
  alertDbError,
  alertCrash,
  alertGuildJoin,
  alertGuildLeave,
  alertUnauthorized,
};
