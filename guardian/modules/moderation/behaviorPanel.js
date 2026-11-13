const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { CHANNELS, GRADE_NAMES } = require('../../config');
const { t } = require('../i18n');
const { replyEphemeral } = require('../utils/interactions');
const { findTextChannelByName } = require('../utils/channels');
const {
  getBehaviorThresholds,
  upsertBehaviorThreshold,
  removeBehaviorThreshold,
  listBehaviorScores,
  resetBehaviorScore
} = require('./behavior');
const { getGradeMappings } = require('../initialisation/gradeMapping');
const { isPremiumFeatureEnabled, buildPremiumLockButton } = require('../tier/premiumGateUI');

const IDS = Object.freeze({
  addThreshold: 'behavior:threshold:add',
  addModal: 'behavior:threshold:add:modal',
  removePrefix: 'behavior:threshold:remove:',
  resetPrefix: 'behavior:reset:',
  listNext: 'behavior:list:next:',
  listPrev: 'behavior:list:prev:'
});

const SANCTIONS = ['warn', 'mute', 'kick', 'ban'];
const PAGE_SIZE = 10;

function hasOwnerGrade(member, guildId) {
  const mappings = getGradeMappings(guildId);
  const ownerRoleId = mappings[GRADE_NAMES.owner];
  return ownerRoleId && member.roles.cache.has(ownerRoleId);
}

function buildPanelContent(guildId) {
  const thresholds = getBehaviorThresholds(guildId);
  const lines = [`**${t(guildId, 'behavior.panelTitle')}**\n`];

  if (!isPremiumFeatureEnabled(guildId)) {
    lines.push('🔒 *Les sanctions automatiques sont une feature **Guardian Premium**.*');
    lines.push('*Cliquez sur le bouton ci-dessous pour en savoir plus.*');
    return lines.join('\n');
  }

  if (thresholds.length === 0) {
    lines.push(t(guildId, 'behavior.noThresholds'));
  } else {
    for (const item of thresholds) {
      lines.push(`• Score **${item.score}** → \`${item.sanction}\``);
    }
  }
  lines.push(`\n${t(guildId, 'behavior.panelHint')}`);
  return lines.join('\n');
}

function buildThresholdRows(guildId) {
  if (!isPremiumFeatureEnabled(guildId)) {
    return [
      new ActionRowBuilder().addComponents(
        buildPremiumLockButton('behavior_sanctions', 'Sanctions automatiques')
      )
    ];
  }

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(IDS.addThreshold)
        .setLabel(t(guildId, 'behavior.addThreshold'))
        .setStyle(ButtonStyle.Primary)
    )
  ];

  const thresholds = getBehaviorThresholds(guildId).slice(0, 4);
  if (thresholds.length > 0) {
    const removeRow = new ActionRowBuilder().addComponents(
      thresholds.map((item) =>
        new ButtonBuilder()
          .setCustomId(`${IDS.removePrefix}${item.score}`)
          .setLabel(`Retirer @${item.score}`)
          .setStyle(ButtonStyle.Danger)
      )
    );
    rows.push(removeRow);
  }

  return rows;
}

function buildScoreListContent(guildId, page) {
  const { rows, total, pageSize } = listBehaviorScores(guildId, page, PAGE_SIZE);
  const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1);
  const lines = [`**${t(guildId, 'behavior.scoreListTitle')}** — Page ${page + 1}/${maxPage + 1}\n`];

  if (rows.length === 0) {
    lines.push(t(guildId, 'behavior.scoreListEmpty'));
  } else {
    for (const row of rows) {
      lines.push(`• <@${row.user_id}> — **${row.score_comportement}** pts`);
    }
  }
  return { content: lines.join('\n'), maxPage };
}

function buildScoreListComponents(guildId, page, maxPage) {
  const row = new ActionRowBuilder();
  if (page > 0) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${IDS.listPrev}${page - 1}`)
        .setLabel(t(guildId, 'behavior.prev'))
        .setStyle(ButtonStyle.Secondary)
    );
  }
  if (page < maxPage) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${IDS.listNext}${page + 1}`)
        .setLabel(t(guildId, 'behavior.next'))
        .setStyle(ButtonStyle.Secondary)
    );
  }
  return row.components.length > 0 ? [row] : [];
}

async function seedBehaviorPanel(guild) {
  const channel = findTextChannelByName(guild, CHANNELS.behavior);
  if (!channel) return;

  const messages = await channel.messages.fetch({ limit: 10 }).catch(() => null);
  const panel = messages?.find(
    (m) => m.author.id === guild.client.user.id && m.components.length > 0
  );
  const guildId = guild.id;
  if (panel) {
    await panel.edit({ content: buildPanelContent(guildId), components: buildThresholdRows(guildId) }).catch(() => undefined);
    return;
  }
  await channel.send({
    content: buildPanelContent(guildId),
    components: buildThresholdRows(guildId)
  }).catch(() => undefined);
}

async function handleBehaviorInteraction(interaction) {
  const { customId, guildId } = interaction;
  if (!customId?.startsWith('behavior:')) return false;

  if (!hasOwnerGrade(interaction.member, guildId)) {
    await replyEphemeral(interaction, t(guildId, 'behavior.ownerOnly'));
    return true;
  }

  if (interaction.isButton() && customId === IDS.addThreshold) {
    const modal = new ModalBuilder()
      .setCustomId(IDS.addModal)
      .setTitle(t(guildId, 'behavior.addModalTitle'))
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('score')
            .setLabel(t(guildId, 'behavior.addModalScore'))
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ex: 10')
            .setRequired(true)
            .setMaxLength(5)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('sanction')
            .setLabel(t(guildId, 'behavior.addModalSanction'))
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('warn / mute / kick / ban')
            .setRequired(true)
            .setMaxLength(4)
        )
      );
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isModalSubmit() && customId === IDS.addModal) {
    const rawScore = interaction.fields.getTextInputValue('score').trim();
    const sanction = interaction.fields.getTextInputValue('sanction').trim().toLowerCase();
    const score = Number.parseInt(rawScore, 10);

    if (!Number.isInteger(score) || score <= 0) {
      await replyEphemeral(interaction, t(guildId, 'behavior.invalidScore'));
      return true;
    }
    if (!SANCTIONS.includes(sanction)) {
      await replyEphemeral(interaction, t(guildId, 'behavior.invalidSanction', { valid: SANCTIONS.join(', ') }));
      return true;
    }

    upsertBehaviorThreshold(guildId, score, sanction);
    await refreshBehaviorPanel(interaction);
    await replyEphemeral(interaction, t(guildId, 'behavior.thresholdAdded', { score: String(score), sanction }));
    return true;
  }

  if (interaction.isButton() && customId.startsWith(IDS.removePrefix)) {
    const score = Number(customId.slice(IDS.removePrefix.length));
    removeBehaviorThreshold(guildId, score);
    await refreshBehaviorPanel(interaction);
    await replyEphemeral(interaction, t(guildId, 'behavior.thresholdRemoved', { score: String(score) }));
    return true;
  }

  if (interaction.isButton() && customId.startsWith(IDS.resetPrefix)) {
    const userId = customId.slice(IDS.resetPrefix.length);
    resetBehaviorScore(interaction.guild, userId, interaction.user.id);
    await replyEphemeral(interaction, t(guildId, 'behavior.scoreReset', { user: `<@${userId}>` }));
    return true;
  }

  if (interaction.isButton() && (customId.startsWith(IDS.listNext) || customId.startsWith(IDS.listPrev))) {
    const isNext = customId.startsWith(IDS.listNext);
    const page = Number(customId.slice(isNext ? IDS.listNext.length : IDS.listPrev.length));
    const { content, maxPage } = buildScoreListContent(guildId, page);
    const components = buildScoreListComponents(guildId, page, maxPage);
    await interaction.update({ content, components });
    return true;
  }

  return false;
}

async function refreshBehaviorPanel(interaction) {
  const guildId = interaction.guildId;
  const channel = findTextChannelByName(interaction.guild, CHANNELS.behavior);
  if (!channel) return;

  const msgs = await channel.messages.fetch({ limit: 5 }).catch(() => null);
  const panel = msgs?.find(
    (m) => m.author.id === interaction.guild.client.user.id && m.components.length > 0
  );
  if (!panel) return;

  await panel.edit({
    content: buildPanelContent(guildId),
    components: buildThresholdRows(guildId)
  }).catch(() => undefined);
}

module.exports = {
  IDS,
  seedBehaviorPanel,
  handleBehaviorInteraction,
  buildPanelContent,
  buildThresholdRows
};
