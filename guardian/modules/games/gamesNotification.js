const { getDb } = require('../../database/db');
const { CHANNEL_NAMES } = require('../../config');
const { getGuildSetting } = require('../config/settings');
const { resolveTextChannel } = require('../utils/channels');
const { createGuildRunTracker } = require('../utils/scheduling');
const { isNonSteamId } = require('./steamGamesList');
const logger = require('../logs/logger');
const { guardAsync } = require('../utils/intervalGuard');

const runTracker = createGuildRunTracker();

function formatChangelogMessage(gameName, item) {
  const date = item?.date ? new Date(item.date * 1000).toLocaleString('fr-FR') : 'date inconnue';
  const title = item?.title || `Nouveau changelog: ${gameName}`;
  const url = item?.url || '';
  const raw = (item?.contents || '').replace(/\s+/g, ' ').trim();
  const summary = raw.length > 600 ? `${raw.slice(0, 597)}...` : raw;

  return [`🎮 **${gameName}**`, `**${title}**`, `Publié le: ${date}`, summary, url].filter(Boolean).join('\n');
}

async function fetchLatestSteamNews(appId) {
  const url = new URL('https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/');
  url.searchParams.set('appid', appId);
  url.searchParams.set('count', '1');
  url.searchParams.set('maxlength', '1000');
  url.searchParams.set('format', 'json');

  const response = await fetch(url, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Steam API returned ${response.status}`);
  }

  const payload = await response.json();
  return payload?.appnews?.newsitems?.[0] || null;
}

async function postIfTextChannel(channel, content) {
  if (channel?.isTextBased()) {
    await channel.send(content);
  }
}

function resolveGuildTextChannel(guild, preferredId, fallbackName, context) {
  return resolveTextChannel(guild, preferredId, fallbackName, () => {
    logger.warn(`Configured channel ID missing for ${context} in guild ${guild.id}, falling back by name`);
  });
}

async function publishChangelog(client, game, item) {
  if (!client) {
    return;
  }

  const guild = await client.guilds.fetch(game.guild_id).catch(() => null);
  if (!guild) {
    return;
  }

  const message = formatChangelogMessage(game.name, item);
  const perGameChannel = await resolveGuildTextChannel(guild, game.channel_changelog_id, null, `game ${game.game_id}`);

  if (game.changelog_enabled && perGameChannel) {
    await postIfTextChannel(perGameChannel, message);
  }

  const aggregateEnabled = getGuildSetting(game.guild_id, 'changelogs', 'aggregate_game_updates', true);
  if (!aggregateEnabled) {
    return;
  }

  const aggregateChannel = await resolveGuildTextChannel(
    guild,
    getGuildSetting(game.guild_id, 'channels', 'game_updates_channel_id', null),
    CHANNEL_NAMES.gameUpdates,
    'aggregate game updates'
  );
  if (aggregateChannel) {
    await aggregateChannel.send(message);
  }
}

async function checkSteamChangelogs(client) {
  try {
    const db = getDb();
    const trackedGames = db
      .prepare(
        `SELECT game_id, guild_id, steam_app_id, name, channel_changelog_id, changelog_enabled
         FROM games
         WHERE steam_app_id IS NOT NULL AND steam_app_id != '' AND steam_app_id NOT LIKE '000%'`
      )
      .all();

    const byGuild = new Map();
    for (const game of trackedGames) {
      const list = byGuild.get(game.guild_id) || [];
      list.push(game);
      byGuild.set(game.guild_id, list);
    }

    const nowMs = Date.now();

    for (const [guildId, games] of byGuild) {
      const intervalMinutes = Math.max(1, Number(getGuildSetting(guildId, 'changelogs', 'check_interval_minutes', 60)));
      if (!runTracker.shouldRun(guildId, nowMs, intervalMinutes)) {
        continue;
      }

      for (const game of games) {
        try {
          const item = await fetchLatestSteamNews(game.steam_app_id);
          if (!item?.gid) {
            continue;
          }

          const seen = db.prepare('SELECT last_changelog_id FROM changelogs_seen WHERE game_id = ?').get(game.game_id);
          if (seen?.last_changelog_id === item.gid) {
            continue;
          }

          db.prepare(
            `INSERT INTO changelogs_seen (game_id, last_changelog_id)
             VALUES (?, ?)
             ON CONFLICT(game_id) DO UPDATE SET last_changelog_id = excluded.last_changelog_id`
          ).run(game.game_id, item.gid);

          await publishChangelog(client, game, item);
        } catch (error) {
          logger.error(`Steam changelog check failed for game ${game.name}`, error);
        }
      }

      runTracker.markRun(guildId, nowMs);
    }
  } catch (error) {
    logger.error('Failed Steam changelog cycle', error);
  }
}

function startChangelogTimer(client, intervalMs = 60 * 1000) {
  return setInterval(guardAsync(async () => {
    checkSteamChangelogs(client).catch((error) => logger.error('Steam changelog timer failure', error));
  }), intervalMs);
}

module.exports = {
  fetchLatestSteamNews,
  checkSteamChangelogs,
  startChangelogTimer
};
