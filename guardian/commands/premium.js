const { MessageFlags } = require('discord.js');
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder } = require('discord.js');
const { buildPremiumLockButton } = require('../modules/tier/premiumGateUI');
const { buildPremiumInviteURL } = require('../modules/tier/premiumInvite');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('premium')
    .setDescription('Découvrir Guardian Premium')
    .addSubcommand((sub) =>
      sub
        .setName('invite')
        .setDescription('Obtenir le lien d\'invitation du bot Guardian Premium')
    )
    .setDMPermission(true),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand(false);

    if (subcommand === 'invite') {
      const inviteUrl = buildPremiumInviteURL(interaction.guildId);
      if (!inviteUrl) {
        await interaction.reply({
          content: 'Lien d\'invitation premium indisponible. Contacte l\'administrateur.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await interaction.reply({
        content: [
          '**Lien d\'invitation Guardian Premium**',
          inviteUrl,
          '',
          '> Utilise ce lien pour ajouter le bot premium à ton serveur Discord.'
        ].join('\n'),
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('Guardian Premium')
      .setDescription('Découvrez les fonctionnalités premium de Guardian :')
      .addFields(
        { name: '🔒 Paramètres Discord avancés', value: 'Personnalisez davantage vos serveurs Discord', inline: false },
        { name: '🔨 Sanctions de comportement', value: 'Gérez les comportements des membres avec plus de flexibilité', inline: false },
        { name: '✉️ DM de bienvenue personnalisé', value: 'Envoyez un message de bienvenue personnalisé aux nouveaux membres', inline: false },
        { name: '💬 Forum de suggestions', value: 'Permettez à vos membres de proposer des idées', inline: false },
        { name: '📊 Liste des serveurs', value: 'Visualisez tous les serveurs gérés par Guardian', inline: false }
      )
      .setColor(0x0099FF)
      .setTimestamp();

    const button = buildPremiumLockButton('premium_info', 'Passer à Guardian Premium');
    const row = new ActionRowBuilder().addComponents(button);

    await interaction.reply({
      embeds: [embed],
      components: [row],
      flags: MessageFlags.Ephemeral
    });
  }
};
