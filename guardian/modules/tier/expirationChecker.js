const { getPremiumExpiry, deactivatePremium } = require('./tier');
const { getGuildSetting, setGuildSetting } = require('../config/settings');
const logger = require('../logs/logger');
const { guardAsync } = require('../utils/intervalGuard');

const FREE_REPO_URL = 'https://github.com/jeremiejt38/Guardian_Discord_Bot_Free';
const MIGRATION_GUIDE_URL = 'https://github.com/jeremiejt38/Guardian_Discord_Bot_Free#migration';

function buildExpiryMessage(guildName, daysLeft = null) {
  const title = daysLeft === null
    ? `Votre abonnement Guardian Premium pour **${guildName}** a expiré.`
    : `Votre abonnement Guardian Premium pour **${guildName}** expire dans **${daysLeft} jour${daysLeft > 1 ? 's' : ''}.**`;

  return [
    title,
    '',
    '**Pour continuer sans interruption :**',
    '1. Exporter vos données : lancez `/migration exporter` sur ce serveur avec le bot premium.',
    `2. Installez la version free : ${FREE_REPO_URL}`,
    `3. Restaurez vos données : lancez \`/migration importer\` avec le fichier exporté.`,
    '',
    '> Conservez bien le fichier de migration généré par `/migration exporter`.',
    `> Guide de migration : ${MIGRATION_GUIDE_URL}`
  ].join('\n');
}

async function sendExpiryDM(client, guild, daysLeft = null) {
  const ownerId = guild.ownerId;
  if (!ownerId) return false;

  try {
    const owner = await client.users.fetch(ownerId);
    if (!owner) return false;

    const message = buildExpiryMessage(guild.name, daysLeft);
    await owner.send(message);
    return true;
  } catch (err) {
    logger.warn(`[expirationChecker] Failed to send expiry DM to ${ownerId} for guild ${guild.id}: ${err.message}`);
    return false;
  }
}

async function processExpiredGuild(client, guild) {
  const ownerNotified = await sendExpiryDM(client, guild);

  try {
    deactivatePremium(guild.id);
    await guild.leave();
    logger.info(`[expirationChecker] Left expired premium guild ${guild.id} (${guild.name}), owner notified=${ownerNotified}`);
  } catch (err) {
    logger.error(`[expirationChecker] Failed to leave guild ${guild.id}: ${err.message}`);
  }
}

async function processWarnings(client, guild, expiryDate) {
  const now = Date.now();
  const msLeft = expiryDate.getTime() - now;
  const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));

  const warningKey = 'premium_expiry_warning_sent';
  const lastWarning = getGuildSetting(guild.id, 'bot', warningKey, null);

  if (daysLeft <= 7 && lastWarning !== '7d') {
    const sent = await sendExpiryDM(client, guild, daysLeft);
    if (sent) {
      setGuildSetting(guild.id, 'bot', warningKey, '7d');
    }
  } else if (daysLeft > 7 && lastWarning !== null) {
    setGuildSetting(guild.id, 'bot', warningKey, null);
  }
}

async function checkPremiumExpirations(client) {
  for (const guild of client.guilds.cache.values()) {
    try {
      const expiry = getPremiumExpiry(guild.id);
      if (!expiry) continue;

      const now = Date.now();
      if (expiry.getTime() <= now) {
        await processExpiredGuild(client, guild);
      } else {
        await processWarnings(client, guild, expiry);
      }
    } catch (err) {
      logger.error(`[expirationChecker] Error checking guild ${guild.id}: ${err.message}`);
    }
  }
}

function startExpirationChecker(client, intervalMs = 60 * 60 * 1000) {
  if (!client) return;

  // Initial check after a short delay to avoid blocking ready
  setTimeout(() => checkPremiumExpirations(client).catch((err) => logger.error('[expirationChecker] initial check failed', err)), 30 * 1000);

  const interval = setInterval(guardAsync(async () => {
    checkPremiumExpirations(client).catch((err) => logger.error('[expirationChecker] periodic check failed', err));
  }), intervalMs);

  client.__expirationCheckerInterval = interval;
}

function stopExpirationChecker(client) {
  if (client?.__expirationCheckerInterval) {
    clearInterval(client.__expirationCheckerInterval);
    delete client.__expirationCheckerInterval;
  }
}

module.exports = {
  startExpirationChecker,
  stopExpirationChecker,
  checkPremiumExpirations
};
