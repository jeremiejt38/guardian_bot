const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { CHANNELS, GRADE_NAMES } = require('../../config');
const { t } = require('../i18n');
const { replyEphemeral } = require('../utils/interactions');
const { findTextChannelByName } = require('../utils/channels');
const { getGuildSetting, setGuildSetting } = require('./settings');
const { getGradeMappings } = require('../initialisation/gradeMapping');
const { isGuildInstalled } = require('../initialisation/checkInstall');
const { getCurrentStep } = require('../initialisation/setupGrades');
const { getAvailableLanguages, getGuildLanguage, setGuildLanguage } = require('../i18n');
const { logConfigChange } = require('./configLogger');
const { getDb } = require('../../database/db');
const { version } = require('../../package.json');

const botStartTime = Date.now();

function formatUptime() {
  const ms = Date.now() - botStartTime;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (d > 0) parts.push(`${d}j`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}min`);
  return parts.join(' ');
}

const ACTIVE_MODULES = [
  'Initialisation', 'Nouveaux Membres', 'Gamelist & Opt-in',
  'Vocaux Temporaires', 'Changelogs Steam', 'Modération',
  'AutoMod', 'Signalements', 'Score Comportemental',
  'Surveillance Serveurs', 'Slow Mode', 'Behavior Panel'
];

function buildStatusEmbed(guild) {
  const guildId = guild.id;

  let dbOk = true;
  let memberCount = 0;
  let gameCount = 0;
  try {
    const db = getDb();
    memberCount = db.prepare('SELECT COUNT(*) as c FROM members WHERE guild_id = ?').get(guildId)?.c ?? 0;
    gameCount = db.prepare('SELECT COUNT(*) as c FROM games WHERE guild_id = ?').get(guildId)?.c ?? 0;
  } catch { dbOk = false; }

  const lastBackupTs = getGuildSetting(guildId, 'bot', 'last_backup_ts', null);
  const lastBackup = lastBackupTs
    ? `<t:${Math.floor(new Date(lastBackupTs).getTime() / 1000)}:R>`
    : '❌ Aucune';

  const steamKey = getGuildSetting(guildId, 'bot', 'steam_api_key', null);
  const rawgKey = getGuildSetting(guildId, 'bot', 'rawg_api_key', null) ?? process.env.RAWG_API_KEY ?? null;
  const lang = getGuildLanguage(guildId) || 'fr';

  const nowSec = Math.floor(Date.now() / 1000);

  return new EmbedBuilder()
    .setTitle('🤖 Guardian — Diagnostic')
    .setColor(dbOk ? 0x2ecc71 : 0xe74c3c)
    .addFields(
      { name: '📦 Version', value: `v${version}`, inline: true },
      { name: '⏱️ Uptime', value: formatUptime(), inline: true },
      { name: '🌐 Langue', value: `\`${lang}\``, inline: true },
      { name: '🗄️ Base de données', value: dbOk ? '✅ Opérationnelle' : '❌ Erreur', inline: true },
      { name: '👥 Membres enregistrés', value: String(memberCount), inline: true },
      { name: '🎮 Jeux configurés', value: String(gameCount), inline: true },
      { name: '💾 Dernier backup', value: lastBackup, inline: true },
      { name: '🔑 Clé Steam', value: steamKey ? '✅ Configurée' : '❌ Non configurée', inline: true },
      { name: '🎮 Clé RAWG', value: rawgKey ? '✅ Configurée' : '⚠️ Non configurée (fonctionnel sans)', inline: true },
      { name: '🔄 Actualisé', value: `<t:${nowSec}:R>`, inline: true },
      { name: '✅ Modules actifs', value: ACTIVE_MODULES.map((m) => `✅ ${m}`).join('\n') }
    )
    .setFooter({ text: 'Actualisé toutes les 5 minutes — si ce message n\'est plus à jour, le bot est hors ligne.' })
    .setTimestamp();
}

const IDS = Object.freeze({
  editSteamKey: 'bot:edit:steamkey',
  steamKeyModal: 'bot:modal:steamkey',
  editRawgKey: 'bot:edit:rawgkey',
  rawgKeyModal: 'bot:modal:rawgkey',
  editLanguage: 'bot:edit:language',
  languageModal: 'bot:modal:language',
  resumeSetup: 'bot:setup:resume'
});

function hasOwnerGrade(member, guildId) {
  const mappings = getGradeMappings(guildId);
  const ownerRoleId = mappings[GRADE_NAMES.owner];
  return ownerRoleId && member.roles.cache.has(ownerRoleId);
}

function hasManagerGrade(member, guildId) {
  const mappings = getGradeMappings(guildId);
  return [GRADE_NAMES.manager, GRADE_NAMES.owner].some(
    (g) => mappings[g] && member.roles.cache.has(mappings[g])
  );
}

function buildPanelContent(guildId) {
  const lang = getGuildLanguage(guildId) || 'fr';
  const steamKey = getGuildSetting(guildId, 'bot', 'steam_api_key', null);
  const rawgKey = getGuildSetting(guildId, 'bot', 'rawg_api_key', null) ?? process.env.RAWG_API_KEY ?? null;
  const steamStatus = steamKey ? '✅ Configurée' : '❌ Non configurée';
  const rawgStatus = rawgKey ? '✅ Configurée' : '⚠️ Non configurée (fonctionnel sans)';
  return [
    `**${t(guildId, 'config.bot.title')}**\n`,
    `• **${t(guildId, 'config.bot.language')}** : \`${lang}\``,
    `• **${t(guildId, 'config.bot.steamKey')}** : ${steamStatus}`,
    `• **Clé RAWG** : ${rawgStatus}`
  ].join('\n');
}

async function upsertStatusEmbed(guild) {
  const channel = findTextChannelByName(guild, CHANNELS.guardianConfig);
  if (!channel) return;
  const msgs = await channel.messages.fetch({ limit: 10 }).catch(() => null);
  const existing = msgs?.find((m) => m.author.id === guild.client.user.id && m.embeds.length > 0);
  const embed = buildStatusEmbed(guild);
  if (existing) {
    await existing.edit({ embeds: [embed] }).catch(() => undefined);
  } else {
    await channel.send({ embeds: [embed] }).catch(() => undefined);
  }
}

function buildRows(guildId) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(IDS.editLanguage)
      .setLabel(t(guildId, 'config.bot.editLanguage'))
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(IDS.editSteamKey)
      .setLabel(t(guildId, 'config.bot.editSteamKey'))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(IDS.editRawgKey)
      .setLabel('🎮 Clé RAWG.io')
      .setStyle(ButtonStyle.Secondary)
  );
  const rows = [row1];
  if (!isGuildInstalled(guildId) || getCurrentStep(guildId) < 9) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(IDS.resumeSetup)
          .setLabel('🔧 Reprendre l\'installation')
          .setStyle(ButtonStyle.Danger)
      )
    );
  }
  return rows;
}

async function seedBotPanel(guild) {
  const channel = findTextChannelByName(guild, CHANNELS.guardianConfig);
  if (!channel) return;
  const msgs = await channel.messages.fetch({ limit: 10 }).catch(() => null);
  const hasPanel = msgs?.some((m) => m.author.id === guild.client.user.id && m.components.length > 0);
  if (!hasPanel) {
    const guildId = guild.id;
    await channel.send({ content: buildPanelContent(guildId), components: buildRows(guildId) }).catch(() => undefined);
  }
  await upsertStatusEmbed(guild);
}

async function refreshBotPanel(guild) {
  const channel = findTextChannelByName(guild, CHANNELS.guardianConfig);
  if (!channel) return;
  const msgs = await channel.messages.fetch({ limit: 10 }).catch(() => null);
  const panel = msgs?.find((m) => m.author.id === guild.client.user.id && m.components.length > 0);
  if (panel) {
    const guildId = guild.id;
    await panel.edit({ content: buildPanelContent(guildId), components: buildRows(guildId) }).catch(() => undefined);
  }
  await upsertStatusEmbed(guild);
}

async function refreshStatusBotPanel(guild) {
  await upsertStatusEmbed(guild);
}

async function handleBotInteraction(interaction) {
  const { customId, guildId } = interaction;
  if (!customId?.startsWith('bot:')) return false;

  if (!hasManagerGrade(interaction.member, guildId)) {
    await replyEphemeral(interaction, t(guildId, 'config.managerOnly'));
    return true;
  }

  if (interaction.isButton() && customId === IDS.editLanguage) {
    const langs = getAvailableLanguages();
    const modal = new ModalBuilder()
      .setCustomId(IDS.languageModal)
      .setTitle(t(guildId, 'config.bot.languageModalTitle'))
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('lang')
            .setLabel(t(guildId, 'config.bot.languageLabel', { available: langs.join(', ') }))
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('fr')
            .setValue(getGuildLanguage(guildId) || 'fr')
            .setRequired(true)
            .setMaxLength(5)
        )
      );
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isModalSubmit() && customId === IDS.languageModal) {
    const lang = interaction.fields.getTextInputValue('lang').trim().toLowerCase();
    const langs = getAvailableLanguages();
    if (!langs.includes(lang)) {
      await replyEphemeral(interaction, t(guildId, 'config.bot.invalidLanguage', { available: langs.join(', ') }));
      return true;
    }
    const old = getGuildLanguage(guildId);
    setGuildLanguage(guildId, lang);
    await logConfigChange(interaction.guild, interaction.user.id, 'bot.language', old, lang);
    await refreshBotPanel(interaction.guild);
    await replyEphemeral(interaction, t(guildId, 'config.bot.languageUpdated', { lang }));
    return true;
  }

  if (!hasOwnerGrade(interaction.member, guildId)) {
    await replyEphemeral(interaction, t(guildId, 'config.ownerOnly'));
    return true;
  }

  if (interaction.isButton() && customId === IDS.editSteamKey) {
    const modal = new ModalBuilder()
      .setCustomId(IDS.steamKeyModal)
      .setTitle(t(guildId, 'config.bot.steamKeyModalTitle'))
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('key')
            .setLabel((t(guildId, 'config.bot.steamKeyLabel') || 'Steam API Key').slice(0, 45))
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(40)
        )
      );
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isModalSubmit() && customId === IDS.steamKeyModal) {
    const key = interaction.fields.getTextInputValue('key').trim();
    const old = getGuildSetting(guildId, 'bot', 'steam_api_key', null);
    setGuildSetting(guildId, 'bot', 'steam_api_key', key || null);
    await logConfigChange(interaction.guild, interaction.user.id, 'bot.steam_api_key', old ? '***' : null, key ? '***' : null);
    await refreshBotPanel(interaction.guild);
    await replyEphemeral(interaction, t(guildId, key ? 'config.bot.steamKeySet' : 'config.bot.steamKeyCleared'));
    return true;
  }

  if (interaction.isButton() && customId === IDS.editRawgKey) {
    const modal = new ModalBuilder()
      .setCustomId(IDS.rawgKeyModal)
      .setTitle('Clé API RAWG.io')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('key')
            .setLabel('Clé RAWG (rawg.io/apidocs — gratuite)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(50)
            .setPlaceholder('Laisser vide pour supprimer')
        )
      );
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isModalSubmit() && customId === IDS.rawgKeyModal) {
    const key = interaction.fields.getTextInputValue('key').trim();
    const old = getGuildSetting(guildId, 'bot', 'rawg_api_key', null);
    setGuildSetting(guildId, 'bot', 'rawg_api_key', key || null);
    await logConfigChange(interaction.guild, interaction.user.id, 'bot.rawg_api_key', old ? '***' : null, key ? '***' : null);
    await refreshBotPanel(interaction.guild);
    await replyEphemeral(interaction, key ? '✅ Clé RAWG enregistrée.' : '🗑️ Clé RAWG supprimée.');
    return true;
  }

  if (interaction.isButton() && customId === IDS.resumeSetup) {
    const { getCurrentStep } = require('../initialisation/setupGrades');
    const { buildStepPayload } = require('../initialisation/setupFlow');
    const step = getCurrentStep(guildId);
    if (step >= 9) {
      await replyEphemeral(interaction, '✅ La configuration est déjà terminée. Utilise `/status` pour voir l\'état.');
      return true;
    }
    const payload = await buildStepPayload(guildId, interaction.guild, step);
    await interaction.reply({ embeds: payload.embeds, components: payload.components, ephemeral: true }).catch(() => {});
    return true;
  }

  return false;
}

module.exports = { seedBotPanel, refreshBotPanel, upsertStatusEmbed, handleBotInteraction };
