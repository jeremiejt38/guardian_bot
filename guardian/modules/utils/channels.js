const { ChannelType } = require('discord.js');

function getChannelCache(guild) {
  return guild?.channels?.cache ?? null;
}

function normalizeChannelName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function namesMatch(a, b) {
  if (a === b) return true;
  return normalizeChannelName(a) === normalizeChannelName(b);
}

function findChannelByName(guild, name) {
  return getChannelCache(guild)?.find((channel) => namesMatch(channel.name, name)) ?? null;
}

function findTextChannelByName(guild, name) {
  return getChannelCache(guild)?.find(
    (channel) => namesMatch(channel.name, name) && channel.isTextBased?.()
  ) ?? null;
}

function findCategoryByName(guild, name) {
  return getChannelCache(guild)?.find(
    (channel) => channel.type === ChannelType.GuildCategory && namesMatch(channel.name, name)
  ) ?? null;
}

function findGuildTextChannelByName(guild, name, parentId) {
  return getChannelCache(guild)?.find(
    (channel) =>
      channel.type === ChannelType.GuildText &&
      namesMatch(channel.name, name) &&
      (parentId === undefined || channel.parentId === parentId)
  ) ?? null;
}

function findGuildVoiceChannelByName(guild, name, parentId) {
  return getChannelCache(guild)?.find(
    (channel) =>
      channel.type === ChannelType.GuildVoice &&
      namesMatch(channel.name, name) &&
      (parentId === undefined || channel.parentId === parentId)
  ) ?? null;
}

function findGuildForumChannelByName(guild, name, parentId) {
  return getChannelCache(guild)?.find(
    (channel) =>
      channel.type === ChannelType.GuildForum &&
      namesMatch(channel.name, name) &&
      (parentId === undefined || channel.parentId === parentId)
  ) ?? null;
}

/**
 * Resolves a text channel by ID or fallback name
 */
async function resolveTextChannel(guild, preferredId, fallbackName, onFallback) {
  if (preferredId) {
    const byId = await guild.channels.fetch(preferredId).catch(() => null);
    if (byId?.isTextBased()) {
      return byId;
    }

    if (typeof onFallback === 'function') {
      onFallback();
    }
  }

  if (!fallbackName) {
    return null;
  }

  return findTextChannelByName(guild, fallbackName);
}

module.exports = {
  findChannelByName,
  findTextChannelByName,
  findCategoryByName,
  findGuildTextChannelByName,
  findGuildVoiceChannelByName,
  findGuildForumChannelByName,
  resolveTextChannel
};
