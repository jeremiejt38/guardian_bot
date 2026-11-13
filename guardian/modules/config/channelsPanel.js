const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { CHANNELS, GRADE_NAMES } = require('../../config');
const { t } = require('../i18n');
const { replyEphemeral } = require('../utils/interactions');
const { findTextChannelByName } = require('../utils/channels');
const { getGuildSetting, setGuildSetting } = require('./settings');
const { getGradeMappings } = require('../initialisation/gradeMapping');
const { logConfigChange } = require('./configLogger');
const { isPremiumFeatureEnabled, buildPremiumLockButton } = require('../tier/premiumGateUI');

const MODULES = [
  {
    key: 'afk_enabled',          label: 'Canal AFK',
    desc: 'Salon vocal AFK pour les membres inactifs',
    toggleId: 'channels:toggle:afk',
    default: true
  },
  {
    key: 'game_updates_enabled', label: 'Changelogs Steam',
    desc: 'Notifications automatiques des mises à jour des jeux suivis',
    toggleId: 'channels:toggle:gameupdates',
    default: true
  },
  {
    key: 'galerie_enabled',      label: 'Galerie par jeu',
    desc: 'Channel galerie dédié pour chaque jeu configuré',
    toggleId: 'channels:toggle:galerie',
    default: true
  },
  {
    key: 'suggestions_enabled',  label: 'Suggestions',
    desc: 'Forum de suggestions membres avec votes et statuts',
    toggleId: 'channels:toggle:suggestions',
    premiumFeature: 'suggestions_forum',
    default: true
  },
  {
    key: 'server_list_enabled',  label: 'Liste des serveurs',
    desc: 'Channel public listant les serveurs de jeu approuvés',
    toggleId: 'channels:toggle:serverlist',
    premiumFeature: 'server_list',
    default: false
  },
  {
    key: 'statusbot_enabled',    label: 'Statut du bot',
    desc: 'Affichage du statut Guardian dans le channel dédié',
    toggleId: 'channels:toggle:statusbot',
    default: true
  },
];

function hasManagerGrade(member, guildId) {
  const mappings = getGradeMappings(guildId);
  return [GRADE_NAMES.manager, GRADE_NAMES.owner].some(
    (g) => mappings[g] && member.roles.cache.has(mappings[g])
  );
}

function buildPanelContent(guildId) {
  const lines = [`**${t(guildId, 'config.channels.title')}**\n`];
  for (const mod of MODULES) {
    const val = getGuildSetting(guildId, 'channels', mod.key, mod.default);
    const state = val ? '🟢' : '🔴';
    const premium = mod.premiumFeature && !isPremiumFeatureEnabled(guildId) ? ' 🔒' : '';
    lines.push(`${state} **${mod.label}**${premium}`);
    lines.push(`  -# *${mod.desc}*`);
  }
  return lines.join('\n');
}

function buildAllRows(guildId) {
  const rows = [];
  for (const mod of MODULES) {
    if (mod.premiumFeature && !isPremiumFeatureEnabled(guildId)) {
      rows.push(new ActionRowBuilder().addComponents(
        buildPremiumLockButton(mod.premiumFeature, mod.label)
      ));
      continue;
    }
    const val = getGuildSetting(guildId, 'channels', mod.key, mod.default);
    const btn = new ButtonBuilder()
      .setCustomId(mod.toggleId)
      .setLabel(`${mod.label} : ${val ? 'ON ✅' : 'OFF ❌'}`)
      .setStyle(val ? ButtonStyle.Success : ButtonStyle.Secondary);
    rows.push(new ActionRowBuilder().addComponents(btn));
  }
  return rows;
}

function buildRows(guildId) {
  return buildAllRows(guildId).slice(0, 5);
}

async function seedChannelsPanel(guild) {
  const channel = findTextChannelByName(guild, CHANNELS.channelsConfig);
  if (!channel) return;
  const guildId = guild.id;
  const allRows = buildAllRows(guildId);
  const chunk1 = allRows.slice(0, 5);
  const chunk2 = allRows.slice(5);

  const msgs = await channel.messages.fetch({ limit: 10 }).catch(() => null);
  const botPanels = msgs?.filter((m) => m.author.id === guild.client.user.id && m.components.length > 0)?.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  if (botPanels && botPanels.size >= 1) { await refreshChannelsPanel(guild); return; }

  await channel.send({ content: buildPanelContent(guildId), components: chunk1 }).catch(() => undefined);
  if (chunk2.length > 0) {
    await channel.send({ content: '** **', components: chunk2 }).catch(() => undefined);
  }
}

async function refreshChannelsPanel(guild) {
  const channel = findTextChannelByName(guild, CHANNELS.channelsConfig);
  if (!channel) return;
  const guildId = guild.id;
  const allRows = buildAllRows(guildId);
  const chunk1 = allRows.slice(0, 5);
  const chunk2 = allRows.slice(5);

  const msgs = await channel.messages.fetch({ limit: 10 }).catch(() => null);
  const botPanels = [...(msgs?.filter((m) => m.author.id === guild.client.user.id && m.components.length > 0)?.values() ?? [])]
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  if (botPanels.length === 0) {
    await channel.send({ content: buildPanelContent(guildId), components: chunk1 }).catch(() => undefined);
    if (chunk2.length > 0) await channel.send({ content: '** **', components: chunk2 }).catch(() => undefined);
    return;
  }
  await botPanels[0].edit({ content: buildPanelContent(guildId), components: chunk1 }).catch(() => undefined);
  if (chunk2.length > 0 && botPanels[1]) {
    await botPanels[1].edit({ content: '** **', components: chunk2 }).catch(() => undefined);
  } else if (chunk2.length > 0) {
    await channel.send({ content: '** **', components: chunk2 }).catch(() => undefined);
  }
}

async function handleChannelsInteraction(interaction) {
  const { customId, guildId } = interaction;
  if (!customId?.startsWith('channels:toggle:')) return false;

  if (!hasManagerGrade(interaction.member, guildId)) {
    await replyEphemeral(interaction, t(guildId, 'config.managerOnly'));
    return true;
  }

  const mod = MODULES.find((m) => m.toggleId === customId);
  if (!mod) return false;

  const current = getGuildSetting(guildId, 'channels', mod.key, mod.default);
  setGuildSetting(guildId, 'channels', mod.key, !current);
  await logConfigChange(interaction.guild, interaction.user.id, `channels.${mod.key}`, current, !current);
  await refreshChannelsPanel(interaction.guild);
  await replyEphemeral(interaction, t(guildId, 'config.channels.toggled', { name: mod.label, state: !current ? 'ON' : 'OFF' }));
  return true;
}

module.exports = { seedChannelsPanel, handleChannelsInteraction, buildRows, buildPanelContent };
