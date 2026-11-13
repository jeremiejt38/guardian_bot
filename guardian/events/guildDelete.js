const logger = require('../modules/logs/logger');
const { alertGuildLeave } = require('../modules/admin/adminAlerts');
const { deleteGuildData } = require('../database/db');

module.exports = {
  name: 'guildDelete',
  once: false,
  async execute(client, guild) {
    logger.info(`Bot removed from guild: ${guild.name} (${guild.id})`);
    deleteGuildData(guild.id);
    await alertGuildLeave(guild).catch(() => {});
  }
};
