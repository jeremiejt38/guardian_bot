const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { getDb } = require('../../database/db');
const { GRADE_NAMES, CATEGORIES, CHANNELS } = require('../../config');
const { getGradeMappings } = require('../initialisation/gradeMapping');
const { replyEphemeral } = require('../utils/interactions');
const { memberHasAnyRole } = require('../utils/roles');
const { searchGames, generateNonSteamId, isNonSteamId } = require('./steamGamesList');
const { searchRawgGame, getRawgApiKey } = require('./rawgApi');
const { insertGame } = require('./serverGamesManager');
const { buildGameChannelTopics } = require('./gameList');
const logger = require('../logs/logger');

const IDS = Object.freeze({
  requestButton:  'gamerequest:request',
  requestModal:   'gamerequest:modal',
  approvePrefix:  'gamerequest:approve:',
  rejectPrefix:   'gamerequest:reject:'
});

function canReviewRequests(member, guildId) {
  const mappings = getGradeMappings(guildId);
  return memberHasAnyRole(member, [
    mappings[GRADE_NAMES.moderateur],
    mappings[GRADE_NAMES.manager],
    mappings[GRADE_NAMES.owner]
  ].filter(Boolean));
}

function createRequest(guildId, requesterId, name, steamAppId) {
  const db = getDb();
  const result = db.prepare(
    `INSERT INTO game_requests (guild_id, requester_id, name, steam_app_id, status, created_at)
     VALUES (?, ?, ?, ?, 'pending', ?)`
  ).run(guildId, requesterId, name, steamAppId ?? null, new Date().toISOString());
  return result.lastInsertRowid;
}

function getPendingRequests(guildId) {
  return getDb()
    .prepare(`SELECT * FROM game_requests WHERE guild_id = ? AND status = 'pending' ORDER BY created_at`)
    .all(guildId);
}

function getRequestById(requestId) {
  return getDb()
    .prepare(`SELECT * FROM game_requests WHERE request_id = ?`)
    .get(requestId);
}

function updateRequestStatus(requestId, status, reviewedBy) {
  getDb()
    .prepare(`UPDATE game_requests SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE request_id = ?`)
    .run(status, reviewedBy, new Date().toISOString(), requestId);
}

function gameAlreadyExists(guildId, name) {
  return !!getDb()
    .prepare(`SELECT 1 FROM games WHERE guild_id = ? AND lower(name) = lower(?)`)
    .get(guildId, name);
}

function pendingRequestExists(guildId, name) {
  return !!getDb()
    .prepare(`SELECT 1 FROM game_requests WHERE guild_id = ? AND lower(name) = lower(?) AND status = 'pending'`)
    .get(guildId, name);
}

function normalizeChannelName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90) || 'jeu';
}

async function createGameChannelBetweenCategories(guild, gameName, gameRoleId) {
  const normalized = normalizeChannelName(gameName);

  const modCat = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === CATEGORIES.moderation
  );
  const configCat = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === CATEGORIES.configuration
  );

  const mappings = getGradeMappings(guild.id);
  const managerRoles = [
    mappings[GRADE_NAMES.moderateur],
    mappings[GRADE_NAMES.manager],
    mappings[GRADE_NAMES.owner]
  ].filter(Boolean);

  const categoryPerms = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: gameRoleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages]
    },
    ...managerRoles.map((roleId) => ({
      id: roleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages]
    }))
  ];

  const category = await guild.channels.create({
    name: gameName.slice(0, 100),
    type: ChannelType.GuildCategory,
    permissionOverwrites: categoryPerms
  });

  const topics = buildGameChannelTopics(gameName);
  const textChannel = await guild.channels.create({
    name: normalized,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: topics.text
  });

  if (modCat && configCat) {
    const targetPosition = configCat.position;
    await category.setPosition(targetPosition).catch(() => {});
  } else if (modCat) {
    await category.setPosition(modCat.position + 1).catch(() => {});
  }

  return { category, textChannel };
}

async function postPendingRequestToJeux(guild, requestId, name, steamAppId, requesterId, rawgInfo = null) {
  const jeuxChannel = guild.channels.cache.find(
    (c) => c.isTextBased?.() && !c.isVoiceBased?.() && c.name === CHANNELS.reports
  );
  if (!jeuxChannel) return;

  let steamInfo;
  if (steamAppId && !isNonSteamId(steamAppId)) {
    steamInfo = ` (Steam App ID: \`${steamAppId}\`)`;
  } else if (rawgInfo) {
    steamInfo = ` *(non-Steam — RAWG: \`${rawgInfo.rawgId}\`)*`;
  } else {
    steamInfo = ' *(non-Steam)*';
  }
  const content = [
    `## 🎮 Demande d'ajout de jeu`,
    `> **Jeu :** ${name}${steamInfo}`,
    `> **Demandé par :** <@${requesterId}>`,
    `> **ID demande :** \`${requestId}\``
  ].join('\n');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${IDS.approvePrefix}${requestId}`)
      .setStyle(ButtonStyle.Success)
      .setLabel('✅ Approuver'),
    new ButtonBuilder()
      .setCustomId(`${IDS.rejectPrefix}${requestId}`)
      .setStyle(ButtonStyle.Danger)
      .setLabel('❌ Refuser')
  );

  await jeuxChannel.send({ content, components: [row] }).catch((err) =>
    logger.error(`[gameRequests] Failed to post request to #signalements: ${err?.message}`)
  );
}

async function ensureRequestsPanelHasGameButton(guild) {
  const requestsChannel = guild.channels.cache.find(
    (c) => c.isTextBased?.() && !c.isVoiceBased?.() && c.name === CHANNELS.requests
  );
  if (!requestsChannel) return;

  const recent = await requestsChannel.messages.fetch({ limit: 50 }).catch(() => null);
  const hasButton = recent?.some(
    (m) =>
      m.author.id === guild.client.user.id &&
      m.components?.some((row) =>
        row.components?.some((c) => c.customId === IDS.requestButton)
      )
  );
  if (hasButton) return;

  await requestsChannel.send({
    content: '## 📋 Demandes\n> Utilisez les boutons ci-dessous pour soumettre vos demandes.',
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(IDS.requestButton)
          .setStyle(ButtonStyle.Primary)
          .setLabel('🎮 Demander un jeu')
      )
    ]
  }).catch((err) => logger.error(`[gameRequests] Failed to post requests panel: ${err?.message}`));
}

async function handleGameRequestInteraction(interaction) {
  if (!interaction.guildId) return false;
  const guildId = interaction.guildId;

  if (interaction.isButton() && interaction.customId === IDS.requestButton) {
    const modal = new ModalBuilder()
      .setCustomId(IDS.requestModal)
      .setTitle('🎮 Demande d\'ajout de jeu')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('game_name')
            .setLabel('Nom du jeu')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(80)
            .setRequired(true)
            .setPlaceholder('ex: Elden Ring')
        )
      );
    await interaction.showModal(modal).catch(() => {});
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId === IDS.requestModal) {
    const name = interaction.fields.getTextInputValue('game_name').trim();
    if (!name) {
      await replyEphemeral(interaction, '❌ Nom du jeu invalide.');
      return true;
    }

    if (gameAlreadyExists(guildId, name)) {
      await replyEphemeral(interaction, `❌ Le jeu **${name}** existe déjà sur ce serveur.`);
      return true;
    }
    if (pendingRequestExists(guildId, name)) {
      await replyEphemeral(interaction, `⏳ Une demande pour **${name}** est déjà en attente d'approbation.`);
      return true;
    }

    const match = searchGames(name, 1)[0];
    const resolvedName = match ? match.name : name;
    const steamAppId = match ? String(match.appid) : generateNonSteamId();
    const isNonSteam = isNonSteamId(steamAppId);

    let rawgInfo = null;
    if (isNonSteam) {
      rawgInfo = await searchRawgGame(resolvedName, getRawgApiKey(guildId)).catch(() => null);
    }

    const requestId = createRequest(guildId, interaction.user.id, resolvedName, steamAppId);
    await postPendingRequestToJeux(interaction.guild, requestId, resolvedName, steamAppId, interaction.user.id, rawgInfo);

    let steamNote;
    if (!isNonSteam) {
      steamNote = `\n> 🔍 Jeu identifié sur Steam : **${resolvedName}** (App ID: \`${steamAppId}\`)`;
    } else if (rawgInfo) {
      const genres = rawgInfo.genres.slice(0, 3).join(', ');
      steamNote = `\n> 🎮 Jeu trouvé sur RAWG : **${rawgInfo.name}**${genres ? ` — ${genres}` : ''}\n> ℹ️ Les changelogs Steam ne seront pas disponibles.`;
    } else {
      steamNote = `\n> ℹ️ Jeu non trouvé sur Steam ni RAWG — les changelogs Steam ne seront pas disponibles.`;
    }

    await replyEphemeral(interaction, `✅ Ta demande pour **${resolvedName}** a été soumise.${steamNote}`);
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith(IDS.approvePrefix)) {
    if (!canReviewRequests(interaction.member, guildId)) {
      await replyEphemeral(interaction, '❌ Tu n\'as pas la permission d\'approuver des demandes.');
      return true;
    }
    const requestId = Number(interaction.customId.slice(IDS.approvePrefix.length));
    const request = getRequestById(requestId);
    if (!request || request.guild_id !== guildId) {
      await replyEphemeral(interaction, '❌ Demande introuvable.');
      return true;
    }
    if (request.status !== 'pending') {
      await replyEphemeral(interaction, `ℹ️ Cette demande a déjà été traitée (${request.status}).`);
      return true;
    }

    if (gameAlreadyExists(guildId, request.name)) {
      updateRequestStatus(requestId, 'rejected', interaction.user.id);
      await interaction.update({ content: `~~${interaction.message.content}~~\n> ❌ Jeu déjà existant — demande annulée.`, components: [] }).catch(() => {});
      return true;
    }

    try {
      await interaction.deferUpdate().catch(() => {});

      const role = await interaction.guild.roles.create({
        name: request.name.slice(0, 100),
        reason: `Guardian: jeu approuvé — ${request.name}`
      });

      const { category, textChannel } = await createGameChannelBetweenCategories(
        interaction.guild, request.name, role.id
      );

      let rawgId = null;
      if (isNonSteamId(request.steam_app_id)) {
        const rawg = await searchRawgGame(request.name, getRawgApiKey(guildId)).catch(() => null);
        rawgId = rawg?.rawgId ?? null;
      }

      insertGame(guildId, {
        name: request.name,
        steamAppId: request.steam_app_id,
        rawgId,
        roleId: role.id,
        channelTextId: textChannel.id,
        channelGalerieId: null,
        channelChangelogId: null,
        categoryId: category.id,
        galerieEnabled: false,
        changelogEnabled: false
      });

      updateRequestStatus(requestId, 'approved', interaction.user.id);

      await interaction.message.edit({
        content: `${interaction.message.content}\n> ✅ **Approuvé** par <@${interaction.user.id}> — channel <#${textChannel.id}> créé.`,
        components: []
      }).catch(() => {});

      logger.info(`[gameRequests] Guild ${guildId}: game "${request.name}" approved by ${interaction.user.id}`);
    } catch (err) {
      logger.error(`[gameRequests] Failed to approve game request ${requestId}`, err);
      await replyEphemeral(interaction, '❌ Erreur lors de la création du jeu. Vérifie les permissions du bot.');
    }
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith(IDS.rejectPrefix)) {
    if (!canReviewRequests(interaction.member, guildId)) {
      await replyEphemeral(interaction, '❌ Tu n\'as pas la permission de refuser des demandes.');
      return true;
    }
    const requestId = Number(interaction.customId.slice(IDS.rejectPrefix.length));
    const request = getRequestById(requestId);
    if (!request || request.guild_id !== guildId) {
      await replyEphemeral(interaction, '❌ Demande introuvable.');
      return true;
    }
    if (request.status !== 'pending') {
      await replyEphemeral(interaction, `ℹ️ Cette demande a déjà été traitée (${request.status}).`);
      return true;
    }

    updateRequestStatus(requestId, 'rejected', interaction.user.id);
    await interaction.update({
      content: `${interaction.message.content}\n> ❌ **Refusé** par <@${interaction.user.id}>`,
      components: []
    }).catch(() => {});

    logger.info(`[gameRequests] Guild ${guildId}: game "${request.name}" rejected by ${interaction.user.id}`);
    return true;
  }

  return false;
}

module.exports = {
  IDS,
  ensureRequestsPanelHasGameButton,
  handleGameRequestInteraction
};
