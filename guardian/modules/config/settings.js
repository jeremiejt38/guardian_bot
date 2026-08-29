const { setConfig, getConfig } = require('../../database/db');
const { CHANNELS } = require('../../config');
const { t } = require('../i18n');
const { findChannelByName } = require('../utils/channels');

function setGuildSetting(guildId, moduleName, key, value) {
  setConfig(guildId, moduleName, key, value);
}

function getGuildSetting(guildId, moduleName, key, fallback = null) {
  return getConfig(guildId, moduleName, key, fallback);
}

async function ensureChannelMessage(channel, content, components = null) {
  if (!channel?.isTextBased?.()) {
    return;
  }

  if (!channel.lastMessageId) {
    await channel.send({ content, components });
  }
}

async function ensureMemberGameInterfaces(guild) {
  const { buildOpenButtonRow } = require('../games/gameList');
  const gameChannelsChannel = findChannelByName(guild, CHANNELS.gameChannels);
  const gameListChannel = findChannelByName(guild, CHANNELS.gameList);

  await ensureChannelMessage(
    gameChannelsChannel,
    t(guild.id, 'settings.gameChannelsHint')
  );
  await ensureChannelMessage(
    gameListChannel,
    t(guild.id, 'settings.gameListHint'),
    [buildOpenButtonRow(guild.id)]
  );
}

function getBehaviorInterfaceData(guildId, fallbackThresholds = []) {
  return {
    thresholds: getGuildSetting(guildId, 'behavior', 'thresholds', fallbackThresholds),
    pageSize: getGuildSetting(guildId, 'behavior', 'page_size', 10)
  };
}

module.exports = {
  setGuildSetting,
  getGuildSetting,
  ensureMemberGameInterfaces,
  getBehaviorInterfaceData
};
