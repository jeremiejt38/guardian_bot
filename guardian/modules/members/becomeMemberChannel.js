const { MessageFlags } = require('discord.js');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { GRADE_NAMES, CHANNELS } = require('../../config');
const { getDb, getGrade } = require('../../database/db');
const { getGuildSetting } = require('../config/settings');
const { getSponsorship } = require('./parrainage');
const { replyEphemeral } = require('../utils/interactions');
const { hasAcceptedRules, getRulesRequired, isCommunityGuild } = require('./rulesAcceptance');
const { t } = require('../../locales');
const logger = require('../logs/logger');

const IDS = Object.freeze({
  open: 'become:open',
  sponsorship: 'become:sponsorship',
  bio: 'become:bio',
  submit: 'become:submit',
  bioModal: 'become:modal:bio'
});

function getMemberRecord(guildId, userId) {
  const db = getDb();
  return db.prepare('SELECT * FROM members WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
}

function parseHoursSince(dateIso) {
  const date = new Date(dateIso).getTime();
  if (!date) return 0;
  return Math.floor(Math.max(0, Date.now() - date) / 3_600_000);
}

function buildPrerequisitesEphemeral(guildId, record, options) {
  const { minDelayHours, bioRequired, sponsorshipRequired, sponsorship, hasBio, joinedHours, pendingRequest, rulesRequired, rulesAccepted } = options;

  const delayOk = joinedHours >= minDelayHours;
  const bioOk = !bioRequired || hasBio;
  const sponsorOk = !sponsorshipRequired || !!sponsorship;
  const rulesOk = !rulesRequired || rulesAccepted;
  const allOk = delayOk && bioOk && sponsorOk && rulesOk && !pendingRequest;

  const lines = [
    '## 📋 Your membership prerequisites',
    ''
  ];

  if (rulesRequired) {
    lines.push(rulesAccepted
      ? `✅ **Rules accepted**`
      : `❌ **Rules** — you must accept the server rules first (see **#${require('../../config').CHANNELS.rules}**)`);
  }

  lines.push(delayOk
    ? `✅ **Time on server** — ${joinedHours}h / ${minDelayHours}h required`
    : `⏳ **Time on server** — ${joinedHours}h / ${minDelayHours}h required — ${minDelayHours - joinedHours}h remaining`);

  if (bioRequired) {
    lines.push(hasBio
      ? `✅ **Presentation** — filled in`
      : `❌ **Presentation** — not filled in yet`);
  }

  if (sponsorshipRequired) {
    lines.push(sponsorship
      ? `✅ **Sponsorship** — sponsored by <@${sponsorship.parrain_id}>`
      : `❌ **Sponsorship** — no sponsor yet`);
  }

  if (pendingRequest) {
    lines.push('', '⏳ *You already have a pending membership request being reviewed by the staff.*');
  }

  lines.push('');

  const buttons = [];

  if (sponsorshipRequired) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(IDS.sponsorship)
        .setLabel(sponsorship ? '✅ My sponsor' : '🤝 Sponsorship')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  buttons.push(
    new ButtonBuilder()
      .setCustomId(IDS.bio)
      .setLabel(hasBio ? '✏️ Edit my presentation' : '📝 Fill in my presentation')
      .setStyle(ButtonStyle.Secondary)
  );

  if (allOk) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(IDS.submit)
        .setLabel('🚀 Submit my request')
        .setStyle(ButtonStyle.Success)
    );
  }

  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }

  return { content: lines.join('\n'), components: rows, flags: MessageFlags.Ephemeral };
}

async function handleBecomeMemberInteraction(interaction) {
  if (!interaction.guildId || !interaction.customId) return false;

  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  if (interaction.isButton() && interaction.customId === IDS.open) {
    const inviteRoleId = getGrade(guildId, GRADE_NAMES.invite);
    const isInvite = inviteRoleId && interaction.member?.roles?.cache?.has(inviteRoleId);
    if (!isInvite) {
      await replyEphemeral(interaction, t('promotion.notInvite', {}, { guildId }));
      return true;
    }

    const record = getMemberRecord(guildId, userId);
    const minDelayHours = Number(getGuildSetting(guildId, 'members', 'promotion_delay_hours', 48));
    const bioRequired = Boolean(getGuildSetting(guildId, 'members', 'bio_required', false));
    const sponsorshipRequired = Boolean(getGuildSetting(guildId, 'members', 'sponsorship_required', false));
    const sponsorship = getSponsorship(guildId, userId);
    const joinedHours = record?.join_date ? parseHoursSince(record.join_date) : 0;
    const hasBio = Boolean(String(record?.bio || '').trim());
    const rulesRequired = getRulesRequired(guildId) && !isCommunityGuild(interaction.guild);
    const rulesAccepted = hasAcceptedRules(guildId, userId);

    const db = getDb();
    const pendingRequest = db.prepare(
      `SELECT request_id FROM promotion_requests WHERE guild_id = ? AND user_id = ? AND status = 'pending' LIMIT 1`
    ).get(guildId, userId);

    const payload = buildPrerequisitesEphemeral(guildId, record, {
      minDelayHours, bioRequired, sponsorshipRequired, sponsorship, hasBio, joinedHours, pendingRequest, rulesRequired, rulesAccepted
    });

    await interaction.reply(payload).catch(() => {});
    return true;
  }

  if (interaction.isButton() && interaction.customId === IDS.sponsorship) {
    const sponsorship = getSponsorship(guildId, userId);
    const sponsorshipRequired = Boolean(getGuildSetting(guildId, 'members', 'sponsorship_required', false));
    const lines = [
      '## 🤝 Sponsorship',
      '',
      '**What is sponsorship?**',
      'A current Member can vouch for you before your membership request is reviewed. It shows the staff that someone in the community already trusts you.',
      '',
      sponsorshipRequired
        ? '⚠️ Sponsorship is **required** on this server to submit a membership request.'
        : 'ℹ️ Sponsorship is optional on this server but may help your request get accepted faster.',
      ''
    ];
    if (sponsorship) {
      lines.push(`✅ You are already sponsored by <@${sponsorship.parrain_id}>.`);
    } else {
      lines.push('❌ You have no sponsor yet.', '', '**How to get sponsored?**', 'Ask a Member, Moderator, Manager or Owner to sponsor you. They can use the `/parrainer` command.');
    }
    await interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral }).catch(() => {});
    return true;
  }

  if (interaction.isButton() && interaction.customId === IDS.bio) {
    const record = getMemberRecord(guildId, userId);
    const existingBio = String(record?.bio || '').trim();
    const modal = new ModalBuilder()
      .setCustomId(IDS.bioModal)
      .setTitle('My presentation');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('bio')
          .setLabel('Introduce yourself in a few words')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(400)
          .setValue(existingBio)
      )
    );
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId === IDS.bioModal) {
    const bio = interaction.fields.getTextInputValue('bio').trim();
    if (bio) {
      const db = getDb();
      db.prepare(
        `INSERT INTO members (guild_id, user_id, grade, join_date, bio)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(guild_id, user_id)
         DO UPDATE SET bio = excluded.bio`
      ).run(guildId, userId, GRADE_NAMES.invite, new Date().toISOString(), bio);
    }
    await replyEphemeral(interaction, '✅ Your presentation has been saved. You can now submit your request if all prerequisites are met.');
    return true;
  }

  if (interaction.isButton() && interaction.customId === IDS.submit) {
    const { processPromotionRequest } = require('./promotion');
    const record = getMemberRecord(guildId, userId);
    const bio = String(record?.bio || '').trim() || null;
    return processPromotionRequest(interaction, bio);
  }

  return false;
}

async function seedBecomeMemberChannel(channel, guild) {
  if (!channel?.isTextBased()) return;

  const existing = await channel.messages.fetch({ limit: 10 }).catch(() => null);
  if (existing?.size > 0) {
    await channel.bulkDelete(existing).catch(() => {});
  }

  const minDelayHours = Number(getGuildSetting(guild.id, 'members', 'promotion_delay_hours', 48));
  const bioRequired = Boolean(getGuildSetting(guild.id, 'members', 'bio_required', false));
  const sponsorshipRequired = Boolean(getGuildSetting(guild.id, 'members', 'sponsorship_required', false));

  const lines = [
    '## 📋 Become a Member',
    '',
    'Want to join **' + guild.name + '** as a full Member? Here is how it works:',
    '',
    `⏱️ **Wait time** — you must be on the server for at least **${minDelayHours}h** before applying`,
    bioRequired ? '📝 **Presentation required** — fill in a short bio about yourself' : '📝 **Presentation** — optional but recommended',
    sponsorshipRequired ? '🤝 **Sponsorship required** — a Member must vouch for you' : '🤝 **Sponsorship** — optional but speeds up the review',
    '',
    'Click the button below to check your status and submit your request.',
    '-# *Only you can see your personal status and request button.*'
  ];

  await channel.send({
    content: lines.join('\n'),
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(IDS.open)
          .setLabel('🚀 I want to become a Member')
          .setStyle(ButtonStyle.Primary)
      )
    ]
  }).catch((err) => logger.warn(`seedBecomeMemberChannel: ${err.message}`));
}

module.exports = { IDS, seedBecomeMemberChannel, handleBecomeMemberInteraction };
