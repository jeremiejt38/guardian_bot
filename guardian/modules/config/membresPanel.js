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
const { logConfigChange } = require('./configLogger');
const { seedJoinServerChannel } = require('../members/joinServerChannel');
const { isPremiumFeatureEnabled, buildPremiumLockButton } = require('../tier/premiumGateUI');
// @premium-start
const { getWelcomeMessage, setWelcomeMessage } = require('../members/welcomeMessage');
// @premium-end

const IDS = Object.freeze({
  editDelay: 'membres:delay:edit',
  delayModal: 'membres:delay:modal',
  toggleBio: 'membres:bio:toggle',
  toggleSponsor: 'membres:sponsor:toggle',
  editWelcome: 'membres:welcome:edit',
  welcomeModal: 'membres:welcome:modal',
  editJoinPresentation: 'membres:joinpresentation:edit',
  joinPresentationModal: 'membres:joinpresentation:modal',
  editExpulsion: 'membres:expulsion:edit',
  expulsionModal: 'membres:expulsion:modal',
  toggleExpulsion: 'membres:expulsion:toggle',
  editWelcomeDm: 'membres:welcomedm:edit',
  welcomeDmModal: 'membres:welcomedm:modal',
});

function hasManagerGrade(member, guildId) {
  const mappings = getGradeMappings(guildId);
  const managerRoleId = mappings[GRADE_NAMES.manager];
  const ownerRoleId = mappings[GRADE_NAMES.owner];
  return (managerRoleId && member.roles.cache.has(managerRoleId)) ||
         (ownerRoleId && member.roles.cache.has(ownerRoleId));
}

function buildPanelEmbed(guildId) {
  const delay = getGuildSetting(guildId, 'members', 'promotion_delay_hours', 48);
  const bio = getGuildSetting(guildId, 'members', 'bio_required', false);
  const sponsor = getGuildSetting(guildId, 'members', 'sponsorship_required', false);
  const expulsion = getGuildSetting(guildId, 'members', 'expulsion_enabled', true);
  const expulsionDays = getGuildSetting(guildId, 'members', 'expulsion_delay_days', 30);
  const joinPresentation = getGuildSetting(guildId, 'joinserver', 'presentation', null);
  const joinPreview = joinPresentation
    ? `"${String(joinPresentation).slice(0, 80)}${String(joinPresentation).length > 80 ? '…' : ''}"`
    : '*non défini*';
  const inviteMode = getGuildSetting(guildId, 'setup', 'invite_mode', 'classic');
  const inviteModeLabel = { classic: '👤 Classique', strict: '🔒 Strict', direct: '🚀 Membre direct' }[inviteMode] ?? 'Classique';

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(t(guildId, 'config.membres.title'))
    .addFields(
      { name: '⏱️ Délai de promotion', value: `${delay}h`, inline: true },
      { name: '📝 Bio obligatoire', value: bio ? '✅ Oui' : '❌ Non', inline: true },
      { name: '🤝 Parrainage', value: sponsor ? '✅ Oui' : '❌ Non', inline: true },
      { name: '🚨 Expulsion auto', value: expulsion ? `✅ ${expulsionDays}j` : '❌ Non', inline: true },
      { name: '� Mode invité', value: inviteModeLabel, inline: true },
      { name: '🌟 Présentation #rejoindre', value: joinPreview, inline: false }
    )
    .setTimestamp();
}

function buildRows(guildId) {
  const bio = getGuildSetting(guildId, 'members', 'bio_required', false);
  const sponsor = getGuildSetting(guildId, 'members', 'sponsorship_required', false);
  const expulsion = getGuildSetting(guildId, 'members', 'expulsion_enabled', true);
  const welcomeDmBtn = isPremiumFeatureEnabled(guildId)
    ? new ButtonBuilder().setCustomId(IDS.editWelcomeDm).setLabel('✉️ DM Bienvenue custom').setStyle(ButtonStyle.Primary)
    : buildPremiumLockButton('welcome_dm', 'DM Bienvenue custom');
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(IDS.editDelay).setLabel(t(guildId, 'config.membres.editDelay')).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(IDS.editWelcome).setLabel(t(guildId, 'config.membres.editWelcome')).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(IDS.editJoinPresentation).setLabel('🌟 Présentation #rejoindre').setStyle(ButtonStyle.Primary),
      welcomeDmBtn
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(IDS.toggleBio).setLabel(`Bio: ${bio ? 'ON' : 'OFF'}`).setStyle(bio ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(IDS.toggleSponsor).setLabel(`Parrainage: ${sponsor ? 'ON' : 'OFF'}`).setStyle(sponsor ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(IDS.toggleExpulsion).setLabel(`Expulsion auto: ${expulsion ? 'ON' : 'OFF'}`).setStyle(expulsion ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(IDS.editExpulsion).setLabel(t(guildId, 'config.membres.editExpulsion')).setStyle(ButtonStyle.Secondary)
    )
  ];
}

async function seedMembresPanel(guild) {
  const channel = findTextChannelByName(guild, CHANNELS.membres);
  if (!channel) return;
  const msgs = await channel.messages.fetch({ limit: 5 }).catch(() => null);
  const hasPanel = msgs?.some((m) => m.author.id === guild.client.user.id && m.components.length > 0);
  if (hasPanel) { await refreshMembresPanel(guild); return; }
  const guildId = guild.id;
  await channel.send({ content: '', embeds: [buildPanelEmbed(guildId)], components: buildRows(guildId) }).catch(() => undefined);
}

async function refreshMembresPanel(guild) {
  const channel = findTextChannelByName(guild, CHANNELS.membres);
  if (!channel) return;
  const msgs = await channel.messages.fetch({ limit: 5 }).catch(() => null);
  const panel = msgs?.find((m) => m.author.id === guild.client.user.id && m.components.length > 0);
  if (!panel) return;
  const guildId = guild.id;
  await panel.edit({ content: '', embeds: [buildPanelEmbed(guildId)], components: buildRows(guildId) }).catch(() => undefined);
}

async function handleMembresInteraction(interaction) {
  const { customId, guildId } = interaction;
  if (!customId?.startsWith('membres:')) return false;

  if (!hasManagerGrade(interaction.member, guildId)) {
    await replyEphemeral(interaction, t(guildId, 'config.managerOnly'));
    return true;
  }

  if (interaction.isButton() && customId === IDS.editDelay) {
    const modal = new ModalBuilder().setCustomId(IDS.delayModal).setTitle(t(guildId, 'config.membres.delayModalTitle'))
      .addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('hours').setLabel(t(guildId, 'config.membres.delayLabel'))
          .setStyle(TextInputStyle.Short).setPlaceholder('48').setRequired(true).setMaxLength(4)
      ));
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isModalSubmit() && customId === IDS.delayModal) {
    const raw = interaction.fields.getTextInputValue('hours').trim();
    const hours = Number.parseInt(raw, 10);
    if (!Number.isInteger(hours) || hours < 0) {
      await replyEphemeral(interaction, t(guildId, 'config.invalidNumber'));
      return true;
    }
    const old = getGuildSetting(guildId, 'members', 'promotion_delay_hours', 48);
    setGuildSetting(guildId, 'members', 'promotion_delay_hours', hours);
    await logConfigChange(interaction.guild, interaction.user.id, 'members.promotion_delay_hours', old, hours);
    await refreshMembresPanel(interaction.guild);
    await replyEphemeral(interaction, t(guildId, 'config.membres.delayUpdated', { hours: String(hours) }));
    return true;
  }

  if (interaction.isButton() && customId === IDS.toggleBio) {
    const current = getGuildSetting(guildId, 'members', 'bio_required', false);
    setGuildSetting(guildId, 'members', 'bio_required', !current);
    await logConfigChange(interaction.guild, interaction.user.id, 'members.bio_required', current, !current);
    await refreshMembresPanel(interaction.guild);
    await replyEphemeral(interaction, t(guildId, 'config.membres.bioToggled', { state: !current ? 'ON' : 'OFF' }));
    return true;
  }

  if (interaction.isButton() && customId === IDS.toggleSponsor) {
    const current = getGuildSetting(guildId, 'members', 'sponsorship_required', false);
    setGuildSetting(guildId, 'members', 'sponsorship_required', !current);
    await logConfigChange(interaction.guild, interaction.user.id, 'members.sponsorship_required', current, !current);
    await refreshMembresPanel(interaction.guild);
    await replyEphemeral(interaction, t(guildId, 'config.membres.sponsorToggled', { state: !current ? 'ON' : 'OFF' }));
    return true;
  }

  if (interaction.isButton() && customId === IDS.toggleExpulsion) {
    const current = getGuildSetting(guildId, 'members', 'expulsion_enabled', true);
    setGuildSetting(guildId, 'members', 'expulsion_enabled', !current);
    await logConfigChange(interaction.guild, interaction.user.id, 'members.expulsion_enabled', current, !current);
    await refreshMembresPanel(interaction.guild);
    await replyEphemeral(interaction, t(guildId, 'config.membres.expulsionToggled', { state: !current ? 'ON' : 'OFF' }));
    return true;
  }

  if (interaction.isButton() && customId === IDS.editExpulsion) {
    const modal = new ModalBuilder().setCustomId(IDS.expulsionModal).setTitle(t(guildId, 'config.membres.expulsionModalTitle'))
      .addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('days').setLabel(t(guildId, 'config.membres.expulsionLabel'))
          .setStyle(TextInputStyle.Short).setPlaceholder('30').setRequired(true).setMaxLength(4)
      ));
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isModalSubmit() && customId === IDS.expulsionModal) {
    const raw = interaction.fields.getTextInputValue('days').trim();
    const days = Number.parseInt(raw, 10);
    if (!Number.isInteger(days) || days < 1) {
      await replyEphemeral(interaction, t(guildId, 'config.invalidNumber'));
      return true;
    }
    const old = getGuildSetting(guildId, 'members', 'expulsion_delay_days', 30);
    setGuildSetting(guildId, 'members', 'expulsion_delay_days', days);
    await logConfigChange(interaction.guild, interaction.user.id, 'members.expulsion_delay_days', old, days);
    await refreshMembresPanel(interaction.guild);
    await replyEphemeral(interaction, t(guildId, 'config.membres.expulsionUpdated', { days: String(days) }));
    return true;
  }

  if (interaction.isButton() && customId === IDS.editWelcome) {
    const current = getGuildSetting(guildId, 'members', 'welcome_text', '');
    const modal = new ModalBuilder().setCustomId(IDS.welcomeModal).setTitle(t(guildId, 'config.membres.welcomeModalTitle'))
      .addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('text').setLabel(t(guildId, 'config.membres.welcomeLabel'))
          .setStyle(TextInputStyle.Paragraph).setValue(String(current)).setRequired(false).setMaxLength(500)
      ));
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isModalSubmit() && customId === IDS.welcomeModal) {
    const text = interaction.fields.getTextInputValue('text').trim();
    const old = getGuildSetting(guildId, 'members', 'welcome_text', '');
    setGuildSetting(guildId, 'members', 'welcome_text', text);
    await logConfigChange(interaction.guild, interaction.user.id, 'members.welcome_text', old, text);
    await replyEphemeral(interaction, t(guildId, 'config.membres.welcomeUpdated'));
    return true;
  }

  // @premium-start
  if (interaction.isButton() && customId === IDS.editWelcomeDm) {
    if (!isPremium(guildId)) {
      await replyEphemeral(interaction, '🔒 Cette feature est disponible en **Guardian Premium** uniquement.');
      return true;
    }
    const current = getWelcomeMessage(guildId) ?? '';
    const modal = new ModalBuilder().setCustomId(IDS.welcomeDmModal).setTitle('DM de bienvenue personnalisé')
      .addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('template')
          .setLabel('Template (variables : {name}, {server}, {delay}, {grade})')
          .setStyle(TextInputStyle.Paragraph)
          .setValue(current)
          .setRequired(false)
          .setMaxLength(1000)
          .setPlaceholder('Bienvenue {name} sur {server} ! Tu peux faire ta demande après {delay}h.')
      ));
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isModalSubmit() && customId === IDS.welcomeDmModal) {
    if (!isPremium(guildId)) {
      await replyEphemeral(interaction, '🔒 Cette feature est disponible en **Guardian Premium** uniquement.');
      return true;
    }
    const template = interaction.fields.getTextInputValue('template').trim();
    const old = getWelcomeMessage(guildId);
    setWelcomeMessage(guildId, template || null);
    await logConfigChange(interaction.guild, interaction.user.id, 'members.welcome_message', old, template || null);
    await replyEphemeral(interaction, template
      ? `✅ DM de bienvenue personnalisé mis à jour.\n> Variables disponibles : \`{name}\`, \`{server}\`, \`{delay}\`, \`{grade}\``
      : '✅ DM de bienvenue personnalisé supprimé (retour au DM par défaut).'
    );
    return true;
  }
  // @premium-end

  if (interaction.isButton() && customId === IDS.editJoinPresentation) {
    const current = String(getGuildSetting(guildId, 'joinserver', 'presentation', '') || '');
    const modal = new ModalBuilder().setCustomId(IDS.joinPresentationModal).setTitle('Présentation #rejoindre-notre-serveur')
      .addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('text')
          .setLabel('Pourquoi rejoindre votre serveur ?')
          .setStyle(TextInputStyle.Paragraph).setValue(current).setRequired(false).setMaxLength(1000)
          .setPlaceholder('Décrivez votre communauté, ses valeurs, ce que les membres y trouvent…')
      ));
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isModalSubmit() && customId === IDS.joinPresentationModal) {
    const text = interaction.fields.getTextInputValue('text').trim();
    const old = getGuildSetting(guildId, 'joinserver', 'presentation', null);
    setGuildSetting(guildId, 'joinserver', 'presentation', text || null);
    await logConfigChange(interaction.guild, interaction.user.id, 'joinserver.presentation', old, text || null);
    const ch = findTextChannelByName(interaction.guild, CHANNELS.joinServer);
    if (ch) await seedJoinServerChannel(ch, interaction.guild).catch(() => {});
    await refreshMembresPanel(interaction.guild);
    await replyEphemeral(interaction, '✅ Présentation mise à jour et channel **#rejoindre-notre-serveur** rafraîchi.');
    return true;
  }

  return false;
}

module.exports = { seedMembresPanel, handleMembresInteraction, buildRows };
