const {
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { getDb } = require('../../database/db');
const { CATEGORIES, CHANNELS, GRADE_NAMES } = require('../../config');
const { getGuildSetting, setGuildSetting } = require('../config/settings');
const {
  getAvailableLanguages,
  getLanguageLabel,
  getGuildLanguage,
  setGuildLanguage,
  detectLanguageFromLocale,
  t,
  tForLanguage
} = require('../i18n');
const { markGuildInstalled } = require('./checkInstall');
const { seedGuildMessages } = require('./seeds');
const { getInstallContext, autoMapRolesByName } = require('./detectInstallContext');
const { provisionGuildGameStructures, buildOpenButtonRow } = require('../games/gameList');
const {
  findCategoryByName,
  findGuildTextChannelByName,
  findGuildVoiceChannelByName,
  findGuildForumChannelByName
} = require('../utils/channels');
const { replyEphemeral } = require('../utils/interactions');
const { safeDiscordAction } = require('../utils/discordErrors');
const { getGradeMappings } = require('./gradeMapping');
const { seedJoinServerChannel } = require('../members/joinServerChannel');
const { seedBecomeMemberChannel } = require('../members/becomeMemberChannel');
const { seedRulesAcceptButton, isCommunityGuild } = require('../members/rulesAcceptance');
const { seedGuidesChannels } = require('../guides/serverGuides');
const logger = require('../logs/logger');

const SETUP_INSTALL_BUTTON_ID = 'setup:install';
const SETUP_LANGUAGE_SELECT_ID = 'setup:language';
const SETUP_START_BUTTON_ID = 'setup:start';
const SETUP_INTEGRATE_BUTTON_ID = 'setup:integrate';
const SETUP_RESET_BUTTON_ID = 'setup:reset';
const SETUP_FORCE_EXISTING_BUTTON_ID = 'setup:force-existing';
const SETUP_FORCE_REINSTALL_BUTTON_ID = 'setup:force-reinstall';
const SETUP_CLEAN_SERVER_BUTTON_ID = 'setup:clean-server';
const SETUP_CLEAN_MODAL_ID = 'setup:clean-modal';
const SETUP_CLEAN_VOCALS_BUTTON_ID = 'setup:clean-vocals';
const SETUP_CLEAN_ROLES_BUTTON_ID = 'setup:clean-roles';
const SETUP_FRESH_START_BUTTON_ID = 'setup:fresh-start';

async function ensureCategory(guild, name, permissionOverwrites) {
  const existing = findCategoryByName(guild, name);

  if (existing) {
    await existing.edit({ permissionOverwrites }).catch(() => {});
    return existing;
  }

  return guild.channels.create({
    name,
    type: ChannelType.GuildCategory,
    permissionOverwrites
  });
}

async function ensureTextChannel(guild, parentId, name, permissionOverwrites, { topic } = {}) {
  const safeTopic = typeof topic === 'string' ? topic : undefined;
  const existing = findGuildTextChannelByName(guild, name, parentId)
    ?? findGuildTextChannelByName(guild, name);

  if (existing) {
    await existing.edit({
      parent: parentId,
      permissionOverwrites,
      ...(safeTopic !== undefined ? { topic: safeTopic } : {})
    });
    return existing;
  }

  return guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: parentId,
    permissionOverwrites,
    ...(safeTopic !== undefined ? { topic: safeTopic } : {})
  });
}

async function ensureAnnouncementChannel(guild, parentId, name, permissionOverwrites, { topic } = {}) {
  const safeTopic = typeof topic === 'string' ? topic : undefined;
  const isCommunity = guild.features?.includes('COMMUNITY');
  const targetType = isCommunity ? ChannelType.GuildAnnouncement : ChannelType.GuildText;
  const existing = guild.channels.cache.find(
    (c) => (c.type === ChannelType.GuildAnnouncement || c.type === ChannelType.GuildText) &&
            c.name === name && (parentId === undefined || c.parentId === parentId)
  ) ?? null;
  if (existing) {
    await existing.edit({ parent: parentId, permissionOverwrites, ...(safeTopic !== undefined ? { topic: safeTopic } : {}) }).catch(() => {});
    if (isCommunity && existing.type !== ChannelType.GuildAnnouncement) {
      await existing.setType(ChannelType.GuildAnnouncement).catch(() => {});
    }
    return existing;
  }
  return guild.channels.create({ name, type: targetType, parent: parentId, permissionOverwrites, ...(safeTopic !== undefined ? { topic: safeTopic } : {}) });
}

async function ensureVoiceChannel(guild, parentId, name, permissionOverwrites) {
  const existing = findGuildVoiceChannelByName(guild, name, parentId);

  if (existing) {
    await existing.edit({
      parent: parentId,
      permissionOverwrites
    });
    return existing;
  }

  return guild.channels.create({
    name,
    type: ChannelType.GuildVoice,
    parent: parentId,
    permissionOverwrites
  });
}

async function ensureForumChannel(guild, parentId, name, permissionOverwrites, { topic } = {}) {
  const safeTopic = typeof topic === 'string' ? topic : undefined;
  const existingForum = findGuildForumChannelByName(guild, name, parentId);
  if (existingForum) {
    await existingForum.edit({ parent: parentId, permissionOverwrites, ...(safeTopic !== undefined ? { topic: safeTopic } : {}) });
    return existingForum;
  }

  // A same-named text channel from a previous install cannot be converted to a
  // forum; keep it as-is so we do not destroy existing content.
  const existingText = findGuildTextChannelByName(guild, name, parentId);
  if (existingText) {
    await existingText.edit({ parent: parentId, permissionOverwrites, ...(safeTopic !== undefined ? { topic: safeTopic } : {}) });
    return existingText;
  }

  return guild.channels.create({
    name,
    type: ChannelType.GuildForum,
    parent: parentId,
    permissionOverwrites,
    ...(safeTopic !== undefined ? { topic: safeTopic } : {})
  });
}

async function ensureForumPost(channel, name, content) {
  if (channel?.type !== ChannelType.GuildForum || typeof channel.threads?.create !== 'function') {
    return;
  }

  const existing = await channel.threads.fetchActive().catch(() => null);
  if (existing?.threads?.size) {
    return;
  }

  await channel.threads.create({ name, message: { content } });
}

function buildGeneralPermissions(guild, roleMap, inviteMode = 'classic') {
  if (inviteMode === 'strict' || inviteMode === 'direct') {
    const permissions = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }
    ];
    const memberPlusGrades = [GRADE_NAMES.membre, GRADE_NAMES.moderateur, GRADE_NAMES.manager, GRADE_NAMES.owner];
    for (const grade of memberPlusGrades) {
      const roleId = roleMap[grade];
      if (roleId) permissions.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
    }
    return permissions;
  }

  const permissions = [
    {
      id: guild.roles.everyone.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
    }
  ];

  const inviteRoleId = roleMap[GRADE_NAMES.invite];
  if (inviteRoleId) {
    permissions.push({
      id: inviteRoleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      deny: [PermissionFlagsBits.ReadMessageHistory]
    });
  }

  return permissions;
}

function buildHiddenPermissions(guild, ownerId) {
  return [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: ownerId, allow: [PermissionFlagsBits.ViewChannel] }
  ];
}

function buildModerationPermissions(guild, roleMap, ownerId) {
  const permissions = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }
  ];

  const modPlusRoleIds = [
    roleMap[GRADE_NAMES.moderateur],
    roleMap[GRADE_NAMES.manager],
    roleMap[GRADE_NAMES.owner]
  ].filter(Boolean);

  if (modPlusRoleIds.length === 0) {
    permissions.push({
      id: ownerId,
      allow: [PermissionFlagsBits.ViewChannel]
    });
    return permissions;
  }

  for (const roleId of modPlusRoleIds) {
    permissions.push({
      id: roleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
    });
  }

  return permissions;
}

function buildConfigPermissions(guild, roleMap, ownerId, minimumGrade) {
  const order = [
    GRADE_NAMES.invite,
    GRADE_NAMES.membre,
    GRADE_NAMES.moderateur,
    GRADE_NAMES.manager,
    GRADE_NAMES.owner
  ];

  const start = Math.max(order.indexOf(minimumGrade), 0);
  const allowedRoleIds = order.slice(start).map((grade) => roleMap[grade]).filter(Boolean);

  const permissions = [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }];

  if (allowedRoleIds.length === 0) {
    permissions.push({ id: ownerId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
    return permissions;
  }

  for (const roleId of allowedRoleIds) {
    permissions.push({
      id: roleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
    });
  }

  return permissions;
}

function buildViewThenActionPermissions(guild, roleMap, ownerId, viewMinimumGrade, actionMinimumGrade) {
  const order = [
    GRADE_NAMES.invite,
    GRADE_NAMES.membre,
    GRADE_NAMES.moderateur,
    GRADE_NAMES.manager,
    GRADE_NAMES.owner
  ];

  const viewIndex = Math.max(order.indexOf(viewMinimumGrade), 0);
  const actionIndex = Math.max(order.indexOf(actionMinimumGrade), 0);

  const viewRoleIds = order.slice(viewIndex).map((g) => roleMap[g]).filter(Boolean);
  const actionRoleIds = order.slice(actionIndex).map((g) => roleMap[g]).filter(Boolean);

  const permissions = [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }];

  // allow view for viewRoleIds
  for (const roleId of viewRoleIds) {
    permissions.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel] });
  }

  // allow send for actionRoleIds (also need view)
  for (const roleId of actionRoleIds) {
    permissions.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
  }

  if (viewRoleIds.length === 0 && actionRoleIds.length === 0) {
    permissions.push({ id: ownerId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
  }

  return permissions;
}

function buildViewOnlyPermissions(guild, roleMap, ownerId, viewMinimumGrade) {
  const order = [
    GRADE_NAMES.invite,
    GRADE_NAMES.membre,
    GRADE_NAMES.moderateur,
    GRADE_NAMES.manager,
    GRADE_NAMES.owner
  ];

  const viewIndex = Math.max(order.indexOf(viewMinimumGrade), 0);
  const viewRoleIds = order.slice(viewIndex).map((g) => roleMap[g]).filter(Boolean);

  const permissions = [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }];
  for (const roleId of viewRoleIds) {
    permissions.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel] });
  }

  if (viewRoleIds.length === 0) {
    permissions.push({ id: ownerId, allow: [PermissionFlagsBits.ViewChannel] });
  }

  return permissions;
}

function buildRequestsPermissions(guild, roleMap) {
  const memberPlusGrades = [
    GRADE_NAMES.membre,
    GRADE_NAMES.moderateur,
    GRADE_NAMES.manager,
    GRADE_NAMES.owner
  ];
  const gradeRoleIds = memberPlusGrades.map((g) => roleMap[g]).filter(Boolean);

  const base = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel]
    }
  ];

  if (gradeRoleIds.length === 0) {
    base[0] = {
      id: guild.roles.everyone.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
    };
    return base;
  }

  for (const roleId of gradeRoleIds) {
    base.push({
      id: roleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
    });
  }

  return base;
}

async function seedFaqMessages(channel) {
  const language = getGuildLanguage(channel.guild.id);
  const defaultMessages = [
    tForLanguage(language, 'init.faq1'),
    tForLanguage(language, 'init.faq2'),
    tForLanguage(language, 'init.faq3')
  ];

  if (channel.type === ChannelType.GuildForum) {
    const existing = await channel.threads.fetchActive().catch(() => null);
    if (existing?.threads?.size) {
      return;
    }

    let index = 1;
    for (const message of defaultMessages) {
      await channel.threads.create({
        name: tForLanguage(language, 'init.faqPostTitle', { index }),
        message: { content: message }
      });
      index += 1;
    }
    return;
  }

  if (channel.lastMessageId) {
    return;
  }

  for (const message of defaultMessages) {
    const msg = await channel.send(message).catch(() => null);
    if (msg) setTimeout(() => msg.delete().catch(() => {}), 8000);
  }
}

async function seedStaticInfoMessage(channel, key) {
  if (!channel?.isTextBased?.() || channel.lastMessageId) {
    return;
  }
  const content = tForLanguage(getGuildLanguage(channel.guild.id), key);
  const msg = await channel.send(content).catch(() => null);
  if (msg) setTimeout(() => msg.delete().catch(() => {}), 8000);
}

async function seedVoiceCreateMessage(channel) {
  if (channel.lastMessageId) {
    return;
  }
  const button = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('creer:open').setLabel(t(channel.guild.id, 'init.createChannel')).setStyle(ButtonStyle.Primary)
  );
  await channel.send({ content: t(channel.guild.id, 'init.voiceCreate'), components: [button] });
}

async function seedGuardianConfigMessage(channel, options = {}) {
  if (options.withGameListButton && !channel.lastMessageId) {
    const msg = await channel.send({ components: [buildOpenButtonRow(channel.guild.id)] }).catch(() => null);
    if (msg) setTimeout(() => msg.delete().catch(() => {}), 8000);
  }
}

async function seedServerManagementPlaceholder(channel) {
  if (channel.lastMessageId) {
    return;
  }
  const msg = await channel.send(t(channel.guild.id, 'init.serverPlaceholder')).catch(() => null);
  if (msg) setTimeout(() => msg.delete().catch(() => {}), 8000);
}

async function seedServeursListMessage(channel) {
  if (channel.lastMessageId) return;

  const db = getDb();
  const rows = db.prepare('SELECT server_id, name, game, ip, port, last_status FROM servers_jeu WHERE guild_id = ?').all(channel.guild.id);

  let content = '**Liste des serveurs communautaires**\n';
  if (rows.length === 0) {
    content += '_Aucun serveur ajouté._\n';
  } else {
    for (const r of rows) {
      content += `• **${r.name}** (${r.game}) — ${r.ip}:${r.port} — Status: ${r.last_status || 'unknown'}\n`;
    }
  }

  const addButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('servers:add').setLabel(t(channel.guild.id, 'init.addServer')).setStyle(ButtonStyle.Primary)
  );

  await channel.send({ content, components: [addButton] });
}

async function createInformationsArea(guild, roleMap) {
  const readOnlyPermissions = [
    {
      id: guild.roles.everyone.id,
      allow: [PermissionFlagsBits.ViewChannel],
      deny: [PermissionFlagsBits.SendMessages]
    }
  ];

  const guildIdI = guild.id;
  const welcomeChannel = await ensureTextChannel(guild, null, CHANNELS.welcome, readOnlyPermissions, { topic: t('init.topics.welcome', {}, { guildId: guildIdI }) });
  const rulesChannel = await ensureTextChannel(guild, null, CHANNELS.rules, readOnlyPermissions, { topic: t('init.topics.rules', {}, { guildId: guildIdI }) });
  const announcementsChannel = await ensureAnnouncementChannel(guild, null, CHANNELS.annonces, readOnlyPermissions, { topic: t('init.topics.annonces', {}, { guildId: guildIdI }) });
  const faqChannel = await ensureTextChannel(guild, null, CHANNELS.faq, readOnlyPermissions, { topic: t('init.topics.faq', {}, { guildId: guildIdI }) });

  await ensureTextChannel(guild, null, CHANNELS.requests, buildRequestsPermissions(guild, roleMap), { topic: t('init.topics.requests', {}, { guildId: guildIdI }) });

  await seedStaticInfoMessage(welcomeChannel, 'init.welcomeInfo');
  await seedStaticInfoMessage(rulesChannel, 'init.rules');
  if (!isCommunityGuild(guild)) {
    await seedRulesAcceptButton(rulesChannel, guild).catch(() => {});
  }
  await seedStaticInfoMessage(announcementsChannel, 'init.announcements');
  await seedFaqMessages(faqChannel);

  const existingCat = findCategoryByName(guild, CATEGORIES.informations);
  if (existingCat) {
    const children = guild.channels.cache.filter((c) => c.parentId === existingCat.id);
    if (children.size === 0) await existingCat.delete('Guardian — catégorie Informations supprimée').catch(() => {});
  }
}

async function createCommunauteArea(guild, roleMap, ownerId) {
  const communauteCategory = await ensureCategory(guild, CATEGORIES.communaute, [
    { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel] }
  ]);

  const generalEnabled = getGuildSetting(guild.id, 'communaute', 'general_enabled', true);
  const inviteMode = getGuildSetting(guild.id, 'setup', 'invite_mode', 'classic');
  const permissions = generalEnabled
    ? buildGeneralPermissions(guild, roleMap, inviteMode)
    : buildHiddenPermissions(guild, ownerId);

  const guildIdC = guild.id;
  await ensureTextChannel(guild, communauteCategory.id, CHANNELS.general, permissions, { topic: t('init.topics.general', {}, { guildId: guildIdC }) });

  await ensureTextChannel(guild, communauteCategory.id, CHANNELS.requests, buildRequestsPermissions(guild, roleMap), { topic: t('init.topics.requests', {}, { guildId: guildIdC }) });

  const memberReadPermissions = [
    { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] }
  ];
  await ensureTextChannel(guild, communauteCategory.id, CHANNELS.serverList, memberReadPermissions, { topic: t('init.topics.serverList', {}, { guildId: guildIdC }) });

  const inviteRoleId = roleMap[GRADE_NAMES.invite];
  const inviteOnlyPerms = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    ...(inviteRoleId ? [{ id: inviteRoleId, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] }] : []),
    { id: ownerId, allow: [PermissionFlagsBits.ViewChannel] }
  ];
  const becomeMemberChannel = await ensureTextChannel(guild, communauteCategory.id, CHANNELS.becomeMember, inviteOnlyPerms, { topic: t('init.topics.becomeMember', {}, { guildId: guildIdC }) });
  await seedBecomeMemberChannel(becomeMemberChannel, guild).catch(() => {});

  const joinServerChannel = await ensureTextChannel(guild, communauteCategory.id, CHANNELS.joinServer, inviteOnlyPerms, { topic: t('init.topics.joinServer', {}, { guildId: guildIdC }) });
  await seedJoinServerChannel(joinServerChannel, guild).catch(() => {});

  const suggestionsEnabled = getGuildSetting(guild.id, 'channels', 'suggestions_enabled', true);
  if (suggestionsEnabled) {
    const memberPlusForSuggestions = [GRADE_NAMES.membre, GRADE_NAMES.moderateur, GRADE_NAMES.manager, GRADE_NAMES.owner];
    const suggestionRoleIds = memberPlusForSuggestions.map((g) => roleMap[g]).filter(Boolean);
    const suggestionsPerms = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      ...suggestionRoleIds.map((id) => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }))
    ];
    const suggestionsForum = await ensureForumChannel(guild, communauteCategory.id, CHANNELS.suggestions,
      suggestionRoleIds.length > 0 ? suggestionsPerms : [{ id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel] }],
      { topic: t('init.topics.suggestions', {}, { guildId: guild.id }) });
    await ensureForumPost(
      suggestionsForum,
      tForLanguage(getGuildLanguage(guild.id), 'init.suggestionsPostTitle'),
      tForLanguage(getGuildLanguage(guild.id), 'init.suggestionsIntro')
    );
  }
}

async function createVocalArea(guild, roleMap, ownerId) {
  const inviteMode = getGuildSetting(guild.id, 'setup', 'invite_mode', 'classic');

  let vocauxCategoryPerms;
  let voiceChannelPerms;
  let voiceCreatePerms;

  if (inviteMode === 'strict' || inviteMode === 'direct') {
    const memberPlusGrades = [GRADE_NAMES.membre, GRADE_NAMES.moderateur, GRADE_NAMES.manager, GRADE_NAMES.owner];
    const allowedRoleIds = memberPlusGrades.map((g) => roleMap[g]).filter(Boolean);
    const base = [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }];
    for (const roleId of allowedRoleIds) {
      base.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel] });
    }
    vocauxCategoryPerms = base;
    voiceChannelPerms = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
      ...allowedRoleIds.map((id) => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] }))
    ];
    voiceCreatePerms = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      ...allowedRoleIds.map((id) => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }))
    ];
  } else {
    vocauxCategoryPerms = [{ id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel] }];
    voiceChannelPerms = [{ id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] }];
    voiceCreatePerms = [{ id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }];
  }

  const vocauxCategory = await ensureCategory(guild, CATEGORIES.vocaux, vocauxCategoryPerms);

  const guildIdV = guild.id;
  const voiceCreateChannel = await ensureTextChannel(guild, vocauxCategory.id, CHANNELS.voiceCreate, voiceCreatePerms, { topic: t('init.topics.voiceCreate', {}, { guildId: guildIdV }) });

  await ensureVoiceChannel(guild, vocauxCategory.id, CHANNELS.voiceGeneral, voiceChannelPerms);

  const afkEnabled = getGuildSetting(guild.id, 'vocaux', 'afk_enabled', true);
  let afkPermissions;
  if (!afkEnabled) {
    afkPermissions = buildHiddenPermissions(guild, ownerId);
  } else if (inviteMode === 'strict' || inviteMode === 'direct') {
    afkPermissions = voiceChannelPerms;
  } else {
    afkPermissions = [{ id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] }];
  }

  await ensureVoiceChannel(guild, vocauxCategory.id, CHANNELS.voiceAfk, afkPermissions);
  await seedVoiceCreateMessage(voiceCreateChannel);
}

async function createModerationArea(guild, roleMap, ownerId) {
  const moderationPermissions = buildModerationPermissions(guild, roleMap, ownerId);
  const moderationCategory = await ensureCategory(guild, CATEGORIES.moderation, moderationPermissions);

  const guildId = guild.id;
  await ensureTextChannel(guild, moderationCategory.id, CHANNELS.moderation,     moderationPermissions, { topic: t('init.topics.moderation',     {}, { guildId }) });
  await ensureTextChannel(guild, moderationCategory.id, CHANNELS.validation,     moderationPermissions, { topic: t('init.topics.validation',     {}, { guildId }) });
  await ensureTextChannel(guild, moderationCategory.id, CHANNELS.behavior,       moderationPermissions, { topic: t('init.topics.behavior',        {}, { guildId }) });
  await ensureTextChannel(guild, moderationCategory.id, CHANNELS.autoModeration, moderationPermissions, { topic: t('init.topics.autoModeration', {}, { guildId }) });
  await ensureTextChannel(guild, moderationCategory.id, CHANNELS.reports,        moderationPermissions, { topic: t('init.topics.reports',        {}, { guildId }) });
  await ensureTextChannel(guild, moderationCategory.id, CHANNELS.securityUpdates, buildConfigPermissions(guild, roleMap, ownerId, GRADE_NAMES.manager), { topic: t('init.topics.securityUpdates', {}, { guildId }) });
}

async function renameChannelIfExists(guild, oldName, newName) {
  const ch = guild.channels.cache.find((c) => c.name === oldName && c.isTextBased?.());
  if (ch && ch.name !== newName) await ch.edit({ name: newName }).catch(() => {});
}

async function createConfigurationArea(guild, roleMap, ownerId) {
  await renameChannelIfExists(guild, 'channels', CHANNELS.channelsConfig);
  await renameChannelIfExists(guild, 'bot', CHANNELS.notifications);
  await renameChannelIfExists(guild, 'guardian-config', CHANNELS.guardianConfig);

  const configurationCategory = await ensureCategory(guild, CATEGORIES.configuration, buildHiddenPermissions(guild, ownerId));

  const guildId = guild.id;
  const channels = [
    // visible to members (opt-in features)
    { name: CHANNELS.gameChannels,    permissions: buildConfigPermissions(guild, roleMap, ownerId, GRADE_NAMES.membre),   topic: t('init.topics.gameChannels',    {}, { guildId }) },
    { name: CHANNELS.gameList,        permissions: buildConfigPermissions(guild, roleMap, ownerId, GRADE_NAMES.membre),   topic: t('init.topics.gameList',        {}, { guildId }) },

    // moderation access (moderateur+)
    { name: CHANNELS.serveurs,        permissions: buildViewThenActionPermissions(guild, roleMap, ownerId, GRADE_NAMES.moderateur, GRADE_NAMES.manager), topic: t('init.topics.serveurs', {}, { guildId }) },

    // manager configuration
    { name: CHANNELS.membres,         permissions: buildConfigPermissions(guild, roleMap, ownerId, GRADE_NAMES.manager),  topic: t('init.topics.membres',         {}, { guildId }) },
    { name: CHANNELS.channelsConfig,  permissions: buildConfigPermissions(guild, roleMap, ownerId, GRADE_NAMES.manager),  topic: t('init.topics.channelsConfig',  {}, { guildId }) },
    { name: CHANNELS.vocauxConfig,    permissions: buildConfigPermissions(guild, roleMap, ownerId, GRADE_NAMES.manager),  topic: t('init.topics.vocauxConfig',    {}, { guildId }) },
    { name: CHANNELS.jeux,            permissions: buildConfigPermissions(guild, roleMap, ownerId, GRADE_NAMES.manager),  topic: t('init.topics.jeux',            {}, { guildId }) },
    { name: CHANNELS.notifications,   permissions: buildConfigPermissions(guild, roleMap, ownerId, GRADE_NAMES.manager),  topic: t('init.topics.botConfig',       {}, { guildId }) },

    // logs (view only, manager+)
    { name: CHANNELS.configLogs,      permissions: buildViewOnlyPermissions(guild, roleMap, ownerId, GRADE_NAMES.manager), topic: t('init.topics.configLogs',     {}, { guildId }) },

    // owner only
    { name: CHANNELS.roles,           permissions: buildConfigPermissions(guild, roleMap, ownerId, GRADE_NAMES.owner),    topic: t('init.topics.roles',           {}, { guildId }) },
    { name: CHANNELS.guardianConfig,  permissions: buildConfigPermissions(guild, roleMap, ownerId, GRADE_NAMES.owner),    topic: t('init.topics.guardian',        {}, { guildId }) },
    { name: CHANNELS.guardian,        permissions: buildConfigPermissions(guild, roleMap, ownerId, GRADE_NAMES.owner),    topic: t('init.topics.guardian',        {}, { guildId }) },

    // legacy management channel (future Pterodactyl control)
    { name: CHANNELS.serverManagement, permissions: buildConfigPermissions(guild, roleMap, ownerId, GRADE_NAMES.owner),  topic: t('init.topics.serverManagement', {}, { guildId }) }
  ];

  for (const item of channels) {
    const channel = await ensureTextChannel(guild, configurationCategory.id, item.name, item.permissions, { topic: item.topic });
    const withGameListButton = item.name === CHANNELS.gameChannels || item.name === CHANNELS.gameList;
    await seedGuardianConfigMessage(channel, { withGameListButton });
  }
}

function buildSetupInstallButtonRow(language) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(SETUP_INSTALL_BUTTON_ID)
      .setLabel(tForLanguage(language, 'setup.continueButton'))
      .setStyle(ButtonStyle.Primary)
  );
}

function buildSetupLanguageSelectRow(language) {
  const options = getAvailableLanguages().map((code) => ({
    label: getLanguageLabel(code).slice(0, 100),
    value: code,
    default: code === language
  }));

  if (options.length === 0) {
    options.push({
      label: 'fr',
      value: 'fr',
      default: true
    });
  }

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(SETUP_LANGUAGE_SELECT_ID)
      .setPlaceholder(tForLanguage(language, 'setup.languagePlaceholder'))
      .addOptions(options)
  );
}

function resolveSetupLanguage(guildId) {
  return getGuildLanguage(guildId);
}

function getSetupMessageContent(language) {
  const languageLabel = getLanguageLabel(language);
  return [
    tForLanguage(language, 'setup.welcome'),
    tForLanguage(language, 'setup.instructions'),
    tForLanguage(language, 'setup.currentLanguage', { language: languageLabel })
  ].join(' ');
}

async function purgeSetupChannel(setupChannel) {
  try {
    let fetched;
    do {
      fetched = await setupChannel.messages.fetch({ limit: 100 });
      if (fetched.size === 0) break;
      const deletable = fetched.filter((m) => Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000);
      const old = fetched.filter((m) => Date.now() - m.createdTimestamp >= 14 * 24 * 60 * 60 * 1000);
      if (deletable.size > 1) {
        await setupChannel.bulkDelete(deletable);
      } else if (deletable.size === 1) {
        await deletable.first().delete();
      }
      for (const msg of old.values()) {
        await msg.delete().catch(() => {});
      }
    } while (fetched.size >= 100);
  } catch (err) {
    logger.error('Failed to purge setup channel', err);
  }
}

async function ensureSetupInstallPrompt(guild, { forceCreateIfMissing = false } = {}) {
  let setupCategory = findCategoryByName(guild, CATEGORIES.setup);
  let setupChannel = setupCategory
    ? findGuildTextChannelByName(guild, CHANNELS.setup, setupCategory.id)
    : null;

  if ((!setupCategory || !setupChannel) && forceCreateIfMissing) {
    const owner = await guild.fetchOwner();
    setupCategory = await ensureCategory(guild, CATEGORIES.setup, [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: owner.id, allow: [PermissionFlagsBits.ViewChannel] }
    ]);
    await setupCategory.setPosition(0).catch(() => {});
    setupChannel = await ensureTextChannel(guild, setupCategory.id, CHANNELS.setup, [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: owner.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
    ], { topic: t('init.topics.setup', {}, { guildId: guild.id }) });
  }

  if (!setupChannel) return;

  await purgeSetupChannel(setupChannel);

  const language = resolveSetupLanguage(guild.id);
  await setupChannel.send(buildSetupInstallMessagePayloadForGuild(language));
}

function buildSetupInstallMessagePayloadForGuild(language) {
  return {
    content: getSetupMessageContent(language),
    components: [buildSetupLanguageSelectRow(language), buildSetupInstallButtonRow(language)]
  };
}

async function repositionCategories(guild) {
  const order = [
    CATEGORIES.communaute,
    CATEGORIES.vocaux,
    CATEGORIES.moderation
  ];
  const fixedEnd = [
    CATEGORIES.configuration,
    CATEGORIES.guides
  ];

  const allCategories = guild.channels.cache.filter((c) => c.type === 4);
  const gameCats = allCategories.filter(
    (c) => !order.includes(c.name) && !fixedEnd.includes(c.name) && c.name !== CATEGORIES.setup && c.name !== CATEGORIES.informations
  ).sort((a, b) => a.name.localeCompare(b.name));

  const ordered = [
    ...order.map((name) => allCategories.find((c) => c.name === name)).filter(Boolean),
    ...gameCats.values(),
    ...fixedEnd.map((name) => allCategories.find((c) => c.name === name)).filter(Boolean)
  ];

  for (let i = 0; i < ordered.length; i++) {
    await ordered[i].setPosition(i).catch(() => {});
  }
}

async function runSetupInstallationPhases(guild, ownerId) {
  const roleMap = getGradeMappings(guild.id);

  await createInformationsArea(guild, roleMap);
  await createCommunauteArea(guild, roleMap, ownerId);
  await createVocalArea(guild, roleMap, ownerId);
  await provisionGuildGameStructures(guild);
  await createModerationArea(guild, roleMap, ownerId);
  await createConfigurationArea(guild, roleMap, ownerId);
  await seedGuidesChannels(guild).catch((err) => logger.warn(`seedGuidesChannels failed: ${err.message}`));
  await repositionCategories(guild);
  await repositionHiddenChannels(guild);

  markGuildInstalled(guild.id, ownerId);
}

async function repositionHiddenChannels(guild) {
  const toReposition = [
    CHANNELS.guardian,
    'guardian-backup',
    CHANNELS.becomeMember,
    CHANNELS.joinServer
  ];
  for (const name of toReposition) {
    const ch = guild.channels.cache.find((c) => c.name === name);
    if (ch) await ch.edit({ position: 999 }).catch(() => {});
  }
  const guideChannels = guild.channels.cache.filter((c) => c.name.startsWith('guide-'));
  for (const ch of guideChannels.values()) {
    await ch.edit({ position: 999 }).catch(() => {});
  }
}

async function createSetupArea(guild, { inviterId } = {}) {
  try {
    const owner = await guild.fetchOwner();
    const extraUserId = inviterId && inviterId !== owner.id ? inviterId : null;

    const categoryPerms = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: owner.id, allow: [PermissionFlagsBits.ViewChannel] }
    ];
    if (extraUserId) categoryPerms.push({ id: extraUserId, allow: [PermissionFlagsBits.ViewChannel] });

    const category = await ensureCategory(guild, CATEGORIES.setup, categoryPerms);
    await category.setPosition(0).catch(() => {});

    const channelPerms = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: owner.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
    ];
    if (extraUserId) channelPerms.push({ id: extraUserId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });

    setGuildSetting(guild.id, 'setup', 'owner_id', owner.id);
    if (!Number.isInteger(getGuildSetting(guild.id, 'setup', 'step', null))) {
      setGuildSetting(guild.id, 'setup', 'step', 1);
    }

    const currentLang = getGuildLanguage(guild.id);
    const detectedLang = detectLanguageFromLocale(guild.preferredLocale);
    if (!getGuildSetting(guild.id, 'i18n', 'language', null) && detectedLang !== currentLang) {
      setGuildLanguage(guild.id, detectedLang);
      logger.info(`Guild ${guild.id}: language auto-set to '${detectedLang}' from preferredLocale '${guild.preferredLocale}'`);
    }

    const language = resolveSetupLanguage(guild.id);
    const setupTopic = tForLanguage(language, 'init.topics.setup');
    const channel = await ensureTextChannel(guild, category.id, CHANNELS.setup, channelPerms, { topic: typeof setupTopic === 'string' ? setupTopic : undefined });
    await channel.send(buildSetupInstallMessagePayloadForGuild(language));
    return { category, channel };
  } catch (error) {
    logger.error('Failed to create setup area', error);
    throw error;
  }
}

async function handleSetupLanguageSelection(interaction) {
  if (!interaction.inGuild() || !interaction.guild) {
    await replyEphemeral(interaction, t(interaction.guildId, 'setup.inGuildOnly'));
    return;
  }

  const isOwner = interaction.user.id === interaction.guild.ownerId;
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);

  if (!isOwner && !isAdmin) {
    await replyEphemeral(interaction, t(interaction.guildId, 'setup.adminOnlyLanguage'));
    return;
  }

  const selectedLanguage = setGuildLanguage(interaction.guild.id, interaction.values?.[0]);

  await interaction.update(buildSetupInstallMessagePayloadForGuild(selectedLanguage));
}

function buildContextChoiceMessage(guildId, context) {
  const messages = {
    reinstall: [
      `⚠️ **${t(guildId, 'setup.contextReinstallTitle')}**`,
      t(guildId, 'setup.contextReinstallDesc'),
      '',
      `> ${t(guildId, 'setup.contextReinstallOption1')}`,
      `> ${t(guildId, 'setup.contextReinstallOption2')}`
    ],
    existing_server: [
      `ℹ️ **${t(guildId, 'setup.contextExistingTitle')}**`,
      t(guildId, 'setup.contextExistingDesc'),
      '',
      `> ${t(guildId, 'setup.contextExistingOption1')}`,
      `> ${t(guildId, 'setup.contextExistingOption2')}`
    ]
  };
  return messages[context]?.join('\n') ?? '';
}

function buildFreshRow(guildId, guild) {
  const buttons = [
    new ButtonBuilder()
      .setCustomId(SETUP_FRESH_START_BUTTON_ID)
      .setLabel(t(guildId, 'setup.freshInstallButton'))
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(SETUP_FORCE_EXISTING_BUTTON_ID)
      .setLabel(t(guildId, 'setup.freshForceExistingButton'))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(SETUP_FORCE_REINSTALL_BUTTON_ID)
      .setLabel(t(guildId, 'setup.freshForceReinstallButton'))
      .setStyle(ButtonStyle.Secondary)
  ];
  if (guild) {
    const hasExtra = guild.channels.cache.some((c) => c.type !== 4 && !Object.values(CHANNELS).includes(c.name))
      || guild.roles.cache.some((r) => r.id !== guild.roles.everyone.id && !r.managed);
    if (hasExtra) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(SETUP_CLEAN_SERVER_BUTTON_ID)
          .setLabel('🗑️ Nettoyer le serveur')
          .setStyle(ButtonStyle.Danger)
      );
    }
  }
  return new ActionRowBuilder().addComponents(...buttons);
}


function buildPartialRow(guildId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(SETUP_START_BUTTON_ID)
      .setLabel(t(guildId, 'setup.resumeInstallButton'))
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(SETUP_RESET_BUTTON_ID)
      .setLabel(t(guildId, 'setup.contextResetButton'))
      .setStyle(ButtonStyle.Danger)
  );
}

function buildContextChoiceRow(guildId, context, guild) {
  const mainRow = context === 'reinstall'
    ? new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(SETUP_INTEGRATE_BUTTON_ID).setLabel(t(guildId, 'setup.contextKeepButton')).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(SETUP_RESET_BUTTON_ID).setLabel(t(guildId, 'setup.contextResetButton')).setStyle(ButtonStyle.Danger)
      )
    : new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(SETUP_INTEGRATE_BUTTON_ID).setLabel(t(guildId, 'setup.contextIntegrateButton')).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(SETUP_FRESH_START_BUTTON_ID).setLabel(t(guildId, 'setup.contextFreshButton')).setStyle(ButtonStyle.Secondary)
      );
  const rows = [mainRow];
  if (guild) {
    const hasExtraChannels = guild.channels.cache.some((c) => c.type !== 4 && !Object.values(CHANNELS).includes(c.name));
    const hasExtraRoles = guild.roles.cache.some((r) => r.id !== guild.roles.everyone.id && !r.managed);
    if (hasExtraChannels || hasExtraRoles) {
      const cleanButtons = [];
      const hasOrphanVoice = guild.channels.cache.some((c) => c.type === ChannelType.GuildVoice && !Object.values(CHANNELS).includes(c.name));
      if (hasOrphanVoice) {
        cleanButtons.push(
          new ButtonBuilder()
            .setCustomId(SETUP_CLEAN_VOCALS_BUTTON_ID)
            .setLabel('🎙️ Supprimer les vocaux inutiles')
            .setStyle(ButtonStyle.Secondary)
        );
      }
      if (hasExtraRoles) {
        cleanButtons.push(
          new ButtonBuilder()
            .setCustomId(SETUP_CLEAN_ROLES_BUTTON_ID)
            .setLabel('🏷️ Supprimer les rôles inutiles')
            .setStyle(ButtonStyle.Secondary)
        );
      }
      cleanButtons.push(
        new ButtonBuilder()
          .setCustomId(SETUP_CLEAN_SERVER_BUTTON_ID)
          .setLabel('🗑️ Tout nettoyer')
          .setStyle(ButtonStyle.Danger)
      );
      rows.push(new ActionRowBuilder().addComponents(...cleanButtons));
    }
  }
  return rows;
}

async function handleSetupInstallButton(interaction) {
  if (!interaction.inGuild() || !interaction.guild) {
    await replyEphemeral(interaction, t(interaction.guildId, 'setup.inGuildOnly'));
    return;
  }

  const isOwner = interaction.user.id === interaction.guild.ownerId;
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);

  if (!isOwner && !isAdmin) {
    await replyEphemeral(interaction, t(interaction.guildId, 'setup.adminOnlyInstall'));
    return;
  }

  const guildId = interaction.guildId;

  if (!getGuildSetting(guildId, 'i18n', 'language', null) && interaction.locale) {
    const detectedLang = detectLanguageFromLocale(interaction.locale);
    if (detectedLang && detectedLang !== 'en') {
      setGuildLanguage(guildId, detectedLang);
      logger.info(`Guild ${guildId}: language auto-set to '${detectedLang}' from user locale '${interaction.locale}'`);
    }
  }

  const context = getInstallContext(interaction.guild);

  if (context === 'fresh') {
    await interaction.message.edit({
      content: [
        `✅ **${t(guildId, 'setup.freshTitle')}**`,
        t(guildId, 'setup.freshDesc')
      ].join('\n'),
      components: [buildFreshRow(guildId, interaction.guild)]
    });
    await interaction.deferUpdate().catch(() => {});
    return;
  }

  if (context === 'guardian_partial') {
    await interaction.message.edit({
      content: [
        `⏸️ **${t(guildId, 'setup.guardianPartialTitle')}**`,
        t(guildId, 'setup.guardianPartialDesc')
      ].join('\n'),
      components: [buildPartialRow(guildId)]
    });
    await interaction.deferUpdate().catch(() => {});
    return;
  }

  await interaction.message.edit({
    content: buildContextChoiceMessage(guildId, context),
    components: buildContextChoiceRow(guildId, context, interaction.guild)
  });
  await interaction.deferUpdate().catch(() => {});
}

async function handleSetupIntegrateButton(interaction) {
  if (!interaction.inGuild() || !interaction.guild) return;
  const guildId = interaction.guildId;
  try {
    const context = getInstallContext(interaction.guild);
    if (context === 'reinstall') {
      await interaction.deferUpdate().catch(() => {});
      await completeGuildSetup(interaction.guild);
      return;
    }
    autoMapRolesByName(interaction.guild);
    setGuildSetting(guildId, 'setup', 'step', 1);
    setGuildSetting(guildId, 'setup', 'grade_cursor', 0);
    setGuildSetting(guildId, 'setup', 'roles_auto_created', false);
    const { startWizardInChannel } = require('./setupFlow');
    await startWizardInChannel(interaction);
  } catch (error) {
    logger.error('Failed setup integrate', error);
    if (interaction.isRepliable()) await replyEphemeral(interaction, t(guildId, 'setup.installError'));
  }
}

async function handleSetupResetButton(interaction) {
  if (!interaction.inGuild() || !interaction.guild) return;
  const guildId = interaction.guildId;
  try {
    const savedLanguage = getGuildLanguage(guildId);
    const db = getDb();
    db.prepare('DELETE FROM guild_config WHERE guild_id = ?').run(guildId);
    db.prepare('DELETE FROM grades WHERE guild_id = ?').run(guildId);
    db.prepare('UPDATE guilds SET setup_done = 0 WHERE guild_id = ?').run(guildId);
    if (savedLanguage) setGuildLanguage(guildId, savedLanguage);
    setGuildSetting(guildId, 'setup', 'fresh_install', true);

    const { getInstallContext } = require('./detectInstallContext');
    const context = getInstallContext(interaction.guild);

    if (context === 'existing_server') {
      await interaction.message.edit({
        content: buildContextChoiceMessage(guildId, 'existing_server'),
        components: buildContextChoiceRow(guildId, 'existing_server', interaction.guild)
      });
      await interaction.deferUpdate().catch(() => {});
    } else {
      const { startWizardInChannel } = require('./setupFlow');
      await startWizardInChannel(interaction);
    }
  } catch (error) {
    logger.error('Failed setup reset', error);
    if (interaction.isRepliable()) await replyEphemeral(interaction, t(guildId, 'setup.installError'));
  }
}

function finalizeInstall(guild) {
  markGuildInstalled(guild.id, guild.ownerId);
}

async function cleanupSetupAreaIfInstalled(guild) {
  try {
    await cleanupSetupArea(guild);
  } catch (err) {
    logger.warn(`cleanupSetupAreaIfInstalled failed for guild ${guild.id}: ${err.message}`);
  }
}

async function cleanupSetupArea(guild) {
  await guild.channels.fetch().catch(() => {});
  const setupCategory = findCategoryByName(guild, CATEGORIES.setup);
  if (!setupCategory) {
    return;
  }

  const children = guild.channels.cache.filter((channel) => channel.parentId === setupCategory.id);
  for (const child of children.values()) {
    await child.delete('Guardian setup finalised').catch((error) => {
      logger.error('Failed to remove setup child channel', error);
    });
  }

  await setupCategory.delete('Guardian setup finalised').catch((error) => {
    logger.error('Failed to remove setup category', error);
  });

  const guardianCatNames = new Set(Object.values(CATEGORIES));
  const remaining = guild.channels.cache.filter((c) => c.type === 4);
  for (const cat of remaining.values()) {
    if (guardianCatNames.has(cat.name)) continue;
    const hasChildren = guild.channels.cache.some((c) => c.parentId === cat.id);
    if (!hasChildren) {
      await cat.delete('Guardian setup — catégorie vide orpheline').catch(() => {});
    }
  }
}

async function postSetupSummary(guild) {
  const welcomeChannel = findGuildTextChannelByName(guild, CHANNELS.welcome);
  if (!welcomeChannel?.isTextBased?.()) {
    return;
  }

  const guildId = guild.id;
  const delayHours = Number(getGuildSetting(guildId, 'members', 'promotion_delay_hours', 48));

  const gradeMappings = getGradeMappings(guildId);
  const gradeLines = Object.entries(gradeMappings)
    .filter(([, roleId]) => roleId)
    .map(([grade, roleId]) => {
      const role = guild.roles.cache.get(roleId);
      return role ? `  • **${grade}** → <@&${role.id}>` : null;
    })
    .filter(Boolean);

  const db = getDb();
  const games = db.prepare('SELECT name, steam_app_id FROM games WHERE guild_id = ?').all(guildId);
  const gameLines = games.map((g) => `  • **${g.name}**${g.steam_app_id ? ` (Steam \`#${g.steam_app_id}\`)` : ' *(non-Steam)*'}`);

  const suggestionsEnabled = Boolean(getGuildSetting(guildId, 'channels', 'suggestions_enabled', true));
  const serverListEnabled = Boolean(getGuildSetting(guildId, 'channels', 'server_list_enabled', false));
  const changelogEnabled = Boolean(getGuildSetting(guildId, 'channels', 'game_updates_enabled', true));
  const bioRequired = Boolean(getGuildSetting(guildId, 'members', 'bio_required', false));
  const sponsorRequired = Boolean(getGuildSetting(guildId, 'members', 'sponsorship_required', false));

  const modulesLines = [
    `  • Suggestions : ${suggestionsEnabled ? '✅' : '❌'}`,
    `  • Liste de serveurs : ${serverListEnabled ? '✅' : '❌'}`,
    `  • Changelogs Steam : ${changelogEnabled ? '✅' : '❌'}`,
    `  • Bio obligatoire : ${bioRequired ? '✅' : '❌'}`,
    `  • Parrainage obligatoire : ${sponsorRequired ? '✅' : '❌'}`,
  ];

  const configChannel = guild.channels.cache.find((c) => c.name === CHANNELS.guardianConfig);
  const configMention = configChannel ? `<#${configChannel.id}>` : `\`#${CHANNELS.guardianConfig}\``;

  const lines = [
    `# 🎉 Guardian est maintenant actif sur **${guild.name}** !`,
    '',
    `> Setup terminé — voici un récapitulatif de ta configuration.`,
    '',
    `## 👥 Grades configurés`,
    gradeLines.length > 0 ? gradeLines.join('\n') : '  *(aucun grade mappé)*',
    `> Les invités peuvent demander à devenir Membre après **${delayHours}h**.`,
    '',
  ];

  if (gameLines.length > 0) {
    lines.push(`## 🎮 Jeux enregistrés (${games.length})`, gameLines.join('\n'), '');
  }

  lines.push(
    `## ⚙️ Modules`,
    modulesLines.join('\n'),
    '',
    `## 📋 Prochaines étapes`,
    `  1️⃣ Va dans \`#règles\` et personnalise le règlement du serveur`,
    `  2️⃣ Va dans \`#faq\` et complète les questions fréquentes`,
    `  3️⃣ Configure les permissions détaillées dans ${configMention}`,
    `  4️⃣ Utilise \`/help\` pour découvrir toutes les commandes disponibles`,
    '',
    `*Pour modifier la configuration à tout moment, utilise ${configMention}.*`
  );

  await welcomeChannel.send({ content: lines.join('\n') }).catch((err) =>
    logger.warn(`[postSetupSummary] Could not send to #bienvenue: ${err?.message}`)
  );
}

async function seedExistingMembers(guild) {
  const db = getDb();
  const roleMap = getGradeMappings(guild.id);
  const invertedMap = {};
  for (const [gradeName, roleId] of Object.entries(roleMap)) {
    if (roleId) invertedMap[roleId] = gradeName;
  }

  const members = await guild.members.fetch().catch(() => null);
  if (!members) return;

  const insert = db.prepare(
    `INSERT OR IGNORE INTO members (guild_id, user_id, grade, join_date, score_comportement)
     VALUES (?, ?, ?, ?, ?)`
  );

  for (const member of members.values()) {
    if (member.user.bot) continue;
    let grade = GRADE_NAMES.invite;
    for (const [roleId, gradeName] of Object.entries(invertedMap)) {
      if (member.roles.cache.has(roleId)) {
        grade = gradeName;
        break;
      }
    }
    insert.run(
      guild.id,
      member.id,
      grade,
      member.joinedAt?.toISOString() || new Date().toISOString(),
      200
    );
  }
}

const LINKED_CHANNEL_MAP = [
  { settingSection: 'channels', settingKey: 'general_channel_id',         targetName: CHANNELS.general,       targetCategory: CATEGORIES.communaute,   type: 'text'  },
  { settingSection: 'channels', settingKey: 'rules_channel_id',            targetName: CHANNELS.rules,         targetCategory: null, type: 'text'  },
  { settingSection: 'channels', settingKey: 'announcements_channel_id',    targetName: CHANNELS.annonces,      targetCategory: null, type: 'text'  },
  { settingSection: 'channels', settingKey: 'faq_channel_id',              targetName: CHANNELS.faq,           targetCategory: null, type: 'text'  },
  { settingSection: 'channels', settingKey: 'welcome_channel_id',          targetName: CHANNELS.welcome,       targetCategory: null, type: 'text'  },
  { settingSection: 'channels', settingKey: 'voice_general_id',            targetName: CHANNELS.voiceGeneral,  targetCategory: CATEGORIES.vocaux,        type: 'voice' },
  { settingSection: 'channels', settingKey: 'voice_afk_id',                targetName: CHANNELS.voiceAfk,      targetCategory: CATEGORIES.vocaux,        type: 'voice' },
  { settingSection: 'channels', settingKey: 'moderation_logs_channel_id',   targetName: CHANNELS.moderation,        targetCategory: CATEGORIES.moderation, type: 'text'  },
  { settingSection: 'channels', settingKey: 'validation_channel_id',        targetName: CHANNELS.validation,        targetCategory: CATEGORIES.moderation, type: 'text'  },
  { settingSection: 'channels', settingKey: 'security_updates_channel_id', targetName: CHANNELS.securityUpdates,   targetCategory: CATEGORIES.moderation, type: 'text', customPerms: true }
];

const DEFAULT_DISCORD_CATEGORIES = [
  'Text Channels', 'Voice Channels', 'Salons vocaux', 'Salons textuels'
];

const DEFAULT_DISCORD_ORPHAN_CHANNELS = [
  'update-safety', 'safety-updates'
];

async function adoptLinkedChannels(guild) {
  const guildId = guild.id;
  await guild.channels.fetch().catch(() => {});

  for (const mapping of LINKED_CHANNEL_MAP) {
    const channelId = getGuildSetting(guildId, mapping.settingSection, mapping.settingKey, null);
    if (!channelId) continue;

    const channel = guild.channels.cache.get(channelId);
    if (!channel) continue;

    const targetCategoryId = mapping.targetCategory
      ? (findCategoryByName(guild, mapping.targetCategory)?.id ?? null)
      : null;
    if (mapping.targetCategory && !targetCategoryId) continue;

    const alreadyCorrect = channel.parentId === targetCategoryId && channel.name === mapping.targetName;
    if (alreadyCorrect) continue;

    try {
      const editPayload = {
        name: mapping.targetName,
        parent: targetCategoryId
      };
      if (mapping.customPerms) {
        const roleMap = getGradeMappings(guildId);
        editPayload.lockPermissions = false;
        editPayload.permissionOverwrites = buildConfigPermissions(guild, roleMap, guild.ownerId, GRADE_NAMES.manager);
      } else {
        editPayload.lockPermissions = true;
      }
      await channel.edit(editPayload);
    } catch (err) {
      logger.error(`adoptLinkedChannels: failed to migrate channel ${channelId}`, err);
    }
  }

  for (const orphanName of DEFAULT_DISCORD_ORPHAN_CHANNELS) {
    const ch = guild.channels.cache.find((c) => c.name === orphanName && !c.parentId);
    if (ch) await ch.delete('Guardian setup — channel système Discord non utilisé').catch(() => {});
  }

  for (const catName of DEFAULT_DISCORD_CATEGORIES) {
    const cat = findCategoryByName(guild, catName);
    if (!cat) continue;
    await guild.channels.fetch().catch(() => {});
    const children = guild.channels.cache.filter((c) => c.parentId === cat.id);
    if (children.size === 0) {
      await cat.delete('Guardian setup — catégorie Discord par défaut vide').catch(() => {});
    }
  }
}

async function completeGuildSetup(guild) {
  const owner = await safeDiscordAction(
    () => guild.fetchOwner(),
    `completeGuildSetup:fetchOwner:${guild.id}`
  );
  await adoptLinkedChannels(guild);
  await safeDiscordAction(
    () => runSetupInstallationPhases(guild, owner?.id),
    `completeGuildSetup:runSetupInstallationPhases:${guild.id}`
  );
  await seedExistingMembers(guild);
  await safeDiscordAction(
    () => postSetupSummary(guild),
    `completeGuildSetup:postSetupSummary:${guild.id}`,
    { silent: true }
  );
  await safeDiscordAction(
    () => cleanupSetupArea(guild),
    `completeGuildSetup:cleanupSetupArea:${guild.id}`,
    { silent: true }
  );
  await seedGuildMessages(guild).catch((err) => logger.error(`completeGuildSetup: seedGuildMessages failed for ${guild.id}`, err));
}

async function handleSetupForceExistingButton(interaction) {
  if (!interaction.inGuild() || !interaction.guild) return;
  const guildId = interaction.guildId;
  await interaction.message.edit({
    content: buildContextChoiceMessage(guildId, 'existing_server'),
    components: buildContextChoiceRow(guildId, 'existing_server', interaction.guild)
  });
  await interaction.deferUpdate().catch(() => {});
}

async function handleSetupCleanServerButton(interaction) {
  if (!interaction.inGuild() || !interaction.guild) return;
  const guildId = interaction.guildId;
  const guild = interaction.guild;
  const channelCount = guild.channels.cache.filter((c) => c.type !== 4 && !Object.values(CHANNELS).includes(c.name)).size;
  const roleCount = guild.roles.cache.filter((r) => r.id !== guild.roles.everyone.id && !r.managed).size;
  const modal = new ModalBuilder()
    .setCustomId(SETUP_CLEAN_MODAL_ID)
    .setTitle('⚠️ Nettoyer le serveur')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('confirm_input')
          .setLabel(`Tape SUPPRIMER pour confirmer (${channelCount} channels, ${roleCount} rôles)`)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('SUPPRIMER')
          .setRequired(true)
          .setMaxLength(20)
      )
    );
  await interaction.showModal(modal).catch(() => {});
}

async function handleSetupCleanModal(interaction) {
  if (!interaction.inGuild() || !interaction.guild) return;
  const guildId = interaction.guildId;
  const guild = interaction.guild;
  const value = interaction.fields.getTextInputValue('confirm_input')?.trim();
  if (value?.toUpperCase() !== 'SUPPRIMER') {
    await interaction.reply({ content: '❌ Confirmation incorrecte — suppression annulée.', ephemeral: true }).catch(() => {});
    return;
  }
  await interaction.deferReply({ ephemeral: true }).catch(() => {});
  let deleted = 0;
  const protectedNames = new Set(Object.values(CHANNELS));
  for (const channel of [...guild.channels.cache.values()]) {
    if (protectedNames.has(channel.name)) continue;
    await channel.delete('Guardian: nettoyage serveur demandé par admin').catch(() => {});
    deleted++;
  }
  const managedRoleIds = new Set(
    guild.roles.cache.filter((r) => r.managed).map((r) => r.id)
  );
  for (const role of [...guild.roles.cache.values()]) {
    if (role.id === guild.roles.everyone.id) continue;
    if (managedRoleIds.has(role.id)) continue;
    await role.delete('Guardian: nettoyage serveur demandé par admin').catch(() => {});
    deleted++;
  }
  await guild.channels.fetch().catch(() => {});
  logger.info(`Guild ${guildId}: server cleaned — ${deleted} items deleted`);
  const { startWizardInChannel } = require('./setupFlow');
  await interaction.editReply({ content: `✅ Serveur nettoyé — ${deleted} éléments supprimés. Le wizard va démarrer.` }).catch(() => {});
  const setupCategory = findCategoryByName(guild, CATEGORIES.setup);
  const setupChannel = setupCategory
    ? guild.channels.cache.find((c) => c.parentId === setupCategory.id && c.isTextBased?.())
    : null;
  if (setupChannel) {
    const fakeInteraction = Object.assign(Object.create(Object.getPrototypeOf(interaction)), interaction, {
      channel: setupChannel,
      message: await setupChannel.messages.fetch({ limit: 1 }).then((msgs) => msgs.first()).catch(() => null)
    });
    if (fakeInteraction.message) await startWizardInChannel(fakeInteraction).catch(() => {});
  }
}

async function handleSetupForceReinstallButton(interaction) {
  if (!interaction.inGuild() || !interaction.guild) return;
  const guildId = interaction.guildId;
  await interaction.message.edit({
    content: buildContextChoiceMessage(guildId, 'reinstall'),
    components: buildContextChoiceRow(guildId, 'reinstall', interaction.guild)
  });
  await interaction.deferUpdate().catch(() => {});
}

async function handleSetupCleanVocalsButton(interaction) {
  if (!interaction.inGuild() || !interaction.guild) return;
  const guildId = interaction.guildId;
  const guild = interaction.guild;
  await interaction.deferReply({ ephemeral: true }).catch(() => {});
  const protectedNames = new Set([CHANNELS.voiceGeneral, CHANNELS.voiceAfk]);
  let deleted = 0;
  for (const channel of [...guild.channels.cache.values()]) {
    if (channel.type !== ChannelType.GuildVoice) continue;
    if (protectedNames.has(channel.name)) continue;
    await channel.delete('Guardian: suppression des salons vocaux inutiles').catch(() => {});
    deleted++;
  }
  await guild.channels.fetch().catch(() => {});
  logger.info(`Guild ${guildId}: ${deleted} voice channels cleaned`);
  await interaction.editReply({ content: `✅ ${deleted} salon(s) vocal(aux) supprimé(s). Seuls **${CHANNELS.voiceGeneral}** et **${CHANNELS.voiceAfk}** sont conservés.` }).catch(() => {});
}

async function handleSetupCleanRolesButton(interaction) {
  if (!interaction.inGuild() || !interaction.guild) return;
  const guildId = interaction.guildId;
  const guild = interaction.guild;
  await interaction.deferReply({ ephemeral: true }).catch(() => {});
  const managedRoleIds = new Set(guild.roles.cache.filter((r) => r.managed).map((r) => r.id));
  let deleted = 0;
  for (const role of [...guild.roles.cache.values()]) {
    if (role.id === guild.roles.everyone.id) continue;
    if (managedRoleIds.has(role.id)) continue;
    await role.delete('Guardian: suppression des rôles inutiles').catch(() => {});
    deleted++;
  }
  logger.info(`Guild ${guildId}: ${deleted} roles cleaned`);
  await interaction.editReply({ content: `✅ ${deleted} rôle(s) supprimé(s).` }).catch(() => {});
}

module.exports = {
  SETUP_INSTALL_BUTTON_ID,
  SETUP_LANGUAGE_SELECT_ID,
  SETUP_START_BUTTON_ID,
  SETUP_FRESH_START_BUTTON_ID,
  SETUP_INTEGRATE_BUTTON_ID,
  SETUP_RESET_BUTTON_ID,
  SETUP_FORCE_EXISTING_BUTTON_ID,
  SETUP_FORCE_REINSTALL_BUTTON_ID,
  SETUP_CLEAN_SERVER_BUTTON_ID,
  SETUP_CLEAN_MODAL_ID,
  SETUP_CLEAN_VOCALS_BUTTON_ID,
  SETUP_CLEAN_ROLES_BUTTON_ID,
  createSetupArea,
  ensureSetupInstallPrompt,
  cleanupSetupAreaIfInstalled,
  repositionHiddenChannels,
  finalizeInstall,
  completeGuildSetup,
  handleSetupLanguageSelection,
  handleSetupInstallButton,
  handleSetupIntegrateButton,
  handleSetupResetButton,
  handleSetupForceExistingButton,
  handleSetupForceReinstallButton,
  handleSetupCleanServerButton,
  handleSetupCleanModal,
  handleSetupCleanVocalsButton,
  handleSetupCleanRolesButton
};
