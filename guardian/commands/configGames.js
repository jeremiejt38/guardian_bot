const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { t, describe } = require('../modules/i18n');
const { replyEphemeral } = require('../modules/utils/interactions');
const {
  listSetupGames,
  addSetupGame,
  removeSetupGameById,
  findSetupGameByName,
  updateSetupGame
} = require('../modules/initialisation/setupGames');
const { provisionGameStructure, provisionGuildGameStructures, rebuildGameLayout } = require('../modules/games/gameList');
const { getGradeMappings } = require('../modules/initialisation/gradeMapping');
const { getGuildSetting } = require('../modules/config/settings');
const logger = require('../modules/logs/logger');

function isManagerOrOwner(interaction) {
  const guildId = interaction.guildId;
  const mappings = getGradeMappings(guildId);
  const managerRoleId = mappings['manager'];
  const ownerRoleId = mappings['owner'];
  const member = interaction.member;
  if (!member) return false;
  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    (managerRoleId && member.roles.cache.has(managerRoleId)) ||
    (ownerRoleId && member.roles.cache.has(ownerRoleId))
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config-games')
    .setDescription(describe('commands.configGames.description'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName('add')
        .setDescription(describe('commands.configGames.subAdd'))
        .addStringOption((opt) =>
          opt.setName('nom').setDescription(describe('commands.configGames.optionNomDesc')).setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName('steam_id').setDescription(describe('commands.configGames.optionSteamIdDesc')).setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('remove')
        .setDescription(describe('commands.configGames.subRemove'))
        .addStringOption((opt) =>
          opt.setName('nom').setDescription(describe('commands.configGames.optionNomDesc')).setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('list')
        .setDescription(describe('commands.configGames.subList'))
    )
    .addSubcommand((sub) =>
      sub.setName('toggle-galerie')
        .setDescription(describe('commands.configGames.subToggleGalerie'))
        .addStringOption((opt) =>
          opt.setName('nom').setDescription(describe('commands.configGames.optionNomDesc')).setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('toggle-changelog')
        .setDescription(describe('commands.configGames.subToggleChangelog'))
        .addStringOption((opt) =>
          opt.setName('nom').setDescription(describe('commands.configGames.optionNomDesc')).setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('toggle-text')
        .setDescription(describe('commands.configGames.subToggleText'))
        .addStringOption((opt) =>
          opt.setName('nom').setDescription(describe('commands.configGames.optionNomDesc')).setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('set-steam')
        .setDescription(describe('commands.configGames.subSetSteam'))
        .addStringOption((opt) =>
          opt.setName('nom').setDescription(describe('commands.configGames.optionNomDesc')).setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName('steam_id').setDescription(describe('commands.configGames.optionSteamIdDesc')).setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('set-layout')
        .setDescription(describe('commands.configGames.subSetLayout'))
        .addStringOption((opt) =>
          opt.setName('mode')
            .setDescription(describe('commands.configGames.optionLayoutModeDesc'))
            .setRequired(true)
            .addChoices(
              { name: 'Par jeu (catégorie par jeu)', value: 'by-game' },
              { name: 'Par type (catégorie texte/galerie/updates)', value: 'by-type' }
            )
        )
    )
    .addSubcommand((sub) =>
      sub.setName('refresh')
        .setDescription('Rafraîchir les channels de jeux existants (topics, permissions, placement)')
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;

    if (!isManagerOrOwner(interaction)) {
      return replyEphemeral(interaction, t(guildId, 'commands.configGames.forbidden'));
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const nom = interaction.options.getString('nom', true).trim();
      const steamId = interaction.options.getString('steam_id') || null;
      const game = addSetupGame(guildId, { name: nom, steam_app_id: steamId });
      if (interaction.guild) {
        await provisionGameStructure(interaction.guild, game).catch(() => {});
      }
      return replyEphemeral(interaction, t(guildId, 'commands.configGames.added', { name: game.name }));
    }

    if (sub === 'remove') {
      const nom = interaction.options.getString('nom', true);
      const game = findSetupGameByName(guildId, nom);
      if (!game) return replyEphemeral(interaction, t(guildId, 'commands.configGames.notFound', { name: nom }));
      removeSetupGameById(guildId, game.game_id);
      return replyEphemeral(interaction, t(guildId, 'commands.configGames.removed', { name: game.name }));
    }

    if (sub === 'list') {
      const games = listSetupGames(guildId);
      if (!games.length) return replyEphemeral(interaction, t(guildId, 'commands.configGames.listEmpty'));
      const lines = games.map((g) => {
        const galerie = g.galerie_enabled ? '🖼️' : '　';
        const changelog = g.changelog_enabled ? '📢' : '　';
        const texte = g.text_channel_enabled !== 0 ? '💬' : '　';
        const steam = g.steam_app_id ? `Steam:${g.steam_app_id}` : 'non-Steam';
        return `• **${g.name}** ${galerie}${changelog}${texte} — ${steam}`;
      });
      const embed = new EmbedBuilder()
        .setTitle(t(guildId, 'commands.configGames.listTitle', { count: String(games.length) }))
        .setDescription(lines.join('\n'));
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'toggle-galerie' || sub === 'toggle-changelog' || sub === 'toggle-text') {
      const nom = interaction.options.getString('nom', true);
      const game = findSetupGameByName(guildId, nom);
      if (!game) return replyEphemeral(interaction, t(guildId, 'commands.configGames.notFound', { name: nom }));

      const fieldMap = {
        'toggle-galerie': { key: 'galerie_enabled', label: 'Galerie' },
        'toggle-changelog': { key: 'changelog_enabled', label: 'Changelogs' },
        'toggle-text': { key: 'text_channel_enabled', label: 'Channel texte' }
      };
      const { key, label } = fieldMap[sub];
      const newVal = !game[key];
      const updated = updateSetupGame(guildId, game.game_id, { [key]: newVal });
      if (interaction.guild) {
        await provisionGameStructure(interaction.guild, updated).catch(() => {});
      }
      const state = newVal ? t(guildId, 'setup.enabled') : t(guildId, 'setup.disabled');
      return replyEphemeral(interaction, t(guildId, 'commands.configGames.toggled', { feature: label, name: game.name, state }));
    }

    if (sub === 'set-steam') {
      const nom = interaction.options.getString('nom', true);
      const steamId = interaction.options.getString('steam_id') || null;
      const game = findSetupGameByName(guildId, nom);
      if (!game) return replyEphemeral(interaction, t(guildId, 'commands.configGames.notFound', { name: nom }));
      updateSetupGame(guildId, game.game_id, { steam_app_id: steamId });
      if (steamId) {
        return replyEphemeral(interaction, t(guildId, 'commands.configGames.steamUpdated', { name: game.name, appId: steamId }));
      }
      return replyEphemeral(interaction, t(guildId, 'commands.configGames.steamCleared', { name: game.name }));
    }

    if (sub === 'set-layout') {
      const mode = interaction.options.getString('mode', true);
      await interaction.deferReply({ ephemeral: true }).catch(() => {});
      await rebuildGameLayout(interaction.guild, mode).catch((err) => {
        logger.error('config-games set-layout failed', { error: err?.message, guildId, mode });
      });
      const label = mode === 'by-game' ? 'catégorie par jeu' : 'catégorie par type';
      return interaction.editReply({ content: `✅ Organisation des channels de jeux changée en **${label}**.` });
    }

    if (sub === 'refresh') {
      await interaction.deferReply({ ephemeral: true }).catch(() => {});
      await provisionGuildGameStructures(interaction.guild).catch((err) => {
        logger.error('config-games refresh failed', { error: err?.message, guildId });
      });
      return interaction.editReply({ content: '✅ Channels de jeux rafraîchis (topics, permissions et placement mis à jour).' });
    }
  }
};
