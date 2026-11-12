const { MessageFlags } = require('discord.js');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } = require("discord.js");
const { CHANNELS, GRADE_NAMES } = require("../../config");
const { getGradeMappings } = require("../initialisation/gradeMapping");
const logger = require("../logs/logger");

async function ensureRequestsPanel(guild) {
  const channel = guild.channels.cache.find(c => c.name === CHANNELS.requests);
  if (!channel) {
    logger.warn(`Channel ${CHANNELS.requests} not found in guild ${guild.id}`);
    return;
  }

  // Vérifier si un message avec le bouton existe déjà
  const messages = await channel.messages.fetch({ limit: 10 });
  const existingMessage = messages.find(msg => 
    msg.author.bot && 
    msg.components.length > 0 && 
    msg.components[0].components.some(btn => btn.customId === 'req:game')
  );

  if (existingMessage) {
    return;
  }

  // Créer le message avec les boutons
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('req:game')
        .setLabel('🎮 Demander un jeu')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('req:server')
        .setLabel('🖥️ Proposer un serveur')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('req:report')
        .setLabel('🚨 Signaler un joueur')
        .setStyle(ButtonStyle.Danger)
    );

  await channel.send({
    content: 'Souhaitez-vous demander un jeu, proposer un serveur ou signaler un joueur ?',
    components: [row]
  });
}

async function handleMemberRequestInteraction(interaction) {
  const customId = interaction.customId;
  if (!customId?.startsWith('req:')) return false;

  if (interaction.isModalSubmit() && customId?.startsWith('req:modal:')) {
    return handleMemberRequestModal(interaction).then(() => true).catch(() => false);
  }

  if (interaction.isButton() && (customId?.startsWith('req:approve:') || customId?.startsWith('req:reject:'))) {
    return handleApproveReject(interaction).then(() => true).catch(() => false);
  }

  if (!interaction.isButton()) return false;

  if (customId === 'req:game') {
    const modal = new ModalBuilder()
      .setCustomId('req:modal:game')
      .setTitle('Demande de jeu');

    const nameInput = new TextInputBuilder()
      .setCustomId('name')
      .setLabel('Nom du jeu')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const steamInput = new TextInputBuilder()
      .setCustomId('steam')
      .setLabel('Steam App ID (optionnel)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    const row1 = new ActionRowBuilder().addComponents(nameInput);
    const row2 = new ActionRowBuilder().addComponents(steamInput);

    modal.addComponents(row1, row2);
    await interaction.showModal(modal);
    return true;
  } else if (customId === 'req:server') {
    const modal = new ModalBuilder()
      .setCustomId('req:modal:server')
      .setTitle('Proposer un serveur');

    const nameInput = new TextInputBuilder()
      .setCustomId('name')
      .setLabel('Nom du serveur')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const ipInput = new TextInputBuilder()
      .setCustomId('ip')
      .setLabel('IP:Port')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const gameInput = new TextInputBuilder()
      .setCustomId('game')
      .setLabel('Jeu associé')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const row1 = new ActionRowBuilder().addComponents(nameInput);
    const row2 = new ActionRowBuilder().addComponents(ipInput);
    const row3 = new ActionRowBuilder().addComponents(gameInput);

    modal.addComponents(row1, row2, row3);
    await interaction.showModal(modal);
    return true;
  } else if (customId === 'req:report') {
    const modal = new ModalBuilder()
      .setCustomId('req:modal:report')
      .setTitle('Signalement');

    const playerInput = new TextInputBuilder()
      .setCustomId('player')
      .setLabel('Pseudo du joueur')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const reasonInput = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('Raison')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const row1 = new ActionRowBuilder().addComponents(playerInput);
    const row2 = new ActionRowBuilder().addComponents(reasonInput);

    modal.addComponents(row1, row2);
    await interaction.showModal(modal);
    return true;
  }
  return false;
}

async function handleMemberRequestModal(interaction) {
  if (!interaction.isModalSubmit()) return;

  const customId = interaction.customId;
  const channel = interaction.guild.channels.cache.find(c => c.name === CHANNELS.reports);
  if (!channel) {
    await interaction.reply({ content: 'Erreur : Channel de signalement non trouvé.', flags: MessageFlags.Ephemeral });
    return;
  }

  let embedData = {};
  let type = '';

  if (customId === 'req:modal:game') {
    const name = interaction.fields.getTextInputValue('name');
    const steam = interaction.fields.getTextInputValue('steam');

    embedData = {
      title: 'Nouvelle demande de jeu',
      fields: [
        { name: 'Nom du jeu', value: name, inline: true },
        { name: 'Steam App ID', value: steam || 'Non fourni', inline: true }
      ]
    };
    type = 'game';
  } 
  else if (customId === 'req:modal:server') {
    const name = interaction.fields.getTextInputValue('name');
    const ip = interaction.fields.getTextInputValue('ip');
    const game = interaction.fields.getTextInputValue('game');

    embedData = {
      title: 'Nouvelle proposition de serveur',
      fields: [
        { name: 'Nom du serveur', value: name, inline: true },
        { name: 'IP:Port', value: ip, inline: true },
        { name: 'Jeu associé', value: game, inline: true }
      ]
    };
    type = 'server';
  } 
  else if (customId === 'req:modal:report') {
    const player = interaction.fields.getTextInputValue('player');
    const reason = interaction.fields.getTextInputValue('reason');

    embedData = {
      title: 'Nouveau signalement',
      fields: [
        { name: 'Pseudo du joueur', value: player, inline: true },
        { name: 'Raison', value: reason }
      ]
    };
    type = 'report';
  } 
  else {
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle(embedData.title)
    .addFields(embedData.fields);

  embed.setFooter({ text: `Demande de ${interaction.user.tag}` });

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`req:approve:${type}:${interaction.id}`)
        .setLabel('✅ Approuver')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`req:reject:${type}:${interaction.id}`)
        .setLabel('❌ Rejeter')
        .setStyle(ButtonStyle.Danger)
    );

  await channel.send({ embeds: [embed], components: [row] });

  await interaction.reply({ content: '✅ Ta demande a été envoyée à la modération.', flags: MessageFlags.Ephemeral });
}

async function handleApproveReject(interaction) {
  if (!interaction.isButton()) return;

  const customId = interaction.customId;
  const parts = customId.split(':');
  
  if (parts.length < 4 || (parts[0] !== 'req' && parts[1] !== 'approve' && parts[1] !== 'reject')) {
    return;
  }

  const action = parts[1];
  const type = parts[2];
  const messageId = parts[3];

  // Vérifier les permissions
  const mappings = getGradeMappings(interaction.guild.id);
  const moderatorRoleId = mappings[GRADE_NAMES.moderateur];
  
  if (!moderatorRoleId) {
    await interaction.reply({ content: 'Erreur : Rôle de modérateur non configuré.', flags: MessageFlags.Ephemeral });
    return;
  }

  const managerRoleId = mappings[GRADE_NAMES.manager];
  const ownerRoleId = mappings[GRADE_NAMES.owner];
  const hasPermission = [moderatorRoleId, managerRoleId, ownerRoleId].filter(Boolean).some((id) => interaction.member.roles.cache.has(id));
  if (!hasPermission) {
    await interaction.reply({ content: 'Erreur : Vous n\'avez pas la permission pour approuver ou rejeter cette demande.', flags: MessageFlags.Ephemeral });
    return;
  }

  const actionText = action === 'approve'
    ? `✅ Approuvé par <@${interaction.user.id}>`
    : `❌ Refusé par <@${interaction.user.id}>`;

  await interaction.message.edit({ components: [], content: actionText }).catch(() => {});
  await interaction.reply({ content: 'Action enregistrée.', flags: MessageFlags.Ephemeral });
}

module.exports = { 
  ensureRequestsPanel, 
  handleMemberRequestInteraction,
  handleMemberRequestModal,
  handleApproveReject
};
