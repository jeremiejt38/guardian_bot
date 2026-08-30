const { getDb } = require('../../database/db');
const logger = require('../logs/logger');

function isConsented(guildId, userId) {
  try {
    const row = getDb()
      .prepare('SELECT 1 FROM rich_presence_consent WHERE guild_id = ? AND user_id = ?')
      .get(guildId, userId);
    return Boolean(row);
  } catch (error) {
    logger.error('richPresence isConsented failed', { guildId, userId, error });
    return false;
  }
}

function giveConsent(guildId, userId) {
  try {
    getDb()
      .prepare(
        `INSERT INTO rich_presence_consent (guild_id, user_id, consented_at)
         VALUES (?, ?, ?)
         ON CONFLICT(guild_id, user_id) DO UPDATE SET consented_at = excluded.consented_at`
      )
      .run(guildId, userId, new Date().toISOString());
    return true;
  } catch (error) {
    logger.error('richPresence giveConsent failed', { guildId, userId, error });
    return false;
  }
}

function revokeConsent(guildId, userId) {
  try {
    getDb()
      .prepare('DELETE FROM rich_presence_consent WHERE guild_id = ? AND user_id = ?')
      .run(guildId, userId);
    getDb()
      .prepare('DELETE FROM rich_presence_sessions WHERE guild_id = ? AND user_id = ?')
      .run(guildId, userId);
    return true;
  } catch (error) {
    logger.error('richPresence revokeConsent failed', { guildId, userId, error });
    return false;
  }
}

function startSession(guildId, userId, gameName) {
  if (!isConsented(guildId, userId)) return false;
  try {
    // End any open session for this guild/user first.
    endSession(guildId, userId);
    getDb()
      .prepare(
        `INSERT INTO rich_presence_sessions (guild_id, user_id, game_name, started_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(guildId, userId, gameName, new Date().toISOString());
    return true;
  } catch (error) {
    logger.error('richPresence startSession failed', { guildId, userId, gameName, error });
    return false;
  }
}

function endSession(guildId, userId) {
  try {
    const row = getDb()
      .prepare(
        `SELECT session_id, started_at FROM rich_presence_sessions
         WHERE guild_id = ? AND user_id = ? AND ended_at IS NULL
         ORDER BY started_at DESC LIMIT 1`
      )
      .get(guildId, userId);

    if (!row) return false;

    const endedAt = new Date();
    const startedAt = new Date(row.started_at);
    const durationSeconds = Math.max(0, Math.floor((endedAt - startedAt) / 1000));

    getDb()
      .prepare(
        `UPDATE rich_presence_sessions
         SET ended_at = ?, duration_seconds = ?
         WHERE session_id = ?`
      )
      .run(endedAt.toISOString(), durationSeconds, row.session_id);
    return true;
  } catch (error) {
    logger.error('richPresence endSession failed', { guildId, userId, error });
    return false;
  }
}

function handlePresenceUpdate(guildId, userId, newPresence) {
  if (!isConsented(guildId, userId)) return;

  const newActivity = newPresence?.activities?.find(
    (a) => a.type === 0 // Playing
  );

  if (!newActivity || !newActivity.name) {
    endSession(guildId, userId);
    return;
  }

  const openSession = getDb()
    .prepare(
      `SELECT session_id, game_name FROM rich_presence_sessions
       WHERE guild_id = ? AND user_id = ? AND ended_at IS NULL
       ORDER BY started_at DESC LIMIT 1`
    )
    .get(guildId, userId);

  if (openSession && openSession.game_name === newActivity.name) {
    return;
  }

  if (openSession) {
    endSession(guildId, userId);
  }

  startSession(guildId, userId, newActivity.name);
}

function getLeaderboard(guildId, limit = 10) {
  try {
    return getDb()
      .prepare(
        `SELECT user_id,
                game_name,
                COUNT(*) AS sessions,
                COALESCE(SUM(duration_seconds), 0) AS total_seconds
         FROM rich_presence_sessions
         WHERE guild_id = ? AND ended_at IS NOT NULL
         GROUP BY user_id, game_name
         ORDER BY total_seconds DESC
         LIMIT ?`
      )
      .all(guildId, limit);
  } catch (error) {
    logger.error('richPresence getLeaderboard failed', { guildId, error });
    return [];
  }
}

function getUserStats(guildId, userId) {
  try {
    const total = getDb()
      .prepare(
        `SELECT COALESCE(SUM(duration_seconds), 0) AS total_seconds,
                COUNT(*) AS sessions
         FROM rich_presence_sessions
         WHERE guild_id = ? AND user_id = ? AND ended_at IS NOT NULL`
      )
      .get(guildId, userId);

    const byGame = getDb()
      .prepare(
        `SELECT game_name,
                COALESCE(SUM(duration_seconds), 0) AS total_seconds,
                COUNT(*) AS sessions
         FROM rich_presence_sessions
         WHERE guild_id = ? AND user_id = ? AND ended_at IS NOT NULL
         GROUP BY game_name
         ORDER BY total_seconds DESC`
      )
      .all(guildId, userId);

    return { total_seconds: total?.total_seconds || 0, sessions: total?.sessions || 0, byGame };
  } catch (error) {
    logger.error('richPresence getUserStats failed', { guildId, userId, error });
    return { total_seconds: 0, sessions: 0, byGame: [] };
  }
}

function getCurrentlyPlaying(guildId) {
  try {
    return getDb()
      .prepare(
        `SELECT user_id, game_name, started_at
         FROM rich_presence_sessions
         WHERE guild_id = ? AND ended_at IS NULL`
      )
      .all(guildId);
  } catch (error) {
    logger.error('richPresence getCurrentlyPlaying failed', { guildId, error });
    return [];
  }
}

module.exports = {
  giveConsent,
  revokeConsent,
  isConsented,
  startSession,
  endSession,
  handlePresenceUpdate,
  getLeaderboard,
  getUserStats,
  getCurrentlyPlaying
};
