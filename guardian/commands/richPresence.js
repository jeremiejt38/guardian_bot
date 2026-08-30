const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
  giveConsent,
  revokeConsent,
  isConsented,
  getLeaderboard,
  getUserStats,
  getCurrentlyPlaying
} = require('../modules/richPresence/richPresence');

function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rich-presence')
    .setDescription('Gère le suivi Rich Presence et le classement des jeux (opt-in)')
    .addSubcommand((sub) =>
      sub
        .setName('optin')
        .setDescription('Autoriser Guardian à suivre ton activité Discord Rich Presence')
    )
    .addSubcommand((sub) =>
      sub
        .setName('optout')
        .setDescription('Arrêter le suivi de ton activité et supprimer tes données')
    )
    .addSubcommand((sub) =>
      sub
        .setName('stats')
        .setDescription('Affiche tes statistiques de jeu')
    )
    .addSubcommand((sub) =>
      sub
        .setName('leaderboard')
        .setDescription('Classement des jeux les plus joués sur le serveur')
        .addIntegerOption((opt) =>
          opt
            .setName('limit')
            .setDescription('Nombre de résultats (max 20)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(20)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('now')
        .setDescription('Membres en train de jouer actuellement')
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'optin': {
        giveConsent(guildId, userId);
        await interaction.reply({
          content: '✅ Suivi Rich Presence activé. Tes sessions de jeu seront comptabilisées pour le classement.',
          ephemeral: true
        });
        return;
      }

      case 'optout': {
        revokeConsent(guildId, userId);
        await interaction.reply({
          content: '✅ Suivi Rich Presence désactivé. Tes données de jeu ont été supprimées.',
          ephemeral: true
        });
        return;
      }

      case 'stats': {
        if (!isConsented(guildId, userId)) {
          await interaction.reply({
            content: 'Tu n’as pas encore opt-in. Utilise `/rich-presence optin`.',
            ephemeral: true
          });
          return;
        }

        const stats = getUserStats(guildId, userId);
        const embed = new EmbedBuilder()
          .setTitle('🎮 Tes stats Rich Presence')
          .setColor(0x5865f2)
          .setDescription(`**Sessions terminées :** ${stats.sessions}\n**Temps total :** ${formatDuration(stats.total_seconds)}`);

        if (stats.byGame.length > 0) {
          const lines = stats.byGame
            .slice(0, 10)
            .map((row, index) => `${index + 1}. **${row.game_name}** — ${formatDuration(row.total_seconds)} (${row.sessions} session${row.sessions > 1 ? 's' : ''})`);
          embed.addFields({ name: 'Top jeux', value: lines.join('\n') });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      case 'leaderboard': {
        const limit = interaction.options.getInteger('limit') ?? 10;
        const rows = getLeaderboard(guildId, limit);

        const embed = new EmbedBuilder()
          .setTitle('🏆 Classement des jeux les plus joués')
          .setColor(0x5865f2);

        if (rows.length === 0) {
          embed.setDescription('Aucune session enregistrée. Les membres doivent d’abord faire `/rich-presence optin`.');
        } else {
          const lines = rows.map((row, index) => {
            const user = interaction.guild.members.cache.get(row.user_id)?.user?.username ?? `<@${row.user_id}>`;
            return `${index + 1}. **${row.game_name}** — ${user} — ${formatDuration(row.total_seconds)} (${row.sessions} sessions)`;
          });
          embed.setDescription(lines.join('\n'));
        }

        await interaction.reply({ embeds: [embed], ephemeral: false });
        return;
      }

      case 'now': {
        const rows = getCurrentlyPlaying(guildId);
        const embed = new EmbedBuilder()
          .setTitle('🎮 En train de jouer')
          .setColor(0x5865f2);

        if (rows.length === 0) {
          embed.setDescription('Personne n’est en jeu actuellement.');
        } else {
          const lines = rows.map((row) => {
            const user = interaction.guild.members.cache.get(row.user_id)?.user?.username ?? `<@${row.user_id}>`;
            return `• **${row.game_name}** — ${user}`;
          });
          embed.setDescription(lines.join('\n'));
        }

        await interaction.reply({ embeds: [embed], ephemeral: false });
        return;
      }

      default:
        await interaction.reply({
          content: 'Sous-commande inconnue.',
          ephemeral: true
        });
    }
  }
};
