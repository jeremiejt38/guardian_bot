const { isGuildInstalled } = require('../modules/initialisation/checkInstall');
const { createSetupArea, ensureSetupInstallPrompt, cleanupSetupAreaIfInstalled } = require('../modules/initialisation/setup');
const { startInviteExpulsionJob } = require('../modules/members/expulsion');
const { startChangelogTimer } = require('../modules/games/gamesNotification');
const { startServerMonitor } = require('../modules/servers/serverMonitor');
const { applyPersistedSlowModeForGuild } = require('../modules/moderation/autoMod');
const { ensureMemberGameInterfaces } = require('../modules/config/settings');
const { runPassiveScoreRegen } = require('../modules/moderation/behavior');
const { seedGuildMessages } = require('../modules/initialisation/seeds');
const { ensureRequestsPanelHasGameButton } = require('../modules/games/gameRequests');
const { ensureRequestsPanel } = require('../modules/members/memberRequests');
const { upsertStatusEmbed } = require('../modules/config/botPanel');
const { getGuildSetting, setGuildSetting } = require('../modules/config/settings');
const { setConfig, getConfig } = require('../database/db');
const { runChannelMigrations } = require('../modules/migrations/channelMigrations');
const { runVersionedMigrations } = require('../modules/migrations/versionedMigrations');
const { restoreConfigFromBackup, saveConfigBackup } = require('../modules/config/configBackup');
const { getInstallContext } = require('../modules/initialisation/detectInstallContext');
const { CATEGORIES, CHANNELS } = require('../config');
const { findCategoryByName, findGuildTextChannelByName } = require('../modules/utils/channels');
const logger = require('../modules/logs/logger');
const { version } = require('../package.json');
const { notifyBotAdminUpdate, getBotAdminId, bootstrapAdminIfNeeded } = require('../modules/admin/botUpdater');
const { sendAdminDmMessage } = require('../modules/admin/adminPanel');
const { notifyAllGuildsNewOptions } = require('../modules/migrations/newOptionsNotifier');
const { initAlerts, alertGuildJoin, alertGuildLeave } = require('../modules/admin/adminAlerts');
const { openOrRefreshPanel, pushPanelToBottom } = require('../modules/admin/adminPanel');
const { checkMissingPermissions } = require('../modules/admin/permissionStartupCheck');
const { startExpirationChecker } = require('../modules/tier/expirationChecker');

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    logger.info(`Connected as ${client.user.tag}`);
    initAlerts(client);
    if (!getBotAdminId()) {
      logger.warn('BOT_ADMIN_ID non défini dans .env — tentative bootstrap automatique');
      await bootstrapAdminIfNeeded(client, client.guilds.cache).catch(() => {});
    } else {
      await openOrRefreshPanel(client).catch(() => {});
    }

    await checkMissingPermissions(client).catch((err) => logger.error('Permission startup check failed', err));

    for (const guild of client.guilds.cache.values()) {
      try {
        const alreadyInstalled = isGuildInstalled(guild.id);

        if (alreadyInstalled) {
          await cleanupSetupAreaIfInstalled(guild);
        } else {
          const restored = await restoreConfigFromBackup(guild);
          if (restored) {
            logger.info(`Guild ${guild.id}: config restored from backup — skipping full setup area creation`);
          } else {
            await createSetupArea(guild);
          }
          await ensureSetupInstallPrompt(guild, { forceCreateIfMissing: true });

          const context = getInstallContext(guild);
          if (context === 'guardian_partial') {
            const ownerId = getGuildSetting(guild.id, 'setup', 'owner_id', null)
              ?? getGuildSetting(guild.id, 'setup', 'inviter_id', null)
              ?? guild.ownerId;
            const ownerUser = await client.users.fetch(ownerId).catch(() => null);
            if (ownerUser) {
              const setupCategory = findCategoryByName(guild, CATEGORIES.setup);
              const setupChannel = setupCategory
                ? findGuildTextChannelByName(guild, CHANNELS.setup, setupCategory.id)
                : null;
              const setupLink = setupChannel
                ? `https://discord.com/channels/${guild.id}/${setupChannel.id}`
                : null;
              const msg = [
                `## ⚙️ Guardian — configuration incomplète détectée`,
                ``,
                `Guardian vient d'être reconnecté sur **${guild.name}** et a détecté une configuration incomplète.`,
                ``,
                `> Pour finaliser l'installation, reprends la configuration là où tu t'es arrêté.`,
                setupLink ? `\n🔗 **[Reprendre la configuration](${setupLink})**` : `\n> Rends-toi dans le channel **#${CHANNELS.setup}** sur ton serveur.`
              ].join('\n');
              const isAdmin = ownerId === getBotAdminId();
              if (isAdmin) {
                await sendAdminDmMessage(client, { content: msg }).catch(() =>
                  logger.warn(`Ready: could not send setup_incomplete admin DM to ${ownerId} for guild ${guild.id}`)
                );
              } else {
                await ownerUser.send(msg).catch(() =>
                  logger.warn(`Ready: could not send setup_incomplete DM to ${ownerId} for guild ${guild.id}`)
                );
              }
              logger.info(`Guild ${guild.id}: setup_incomplete DM sent to ${ownerId}`);
            }
          }
        }

        await applyPersistedSlowModeForGuild(guild);
        await ensureMemberGameInterfaces(guild);
        await ensureRequestsPanel(guild).catch(() => {});
        await seedGuildMessages(guild).catch(() => undefined);

        await runChannelMigrations(guild);
        await runVersionedMigrations(guild).catch((err) => logger.error(`Failed versioned migrations for guild ${guild.id}`, err));

        const lastVersion = getGuildSetting(guild.id, 'bot', 'last_version', null);
        if (lastVersion !== version) {
          setGuildSetting(guild.id, 'bot', 'last_version', version);
        }

        if (isGuildInstalled(guild.id)) {
          await ensureRequestsPanelHasGameButton(guild).catch(() => {});
        }
        await saveConfigBackup(guild).catch(() => {});
      } catch (error) {
        logger.error(`Failed ready setup check for guild ${guild.id}`, error);
      }
    }

    const GLOBAL = '__global__';
    const lastGlobalVersion = getConfig(GLOBAL, 'bot', 'last_version', null);
    const isUpdate = Boolean(lastGlobalVersion && lastGlobalVersion !== version);
    if (isUpdate) {
      setConfig(GLOBAL, 'bot', 'last_version', version);
      await notifyBotAdminUpdate(client, lastGlobalVersion, version).catch(() => {});
    } else if (!lastGlobalVersion) {
      setConfig(GLOBAL, 'bot', 'last_version', version);
    }

    await notifyAllGuildsNewOptions(client).catch(() => {});

    setInterval(() => {
      for (const guild of client.guilds.cache.values()) {
        upsertStatusEmbed(guild).catch(() => {});
      }
    }, 5 * 60 * 1000);

    startInviteExpulsionJob(client);
    startChangelogTimer();
    startServerMonitor(client, 60 * 1000);
    startExpirationChecker(client);
    setInterval(() => runPassiveScoreRegen(client).catch((err) => logger.error('Passive regen error', err)), 60 * 60 * 1000);
    runPassiveScoreRegen(client).catch((err) => logger.error('Passive regen error', err));
  }
};
