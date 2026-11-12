/**
 * configBackup.js
 *
 * Sauvegarde et restauration de la configuration Guardian via un channel Discord privé.
 *
 * Le channel #guardian-backup est créé dans la catégorie Guardian (visible uniquement
 * par le bot + Owner). Il contient un unique message pinné avec le snapshot de config
 * encodé en base64 (pas d'info sensible — uniquement IDs de channels/rôles, settings,
 * mappings de grades, liste des jeux).
 *
 * À chaque modification significative de la config, le snapshot est mis à jour.
 * Au démarrage (ready.js), si la BDD est vide pour un guild, le bot tente de restaurer
 * depuis ce channel.
 */

const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { getDb } = require('../../database/db');
const { getGuildSetting, setGuildSetting } = require('./settings');
const { getGradeMappings } = require('../initialisation/gradeMapping');
const { CHANNELS, CATEGORIES } = require('../../config');
const logger = require('../logs/logger');

const BACKUP_CHANNEL_NAME = CHANNELS.guardianBackup;
const BACKUP_VERSION = 2;
const BACKUP_MARKER = '<!-- guardian-config-backup -->';

// ─── Snapshot builder ────────────────────────────────────────────────────────

function buildSnapshot(guildId) {
  const db = getDb();

  const grades = getGradeMappings(guildId);

  const channelKeys = [
    'general_channel_id', 'rules_channel_id', 'welcome_channel_id',
    'announcements_channel_id', 'faq_channel_id', 'moderation_logs_channel_id',
    'security_updates_channel_id', 'voice_general_id', 'voice_afk_id',
    'requests_channel_id', 'reports_channel_id'
  ];
  const channels = {};
  for (const key of channelKeys) {
    const val = getGuildSetting(guildId, 'channels', key, null);
    if (val) channels[key] = val;
  }

  const settingKeys = [
    ['members', 'bio_required'],
    ['members', 'parrain_required'],
    ['members', 'min_days'],
    ['members', 'welcome_message'],
    ['moderation', 'spam_threshold'],
    ['moderation', 'blacklist_warn'],
    ['moderation', 'slowmode'],
    ['moderation', 'logs_level'],
    ['modules', 'behavior_score_enabled'],
    ['i18n', 'language']
  ];
  const settings = {};
  for (const [section, key] of settingKeys) {
    const val = getGuildSetting(guildId, section, key, null);
    if (val !== null) settings[`${section}.${key}`] = val;
  }

  const games = db.prepare(
    'SELECT name, steam_app_id, text_channel_enabled, galerie_enabled, changelog_enabled FROM games WHERE guild_id = ?'
  ).all(guildId);

  const notifKeys = ['bot_update', 'bot_error', 'setup_incomplete', 'moderation', 'new_member', 'promotion', 'server_status', 'steam_update'];
  const notifs = {};
  for (const key of notifKeys) {
    const val = getGuildSetting(guildId, 'notifications', key, null);
    if (val !== null) notifs[key] = Boolean(val);
  }

  const setupStep = getGuildSetting(guildId, 'setup', 'step', null);
  const installVersion = getGuildSetting(guildId, 'bot', 'install_version', null);

  return {
    _v: BACKUP_VERSION,
    _ts: new Date().toISOString(),
    install_version: installVersion,
    setup_step: setupStep,
    grades,
    channels,
    settings,
    games,
    notifs
  };
}

function encodeSnapshot(snapshot) {
  return Buffer.from(JSON.stringify(snapshot)).toString('base64');
}

function decodeSnapshot(encoded) {
  try {
    return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

// ─── Channel helpers ─────────────────────────────────────────────────────────

function buildBackupPerms(guild) {
  const botUserId = guild.client?.user?.id ?? guild.members?.me?.id;
  const perms = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }
  ];
  if (botUserId) {
    perms.push({
      id: botUserId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages]
    });
  }
  if (guild.ownerId) {
    perms.push({ id: guild.ownerId, allow: [PermissionFlagsBits.ViewChannel] });
  }
  return perms;
}

async function findOrCreateBackupChannel(guild) {
  const existing = guild.channels.cache.find(
    (c) => c.name === BACKUP_CHANNEL_NAME && c.type === ChannelType.GuildText
  );

  const guardianCategory = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === CATEGORIES.configuration
  );

  if (existing) {
    await existing.edit({ permissionOverwrites: buildBackupPerms(guild) }).catch(() => {});
    await positionBackupChannelLast(existing, guardianCategory).catch(() => {});
    return existing;
  }

  const channel = await guild.channels.create({
    name: BACKUP_CHANNEL_NAME,
    type: ChannelType.GuildText,
    topic: 'Canal de sauvegarde Guardian — ne pas supprimer ni modifier.',
    parent: guardianCategory?.id ?? null,
    permissionOverwrites: buildBackupPerms(guild)
  });

  await positionBackupChannelLast(channel, guardianCategory).catch(() => {});
  return channel;
}

async function positionBackupChannelLast(channel, category) {
  if (!category) return;
  const siblings = category.guild.channels.cache
    .filter((c) => c.parentId === category.id && c.id !== channel.id)
    .sort((a, b) => a.position - b.position);
  const lastPos = siblings.size > 0 ? Math.max(...siblings.map((c) => c.position)) + 1 : 0;
  await channel.setPosition(lastPos).catch(() => {});
}

// ─── Save backup ─────────────────────────────────────────────────────────────

/**
 * Saves the current guild config snapshot to #guardian-backup.
 * Creates the channel if it doesn't exist. Edits the existing message if found.
 */
async function saveConfigBackup(guild) {
  if (!guild?.id) return;
  try {
    const channel = await findOrCreateBackupChannel(guild);
    if (!channel) return;

    const snapshot = buildSnapshot(guild.id);
    const encoded = encodeSnapshot(snapshot);
    const content = `${BACKUP_MARKER}\n\`\`\`\n${encoded}\n\`\`\`\n-# Sauvegarde automatique Guardian — ${snapshot._ts}`;

    const pinned = await channel.messages.fetchPins().catch(() => null);
    const existing = pinned?.items?.find((i) => i.message.content.includes(BACKUP_MARKER) && i.message.author.id === guild.client?.user?.id)?.message;

    if (existing) {
      await existing.edit(content).catch(() => {});
    } else {
      const msg = await channel.send(content);
      await msg.pin().catch(() => {});
    }

    setGuildSetting(guild.id, 'bot', 'last_backup_ts', snapshot._ts);
    logger.info(`Guild ${guild.id}: config backup saved to #${BACKUP_CHANNEL_NAME}`);
  } catch (err) {
    logger.warn(`Guild ${guild.id}: failed to save config backup — ${err?.message}`);
  }
}

// ─── Restore backup ──────────────────────────────────────────────────────────

/**
 * Attempts to restore guild config from the #guardian-backup channel.
 * Returns true if restore was successful, false otherwise.
 */
async function restoreConfigFromBackup(guild) {
  if (!guild?.id) return false;
  try {
    const channel = guild.channels.cache.find(
      (c) => c.name === BACKUP_CHANNEL_NAME && c.type === ChannelType.GuildText
    );
    if (!channel) return false;

    const messages = await channel.messages.fetch({ limit: 20 });
    const backupMsg = messages.find((m) => m.content.includes(BACKUP_MARKER));
    if (!backupMsg) return false;

    const match = backupMsg.content.match(/```\n([A-Za-z0-9+/=\n]+)\n```/);
    if (!match) return false;

    const snapshot = decodeSnapshot(match[1].replace(/\n/g, ''));
    if (!snapshot || snapshot._v !== BACKUP_VERSION) {
      logger.warn(`Guild ${guild.id}: backup snapshot version mismatch — skipping restore`);
      return false;
    }

    applySnapshot(guild.id, snapshot);
    logger.info(`Guild ${guild.id}: config restored from #${BACKUP_CHANNEL_NAME} (snapshot from ${snapshot._ts})`);

    if (snapshot.setup_step >= 8) {
      const { markGuildInstalled } = require('../initialisation/checkInstall');
      markGuildInstalled(guild.id, guild.ownerId);
      logger.info(`Guild ${guild.id}: marked as installed after backup restore`);
    }

    return true;
  } catch (err) {
    logger.warn(`Guild ${guild.id}: failed to restore config backup — ${err?.message}`);
    return false;
  }
}

// ─── Apply snapshot to DB ────────────────────────────────────────────────────

function applySnapshot(guildId, snapshot) {
  const { setGradeRole } = require('../initialisation/gradeMapping');

  if (snapshot.grades && typeof snapshot.grades === 'object') {
    for (const [grade, roleId] of Object.entries(snapshot.grades)) {
      if (roleId) setGradeRole(guildId, grade, roleId);
    }
  }

  if (snapshot.channels && typeof snapshot.channels === 'object') {
    for (const [key, val] of Object.entries(snapshot.channels)) {
      if (val) setGuildSetting(guildId, 'channels', key, val);
    }
  }

  if (snapshot.settings && typeof snapshot.settings === 'object') {
    for (const [dotKey, val] of Object.entries(snapshot.settings)) {
      const dot = dotKey.indexOf('.');
      if (dot === -1) continue;
      const section = dotKey.slice(0, dot);
      const key = dotKey.slice(dot + 1);
      setGuildSetting(guildId, section, key, val);
    }
  }

  if (snapshot.notifs && typeof snapshot.notifs === 'object') {
    for (const [key, val] of Object.entries(snapshot.notifs)) {
      setGuildSetting(guildId, 'notifications', key, val ? 1 : 0);
    }
  }

  if (Array.isArray(snapshot.games) && snapshot.games.length > 0) {
    const db = getDb();
    for (const game of snapshot.games) {
      if (!game.name) continue;
      const existing = db.prepare('SELECT game_id FROM games WHERE guild_id = ? AND LOWER(name) = LOWER(?)').get(guildId, game.name);
      if (!existing) {
        db.prepare(
          `INSERT INTO games (guild_id, name, steam_app_id, text_channel_enabled, galerie_enabled, changelog_enabled)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(guildId, game.name, game.steam_app_id ?? null, game.text_channel_enabled ?? 0, game.galerie_enabled ?? 1, game.changelog_enabled ?? 0);
      }
    }
  }

  if (snapshot.install_version) {
    setGuildSetting(guildId, 'bot', 'install_version', snapshot.install_version);
  }
  if (snapshot.setup_step) {
    setGuildSetting(guildId, 'setup', 'step', snapshot.setup_step);
  }
}

module.exports = { saveConfigBackup, restoreConfigFromBackup, buildSnapshot, encodeSnapshot, decodeSnapshot, BACKUP_MARKER, BACKUP_CHANNEL_NAME };
