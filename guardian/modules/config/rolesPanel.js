const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require('discord.js');
const { CHANNELS, GRADE_NAMES } = require('../../config');
const { t } = require('../i18n');
const { replyEphemeral } = require('../utils/interactions');
const { findTextChannelByName } = require('../utils/channels');
const { getGradeMappings } = require('../initialisation/gradeMapping');
const { logConfigChange } = require('./configLogger');

const GRADES_LIST = [
  GRADE_NAMES.invite,
  GRADE_NAMES.membre,
  GRADE_NAMES.moderateur,
  GRADE_NAMES.manager,
  GRADE_NAMES.owner
];

const GRADE_DESCRIPTIONS = Object.freeze({
  [GRADE_NAMES.invite]:     'Nouveau membre en attente de validation',
  [GRADE_NAMES.membre]:     'Membre validé de la communauté',
  [GRADE_NAMES.moderateur]: 'Modère les échanges et gère les conflits',
  [GRADE_NAMES.manager]:    'Administre le serveur et les membres',
  [GRADE_NAMES.owner]:      'Propriétaire du serveur',
});

const COLORS = [
  { name: 'Rouge',  value: '#E74C3C' },
  { name: 'Orange', value: '#E67E22' },
  { name: 'Jaune',  value: '#F1C40F' },
  { name: 'Vert',   value: '#2ECC71' },
  { name: 'Bleu',   value: '#3498DB' },
  { name: 'Violet', value: '#9B59B6' },
  { name: 'Rose',   value: '#E91E63' },
  { name: 'Blanc',  value: '#FFFFFF' },
  { name: 'Gris',   value: '#95A5A6' },
  { name: 'Noir',   value: '#000001' },
];

const IDS = Object.freeze({
  selectPrefix:      'roles:select:',
  editNamePrefix:    'roles:edit:name:',
  editColorPrefix:   'roles:edit:color:',
  colorSelectPrefix: 'roles:color:select:',
  modalNamePrefix:   'roles:modal:name:',
});

function hasOwnerGrade(member, guildId) {
  const mappings = getGradeMappings(guildId);
  const ownerRoleId = mappings[GRADE_NAMES.owner];
  return ownerRoleId && member.roles.cache.has(ownerRoleId);
}

function buildPanelContent(guild, guildId) {
  const mappings = getGradeMappings(guildId);
  const lines = [`**${t(guildId, 'config.roles.title')}**\n`];
  for (const grade of GRADES_LIST) {
    const roleId = mappings[grade];
    const role = roleId ? guild.roles.cache.get(roleId) : null;
    const roleInfo = role
      ? `<@&${role.id}> \`${role.name}\` — couleur \`${role.hexColor}\` — ${role.members.size} membre(s)`
      : '❌ non configuré';
    lines.push(`• **${grade}** : ${roleInfo}`);
    lines.push(`  -# *${GRADE_DESCRIPTIONS[grade]}*`);
  }
  lines.push(`\n${t(guildId, 'config.roles.hint')}`);
  return lines.join('\n');
}

function buildRows(guildId) {
  const buttons = GRADES_LIST.map((grade) =>
    new ButtonBuilder()
      .setCustomId(`${IDS.selectPrefix}${grade}`)
      .setLabel(t(guildId, 'config.roles.editButton', { grade }))
      .setStyle(ButtonStyle.Primary)
  );
  const rows = [];
  for (let i = 0; i < buttons.length; i += 4) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 4)));
  }
  return rows;
}

async function seedRolesPanel(guild) {
  const channel = findTextChannelByName(guild, CHANNELS.roles);
  if (!channel) return;
  const msgs = await channel.messages.fetch({ limit: 5 }).catch(() => null);
  const hasPanel = msgs?.some((m) => m.author.id === guild.client.user.id && m.components.length > 0);
  if (hasPanel) { await refreshRolesPanel(guild); return; }
  const guildId = guild.id;
  await channel.send({ content: buildPanelContent(guild, guildId), components: buildRows(guildId) }).catch(() => undefined);
}

async function refreshRolesPanel(guild) {
  const channel = findTextChannelByName(guild, CHANNELS.roles);
  if (!channel) return;
  const msgs = await channel.messages.fetch({ limit: 5 }).catch(() => null);
  const panel = msgs?.find((m) => m.author.id === guild.client.user.id && m.components.length > 0);
  if (!panel) return;
  const guildId = guild.id;
  await panel.edit({ content: buildPanelContent(guild, guildId), components: buildRows(guildId) }).catch(() => undefined);
}

async function handleRolesInteraction(interaction) {
  const { customId, guildId } = interaction;
  if (!customId?.startsWith('roles:')) return false;

  if (!hasOwnerGrade(interaction.member, guildId)) {
    await replyEphemeral(interaction, t(guildId, 'config.ownerOnly'));
    return true;
  }

  // Étape 1 — bouton principal → sous-menu éphémère
  if (interaction.isButton() && customId.startsWith(IDS.selectPrefix)) {
    const grade = customId.slice(IDS.selectPrefix.length);
    const mappings = getGradeMappings(guildId);
    if (!mappings[grade]) {
      await replyEphemeral(interaction, t(guildId, 'config.roles.notMapped', { grade }));
      return true;
    }
    await replyEphemeral(interaction, {
      content: `Que souhaitez-vous modifier pour le rôle **${grade}** ?`,
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`${IDS.editNamePrefix}${grade}`)
            .setLabel('✏️ Modifier le nom')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`${IDS.editColorPrefix}${grade}`)
            .setLabel('🎨 Modifier la couleur')
            .setStyle(ButtonStyle.Secondary)
        )
      ]
    });
    return true;
  }

  // Étape 2a — bouton "Modifier le nom" → modal
  if (interaction.isButton() && customId.startsWith(IDS.editNamePrefix)) {
    const grade = customId.slice(IDS.editNamePrefix.length);
    const modal = new ModalBuilder()
      .setCustomId(`${IDS.modalNamePrefix}${grade}`)
      .setTitle(t(guildId, 'config.roles.modalTitle', { grade }))
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('name')
            .setLabel(t(guildId, 'config.roles.nameLabel'))
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(32)
        )
      );
    await interaction.showModal(modal);
    return true;
  }

  // Étape 2b — bouton "Modifier la couleur" → select menu
  if (interaction.isButton() && customId.startsWith(IDS.editColorPrefix)) {
    const grade = customId.slice(IDS.editColorPrefix.length);
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`${IDS.colorSelectPrefix}${grade}`)
      .setPlaceholder('Choisir une couleur...')
      .addOptions(
        COLORS.map((c) => new StringSelectMenuOptionBuilder().setLabel(c.name).setValue(c.value))
      );
    await replyEphemeral(interaction, {
      content: `Choisissez une couleur pour le rôle **${grade}** :`,
      components: [new ActionRowBuilder().addComponents(selectMenu)]
    });
    return true;
  }

  // Étape 3a — soumission modal nom
  if (interaction.isModalSubmit() && customId.startsWith(IDS.modalNamePrefix)) {
    const grade = customId.slice(IDS.modalNamePrefix.length);
    const name = interaction.fields.getTextInputValue('name').trim();
    if (!name) {
      await replyEphemeral(interaction, t(guildId, 'config.roles.nothingChanged'));
      return true;
    }
    const mappings = getGradeMappings(guildId);
    const role = interaction.guild.roles.cache.get(mappings[grade]);
    if (!role) {
      await replyEphemeral(interaction, t(guildId, 'config.roles.roleNotFound'));
      return true;
    }
    await role.edit({ name }).catch(() => undefined);
    await logConfigChange(interaction.guild, interaction.user.id, `role.${grade}`, {}, { name });
    await refreshRolesPanel(interaction.guild);
    await replyEphemeral(interaction, t(guildId, 'config.roles.updated', { grade }));
    return true;
  }

  // Étape 3b — sélection couleur
  if (interaction.isStringSelectMenu() && customId.startsWith(IDS.colorSelectPrefix)) {
    const grade = customId.slice(IDS.colorSelectPrefix.length);
    const color = interaction.values[0];
    const mappings = getGradeMappings(guildId);
    const role = interaction.guild.roles.cache.get(mappings[grade]);
    if (!role) {
      await replyEphemeral(interaction, t(guildId, 'config.roles.roleNotFound'));
      return true;
    }
    await role.edit({ color }).catch(() => undefined);
    await logConfigChange(interaction.guild, interaction.user.id, `role.${grade}`, {}, { color });
    await refreshRolesPanel(interaction.guild);
    await replyEphemeral(interaction, t(guildId, 'config.roles.updated', { grade }));
    return true;
  }

  return false;
}

module.exports = { seedRolesPanel, handleRolesInteraction };
