'use strict';

/**
 * setupHandlers.js
 * Dispatcher principal du setup wizard.
 * Délègue chaque interaction au sous-handler correspondant (handlers/).
 */

const { getGuildSetting } = require('../config/settings');
const { replyEphemeral } = require('../utils/interactions');
const { t } = require('../../locales');

const { _handleStep1 } = require('./handlers/setupStep1Grades');
const { _handleStep2 } = require('./handlers/setupStep2Modules');
const { _handleStep3 } = require('./handlers/setupStep3Channels');
const { _handleStep4 } = require('./handlers/setupStep4Members');
const { _handleStep5 } = require('./handlers/setupStep5Vocal');
const { _handleStep6 } = require('./handlers/setupStep6Games');
const { _handleStep7 } = require('./handlers/setupStep7Moderation');
const { _handleStep4Security } = require('./handlers/setupStep4Security');
const { _handleStep8 } = require('./handlers/setupStep8Discord');
const { _handleNavAndTransitions } = require('./handlers/setupNav');

async function handleSetupInteraction(interaction) {
  const guildId = interaction.guildId;
  if (!guildId) return false;
  if (!interaction.customId || !interaction.customId.startsWith('setup:')) return false;

  if (getGuildSetting(guildId, 'setup', 'finalizing', false)) {
    await interaction.deferUpdate().catch(() => {});
    return true;
  }

  const setupOwnerId = getGuildSetting(guildId, 'setup', 'owner_id', null);
  if (setupOwnerId && interaction.user.id !== setupOwnerId) {
    if (interaction.isRepliable()) await replyEphemeral(interaction, t('setup.forbiddenNotOwner', {}, { guildId }));
    return true;
  }

  if (interaction.locale && !getGuildSetting(guildId, 'i18n', 'language', null)) {
    const { detectLanguageFromLocale: _dlfl, setGuildLanguage: _sgl } = require('../i18n');
    _sgl(guildId, _dlfl(interaction.locale));
  }

  return (
    await _handleStep1(guildId, interaction) ||
    await _handleStep2(guildId, interaction) ||
    await _handleStep3(guildId, interaction) ||
    await _handleStep4(guildId, interaction) ||
    await _handleStep5(guildId, interaction) ||
    await _handleStep6(guildId, interaction) ||
    await _handleStep7(guildId, interaction) ||
    await _handleStep4Security(guildId, interaction) ||
    await _handleStep8(guildId, interaction) ||
    await _handleNavAndTransitions(guildId, interaction)
  );
}

module.exports = { handleSetupInteraction };
