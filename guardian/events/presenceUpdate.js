const { handlePresenceUpdate } = require('../modules/richPresence/richPresence');
const logger = require('../modules/logs/logger');

module.exports = {
  name: 'presenceUpdate',
  async execute(_client, oldPresence, newPresence) {
    try {
      const guildId = newPresence?.guild?.id;
      const userId = newPresence?.userId;
      if (!guildId || !userId) return;

      // Only process tracked guild members; ignore DMs / non-guild presences.
      handlePresenceUpdate(guildId, userId, newPresence);
    } catch (error) {
      logger.error('presenceUpdate event failed', { error });
    }
  }
};
