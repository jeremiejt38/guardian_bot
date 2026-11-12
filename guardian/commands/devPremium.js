const { MessageFlags } = require('discord.js');
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { activatePremium, deactivatePremium, checkTier } = require('../modules/tier/tier');

function isDevMode() {
  const env = process.env.NODE_ENV || '';
  return env === 'development' || env === 'dev';
}

const data = new SlashCommandBuilder()
  .setName('dev-premium')
  .setDescription('[DEV] Toggle premium state for this test server')
  .addStringOption((option) =>
    option
      .setName('action')
      .setDescription('Action to perform')
      .setRequired(true)
      .addChoices(
        { name: 'Enable premium', value: 'enable' },
        { name: 'Disable premium', value: 'disable' },
        { name: 'Show current tier', value: 'status' }
      )
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false);

module.exports = {
  data,
  devOnly: true,
  isDevMode,

  async execute(interaction) {
    if (!isDevMode()) {
      await interaction.reply({
        content: 'This command is only available in development mode.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: 'This command must be used inside a server.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const action = interaction.options.getString('action');

    if (action === 'enable') {
      activatePremium(guildId, null);
      await interaction.reply({
        content: '✅ Premium enabled for this server (dev mode, no expiration).',
        flags: MessageFlags.Ephemeral
      });
    } else if (action === 'disable') {
      deactivatePremium(guildId);
      await interaction.reply({
        content: '✅ Premium disabled for this server.',
        flags: MessageFlags.Ephemeral
      });
    } else {
      const tier = checkTier(guildId);
      await interaction.reply({
        content: `Current tier for this server: **${tier}**.`,
        flags: MessageFlags.Ephemeral
      });
    }
  }
};
