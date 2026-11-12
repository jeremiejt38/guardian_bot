const { MessageFlags } = require('discord.js');
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { exportGuildData, encodeSnapshot, decodeSnapshot } = require('../modules/migration/guildExport');
const { importGuildData, validateSnapshot } = require('../modules/migration/guildImport');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('migration')
    .setDescription('Exporter ou importer les données du serveur')
    .addSubcommand((sub) =>
      sub.setName('exporter').setDescription('Exporter les données de ce serveur pour migration')
    )
    .addSubcommand((sub) =>
      sub
        .setName('importer')
        .setDescription('Importer un snapshot dans ce serveur')
        .addStringOption((option) =>
          option.setName('snapshot').setDescription('Le snapshot encodé à importer').setRequired(true)
        )
    ),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: 'Cette commande est réservée aux administrateurs.', flags: MessageFlags.Ephemeral });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'exporter') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const snapshot = exportGuildData(interaction.guildId);
        const encoded = encodeSnapshot(snapshot);
        const buffer = Buffer.from(encoded, 'utf8');
        await interaction.editReply({
          content: `Snapshot exporté : **${Object.keys(snapshot.tables).length} tables**, version ${snapshot.version}.`,
          files: [{ attachment: buffer, name: `guardian-migration-${interaction.guildId}.txt` }]
        });
        return;
      }

      if (subcommand === 'importer') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const raw = interaction.options.getString('snapshot', true).trim();
        let snapshot = decodeSnapshot(raw);
        if (!snapshot) {
          try { snapshot = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')); } catch { snapshot = null; }
        }
        if (!snapshot || !validateSnapshot(snapshot)) {
          await interaction.editReply({ content: 'Snapshot invalide. Colle le contenu exact du fichier exporté.', flags: MessageFlags.Ephemeral });
          return;
        }
        const result = importGuildData(snapshot, interaction.guildId, { deleteExisting: true });
        const summary = Object.entries(result.importedTables).map(([table, count]) => `- ${table}: ${count} lignes`).join('\n');
        const sameGuild = snapshot.guildId === interaction.guildId;
        const hint = sameGuild
          ? 'Le serveur Discord est le même, les salons/rôles existants restent liés.'
          : 'Le serveur Discord semble différent : les IDs salons/rôles devront être reconfigurés.';
        await interaction.editReply({
          content: [
            `Importation terminée : **${result.totalRows} lignes** importées.`,
            hint,
            '```',
            summary || 'Aucune donnée',
            '```'
          ].join('\n'),
          flags: MessageFlags.Ephemeral
        });
      }
    } catch (err) {
      console.error('[migration command]', err);
      await interaction.editReply({ content: `Erreur : ${err.message}`, flags: MessageFlags.Ephemeral });
    }
  }
};
