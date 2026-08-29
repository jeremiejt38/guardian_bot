const { getGuildSetting, setGuildSetting } = require('../config/settings');
const { refreshGuildPanels } = require('../initialisation/seeds');
const { provisionGuildGameStructures } = require('../games/gameList');
const { version } = require('../../package.json');
const logger = require('../logs/logger');

function semverToInt(v) {
  const [major = 0, minor = 0, patch = 0] = String(v).replace(/^v/, '').split('.').map(Number);
  return major * 10000 + minor * 100 + patch;
}

const VERSIONED_MIGRATIONS = [
  {
    version: '0.30.8',
    description: 'Refresh all configuration panels after install flow fix',
    async up(guild) {
      await refreshGuildPanels(guild);
    }
  }
];

async function runVersionedMigrations(guild) {
  const guildId = guild.id;
  const appliedVersion = getGuildSetting(guildId, 'migrations', 'versioned_applied_version', '0.0.0');
  const appliedInt = semverToInt(appliedVersion);
  const currentInt = semverToInt(version);

  if (currentInt <= appliedInt) return;

  const pending = VERSIONED_MIGRATIONS
    .filter((m) => semverToInt(m.version) > appliedInt && semverToInt(m.version) <= currentInt)
    .sort((a, b) => semverToInt(a.version) - semverToInt(b.version));

  if (pending.length === 0) {
    setGuildSetting(guildId, 'migrations', 'versioned_applied_version', version);
    return;
  }

  logger.info(`Guild ${guildId}: ${pending.length} versioned migration(s) to apply (current ${appliedVersion} → ${version})`);

  for (const migration of pending) {
    try {
      await migration.up(guild);
      setGuildSetting(guildId, 'migrations', 'versioned_applied_version', migration.version);
      logger.info(`Guild ${guildId}: versioned migration ${migration.version} applied — ${migration.description}`);
    } catch (e) {
      logger.error(`Guild ${guildId}: versioned migration ${migration.version} failed — ${migration.description}`, e);
      break;
    }
  }
}

module.exports = { runVersionedMigrations, VERSIONED_MIGRATIONS };
