const { MessageFlags } = require('discord.js');
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const { getModerationRoleIds } = require('../database/db');
const { memberHasAnyRole } = require('../modules/utils/roles');
const { getSanctionsHistory, getBehaviorScore } = require('../modules/moderation/moderation');
const { getGuildLanguage, t, describe } = require('../modules/i18n');
const { replyEphemeral } = require('../modules/utils/interactions');

const PAGE_SIZE = 10;

function formatDate(iso, language) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return date.toLocaleString(language === 'en' ? 'en-US' : 'fr-FR');
}

function formatEntry(guildId, entry) {
  const language = getGuildLanguage(guildId);
  return [
    t(guildId, 'commands.historique.entryType', { value: entry.type }),
    t(guildId, 'commands.historique.entryReason', { value: entry.reason }),
    t(guildId, 'commands.historique.entryDate', { value: formatDate(entry.timestamp, language) }),
    t(guildId, 'commands.historique.entryAppliedBy', { value: entry.applied_by }),
    t(guildId, 'commands.historique.entryDuration', { value: entry.duration || '-' }),
    t(guildId, 'commands.historique.entryAuto', {
      value: entry.auto ? t(guildId, 'commands.historique.autoYes') : t(guildId, 'commands.historique.autoNo')
    })
  ].join('\n');
}

function buildPageEmbed(guildId, member, history, page, score) {
  const start = page * PAGE_SIZE;
  const pageEntries = history.slice(start, start + PAGE_SIZE);
  const maxPage = Math.max(Math.ceil(history.length / PAGE_SIZE) - 1, 0);

  const embed = new EmbedBuilder()
    .setTitle(t(guildId, 'commands.historique.title', { memberTag: member.tag }))
    .setFooter({
      text: t(guildId, 'commands.historique.footer', { score, page: page + 1, maxPage: maxPage + 1 })
    });

  if (pageEntries.length === 0) {
    embed.setDescription(t(guildId, 'commands.historique.empty'));
    return embed;
  }

  embed.addFields(
    pageEntries.map((entry, index) => ({
      name: t(guildId, 'commands.historique.fieldName', { index: start + index + 1 }),
      value: formatEntry(guildId, entry)
    }))
  );

  return embed;
}

function buildPaginationRow(guildId, targetUserId, actorId, page, maxPage) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`historique:${targetUserId}:${actorId}:${Math.max(page - 1, 0)}`)
      .setLabel(t(guildId, 'commands.historique.prev'))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`historique:${targetUserId}:${actorId}:${Math.min(page + 1, maxPage)}`)
      .setLabel(t(guildId, 'commands.historique.next'))
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page >= maxPage)
  );
}

function hasModeratorAccess(member) {
  const modRoleIds = getModerationRoleIds(member.guild.id);

  if (modRoleIds.length > 0) {
    return memberHasAnyRole(member, modRoleIds);
  }

  return member.permissions.has(PermissionFlagsBits.ModerateMembers);
}

async function renderHistorique(interaction, targetUserId, actorId, page) {
  if (interaction.user.id !== actorId) {
    await replyEphemeral(interaction, t(interaction.guildId, 'commands.historique.forbiddenPagination'));
    return;
  }

  const targetUser = await interaction.client.users.fetch(targetUserId);
  const history = getSanctionsHistory(interaction.guildId, targetUserId);
  const score = getBehaviorScore(interaction.guildId, targetUserId);
  const maxPage = Math.max(Math.ceil(history.length / PAGE_SIZE) - 1, 0);
  const safePage = Math.min(Math.max(page, 0), maxPage);
  const embed = buildPageEmbed(interaction.guildId, targetUser, history, safePage, score);
  const components = history.length > PAGE_SIZE
    ? [buildPaginationRow(interaction.guildId, targetUserId, actorId, safePage, maxPage)]
    : [];

  if (interaction.isButton()) {
    await interaction.update({ embeds: [embed], components });
    return;
  }

  await interaction.reply({ embeds: [embed], components, flags: MessageFlags.Ephemeral });
}

async function handleHistoriquePagination(interaction) {
  const [, targetUserId, actorId, pageRaw] = interaction.customId.split(':');
  const page = Number.parseInt(pageRaw, 10);
  await renderHistorique(interaction, targetUserId, actorId, Number.isNaN(page) ? 0 : page);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('historique')
    .setDescription(describe('commands.historique.description'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName('membre').setDescription(describe('commands.historique.memberOption')).setRequired(true)),
  async execute(interaction) {
    const actorMember = await interaction.guild.members.fetch(interaction.user.id);
    if (!hasModeratorAccess(actorMember)) {
      await replyEphemeral(interaction, t(interaction.guildId, 'commands.historique.moderatorOnly'));
      return;
    }

    const member = interaction.options.getUser('membre', true);
    await renderHistorique(interaction, member.id, interaction.user.id, 0);
  },
  handleHistoriquePagination
};
