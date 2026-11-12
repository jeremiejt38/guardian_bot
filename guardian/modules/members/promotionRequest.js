const { MessageFlags } = require('discord.js');
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
const { GRADE_NAMES, CHANNELS } = require('../../config');
const { t } = require('../i18n');
const { getGuildSetting } = require('../config/settings');
const { getSponsorship } = require('./parrainage');
const logger = require('../logs/logger');

const CUSTOM_IDS = Object.freeze({
  requestButton: 'promotion:request',
  bioModal: 'promotion:bio:modal',
  bioInput: 'promotion:bio:input',
  accept: 'promotion:accept:',
  reject: 'promotion:reject:',
  reply: 'promotion:reply:',
  rejectModal: 'promotion:reject:modal:',
  rejectInput: 'promotion:reject:input',
  replyModal: 'promotion:reply:modal:',
  replyInput: 'promotion:reply:input'
});

function getGradeRoleId(guildId, gradeName) {
  const db = getDb();
  const row = db.prepare('SELECT role_id FROM grades WHERE guild_id = ? AND grade_name = ?').get(guildId, gradeName);
  return row?.role_id || null;
}

function getMemberRecord(guildId, userId) {
  const db = getDb();
  return db.prepare('SELECT * FROM members WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
}

function getPendingRequest(guildId, userId) {
  const db = getDb();
  return db
    .prepare("SELECT * FROM promotion_requests WHERE guild_id = ? AND user_id = ? AND status = 'pending'")
    .get(guildId, userId);
}

function createRequest(guildId, userId, bio, sponsorshipId) {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO promotion_requests (guild_id, user_id, status, bio, sponsorship_id, created_at)
       VALUES (?, ?, 'pending', ?, ?, ?)`
    )
    .run(guildId, userId, bio || null, sponsorshipId || null, new Date().toISOString());
  return result.lastInsertRowid;
}

function updateRequestMessageId(requestId, messageId) {
  const db = getDb();
  db.prepare('UPDATE promotion_requests SET message_id = ? WHERE request_id = ?').run(messageId, requestId);
}

function getRequest(requestId) {
  const db = getDb();
  return db.prepare('SELECT * FROM promotion_requests WHERE request_id = ?').get(requestId);
}

function resolveRequest(requestId, status, reviewedBy, reason) {
  const db = getDb();
  db.prepare(
    'UPDATE promotion_requests SET status = ?, reviewed_at = ?, reviewed_by = ?, reason = ? WHERE request_id = ?'
  ).run(status, new Date().toISOString(), reviewedBy, reason || null, requestId);
}

function hasReviewerGrade(member, guildId) {
  const reviewerGrade = getGuildSetting(guildId, 'members', 'promotion_review_grade', GRADE_NAMES.moderateur);
  const gradeOrder = [GRADE_NAMES.moderateur, GRADE_NAMES.manager, GRADE_NAMES.owner];
  const minIndex = gradeOrder.indexOf(reviewerGrade);
  if (minIndex < 0) {
    return false;
  }

  for (let i = minIndex; i < gradeOrder.length; i++) {
    const roleId = getGradeRoleId(guildId, gradeOrder[i]);
    if (roleId && member.roles.cache.has(roleId)) {
      return true;
    }
  }

  return false;
}

function buildRequestButton(guildId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.requestButton)
      .setLabel(t(guildId, 'promotion.requestButton'))
      .setStyle(ButtonStyle.Primary)
  );
}

function buildRequestEmbed(guildId, member, joinedHours, bio, sponsorId) {
  return new EmbedBuilder()
    .setTitle(t(guildId, 'promotion.requestEmbedTitle'))
    .addFields(
      { name: t(guildId, 'promotion.requestEmbedUser'), value: `<@${member.id}>`, inline: true },
      { name: t(guildId, 'promotion.requestEmbedJoinedHours', { hours: String(Math.floor(joinedHours)) }), value: '\u200B', inline: true },
      { name: t(guildId, 'promotion.requestEmbedBio'), value: bio || t(guildId, 'promotion.none'), inline: false },
      {
        name: t(guildId, 'promotion.requestEmbedSponsorship'),
        value: sponsorId ? `<@${sponsorId}>` : t(guildId, 'promotion.none'),
        inline: true
      }
    )
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp();
}

function buildStaffActions(guildId, requestId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CUSTOM_IDS.accept}${requestId}`)
      .setLabel(t(guildId, 'promotion.accept'))
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${CUSTOM_IDS.reject}${requestId}`)
      .setLabel(t(guildId, 'promotion.reject'))
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`${CUSTOM_IDS.reply}${requestId}`)
      .setLabel(t(guildId, 'promotion.reply'))
      .setStyle(ButtonStyle.Secondary)
  );
}

async function handleRequestButton(interaction) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  const inviteRoleId = getGradeRoleId(guildId, GRADE_NAMES.invite);
  const isInvite = inviteRoleId && interaction.member?.roles?.cache?.has(inviteRoleId);
  if (!isInvite) {
    await interaction.reply({ content: t(guildId, 'promotion.notInvite'), flags: MessageFlags.Ephemeral });
    return;
  }

  const record = getMemberRecord(guildId, userId);
  const delayHours = Math.max(0, Number(getGuildSetting(guildId, 'members', 'promotion_delay_hours', 48)));
  if (record?.join_date) {
    const ageMs = Date.now() - new Date(record.join_date).getTime();
    const remaining = delayHours - ageMs / 3600000;
    if (remaining > 0) {
      await interaction.reply({
        content: t(guildId, 'promotion.delayNotReached', { remaining: String(Math.ceil(remaining)) }),
        flags: MessageFlags.Ephemeral
      });
      return;
    }
  }

  const sponsorRequired = Boolean(getGuildSetting(guildId, 'members', 'sponsorship_required', false));
  if (sponsorRequired) {
    const sponsorship = getSponsorship(guildId, userId);
    if (!sponsorship) {
      await interaction.reply({ content: t(guildId, 'promotion.sponsorshipRequired'), flags: MessageFlags.Ephemeral });
      return;
    }
  }

  if (getPendingRequest(guildId, userId)) {
    await interaction.reply({ content: t(guildId, 'promotion.pendingExists'), flags: MessageFlags.Ephemeral });
    return;
  }

  const bioRequired = Boolean(getGuildSetting(guildId, 'members', 'bio_required', false));
  if (bioRequired) {
    const modal = new ModalBuilder()
      .setCustomId(CUSTOM_IDS.bioModal)
      .setTitle(t(guildId, 'promotion.bioModalTitle'))
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(CUSTOM_IDS.bioInput)
            .setLabel(t(guildId, 'promotion.bioModalLabel'))
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMinLength(15)
        )
      );
    await interaction.showModal(modal);
    return;
  }

  await submitRequest(interaction, null);
}

async function handleBioModal(interaction) {
  const bio = interaction.fields.getTextInputValue(CUSTOM_IDS.bioInput);
  await submitRequest(interaction, bio);
}

async function submitRequest(interaction, bio) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const member = interaction.member;

  const sponsorship = getSponsorship(guildId, userId);
  const requestId = createRequest(guildId, userId, bio, sponsorship?.parrain_id || null);

  const requestsChannel = interaction.guild.channels.cache.find(
    (ch) => ch.name === CHANNELS.requests && ch.isTextBased?.()
  );

  if (!requestsChannel) {
    await interaction.reply({ content: t(guildId, 'promotion.requestsChannelMissing'), flags: MessageFlags.Ephemeral });
    return;
  }

  const record = getMemberRecord(guildId, userId);
  const joinedHours = record?.join_date ? (Date.now() - new Date(record.join_date).getTime()) / 3600000 : 0;

  const embed = buildRequestEmbed(guildId, member, joinedHours, bio, sponsorship?.parrain_id || null);
  const staffRow = buildStaffActions(guildId, requestId);

  const msg = await requestsChannel.send({ embeds: [embed], components: [staffRow] });
  updateRequestMessageId(requestId, msg.id);

  await interaction.reply({ content: t(guildId, 'promotion.requestSubmitted'), flags: MessageFlags.Ephemeral });
}

async function handleAccept(interaction, requestId) {
  const guildId = interaction.guildId;

  if (!hasReviewerGrade(interaction.member, guildId)) {
    await interaction.reply({ content: t(guildId, 'promotion.reviewerForbidden'), flags: MessageFlags.Ephemeral });
    return;
  }

  const request = getRequest(requestId);
  if (!request) {
    await interaction.reply({ content: t(guildId, 'promotion.requestNotFound'), flags: MessageFlags.Ephemeral });
    return;
  }

  if (request.status !== 'pending') {
    await interaction.reply({ content: t(guildId, 'promotion.requestAlreadyHandled'), flags: MessageFlags.Ephemeral });
    return;
  }

  let targetMember;
  try {
    targetMember = await interaction.guild.members.fetch(request.user_id);
  } catch {
    await interaction.reply({ content: t(guildId, 'promotion.targetMissing'), flags: MessageFlags.Ephemeral });
    return;
  }

  const inviteRoleId = getGradeRoleId(guildId, GRADE_NAMES.invite);
  const memberRoleId = getGradeRoleId(guildId, GRADE_NAMES.membre);

  if (inviteRoleId) {
    await targetMember.roles.remove(inviteRoleId).catch(() => {});
  }

  if (memberRoleId) {
    await targetMember.roles.add(memberRoleId).catch(() => {});
  }

  const db = getDb();
  db.prepare("UPDATE members SET grade = ? WHERE guild_id = ? AND user_id = ?").run(GRADE_NAMES.membre, guildId, request.user_id);
  resolveRequest(requestId, 'accepted', interaction.user.id, null);

  try {
    await targetMember.send(t(guildId, 'promotion.acceptedDm'));
  } catch {}

  const generalChannel = interaction.guild.channels.cache.find(
    (ch) => ch.name === 'general' && ch.isTextBased?.()
  );
  if (generalChannel) {
    await generalChannel.send(t(guildId, 'promotion.acceptedPublic', { user: `<@${request.user_id}>` }));
  }

  await logger.logToDiscord(
    interaction.guild,
    t(guildId, 'promotion.acceptedLog', { user: `<@${request.user_id}>`, staff: `<@${interaction.user.id}>` })
  );

  await interaction.update({ components: [] });
}

async function handleReject(interaction, requestId) {
  const guildId = interaction.guildId;

  if (!hasReviewerGrade(interaction.member, guildId)) {
    await interaction.reply({ content: t(guildId, 'promotion.reviewerForbidden'), flags: MessageFlags.Ephemeral });
    return;
  }

  const request = getRequest(requestId);
  if (!request) {
    await interaction.reply({ content: t(guildId, 'promotion.requestNotFound'), flags: MessageFlags.Ephemeral });
    return;
  }

  if (request.status !== 'pending') {
    await interaction.reply({ content: t(guildId, 'promotion.requestAlreadyHandled'), flags: MessageFlags.Ephemeral });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`${CUSTOM_IDS.rejectModal}${requestId}`)
    .setTitle(t(guildId, 'promotion.rejectModalTitle'))
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(CUSTOM_IDS.rejectInput)
          .setLabel(t(guildId, 'promotion.rejectModalLabel'))
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
      )
    );
  await interaction.showModal(modal);
}

async function handleRejectModal(interaction, requestId) {
  const guildId = interaction.guildId;
  const reason = interaction.fields.getTextInputValue(CUSTOM_IDS.rejectInput) || '';

  const request = getRequest(requestId);
  if (!request || request.status !== 'pending') {
    await interaction.reply({ content: t(guildId, 'promotion.requestAlreadyHandled'), flags: MessageFlags.Ephemeral });
    return;
  }

  resolveRequest(requestId, 'rejected', interaction.user.id, reason);

  try {
    const target = await interaction.guild.members.fetch(request.user_id);
    await target.send(t(guildId, 'promotion.rejectedDm', { reason: reason || '-' }));
  } catch {}

  await logger.logToDiscord(
    interaction.guild,
    t(guildId, 'promotion.rejectedLog', { user: `<@${request.user_id}>`, staff: `<@${interaction.user.id}>` })
  );

  const originalMsg = await interaction.channel.messages.fetch(request.message_id).catch(() => null);
  if (originalMsg) {
    await originalMsg.edit({ components: [] }).catch(() => {});
  }

  await interaction.reply({ content: t(guildId, 'promotion.rejectedPublic', { user: `<@${request.user_id}>` }), flags: MessageFlags.Ephemeral });
}

async function handleReply(interaction, requestId) {
  const guildId = interaction.guildId;

  if (!hasReviewerGrade(interaction.member, guildId)) {
    await interaction.reply({ content: t(guildId, 'promotion.reviewerForbidden'), flags: MessageFlags.Ephemeral });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`${CUSTOM_IDS.replyModal}${requestId}`)
    .setTitle(t(guildId, 'promotion.replyModalTitle'))
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(CUSTOM_IDS.replyInput)
          .setLabel(t(guildId, 'promotion.replyModalLabel'))
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      )
    );
  await interaction.showModal(modal);
}

async function handleReplyModal(interaction, requestId) {
  const guildId = interaction.guildId;
  const message = interaction.fields.getTextInputValue(CUSTOM_IDS.replyInput);

  const request = getRequest(requestId);
  if (!request) {
    await interaction.reply({ content: t(guildId, 'promotion.requestNotFound'), flags: MessageFlags.Ephemeral });
    return;
  }

  try {
    const target = await interaction.guild.members.fetch(request.user_id);
    await target.send(message);
  } catch {}

  await interaction.reply({ content: t(guildId, 'promotion.replySent', { user: `<@${request.user_id}>` }), flags: MessageFlags.Ephemeral });
}

async function handlePromotionInteraction(interaction) {
  const id = interaction.customId;

  if (interaction.isButton() && id === CUSTOM_IDS.requestButton) {
    await handleRequestButton(interaction);
    return true;
  }

  if (interaction.isModalSubmit() && id === CUSTOM_IDS.bioModal) {
    await handleBioModal(interaction);
    return true;
  }

  if (interaction.isButton() && id.startsWith(CUSTOM_IDS.accept)) {
    const requestId = Number(id.slice(CUSTOM_IDS.accept.length));
    await handleAccept(interaction, requestId);
    return true;
  }

  if (interaction.isButton() && id.startsWith(CUSTOM_IDS.reject) && !id.includes('modal')) {
    const requestId = Number(id.slice(CUSTOM_IDS.reject.length));
    await handleReject(interaction, requestId);
    return true;
  }

  if (interaction.isModalSubmit() && id.startsWith(CUSTOM_IDS.rejectModal)) {
    const requestId = Number(id.slice(CUSTOM_IDS.rejectModal.length));
    await handleRejectModal(interaction, requestId);
    return true;
  }

  if (interaction.isButton() && id.startsWith(CUSTOM_IDS.reply)) {
    const requestId = Number(id.slice(CUSTOM_IDS.reply.length));
    await handleReply(interaction, requestId);
    return true;
  }

  if (interaction.isModalSubmit() && id.startsWith(CUSTOM_IDS.replyModal)) {
    const requestId = Number(id.slice(CUSTOM_IDS.replyModal.length));
    await handleReplyModal(interaction, requestId);
    return true;
  }

  return false;
}

module.exports = {
  CUSTOM_IDS,
  buildRequestButton,
  handlePromotionInteraction
};
