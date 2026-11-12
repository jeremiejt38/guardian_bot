const { MessageFlags } = require('discord.js');
const { SlashCommandBuilder } = require('discord.js');
const { isBotAdmin } = require('../modules/admin/botUpdater');
const { openOrRefreshPanel } = require('../modules/admin/adminPanel');
// @premium-start
const { activatePremium, deactivatePremium, checkTier, getPremiumExpiry } = require('../modules/tier/tier');
const { createLicense } = require('../modules/tier/licenses');
// @premium-end

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Panneau d\'administration système Guardian (réservé au bot admin)')
    // @premium-start
    .addSubcommand((sub) =>
      sub
        .setName('setpremium')
        .setDescription('Active ou désactive le tier premium pour un serveur')
        .addStringOption((opt) =>
          opt.setName('guild_id').setDescription('ID du serveur Discord').setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName('tier')
            .setDescription('Tier à appliquer')
            .setRequired(true)
            .addChoices(
              { name: 'Premium', value: 'premium' },
              { name: 'Free', value: 'free' }
            )
        )
        .addIntegerOption((opt) =>
          opt
            .setName('days')
            .setDescription('Durée en jours (laisser vide = permanent)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(3650)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('license')
        .setDescription('Génère une clé de licence Guardian Premium')
        .addIntegerOption((opt) =>
          opt
            .setName('days')
            .setDescription('Durée en jours (laisser vide = permanent)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(3650)
        )
    )
    // @premium-end
    .addSubcommand((sub) =>
      sub.setName('panel').setDescription('Ouvre le panneau d\'administration système')
    ),

  async execute(interaction) {
    if (!isBotAdmin(interaction.user.id)) {
      await interaction.reply({ content: '❌ Accès réservé à l\'administrateur système bot.', flags: MessageFlags.Ephemeral });
      return;
    }

    const sub = interaction.options.getSubcommand(false);

    // @premium-start
    if (sub === 'setpremium') {
      const guildId = interaction.options.getString('guild_id');
      const tier = interaction.options.getString('tier');
      const days = interaction.options.getInteger('days') ?? null;

      if (tier === 'premium') {
        activatePremium(guildId, days);
        const expiry = getPremiumExpiry(guildId);
        const expiryStr = expiry ? `expire le **${expiry.toLocaleDateString('fr-FR')}**` : '**permanent**';
        await interaction.reply({
          content: [
            `✅ **Premium activé** pour le serveur \`${guildId}\``,
            `> Tier : \`premium\` — ${expiryStr}`,
          ].join('\n'),
          flags: MessageFlags.Ephemeral,
        });
      } else {
        deactivatePremium(guildId);
        await interaction.reply({
          content: `✅ **Premium désactivé** pour le serveur \`${guildId}\` — tier : \`free\``,
          flags: MessageFlags.Ephemeral,
        });
      }
      return;
    }

    if (sub === 'license') {
      const days = interaction.options.getInteger('days') ?? null;
      const { key, expiresAt } = createLicense(days);
      const expiryStr = expiresAt ? `expire le **${new Date(expiresAt).toLocaleDateString('fr-FR')}**` : '**permanente**';
      await interaction.reply({
        content: [
          `\`\`\``, // séparation pour éviter le formattage
          key,
          `\`\`\``,
          `Clé générée (${expiryStr}). Tu peux la donner à ton client.`,
        ].join('\n'),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    // @premium-end

    if (sub === 'panel' || !sub) {
      if (interaction.guild) {
        await interaction.reply({ content: '❌ Cette commande est uniquement disponible en message privé (DM).', flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await openOrRefreshPanel(interaction.client);
      await interaction.editReply({ content: '✅ Panneau admin ouvert en DM.' });
    }
  }
};
