const { getDb } = require('../../database/db');
const { getGuildSetting } = require('../config/settings');
const { sendModLog } = require('../moderation/modLog');
const logger = require('../logs/logger');
const { guardAsync } = require('../utils/intervalGuard');

const DAY_MS = 24 * 60 * 60 * 1000;

function startInviteExpulsionJob(client, intervalMs = DAY_MS) {
  return setInterval(guardAsync(async () => {
    const db = getDb();
    const rows = db.prepare("SELECT guild_id, user_id, join_date FROM members WHERE grade = 'invite'").all();

    for (const row of rows) {
      try {
        const expulsionEnabled = Boolean(getGuildSetting(row.guild_id, 'members', 'invite_expulsion_enabled', true));
        if (!expulsionEnabled) {
          continue;
        }

        const maxDays = Math.max(1, Number(getGuildSetting(row.guild_id, 'members', 'invite_expulsion_days', 30)));
        const joinedAt = new Date(row.join_date).getTime();
        if (!joinedAt || Date.now() - joinedAt < maxDays * DAY_MS) {
          continue;
        }

        const guild = await client.guilds.fetch(row.guild_id);
        const member = await guild.members.fetch(row.user_id).catch(() => null);
        if (member) {
          await member.kick('Guardian: délai de promotion dépassé');
          await logger.logToDiscord(guild, `Expulsion automatique: <@${row.user_id}> (délai dépassé)`);
          await sendModLog(guild, `🚪 **Expulsion auto** | Membre: <@${row.user_id}> | Raison: délai de promotion dépassé`);
        }
      } catch (error) {
        logger.error('Failed invite expulsion cycle item', error);
      }
    }
  }), intervalMs);
}

module.exports = {
  startInviteExpulsionJob
};
