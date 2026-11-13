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
const { getGuildSetting, setGuildSetting } = require('./settings');
const { getGradeMappings } = require('../initialisation/gradeMapping');
const { logConfigChange } = require('./configLogger');

const IDS = Object.freeze({
  editPrefix: 'vocaux:edit:prefix',
  editSuffix: 'vocaux:edit:suffix',
  editLimit: 'vocaux:edit:limit',
  editDelay: 'vocaux:edit:delay',
  prefixModal: 'vocaux:modal:prefix',
  suffixModal: 'vocaux:modal:suffix',
  limitModal: 'vocaux:modal:limit',
  delayModal: 'vocaux:modal:delay'
});

function hasManagerGrade(member, guildId) {
  const mappings = getGradeMappings(guildId);
  return [GRADE_NAMES.manager, GRADE_NAMES.owner].some(
    (g) => mappings[g] && member.roles.cache.has(mappings[g])
  );
}

function buildPanelContent(guildId) {
  const prefix = getGuildSetting(guildId, 'vocal', 'prefix', '🎮');
  const suffix = getGuildSetting(guildId, 'vocal', 'suffix', '— Partie');
  const limit = getGuildSetting(guildId, 'vocal', 'member_limit', 0);
  const delay = getGuildSetting(guildId, 'vocal', 'delete_delay_minutes', 5);
  return [
    `**${t(guildId, 'config.vocaux.title')}**\n`,
    `• **${t(guildId, 'config.vocaux.prefix')}** : \`${prefix}\``,
    `• **${t(guildId, 'config.vocaux.suffix')}** : \`${suffix}\``,
    `• **${t(guildId, 'config.vocaux.limit')}** : ${limit === 0 ? 'illimité' : limit}`,
    `• **${t(guildId, 'config.vocaux.delay')}** : ${delay} min`
  ].join('\n');
}

function buildRows(guildId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(IDS.editPrefix).setLabel(t(guildId, 'config.vocaux.editPrefix')).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(IDS.editSuffix).setLabel(t(guildId, 'config.vocaux.editSuffix')).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(IDS.editLimit).setLabel(t(guildId, 'config.vocaux.editLimit')).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(IDS.editDelay).setLabel(t(guildId, 'config.vocaux.editDelay')).setStyle(ButtonStyle.Secondary)
    )
  ];
}

async function seedVocauxPanel(guild) {
  const channel = findTextChannelByName(guild, CHANNELS.vocauxConfig);
  if (!channel) return;
  const msgs = await channel.messages.fetch({ limit: 5 }).catch(() => null);
  const hasPanel = msgs?.some((m) => m.author.id === guild.client.user.id && m.components.length > 0);
  if (hasPanel) { await refreshVocauxPanel(guild); return; }
  const guildId = guild.id;
  await channel.send({ content: buildPanelContent(guildId), components: buildRows(guildId) }).catch(() => undefined);
}

async function refreshVocauxPanel(guild) {
  const channel = findTextChannelByName(guild, CHANNELS.vocauxConfig);
  if (!channel) return;
  const msgs = await channel.messages.fetch({ limit: 5 }).catch(() => null);
  const panel = msgs?.find((m) => m.author.id === guild.client.user.id && m.components.length > 0);
  if (!panel) return;
  const guildId = guild.id;
  await panel.edit({ content: buildPanelContent(guildId), components: buildRows(guildId) }).catch(() => undefined);
}

async function handleVocauxInteraction(interaction) {
  const { customId, guildId } = interaction;
  if (!customId?.startsWith('vocaux:')) return false;

  if (!hasManagerGrade(interaction.member, guildId)) {
    await replyEphemeral(interaction, t(guildId, 'config.managerOnly'));
    return true;
  }

  const modals = {
    [IDS.editPrefix]: { modalId: IDS.prefixModal, field: 'value', label: t(guildId, 'config.vocaux.editPrefix'), setting: 'prefix', max: 10 },
    [IDS.editSuffix]: { modalId: IDS.suffixModal, field: 'value', label: t(guildId, 'config.vocaux.editSuffix'), setting: 'suffix', max: 20 },
    [IDS.editLimit]: { modalId: IDS.limitModal, field: 'value', label: t(guildId, 'config.vocaux.editLimit'), setting: 'member_limit', max: 4 },
    [IDS.editDelay]: { modalId: IDS.delayModal, field: 'value', label: t(guildId, 'config.vocaux.editDelay'), setting: 'delete_delay_minutes', max: 4 }
  };

  if (interaction.isButton() && modals[customId]) {
    const cfg = modals[customId];
    const modal = new ModalBuilder().setCustomId(cfg.modalId).setTitle(cfg.label)
      .addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId(cfg.field).setLabel(cfg.label)
          .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(cfg.max)
      ));
    await interaction.showModal(modal);
    return true;
  }

  const submitMap = {
    [IDS.prefixModal]: { setting: 'prefix', isNumber: false },
    [IDS.suffixModal]: { setting: 'suffix', isNumber: false },
    [IDS.limitModal]: { setting: 'member_limit', isNumber: true, min: 0, max: 99 },
    [IDS.delayModal]: { setting: 'delete_delay_minutes', isNumber: true, min: 1, max: 60 }
  };

  if (interaction.isModalSubmit() && submitMap[customId]) {
    const cfg = submitMap[customId];
    const raw = interaction.fields.getTextInputValue('value').trim();
    let value = cfg.isNumber ? Number.parseInt(raw, 10) : raw;

    if (cfg.isNumber) {
      if (!Number.isInteger(value) || value < cfg.min || value > cfg.max) {
        await replyEphemeral(interaction, t(guildId, 'config.invalidNumber'));
        return true;
      }
    }

    const old = getGuildSetting(guildId, 'vocal', cfg.setting, null);
    setGuildSetting(guildId, 'vocal', cfg.setting, value);
    await logConfigChange(interaction.guild, interaction.user.id, `vocal.${cfg.setting}`, old, value);
    await refreshVocauxPanel(interaction.guild);
    await replyEphemeral(interaction, t(guildId, 'config.vocaux.updated', { setting: cfg.setting, value: String(value) }));
    return true;
  }

  return false;
}

module.exports = { seedVocauxPanel, handleVocauxInteraction };
