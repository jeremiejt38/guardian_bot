const { MessageFlags } = require('discord.js');
const { SlashCommandBuilder } = require('discord.js');
const { isPremiumFeatureEnabled } = require('../modules/tier/premiumGateUI');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('license')
    .setDescription('Active une clé de licence Guardian Premium pour ce serveur')
    .addStringOption((option) =>
      option
        .setName('key')
        .setDescription('Clé de licence Guardian Premium')
        .setRequired(true)
    ),
  async execute(interaction) {
    if (!interaction.member.permissions.has('ManageGuild')) {
      return interaction.reply({ content: 'Tu dois avoir la permission Gérer le serveur.', flags: MessageFlags.Ephemeral });
    }

    if (!isPremiumFeatureEnabled(interaction.guildId)) {
      return interaction.reply({
        content: '🔒 Cette fonctionnalité est réservée à Guardian Premium. Contactez le développeur pour obtenir une licence.',
        flags: MessageFlags.Ephemeral
      });
    }

    // @premium-start
    const { linkLicenseToGuild } = require('../modules/tier/licenses');
    const key = interaction.options.getString('key');
    try {
      linkLicenseToGuild(key, interaction.guildId);
      return interaction.reply({ content: '✅ Licence activée avec succès. Guardian Premium est maintenant actif sur ce serveur.', flags: MessageFlags.Ephemeral });
    } catch (err) {
      return interaction.reply({ content: `❌ ${err.message}`, flags: MessageFlags.Ephemeral });
    }
    // @premium-end
  },
};
