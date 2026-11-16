/**
 * New options notifier — sent to guild owners on bot update.
 *
 * Each entry in NEW_OPTIONS_REGISTRY describes a new configurable option
 * introduced in a specific version. On startup, Guardian checks per guild
 * which options are unconfigured and sends a DM to the owner.
 *
 * Adding a new option:
 *   1. Add an entry to NEW_OPTIONS_REGISTRY with the correct `addedInVersion`.
 *   2. The `isConfigured(guildId, guild)` function returns true if the option
 *      is already set (no notification needed).
 *   3. The `setupLink` points to the setup step where it can be configured
 *      (step number matching the setup flow).
 */

const { getGuildSetting, setGuildSetting } = require('../config/settings');
const { setConfig, getConfig } = require('../../database/db');
const logger = require('../logs/logger');

const GLOBAL = '__global__';

function semverToInt(v) {
  const [major = 0, minor = 0, patch = 0] = (v || '0.0.0').split('.').map(Number);
  return major * 10000 + minor * 100 + patch;
}

/**
 * Registry of new configurable options, versioned.
 * Each entry:
 *   - addedInVersion: string semver
 *   - emoji: string
 *   - label: string (short name)
 *   - desc: string (one-line description)
 *   - setupStep: number (setup step where it's configured)
 *   - isConfigured(guildId, guild): boolean — true = already set, skip
 */
const NEW_OPTIONS_REGISTRY = [
  {
    addedInVersion: '0.23.4',
    emoji: '📜',
    label: 'Rules acceptance requirement',
    desc: 'Require users to accept the server rules before requesting membership.',
    setupStep: 4,
    isConfigured: (guildId) => getGuildSetting(guildId, 'members', 'rules_acceptance_required', null) !== null
  },
  {
    addedInVersion: '0.23.4',
    emoji: '🔒',
    label: 'Strict invite mode',
    desc: 'Restrict invited users from accessing voice channels and #general until they become members.',
    setupStep: 4,
    isConfigured: (guildId) => getGuildSetting(guildId, 'members', 'invite_strict_mode', null) !== null
  },
  {
    addedInVersion: '0.23.5',
    emoji: '📚',
    label: 'Server guides',
    desc: 'Automatically generate read-only guide channels (getting started, promotion, games, commands).',
    setupStep: 2,
    isConfigured: (guildId) => getGuildSetting(guildId, 'guides', 'enabled', null) !== null
  }
];

/**
 * Returns the list of new options that are unconfigured for a guild,
 * introduced after the guild's install version.
 */
function getPendingOptionsForGuild(guildId, guild) {
  const installVersion = getGuildSetting(guildId, 'bot', 'install_version', null);
  if (!installVersion) return [];

  const installInt = semverToInt(installVersion);
  const isCommunity = guild?.features?.includes('COMMUNITY') ?? false;

  return NEW_OPTIONS_REGISTRY.filter((opt) => {
    if (semverToInt(opt.addedInVersion) <= installInt) return false;
    if (opt.communityOnly && !isCommunity) return false;
    return !opt.isConfigured(guildId, guild);
  });
}

/**
 * Sends a DM to the guild owner listing unconfigured new options.
 * Deduplicates by tracking the last notified version per guild.
 */
async function notifyOwnerNewOptions(client, guild) {
  const guildId = guild.id;
  const { version } = require('../../package.json');

  const lastNotified = getGuildSetting(guildId, 'bot', 'new_options_notified_version', null);
  if (lastNotified === version) return;

  const pending = getPendingOptionsForGuild(guildId, guild);
  if (pending.length === 0) return;

  const ownerId = getGuildSetting(guildId, 'setup', 'owner_id', null)
    ?? getGuildSetting(guildId, 'setup', 'inviter_id', null)
    ?? guild.ownerId;

  const owner = await client.users.fetch(ownerId).catch(() => null);
  if (!owner) return;

  const groupedByStep = {};
  for (const opt of pending) {
    const step = opt.setupStep;
    if (!groupedByStep[step]) groupedByStep[step] = [];
    groupedByStep[step].push(opt);
  }

  const lines = [
    `## 🆕 Guardian v${version} — New options to configure on **${guild.name}**`,
    '',
    'The following options were added in this update and are not yet configured for your server.',
    'You can configure them by running the setup wizard (`/setup`) on your server.',
    ''
  ];

  for (const [step, opts] of Object.entries(groupedByStep)) {
    lines.push(`### Setup step ${step}`);
    for (const opt of opts) {
      lines.push(`${opt.emoji} **${opt.label}**`);
      lines.push(`> ${opt.desc}`);
      lines.push('');
    }
  }

  lines.push('-# *You only receive this message once per version update.*');

  await owner.send(lines.join('\n')).catch((err) => {
    logger.warn(`newOptionsNotifier: failed to DM owner ${ownerId} for guild ${guildId} — ${err.message}`);
  });

  setGuildSetting(guildId, 'bot', 'new_options_notified_version', version);
  logger.info(`newOptionsNotifier: notified owner ${ownerId} of guild ${guildId} — ${pending.length} new option(s)`);
}

/**
 * Run for all guilds on bot startup after an update.
 */
async function notifyAllGuildsNewOptions(client) {
  for (const guild of client.guilds.cache.values()) {
    await notifyOwnerNewOptions(client, guild).catch((err) => {
      logger.warn(`newOptionsNotifier: error for guild ${guild.id} — ${err.message}`);
    });
  }
}

module.exports = { notifyAllGuildsNewOptions, getPendingOptionsForGuild, NEW_OPTIONS_REGISTRY };
