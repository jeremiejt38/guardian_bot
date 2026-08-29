const { markReportHandled, handleOpenReportButton, handleReportModalSubmit } = require('../modules/moderation/reports');
const { handleSlowModeInteraction } = require('../modules/moderation/slowModePanel');
const { handleBehaviorInteraction } = require('../modules/moderation/behaviorPanel');
const { handleMembresInteraction } = require('../modules/config/membresPanel');
const { handleChannelsInteraction } = require('../modules/config/channelsPanel');
const { handleVocauxInteraction } = require('../modules/config/vocauxPanel');
const { handleJeuxInteraction } = require('../modules/config/jeuxPanel');
const { handleServeursJeuInteraction } = require('../modules/config/serveursJeuPanel');
const { handleRolesInteraction } = require('../modules/config/rolesPanel');
const { handleBotInteraction } = require('../modules/config/botPanel');
const { handleGuardianInteraction } = require('../modules/config/guardianPanel');
const { handleHistoriquePagination } = require('../commands/historique');
const { handleOpenGameList, handleGameListSelection, handleGameListPage } = require('../modules/games/gameList');
const { handleGamesInteraction } = require('../modules/games/optInInteraction');
const { handleServerGamesInteraction } = require('../modules/games/serverGamesManager');
const { handleGameRequestInteraction } = require('../modules/games/gameRequests');
const { handleMemberRequestInteraction } = require('../modules/members/memberRequests');
const { handlePromotionInteraction, IDS: PROMOTION_IDS } = require('../modules/members/promotion');
const { handleBecomeMemberInteraction } = require('../modules/members/becomeMemberChannel');
const { handleRulesInteraction } = require('../modules/members/rulesAcceptance');
const { t } = require('../modules/i18n');
const { performUpdate, isBotAdmin, setBotAdminId, getBotAdminId } = require('../modules/admin/botUpdater');
const { handlePanelInteraction, openOrRefreshPanel } = require('../modules/admin/adminPanel');
const {
  SETUP_INSTALL_BUTTON_ID,
  SETUP_START_BUTTON_ID,
  SETUP_LANGUAGE_SELECT_ID,
  SETUP_INTEGRATE_BUTTON_ID,
  SETUP_RESET_BUTTON_ID,
  SETUP_FORCE_EXISTING_BUTTON_ID,
  SETUP_FORCE_REINSTALL_BUTTON_ID,
  handleSetupInstallButton,
  handleSetupIntegrateButton,
  handleSetupResetButton,
  handleSetupForceExistingButton,
  handleSetupForceReinstallButton,
  handleSetupLanguageSelection,
  SETUP_CLEAN_SERVER_BUTTON_ID,
  SETUP_CLEAN_MODAL_ID,
  SETUP_CLEAN_VOCALS_BUTTON_ID,
  SETUP_CLEAN_ROLES_BUTTON_ID,
  SETUP_FRESH_START_BUTTON_ID,
  handleSetupCleanServerButton,
  handleSetupCleanModal,
  handleSetupCleanVocalsButton,
  handleSetupCleanRolesButton
} = require('../modules/initialisation/setup');
const { handleSetupInteraction, startWizardInChannel } = require('../modules/initialisation/setupFlow');
const { handleAddServerButton, handleServerModalSubmit, memberCanManageServers } = require('../modules/servers/interaction');
const { handleTempVoiceInteraction } = require('../modules/games/tempVoiceInteraction');
const { getGuildSetting, setGuildSetting } = require('../modules/config/settings');
const { getDb } = require('../database/db');
const { decrypt } = require('../modules/crypto/secrets');
const { CHANNELS } = require('../config');
const { findGuildTextChannelByName } = require('../modules/utils/channels');
const { handleInteractionError } = require('../modules/utils/discordErrors');
const { checkRateLimit } = require('../modules/utils/rateLimit');
const { handlePremiumGateClick } = require('../modules/tier/premiumGate');
const { handleSuggestionInteraction } = require('../modules/suggestions/suggestions');
const logger = require('../modules/logs/logger');

const commandCooldowns = new Map();
const COMMAND_COOLDOWN_MS = 2000;

module.exports = {
  name: 'interactionCreate',
  async execute(client, interaction) {
    try {
    const AGE_LIMIT_MS = 3000;
    if (interaction.createdTimestamp && Date.now() - interaction.createdTimestamp > AGE_LIMIT_MS) {
      return;
    }

    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) {
        return;
      }

      const cooldownKey = `${interaction.user.id}:${interaction.commandName}`;
      const lastUsed = commandCooldowns.get(cooldownKey) ?? 0;
      const now = Date.now();
      if (now - lastUsed < COMMAND_COOLDOWN_MS) {
        await interaction.reply({ content: '⏳ Please wait a moment before using this command again.', ephemeral: true }).catch(() => {});
        return;
      }
      commandCooldowns.set(cooldownKey, now);
      if (commandCooldowns.size > 500) {
        const cutoff = now - COMMAND_COOLDOWN_MS;
        for (const [k, t] of commandCooldowns) if (t < cutoff) commandCooldowns.delete(k);
      }

      await command.execute(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId?.startsWith('premium:gate:')) {
      await handlePremiumGateClick(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId?.startsWith('suggestions:status:')) {
      const handled = await handleSuggestionInteraction(interaction);
      if (handled) return;
    }

    if (interaction.isButton() && interaction.customId?.startsWith('bot:admin:bootstrap:')) {
      const action = interaction.customId.split(':')[3];
      await interaction.deferUpdate().catch(() => {});
      if (action === 'confirm') {
        const userId = interaction.user.id;
        setBotAdminId(userId);
        await interaction.message?.edit({
          content: [
            '## ✅ Admin système configuré',
            '',
            'Tu es maintenant l\'administrateur système de Guardian.',
            '> Tu recevras les alertes bot et pourras déclencher les mises à jour depuis ce DM.',
            '> Tu peux aussi fixer ton ID dans `.env` : `BOT_ADMIN_ID=' + userId + '`',
          ].join('\n'),
          components: [],
        }).catch(() => {});
        await openOrRefreshPanel(client).catch(() => {});
      } else {
        await interaction.message?.edit({ content: '⏭️ Configuration admin ignorée.', components: [] }).catch(() => {});
      }
      return;
    }

    if (interaction.isButton() && interaction.customId?.startsWith('admin:panel:')) {
      await handlePanelInteraction(interaction, client);
      return;
    }

    if (interaction.isButton() && interaction.customId?.startsWith('bot:admin:update:')) {
      const action = interaction.customId.split(':').pop();
      if (action === 'confirm') {
        await performUpdate(interaction);
      } else if (action === 'skip') {
        if (!isBotAdmin(interaction.user.id)) {
          await interaction.reply({ content: '❌ Tu n\'es pas autorisé.', ephemeral: true }).catch(() => {});
          return;
        }
        await interaction.deferUpdate().catch(() => {});
        await interaction.message?.edit({ content: '⏭️ Mise à jour ignorée.', components: [] }).catch(() => {});
      }
      return;
    }

    if (interaction.isButton() && interaction.customId?.startsWith('setup:prerelease:')) {
      const parts = interaction.customId.split(':');
      const action = parts[2];
      const guildId = parts[3];
      const { version, prerelease } = require('../package.json');
      await interaction.deferUpdate().catch(() => {});
      const validGuild = guildId && client.guilds.cache.has(guildId);
      if (action === 'confirm' && validGuild) {
        setGuildSetting(guildId, 'bot', 'last_version', version);
        setGuildSetting(guildId, 'bot', 'prerelease_pending', null);
        const confirmed = [
          `## ✅ Mise à jour confirmée — **v${version}**${prerelease ? ' *(test)*' : ''}`,
          ``,
          `Guardian a été mis à jour sur le serveur.`,
          `> La configuration est préservée. Merci d'avoir validé cette version de test.`
        ].join('\n');
        await interaction.message?.edit({ content: confirmed, components: [] }).catch(() => {});
      } else if (action === 'skip' && validGuild) {
        setGuildSetting(guildId, 'bot', 'prerelease_skipped', version);
        const skipped = [
          `## ⏭️ Mise à jour ignorée — v${version} *(test)*`,
          ``,
          `Guardian continue de fonctionner avec la version précédente.`,
          `> Dès que cette version sera stable, la mise à jour s'appliquera automatiquement.`
        ].join('\n');
        await interaction.message?.edit({ content: skipped, components: [] }).catch(() => {});
      }
      return;
    }

    if ((interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) && interaction.customId) {
      if (checkRateLimit(interaction.user.id, interaction.customId)) {
        await interaction.deferUpdate().catch(() => {});
        return;
      }
    }

    if (
      interaction.customId?.startsWith('tempvoice:') ||
      interaction.customId === 'init.createChannel' ||
      interaction.customId === 'creer:open'
    ) {
      const handled = await handleTempVoiceInteraction(interaction);
      if (handled) return;
    }

    if (interaction.customId?.startsWith('automod:slowmode:')) {
      const handled = await handleSlowModeInteraction(interaction);
      if (handled) return;
    }

    if (interaction.customId?.startsWith('behavior:')) {
      const handled = await handleBehaviorInteraction(interaction);
      if (handled) return;
    }

    if (interaction.customId?.startsWith('membres:')) {
      const handled = await handleMembresInteraction(interaction);
      if (handled) return;
    }

    if (interaction.customId?.startsWith('channels:toggle:')) {
      const handled = await handleChannelsInteraction(interaction);
      if (handled) return;
    }

    if (interaction.customId?.startsWith('vocaux:')) {
      const handled = await handleVocauxInteraction(interaction);
      if (handled) return;
    }

    if (interaction.customId?.startsWith('jeux:')) {
      const handled = await handleJeuxInteraction(interaction);
      if (handled) return;
    }

    if (interaction.customId?.startsWith('changelogs:')) {
      const handled = await handleJeuxInteraction(interaction);
      if (handled) return;
    }

    if (
      interaction.customId?.startsWith('serveurs-jeu:') ||
      interaction.customId?.startsWith('servers:approve:') ||
      interaction.customId?.startsWith('servers:reject:')
    ) {
      const handled = await handleServeursJeuInteraction(interaction);
      if (handled) return;
    }

    if (interaction.customId?.startsWith('roles:')) {
      const handled = await handleRolesInteraction(interaction);
      if (handled) return;
    }

    if (interaction.customId?.startsWith('bot:')) {
      const handled = await handleBotInteraction(interaction);
      if (handled) return;
    }

    if (interaction.customId?.startsWith('guardian:')) {
      const handled = await handleGuardianInteraction(interaction);
      if (handled) return;
    }

    if (interaction.isButton() && interaction.customId === 'report:open') {
      await handleOpenReportButton(interaction);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === 'report:modal') {
      await handleReportModalSubmit(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('report:handled')) {
      await markReportHandled(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('historique:')) {
      await handleHistoriquePagination(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId === 'gamelist:open') {
      await handleOpenGameList(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('gamelist:select:page:')) {
      await handleGameListPage(interaction);
      return;
    }

    if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
      if (
        interaction.customId === PROMOTION_IDS.request ||
        interaction.customId === PROMOTION_IDS.submitBioModal ||
        interaction.customId.startsWith(`${PROMOTION_IDS.acceptPrefix}:`) ||
        interaction.customId.startsWith(`${PROMOTION_IDS.rejectPrefix}:`) ||
        interaction.customId.startsWith(`${PROMOTION_IDS.replyPrefix}:`) ||
        interaction.customId.startsWith(`${PROMOTION_IDS.rejectReasonModalPrefix}:`) ||
        interaction.customId.startsWith(`${PROMOTION_IDS.replyMessageModalPrefix}:`)
      ) {
        const handled = await handlePromotionInteraction(interaction);
        if (handled) return;
      }
    }

    if (interaction.customId?.startsWith('become:')) {
      const handled = await handleBecomeMemberInteraction(interaction);
      if (handled) return;
    }

    if (interaction.customId === 'rules:accept') {
      const handled = await handleRulesInteraction(interaction);
      if (handled) return;
    }

    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      if (interaction.customId === 'games:manage' || interaction.customId.startsWith('games:select')) {
        const handled = await handleGamesInteraction(interaction);
        if (handled) return;
      }
    }

    if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
      if (
        interaction.customId === 'servergames:add' ||
        interaction.customId === 'servergames:remove' ||
        interaction.customId === 'servergames:add:modal' ||
        interaction.customId.startsWith('servergames:remove:select')
      ) {
        const handled = await handleServerGamesInteraction(interaction);
        if (handled) return;
      }

      const gameRequestHandled = await handleGameRequestInteraction(interaction);
      if (gameRequestHandled) return;
    }

    const memberRequestHandled = await handleMemberRequestInteraction(interaction);
    if (memberRequestHandled) return;

    if (interaction.isButton() && interaction.customId === SETUP_INSTALL_BUTTON_ID) {
      await handleSetupInstallButton(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId === SETUP_START_BUTTON_ID) {
      await startWizardInChannel(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId === SETUP_FRESH_START_BUTTON_ID) {
      setGuildSetting(interaction.guildId, 'setup', 'step', 1);
      setGuildSetting(interaction.guildId, 'setup', 'fresh_install', true);
      await startWizardInChannel(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId === SETUP_INTEGRATE_BUTTON_ID) {
      await handleSetupIntegrateButton(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId === SETUP_RESET_BUTTON_ID) {
      await handleSetupResetButton(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId === SETUP_CLEAN_SERVER_BUTTON_ID) {
      await handleSetupCleanServerButton(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId === SETUP_CLEAN_VOCALS_BUTTON_ID) {
      await handleSetupCleanVocalsButton(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId === SETUP_CLEAN_ROLES_BUTTON_ID) {
      await handleSetupCleanRolesButton(interaction);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === SETUP_CLEAN_MODAL_ID) {
      await handleSetupCleanModal(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId === SETUP_FORCE_EXISTING_BUTTON_ID) {
      await handleSetupForceExistingButton(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId === SETUP_FORCE_REINSTALL_BUTTON_ID) {
      await handleSetupForceReinstallButton(interaction);
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('gamelist:select:')) {
      await handleGameListSelection(interaction);
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === SETUP_LANGUAGE_SELECT_ID) {
      await handleSetupLanguageSelection(interaction);
      return;
    }

    if (
      typeof interaction.customId === 'string'
      && interaction.customId.startsWith('setup:')
      && interaction.customId !== SETUP_INSTALL_BUTTON_ID
      && interaction.customId !== SETUP_LANGUAGE_SELECT_ID
    ) {
      const handled = await handleSetupInteraction(interaction);
      if (handled) {
        return;
      }
    }

    if (interaction.isButton() && interaction.customId === 'servers:add') {
      await handleAddServerButton(interaction);
      return;
    }


    if (interaction.isModalSubmit() && interaction.customId === 'servers:add:modal') {
      await handleServerModalSubmit(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('servers:approve:')) {
      if (!memberCanManageServers(interaction)) {
        await interaction.reply({ content: t(interaction.guildId, 'interaction.forbidden'), ephemeral: true });
        return;
      }
      const parts = interaction.customId.split(':');
      const serverId = Number(parts[2]);
      const db = getDb();
      db.prepare('UPDATE servers_jeu SET approved = 1 WHERE server_id = ?').run(serverId);

      const row = db.prepare('SELECT name, game, ip, port, password FROM servers_jeu WHERE server_id = ?').get(serverId);
      const channel = findGuildTextChannelByName(interaction.guild, CHANNELS.serverList);
      if (channel) {
        const embed = {
          title: `Serveur ajouté: ${row.name}`,
          fields: [
            { name: 'Jeu', value: String(row.game), inline: true },
            { name: 'IP:Port', value: `${row.ip}:${row.port}`, inline: true }
          ]
        };
        if (row.password) {
          let pwd = row.password;
          try {
            pwd = decrypt(row.password);
          } catch (e) {}
          embed.fields.push({ name: 'Mot de passe', value: String(pwd), inline: true });
        }
        await channel.send({ embeds: [embed] });
      }

      await interaction.update({ content: t(interaction.guildId, 'servers.approved', { user: interaction.user.tag }), components: [] });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('servers:reject:')) {
      if (!memberCanManageServers(interaction)) {
        await interaction.reply({ content: t(interaction.guildId, 'interaction.forbidden'), ephemeral: true });
        return;
      }
      const parts = interaction.customId.split(':');
      const serverId = Number(parts[2]);
      const db = getDb();
      db.prepare('DELETE FROM servers_jeu WHERE server_id = ?').run(serverId);
      await interaction.update({ content: t(interaction.guildId, 'servers.rejected', { user: interaction.user.tag }), components: [] });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('servers:connect:')) {
      if (!memberCanManageServers(interaction)) {
        await interaction.reply({ content: t(interaction.guildId, 'interaction.forbidden'), ephemeral: true });
        return;
      }
      const parts = interaction.customId.split(':');
      const serverId = Number(parts[2]);
      const db = getDb();
      const row = db.prepare('SELECT ip, port, password FROM servers_jeu WHERE server_id = ?').get(serverId);
      if (!row) {
        await interaction.reply({ content: t(interaction.guildId, 'servers.notFound'), ephemeral: true });
        return;
      }
      let pwd = row.password;
      try {
        pwd = decrypt(row.password);
      } catch (e) {}
      await interaction.reply({ content: t(interaction.guildId, 'servers.connectInfo', { ip: row.ip, port: String(row.port), pwd: pwd || '' }), ephemeral: true });
      return;
    }

    if (interaction.isRepliable()) {
      await interaction.reply({ content: t(interaction.guildId, 'interaction.unsupported'), ephemeral: true });
    }
    } catch (err) {
      const handled = await handleInteractionError(interaction, err, `interactionCreate:${interaction.customId ?? interaction.commandName ?? 'unknown'}`);
      if (!handled) {
        logger.error('Unhandled interaction error', { message: err?.message, stack: err?.stack, customId: interaction.customId });
      }
    }
  }
};
