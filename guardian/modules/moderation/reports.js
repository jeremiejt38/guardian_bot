const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { getDb } = require('../../database/db');
const { CHANNELS } = require('../../config');
const { t } = require('../i18n');
const { replyEphemeral } = require('../utils/interactions');
const { findTextChannelByName } = require('../utils/channels');
const logger = require('../logs/logger');
const { sendModLog } = require('./modLog');

function createReport(guildId, reporterId, targetText, reason, evidence) {
  const db = getDb();
  const result = db.prepare(
    `INSERT INTO reports (guild_id, reporter_id, target_text, reason, evidence, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'open', ?)`
  ).run(guildId, reporterId, targetText, reason, evidence || null, new Date().toISOString());
  return result.lastInsertRowid;
}

function getReport(reportId) {
  return getDb().prepare('SELECT * FROM reports WHERE report_id = ?').get(reportId);
}

function resolveReport(reportId, handledBy) {
  const row = getDb().prepare('SELECT status FROM reports WHERE report_id = ?').get(reportId);
  if (!row) return 'not_found';
  if (row.status === 'handled') return 'already_handled';
  getDb().prepare(
    'UPDATE reports SET status = ?, handled_at = ?, handled_by = ? WHERE report_id = ?'
  ).run('handled', new Date().toISOString(), handledBy, reportId);
  return 'ok';
}

function setReportMessageId(reportId, messageId) {
  getDb().prepare('UPDATE reports SET message_id = ? WHERE report_id = ?').run(messageId, reportId);
}

async function handleOpenReportButton(interaction) {
  const guildId = interaction.guildId;
  const modal = new ModalBuilder()
    .setCustomId('report:modal')
    .setTitle(t(guildId, 'reports.modalTitle'))
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('target')
          .setLabel(t(guildId, 'reports.modalTarget'))
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel(t(guildId, 'reports.modalReason'))
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(500)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('evidence')
          .setLabel(t(guildId, 'reports.modalEvidence'))
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(200)
      )
    );
  await interaction.showModal(modal);
}

async function handleReportModalSubmit(interaction) {
  const guildId = interaction.guildId;
  const targetText = interaction.fields.getTextInputValue('target').trim();
  const reason = interaction.fields.getTextInputValue('reason').trim();
  const evidence = interaction.fields.getTextInputValue('evidence')?.trim() || null;

  const reportsChannel = findTextChannelByName(interaction.guild, CHANNELS.reports);
  if (!reportsChannel) {
    await replyEphemeral(interaction, t(guildId, 'reports.channelMissing'));
    return;
  }

  const reportId = createReport(guildId, interaction.user.id, targetText, reason, evidence);

  const embed = new EmbedBuilder()
    .setTitle(t(guildId, 'reports.embedTitle'))
    .addFields(
      { name: t(guildId, 'reports.embedReporter'), value: `<@${interaction.user.id}>`, inline: true },
      { name: t(guildId, 'reports.embedTarget'), value: targetText, inline: true },
      { name: t(guildId, 'reports.embedReason'), value: reason, inline: false },
      { name: t(guildId, 'reports.embedEvidence'), value: evidence || t(guildId, 'reports.none'), inline: false }
    )
    .setTimestamp()
    .setColor(0xE74C3C);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`report:handled:${reportId}`)
      .setLabel(t(guildId, 'reports.handledButton'))
      .setStyle(ButtonStyle.Success)
  );

  const msg = await reportsChannel.send({ embeds: [embed], components: [row] });
  setReportMessageId(reportId, msg.id);

  await replyEphemeral(interaction, t(guildId, 'reports.submitted'));
}

async function markReportHandled(interaction) {
  const guildId = interaction.guildId;
  const parts = interaction.customId.split(':');
  const reportId = Number(parts[2]);

  if (!reportId) {
    await replyEphemeral(interaction, t(guildId, 'reports.notFound'));
    return;
  }

  const result = resolveReport(reportId, interaction.user.id);

  if (result === 'not_found') {
    await replyEphemeral(interaction, t(guildId, 'reports.notFound'));
    return;
  }

  if (result === 'already_handled') {
    await replyEphemeral(interaction, t(guildId, 'reports.alreadyHandled'));
    return;
  }

  await logger.logToDiscord(
    interaction.guild,
    t(guildId, 'reports.handledPublic', { staff: `<@${interaction.user.id}>`, id: String(reportId) })
  ).catch(() => undefined);

  await sendModLog(interaction.guild, t(guildId, 'modLog.reportHandledLog', { id: String(reportId), staffId: interaction.user.id }));

  await interaction.update({
    content: t(guildId, 'reports.handledPublic', { staff: `<@${interaction.user.id}>`, id: String(reportId) }),
    components: []
  });
}

async function seedReportPanel(guild) {
  const { findTextChannelByName: find } = require('../utils/channels');
  const channel = find(guild, CHANNELS.welcome);
  if (!channel) return;

  const messages = await channel.messages.fetch({ limit: 10 }).catch(() => null);
  const panel = messages?.find(
    (m) => m.author.id === guild.client.user.id && m.components.length > 0 &&
      m.components[0]?.components?.[0]?.customId === 'report:open'
  );
  if (panel) {
    await panel.edit({ content: t(guild.id, 'reports.panelText') }).catch(() => undefined);
    return;
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('report:open')
      .setLabel(t(guild.id, 'reports.panelButton'))
      .setStyle(ButtonStyle.Danger)
  );
  await channel.send({ content: t(guild.id, 'reports.panelText'), components: [row] }).catch(() => undefined);
}

module.exports = {
  createReport,
  getReport,
  resolveReport,
  handleOpenReportButton,
  handleReportModalSubmit,
  markReportHandled,
  seedReportPanel
};
