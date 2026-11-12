const { setConfig, getConfig } = require('../../database/db');

const GLOBAL = '__global__';

function getBotAdminId() {
  return process.env.BOT_ADMIN_ID || getConfig(GLOBAL, 'admin', 'bot_admin_id', null);
}

function setBotAdminId(id) {
  setConfig(GLOBAL, 'admin', 'bot_admin_id', id);
}

function isBotAdmin(userId) {
  const id = getBotAdminId();
  if (!id) return false;
  return userId === id;
}

function isRunningUnderPM2() {
  return Boolean(process.env.PM2_HOME || process.env.pm_id !== undefined);
}

module.exports = { getBotAdminId, setBotAdminId, isBotAdmin, isRunningUnderPM2 };
