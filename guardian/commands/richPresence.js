const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
  giveConsent,
  revokeConsent,
  isConsented,
  getLeaderboard,
  getUserStats,
  getCurrentlyPlaying
} = require('../modules/richPresence/richPresence');
const { t, describe } = require('../modules/i18n');

function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rich-presence')
    .setDescription(describe('commands.richPresence.description'))
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
          content: `✅ ${t(guildId, 'commands.richPresence.optinSuccess')}`,
          ephemeral: true
        });
        return;
      }

      case 'optout': {
        revokeConsent(guildId, userId);
        await interaction.reply({
          content: `✅ ${t(guildId, 'commands.richPresence.optoutSuccess')}`,
          ephemeral: true
        });
        return;
      }

      case 'stats': {
        if (!isConsented(guildId, userId)) {
          await interaction.reply({
            content: t(guildId, 'commands.richPresence.notOptedIn'),
            ephemeral: true
          });
          return;
        }

        const stats = getUserStats(guildId, userId);
        const embed = new EmbedBuilder()
          .setTitle(`🎮 ${t(guildId, 'commands.richPresence.statsTitle')}`)
          .setColor(0x5865f2)
          .setDescription(`**${t(guildId, 'commands.richPresence.statsSessions')} :** ${stats.sessions}\n**${t(guildId, 'commands.richPresence.statsTotalTime')} :** ${formatDuration(stats.total_seconds)}`);

        if (stats.byGame.length > 0) {
          const lines = stats.byGame
            .slice(0, 10)
            .map((row, index) => `${index + 1}. **${row.game_name}** — ${formatDuration(row.total_seconds)} (${row.sessions} session${row.sessions > 1 ? 's' : ''})`);
          embed.addFields({ name: t(guildId, 'commands.richPresence.statsTopGames'), value: lines.join('\n') });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      case 'leaderboard': {
        const limit = interaction.options.getInteger('limit') ?? 10;
        const rows = getLeaderboard(guildId, limit);

        const embed = new EmbedBuilder()
          .setTitle(`🏆 ${t(guildId, 'commands.richPresence.leaderboardTitle')}`)
          .setColor(0x5865f2);

        if (rows.length === 0) {
          embed.setDescription(t(guildId, 'commands.richPresence.leaderboardEmpty'));
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
          .setTitle(`🎮 ${t(guildId, 'commands.richPresence.nowTitle')}`)
          .setColor(0x5865f2);

        if (rows.length === 0) {
          embed.setDescription(t(guildId, 'commands.richPresence.nowEmpty'));
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
