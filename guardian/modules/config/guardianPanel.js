const { MessageFlags } = require('discord.js');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const { CHANNELS, GRADE_NAMES } = require('../../config');
const { t } = require('../i18n');
const { replyEphemeral } = require('../utils/interactions');
const { findTextChannelByName } = require('../utils/channels');
const { getGuildSetting } = require('./settings');
const { getGradeMappings } = require('../initialisation/gradeMapping');
const { getDb } = require('../../database/db');
const { logConfigChange } = require('./configLogger');
const { NOTIFICATION_CATEGORIES, getNotifPrefs, setNotifPref } = require('../notifications/dmNotifier');

const IDS = Object.freeze({
  refreshPanels: 'guardian:refresh:panels',
  syncMembers: 'guardian:sync:members',
  notifTogglePrefix: 'guardian:notif:toggle:'
});

function hasOwnerGrade(member, guildId) {
  const mappings = getGradeMappings(guildId);
  const ownerRoleId = mappings[GRADE_NAMES.owner];
  return ownerRoleId && member.roles.cache.has(ownerRoleId);
}

function buildPanelContent(guild, guildId) {
  const db = getDb();
  const memberCount = db.prepare('SELECT COUNT(*) as n FROM members WHERE guild_id = ?').get(guildId)?.n ?? 0;
  const gameCount = db.prepare('SELECT COUNT(*) as n FROM games WHERE guild_id = ?').get(guildId)?.n ?? 0;
  const setupDone = getGuildSetting(guildId, 'setup', 'step', 0);
  const lang = getGuildSetting(guildId, 'bot', 'language', 'fr') || 'fr';
  const steamKey = getGuildSetting(guildId, 'bot', 'steam_api_key', null);

  return [
    `**${t(guildId, 'config.guardian.title')}**\n`,
    `• **${t(guildId, 'config.guardian.members')}** : ${memberCount}`,
    `• **${t(guildId, 'config.guardian.games')}** : ${gameCount}`,
    `• **${t(guildId, 'config.guardian.setupStep')}** : étape ${setupDone}/8`,
    `• **${t(guildId, 'config.guardian.language')}** : \`${lang}\``,
    `• **${t(guildId, 'config.guardian.steamKey')}** : ${steamKey ? '✅' : '❌'}`,
    `\n${t(guildId, 'config.guardian.hint')}`
  ].join('\n');
}

function buildRows(guildId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(IDS.refreshPanels)
        .setLabel(t(guildId, 'config.guardian.refreshPanels'))
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(IDS.syncMembers)
        .setLabel(t(guildId, 'config.guardian.syncMembers'))
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function buildNotifPanelContent(guildId) {
  const prefs = getNotifPrefs(guildId);
  const lines = [
    `**🔔 ${t(guildId, 'notifications.panelTitle')}**`,
    `*${t(guildId, 'notifications.panelDesc')}*`,
    ''
  ];
  for (const cat of Object.values(NOTIFICATION_CATEGORIES)) {
    const on = prefs[cat.key];
    const label = t(guildId, cat.labelKey) !== cat.labelKey ? t(guildId, cat.labelKey) : cat.key;
    const desc = t(guildId, cat.descKey) !== cat.descKey ? t(guildId, cat.descKey) : '';
    const state = on ? '🟢 Actif' : '🔴 Inactif';
    const crit = cat.critical ? ' *(critique)*' : '';
    lines.push(`${cat.emoji} **${label}**${crit} — ${state}`);
    if (desc) lines.push(`> ${desc}`);
  }
  return lines.join('\n');
}

function buildNotifRows(guildId) {
  const prefs = getNotifPrefs(guildId);
  const cats = Object.values(NOTIFICATION_CATEGORIES);
  const rows = [];
  for (let i = 0; i < cats.length; i += 4) {
    const chunk = cats.slice(i, i + 4);
    const row = new ActionRowBuilder().addComponents(
      chunk.map((cat) => {
        const on = prefs[cat.key];
        const label = t(guildId, cat.labelKey) !== cat.labelKey ? t(guildId, cat.labelKey) : cat.key;
        return new ButtonBuilder()
          .setCustomId(`${IDS.notifTogglePrefix}${cat.key}`)
          .setLabel(`${cat.emoji} ${label}`)
          .setStyle(on ? ButtonStyle.Success : ButtonStyle.Secondary);
      })
    );
    rows.push(row);
    if (rows.length >= 4) break;
  }
  return rows;
}

async function seedGuardianPanel(guild) {
  const guildId = guild.id;

  const adminChannel = findTextChannelByName(guild, CHANNELS.guardian);
  if (adminChannel) {
    const msgs = await adminChannel.messages.fetch({ limit: 10 }).catch(() => null);
    const panel = msgs?.find((m) => m.author.id === guild.client.user.id && m.components.length > 0);
    if (panel) {
      await panel.edit({ content: buildPanelContent(guild, guildId), components: buildRows(guildId) }).catch(() => undefined);
    } else {
      await adminChannel.send({ content: buildPanelContent(guild, guildId), components: buildRows(guildId) }).catch(() => undefined);
    }
  }

  const notifChannel = findTextChannelByName(guild, CHANNELS.notifications);
  if (notifChannel) {
    const msgs = await notifChannel.messages.fetch({ limit: 10 }).catch(() => null);
    const panel = msgs?.find((m) => m.author.id === guild.client.user.id && m.components.length > 0);
    if (panel) {
      await panel.edit({ content: buildNotifPanelContent(guildId), components: buildNotifRows(guildId) }).catch(() => undefined);
    } else {
      await notifChannel.send({ content: buildNotifPanelContent(guildId), components: buildNotifRows(guildId) }).catch(() => undefined);
    }
  }
}

async function handleGuardianInteraction(interaction) {
  const { customId, guildId } = interaction;
  if (!customId?.startsWith('guardian:')) return false;

  if (!hasOwnerGrade(interaction.member, guildId)) {
    await replyEphemeral(interaction, t(guildId, 'config.ownerOnly'));
    return true;
  }

  if (interaction.isButton() && customId === IDS.refreshPanels) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
    const { seedGuildMessages } = require('../../modules/initialisation/seeds');
    await seedGuildMessages(interaction.guild);
    await seedGuardianPanel(interaction.guild);
    await interaction.editReply({ content: t(guildId, 'config.guardian.panelsRefreshed') }).catch(() => {});
    await logConfigChange(interaction.guild, interaction.user.id, 'guardian.refresh_panels', null, 'triggered');
    return true;
  }

  if (interaction.isButton() && customId.startsWith(IDS.notifTogglePrefix)) {
    const catKey = customId.slice(IDS.notifTogglePrefix.length);
    const prefs = getNotifPrefs(guildId);
    const current = prefs[catKey] ?? false;
    setNotifPref(guildId, catKey, !current);
    await interaction.update({
      content: buildNotifPanelContent(guildId),
      components: buildNotifRows(guildId)
    }).catch(() => {});
    await logConfigChange(interaction.guild, interaction.user.id, `notifications.${catKey}`, current, !current);
    return true;
  }

  if (interaction.isButton() && customId === IDS.syncMembers) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
    const db = getDb();
    const mappings = getGradeMappings(guildId);
    const invertedMap = {};
    for (const [gradeName, roleId] of Object.entries(mappings)) {
      if (roleId) invertedMap[roleId] = gradeName;
    }
    const members = await interaction.guild.members.fetch().catch(() => null);
    if (!members) {
      await interaction.editReply({ content: t(guildId, 'config.guardian.syncFailed') }).catch(() => {});
      return true;
    }
    const insert = db.prepare(
      `INSERT OR IGNORE INTO members (guild_id, user_id, grade, join_date, score_comportement) VALUES (?, ?, ?, ?, ?)`
    );
    let count = 0;
    for (const member of members.values()) {
      if (member.user.bot) continue;
      let grade = GRADE_NAMES.invite;
      for (const [roleId, gradeName] of Object.entries(invertedMap)) {
        if (member.roles.cache.has(roleId)) { grade = gradeName; break; }
      }
      const result = insert.run(guildId, member.id, grade, member.joinedAt?.toISOString() || new Date().toISOString(), 200);
      if (result.changes > 0) count++;
    }
    await seedGuardianPanel(interaction.guild);
    await interaction.editReply({ content: t(guildId, 'config.guardian.syncDone', { count }) }).catch(() => {});
    await logConfigChange(interaction.guild, interaction.user.id, 'guardian.sync_members', null, `${count} inserts`);
    return true;
  }

  return false;
}

module.exports = { seedGuardianPanel, handleGuardianInteraction, buildNotifPanelContent, buildNotifRows };
