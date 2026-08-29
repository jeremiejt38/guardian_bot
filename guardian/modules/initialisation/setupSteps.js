'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const { GRADE_NAMES, CHANNELS } = require('../../config');
const { getGuildSetting, setGuildSetting } = require('../config/settings');
const logger = require('../logs/logger');
const {
  ORDERED_GRADES,
  REQUIRED_GRADES,
  getGradeMappings,
} = require('./gradeMapping');
const { listSetupGames, addSetupGame } = require('./setupGames');
const _gd = require('./setupGamesDetect');
const { t } = require('../../locales');
const { isPremiumFeatureEnabled, buildPremiumLockButton } = require('../tier/premiumGateUI');
// @premium-start
const {
  AFK_TIMEOUT_LABELS,
  getAfkConfig,
  getLocaleConfig,
  getAutoModConfig,
  fetchOnboardingState,
} = require('./discordSettings');
// @premium-end

// ─── Step 1 helpers ──────────────────────────────────────────────────────────

function buildStepOneContent(guildId, guild, { TOTAL_STEPS, gradeLabel, getGradeCursor, getRolesAutoCreated, hasMapableRoles, getGradeRenameMap, isCommunityGuild }) {
  const mappings = getGradeMappings(guildId);
  const autoCreated = getRolesAutoCreated(guildId);
  const noRoles = !hasMapableRoles(guild);
  const { version } = require('../../package.json');
  const isCommunity = isCommunityGuild(guild);
  const lines = [
    `## ${t('setup.step1Title', {}, { guildId })} (1/${TOTAL_STEPS}) — Guardian v${version}`
  ];

  if (!isCommunity) {
    lines.push(
      '',
      '> ⚠️ **Mode Communauté requis** — Ce serveur n\'est pas un serveur Community Discord.',
      '> Les channels `#règles`, `#logs-modération` et `#maj-sécurité` nécessitent le mode Communauté.',
      '> Active-le dans *Paramètres du serveur → Communauté* pour débloquer toutes les fonctionnalités.'
    );
  }

  const GRADE_DESCS = {
    invite:     '👤 Nouveau venu — accès limité, en attente de validation',
    membre:     '✅ Membre validé — accès complet aux channels communautaires',
    moderateur: '🛡️ Modérateur — peut sanctionner et gérer les membres',
    manager:    '⚙️ Manager — accès à la configuration Guardian',
    owner:      '👑 Owner — tous les droits, propriétaire du serveur Guardian'
  };
  if (autoCreated) {
    const renameMap = getGradeRenameMap(guildId);
    lines.push(t('setup.step1RenameDesc', {}, { guildId }));
    lines.push('');
    for (const grade of ORDERED_GRADES) {
      const roleId = mappings[grade];
      const roleName = renameMap[grade] || gradeLabel(grade);
      const roleExists = roleId && guild?.roles?.cache?.get(roleId);
      lines.push(`🏷️ **${gradeLabel(grade)}** → \`${roleName}\`` + (roleExists ? ` <@&${roleId}>` : ''));
      lines.push(`> ${GRADE_DESCS[grade] || ''}`);
    }
  } else if (noRoles) {
    lines.push(t('setup.step1NoRolesDesc', {}, { guildId }));
    lines.push('');
    for (const [grade, desc] of Object.entries(GRADE_DESCS)) {
      lines.push(`${desc}`);
    }
  } else {
    const cursor = getGradeCursor(guildId);
    const currentGrade = ORDERED_GRADES[cursor];
    const inviteMode = getGuildSetting(guildId, 'setup', 'invite_mode', 'classic');
    const inviteModeLabel = { classic: '👤 Classique', strict: '🔒 Strict', direct: '🚀 Membre direct' }[inviteMode] ?? 'Classique';
    const inviteModeDesc = {
      classic: 'Les invités voient les channels mais ont un accès limité.',
      strict: 'Les invités n\'ont accès qu\'à #devenir-membre et #rejoindre. Vocal et #general réservés aux Membres.',
      direct: 'Pas de grade Invité — toute nouvelle personne est directement Membre.'
    }[inviteMode];
    lines.push(t('setup.step1Instructions', {}, { guildId }));
    lines.push(`> Mode invité : **${inviteModeLabel}** — ${inviteModeDesc}`);
    lines.push(`> ${t('setup.step1CurrentGrade', { grade: gradeLabel(currentGrade) }, { guildId })}`);
    lines.push(`> ${GRADE_DESCS[currentGrade] || ''}`);
    lines.push('');
    const summary = ORDERED_GRADES.map((grade) => {
      const roleId = mappings[grade];
      const roleExists = roleId && guild?.roles?.cache?.get(roleId);
      const required = REQUIRED_GRADES.includes(grade);
      const marker = roleExists ? '✅' : '❌';
      const roleText = roleExists ? `<@&${roleId}>` : (required ? '*obligatoire* ‼️' : '*optionnel*');
      return `${marker} **${gradeLabel(grade)}** → ${roleText}`;
    }).join('\n');
    lines.push(summary);
  }

  return lines.join('\n');
}

function buildStepOneComponents(guildId, guild, { CUSTOM_IDS, gradeLabel, getGradeCursor, getRolesAutoCreated, hasMapableRoles, buildRoleOptions, buildNavRow }) {
  const noRoles = !hasMapableRoles(guild);
  if (getRolesAutoCreated(guildId)) {
    const rows = [];
    for (let i = 0; i < ORDERED_GRADES.length; i += 3) {
      const slice = ORDERED_GRADES.slice(i, i + 3);
      const row = new ActionRowBuilder().addComponents(
        slice.map((grade) =>
          new ButtonBuilder()
            .setCustomId(`${CUSTOM_IDS.renameGradePrefix}:${grade}`)
            .setStyle(ButtonStyle.Secondary)
            .setLabel(`✏️ ${gradeLabel(grade)}`)
        )
      );
      rows.push(row);
    }
    rows.push(buildNavRow(guildId, 1));
    return rows;
  }

  if (noRoles) {
    const inviteModeFresh = getGuildSetting(guildId, 'setup', 'invite_mode', 'classic');
    const autoRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(CUSTOM_IDS.createRolesAll)
        .setStyle(ButtonStyle.Primary)
        .setLabel(t('setup.step1CreateRolesAuto', {}, { guildId }))
    );
    const inviteModeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(CUSTOM_IDS.cycleInviteMode)
        .setStyle({ classic: ButtonStyle.Secondary, strict: ButtonStyle.Danger, direct: ButtonStyle.Success }[inviteModeFresh] ?? ButtonStyle.Secondary)
        .setLabel({ classic: '👤 Invité: Classique', strict: '🔒 Invité: Strict', direct: '🚀 Invité: Direct' }[inviteModeFresh] ?? '👤 Invité: Classique')
    );
    return [autoRow, inviteModeRow, buildNavRow(guildId, 1)];
  }

  const mappings = getGradeMappings(guildId);
  const cursor = getGradeCursor(guildId);
  const currentGrade = ORDERED_GRADES[cursor];
  const selectedRoleId = mappings[currentGrade];
  const roleOptions = buildRoleOptions(guild, selectedRoleId);

  const effectiveOptions = roleOptions.length > 0
    ? roleOptions
    : [{ label: 'Aucun rôle disponible', value: 'none' }];

  const currentRoleName = selectedRoleId ? guild.roles.cache.get(selectedRoleId)?.name : null;
  const placeholder = currentRoleName
    ? `${gradeLabel(currentGrade)} → ${currentRoleName} (changer ?)`
    : t('setup.selectRolePlaceholder', { grade: gradeLabel(currentGrade) }, { guildId });

  const roleSelector = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${CUSTOM_IDS.selectRolePrefix}:${currentGrade}`)
      .setPlaceholder(placeholder.slice(0, 150))
      .setMinValues(1).setMaxValues(1)
      .setDisabled(roleOptions.length === 0)
      .addOptions(effectiveOptions)
  );

  const gradeNavigation = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.previousGrade)
      .setStyle(ButtonStyle.Secondary)
      .setLabel('◀ Grade préc.')
      .setDisabled(cursor === 0),
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.nextGrade)
      .setStyle(ButtonStyle.Secondary)
      .setLabel('Grade suiv. ▶')
      .setDisabled(cursor >= ORDERED_GRADES.length - 1)
  );

  const inviteMode = getGuildSetting(guildId, 'setup', 'invite_mode', 'classic');
  const inviteModeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.cycleInviteMode)
      .setStyle({ classic: ButtonStyle.Secondary, strict: ButtonStyle.Danger, direct: ButtonStyle.Success }[inviteMode] ?? ButtonStyle.Secondary)
      .setLabel({ classic: '👤 Invité: Classique', strict: '🔒 Invité: Strict', direct: '🚀 Invité: Direct' }[inviteMode] ?? '👤 Invité: Classique')
  );

  const cursor2 = getGradeCursor(guildId);
  const currentGradeForCreate = ORDERED_GRADES[cursor2];
  const alreadyMappedRoleId = mappings[currentGradeForCreate];
  const alreadyMappedRoleExists = alreadyMappedRoleId && guild?.roles?.cache?.get(alreadyMappedRoleId);
  const autoCreateRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.createRolesAuto)
      .setStyle(ButtonStyle.Primary)
      .setLabel(`✨ Créer le rôle « ${gradeLabel(currentGradeForCreate)} »`)
      .setDisabled(Boolean(alreadyMappedRoleExists))
  );

  return [roleSelector, gradeNavigation, inviteModeRow, autoCreateRow, buildNavRow(guildId, 1)];
}

// ─── Step 2 helpers ──────────────────────────────────────────────────────────

function getStep2Config(guildId) {
  return {
    suggestionsEnabled: Boolean(getGuildSetting(guildId, 'channels', 'suggestions_enabled', true)),
    serverListEnabled: Boolean(getGuildSetting(guildId, 'channels', 'server_list_enabled', false)),
    statusBotEnabled: Boolean(getGuildSetting(guildId, 'channels', 'status_bot_enabled', true)),
    afkEnabled: Boolean(getGuildSetting(guildId, 'channels', 'afk_enabled', true)),
    gameUpdatesEnabled: Boolean(getGuildSetting(guildId, 'channels', 'game_updates_enabled', true)),
    guidesEnabled: Boolean(getGuildSetting(guildId, 'guides', 'enabled', true))
  };
}

function setStep2Config(guildId, config) {
  setGuildSetting(guildId, 'channels', 'suggestions_enabled', config.suggestionsEnabled);
  setGuildSetting(guildId, 'channels', 'server_list_enabled', config.serverListEnabled);
  setGuildSetting(guildId, 'channels', 'status_bot_enabled', config.statusBotEnabled);
  setGuildSetting(guildId, 'channels', 'afk_enabled', config.afkEnabled);
  setGuildSetting(guildId, 'channels', 'game_updates_enabled', config.gameUpdatesEnabled);
  setGuildSetting(guildId, 'guides', 'enabled', config.guidesEnabled);
}

// @premium-start
const SYSCHANNEL_CHOICES = ['disabled', 'general', 'keep'];
const SYSCHANNEL_LABELS = { disabled: '🔕 Désactivé', general: '📢 #general', keep: '📌 Garder actuel' };
// @premium-end

function buildStep2Content(guildId, guild, { TOTAL_STEPS, onOff: _onOff }) {
  const c = getStep2Config(guildId);
  const dot = (v) => v ? '🟢 Actif' : '🔴 Inactif';

  // @premium-start
  const afkCfg = getAfkConfig(guildId, guild);
  const afkTimeoutLabel = AFK_TIMEOUT_LABELS[afkCfg.timeout] ?? `${afkCfg.timeout}s`;
  const afkChannelMention = afkCfg.channelId && guild?.channels?.cache?.get(afkCfg.channelId)
    ? `<#${afkCfg.channelId}>`
    : (c.afkEnabled ? '*sera créé par Guardian*' : '*désactivé*');

  const syschanChoice = getGuildSetting(guildId, 'discord', 'system_channel_choice', 'keep');
  const syschanLabel = SYSCHANNEL_LABELS[syschanChoice] ?? SYSCHANNEL_LABELS.keep;
  const currentSyschan = guild?.systemChannelId && guild.channels.cache.get(guild.systemChannelId);
  const syschanCurrent = currentSyschan ? `actuellement <#${guild.systemChannelId}>` : 'actuellement désactivé';

  const locale = getLocaleConfig(guildId, guild);
  const localeStatus = locale.inSync
    ? `✅ En accord avec Discord (${locale.discordLocale})`
    : `⚠️ Discord : \`${locale.discordLocale}\` ≠ Guardian : \`${locale.guardianLang}\``;
  // @premium-end

  return [
    `## ${t('setup.step2Title', {}, { guildId })} (2/${TOTAL_STEPS})`,
    t('setup.step2Instructions', {}, { guildId }),
    '',
    '### Modules Guardian',
    `💡 **Suggestions** — ${dot(c.suggestionsEnabled)}`,
    '> Les membres peuvent soumettre des idées et voter via un forum dédié.',
    '',
    `🖥️ **Liste de serveurs** — ${dot(c.serverListEnabled)}`,
    '> Affiche les serveurs de jeu approuvés par la communauté.',
    '',
    `🤖 **Statut du bot** — ${dot(c.statusBotEnabled)}`,
    '> Message automatique affichant l\'uptime et la version de Guardian.',
    '',
    `🔇 **Vocal AFK** — ${dot(c.afkEnabled)}`,
    '> Salon où Discord déplace automatiquement les membres inactifs.',
    '',
    `📢 **Game Updates** — ${dot(c.gameUpdatesEnabled)}`,
    '> Publie les changelogs Steam des jeux configurés dans un channel dédié.',
    '',
    `📚 **Guides** — ${dot(c.guidesEnabled)}`,
    '> Génère une catégorie de guides de serveur (démarrage, promotion, parrainage, jeux, commandes).',
    '',
    isPremiumFeatureEnabled(guildId)
      ? [
          '### ⚙️ Paramètres Discord',
          `🔇 **Canal AFK** — ${afkChannelMention} — délai : **${afkTimeoutLabel}**`,
          '> Guardian applique ce délai dans les paramètres Discord. Change le délai avec le bouton ci-dessous.',
          '',
          `📣 **Notifications système** — ${syschanLabel} *(${syschanCurrent})*`,
          '> Messages Discord de bienvenue/boost. Choisir le canal ou désactiver.',
          '',
          `🌐 **Langue du serveur** — ${localeStatus}`,
          '> Si différentes, Guardian peut synchroniser la langue Discord avec ton choix Guardian.'
        ].join('\n')
      : '### 🔒 Paramètres Discord avancés\nCes options sont réservées à **Guardian Premium**.\nCliquez sur le bouton ci-dessous pour en savoir plus.'
  ].join('\n');
}

function buildStep2Components(guildId, guild, { CUSTOM_IDS, buildNavRow }) {
  const c = getStep2Config(guildId);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(CUSTOM_IDS.toggleSuggestions).setStyle(c.suggestionsEnabled ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setLabel('💡 Suggestions'),
    new ButtonBuilder().setCustomId(CUSTOM_IDS.toggleServerList).setStyle(c.serverListEnabled ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setLabel('🖥️ Serveurs'),
    new ButtonBuilder().setCustomId(CUSTOM_IDS.toggleStatusBot).setStyle(c.statusBotEnabled ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setLabel('🤖 Statut')
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(CUSTOM_IDS.toggleAfk).setStyle(c.afkEnabled ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setLabel('🔇 AFK'),
    new ButtonBuilder().setCustomId(CUSTOM_IDS.toggleGameUpdates).setStyle(c.gameUpdatesEnabled ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setLabel('🎮 Game Updates'),
    new ButtonBuilder().setCustomId(CUSTOM_IDS.toggleGuides).setStyle(c.guidesEnabled ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setLabel('📚 Guides')
  );
  const discordRow = isPremiumFeatureEnabled(guildId)
    ? (() => {
        // @premium-start
        const afkCfg = getAfkConfig(guildId, guild);
        const afkTimeoutLabel = AFK_TIMEOUT_LABELS[afkCfg.timeout] ?? `${afkCfg.timeout}s`;
        const syschanChoice = getGuildSetting(guildId, 'discord', 'system_channel_choice', 'keep');
        const locale = getLocaleConfig(guildId, guild);
        return new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(CUSTOM_IDS.cycleAfkTimeout)
            .setStyle(ButtonStyle.Secondary)
            .setLabel(`⏱️ AFK: ${afkTimeoutLabel}`)
            .setDisabled(!c.afkEnabled),
          new ButtonBuilder().setCustomId(CUSTOM_IDS.cycleSystemChannel)
            .setStyle(ButtonStyle.Secondary)
            .setLabel(`📣 Notifs: ${SYSCHANNEL_LABELS[syschanChoice] ?? '📌 Garder'}`),
          new ButtonBuilder().setCustomId(CUSTOM_IDS.syncLocale)
            .setStyle(locale.inSync ? ButtonStyle.Success : ButtonStyle.Primary)
            .setLabel(locale.inSync ? '🌐 Langue ✅' : '🌐 Sync langue')
            .setDisabled(locale.inSync)
        );
        // @premium-end
      })()
    : new ActionRowBuilder().addComponents(
        buildPremiumLockButton('discord_settings', 'Paramètres Discord avancés')
      );
  return [row, row2, discordRow, buildNavRow(guildId, 2)];
}

// ─── Step 3 helpers (channels) ───────────────────────────────────────────────

const CHANNEL_SLOTS = Object.freeze([
  { key: 'voiceGeneral',    label: 'Général',           desc: 'Salon vocal principal — Guardian y crée des rooms temporaires.',                                settingSection: 'channels', settingKey: 'voice_general_id',             emoji: '🔊', addedInVersion: '0.1.0' },
  { key: 'voiceAfk',       label: 'Vocal AFK',          desc: 'Salon vocal AFK — les membres inactifs y sont déplacés automatiquement.',                     settingSection: 'channels', settingKey: 'voice_afk_id',                  emoji: '🔇', addedInVersion: '0.1.0', moduleFlag: 'afkEnabled' },
  { key: 'general',        label: '#général',            desc: 'Channel de discussion principale de la communauté.',                                          settingSection: 'channels', settingKey: 'general_channel_id',            emoji: '💬', addedInVersion: '0.1.0' },
  { key: 'rules',          label: '#règles',             desc: 'Channel où le règlement du serveur est affiché.',                                             settingSection: 'channels', settingKey: 'rules_channel_id',              emoji: '📜', communityOnly: true,  addedInVersion: '0.1.0' },
  { key: 'moderationLogs', label: '#logs-modération',   desc: 'Channel modérateurs — logs Guardian. Correspond au "Moderator Only" Discord.',                 settingSection: 'channels', settingKey: 'moderation_logs_channel_id',    emoji: '🛡️', communityOnly: true,  addedInVersion: '0.1.0' },
  { key: 'securityUpdates', label: '#maj-securite',     desc: 'Channel mises à jour de sécurité Discord — visible manager et owner uniquement.',             settingSection: 'channels', settingKey: 'security_updates_channel_id',   emoji: '🔒', communityOnly: true,  addedInVersion: '0.1.0' },
  { key: 'announcements',  label: '#annonces',           desc: "Channel réservé aux annonces officielles de l'équipe. Guardian le crée si absent.",          settingSection: 'channels', settingKey: 'announcements_channel_id',      emoji: '📢', addedInVersion: '0.1.0' },
  { key: 'faq',            label: '#faq',                desc: 'Channel FAQ — Guardian le crée sous forme de forum si absent.',                               settingSection: 'channels', settingKey: 'faq_channel_id',                emoji: '❓', addedInVersion: '0.1.0' },
  { key: 'welcome',        label: '#bienvenue',          desc: 'Channel où Guardian accueille les nouveaux membres. Guardian le crée si absent.',             settingSection: 'channels', settingKey: 'welcome_channel_id',            emoji: '👋', addedInVersion: '0.1.0' },
]);

function getChannelCursor(guildId) {
  const cursor = getGuildSetting(guildId, 'setup', 'channel_cursor', 0);
  return Number.isInteger(cursor) ? Math.min(Math.max(cursor, 0), CHANNEL_SLOTS.length - 1) : 0;
}

function setChannelCursor(guildId, cursor) {
  const safe = Math.min(Math.max(cursor, 0), CHANNEL_SLOTS.length - 1);
  setGuildSetting(guildId, 'setup', 'channel_cursor', safe);
  return safe;
}

function isCommunityGuild(guild) {
  return guild?.features?.includes('COMMUNITY') ?? false;
}

function getActiveSlotsForInstall(guildId, guild, CHANNEL_SLOTS_ARG, isCommunityGuildFn) {
  const slots = CHANNEL_SLOTS_ARG || CHANNEL_SLOTS;
  const communityCheck = isCommunityGuildFn || isCommunityGuild;
  const config = getStep2Config(guildId);
  return slots.filter((s) => {
    if (s.communityOnly && !communityCheck(guild)) return false;
    if (s.moduleFlag && !config[s.moduleFlag]) return false;
    return true;
  });
}
function normalizeChannelName(name) {
  return name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function getCachedAutoDetectedChannels(guildId, guild, CHANNEL_SLOTS) {
  const raw = getGuildSetting(guildId, 'setup', 'auto_detected_channels', null);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch { /* cache invalide, on recalcule */ }
  }
  const detected = autoDetectGuardianChannels(guild, CHANNEL_SLOTS);
  setGuildSetting(guildId, 'setup', 'auto_detected_channels', JSON.stringify(detected));
  return detected;
}

function invalidateAutoDetectedChannels(guildId) {
  setGuildSetting(guildId, 'setup', 'auto_detected_channels', null);
}

function autoDetectGuardianChannels(guild, CHANNEL_SLOTS) {
  const detected = {};
  for (const slot of CHANNEL_SLOTS) {
    const isVoice = slot.key.startsWith('voice');
    const rawName = CHANNELS[slot.key] || slot.label;
    const targetNorm = normalizeChannelName(rawName);

    const candidates = [...guild.channels.cache.values()].filter((c) => {
      if (isVoice && !(c.isVoiceBased && c.isVoiceBased())) return false;
      if (!isVoice && !(c.isTextBased && c.isTextBased() && !c.isVoiceBased())) return false;
      return true;
    });

    let best = null;
    let bestScore = 0;
    for (const c of candidates) {
      const n = normalizeChannelName(c.name);
      let score = 0;
      if (n === targetNorm) score = 100;
      else if (n.startsWith(targetNorm) || targetNorm.startsWith(n)) score = 80;
      else if (n.includes(targetNorm) || targetNorm.includes(n)) score = 60;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    if (best && bestScore >= 80) detected[slot.key] = best.id;
  }
  return detected;
}

function buildChannelAutoDetectContent(guildId, guild, { TOTAL_STEPS, CHANNEL_SLOTS, isCommunityGuild }) {
  const detected = getCachedAutoDetectedChannels(guildId, guild, CHANNEL_SLOTS);
  const slots = getActiveSlotsForInstall(guildId, guild, CHANNEL_SLOTS, isCommunityGuild);
  const found = slots.filter((s) => detected[s.key]);
  const lines = [
    `## 🔍 Channels détectés automatiquement (3/${TOTAL_STEPS})`,
    '',
    `Guardian a trouvé **${found.length}** channel(s) correspondant à sa configuration sur ce serveur :`,
    ''
  ];
  for (const slot of slots) {
    const channelId = detected[slot.key];
    const ch = channelId ? guild.channels.cache.get(channelId) : null;
    lines.push(ch ? `> ✅ ${slot.emoji} **${slot.label}** → #${ch.name}` : `> ➖ ${slot.emoji} **${slot.label}** → *non détecté*`);
  }
  lines.push('', '> **Conserver ces choix ?** Guardian les utilisera directement sans te les redemander.');
  lines.push('> Sinon, tu pourras configurer chaque channel manuellement.');
  return lines.join('\n');
}

function buildChannelAutoDetectComponents(CUSTOM_IDS) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(CUSTOM_IDS.channelAutoDetectAccept).setStyle(ButtonStyle.Success).setLabel('✅ Conserver les choix de Guardian'),
    new ButtonBuilder().setCustomId(CUSTOM_IDS.channelAutoDetectSkip).setStyle(ButtonStyle.Secondary).setLabel('⚙️ Configurer manuellement')
  )];
}

function getIgnoredChannelSlots(guildId) {
  const raw = getGuildSetting(guildId, 'setup', 'ignored_channel_slots', null);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function addIgnoredChannelSlot(guildId, slotKey) {
  const ignored = getIgnoredChannelSlots(guildId);
  if (!ignored.includes(slotKey)) ignored.push(slotKey);
  setGuildSetting(guildId, 'setup', 'ignored_channel_slots', JSON.stringify(ignored));
}

function buildChannelOptions(guild, slot) {
  const isVoice = slot.key.startsWith('voice');
  const targetName = (isVoice ? CHANNELS.voiceGeneral : (CHANNELS[slot.key] || slot.label)).toLowerCase();
  const allChannels = Array.from(guild.channels.cache.values())
    .filter((c) => isVoice ? (c.isVoiceBased && c.isVoiceBased()) : (c.isTextBased && c.isTextBased() && !c.isVoiceBased()));
  const scored = allChannels.map((c) => {
    const n = c.name.toLowerCase();
    let score = 0;
    if (n === targetName) score = 100;
    else if (n.startsWith(targetName)) score = 80;
    else if (n.includes(targetName)) score = 60;
    else if (targetName.includes(n) && n.length >= 3) score = 40;
    return { c, score };
  });
  const channels = scored
    .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name))
    .slice(0, 25)
    .map(({ c }) => ({ label: `${c.name}`.slice(0, 25), value: c.id, description: `#${c.name}`.slice(0, 50) }));
  if (channels.length === 0) {
    logger.warn('[buildChannelOptions] no options', { guildId: guild?.id, slotKey: slot.key, filteredCount: allChannels.length, scoredCount: scored.length });
  }
  return channels.length > 0 ? channels : [{ label: 'Aucun channel compatible', value: 'none', description: 'Guardian en créera un automatiquement' }];
}

function buildStep3ChannelsContent(guildId, guild, { TOTAL_STEPS, CHANNEL_SLOTS, isCommunityGuild, getChannelCursor, isFreshInstall }) {
  const slots = getActiveSlotsForInstall(guildId, guild, CHANNEL_SLOTS, isCommunityGuild);
  const cursor = Math.min(getChannelCursor(guildId), slots.length - 1);
  const slot = slots[cursor];
  const currentId = getGuildSetting(guildId, slot.settingSection, slot.settingKey, null);
  const currentChannel = (currentId && currentId !== 'guardian:create' && guild) ? guild.channels.cache.get(currentId) : null;
  const statusLines = slots.map((s, i) => {
    const id = getGuildSetting(guildId, s.settingSection, s.settingKey, null);
    const ch = (id && id !== 'guardian:create' && guild) ? guild.channels.cache.get(id) : null;
    const ignored = getIgnoredChannelSlots(guildId).includes(s.key);
    const guardianWillCreate = id === 'guardian:create';
    const configured = Boolean(id) || ignored;
    const isRequired = s.key === 'general' || s.key === 'voiceGeneral' || (s.key === 'rules' && isCommunityGuild(guild));
    const statusIcon = configured ? '✅' : '❌';
    const cursorIcon = i === cursor ? '  ▶' : '';
    const requiredTag = isRequired && !configured ? ' ‼️' : '';
    const label = ch ? `→ #${ch.name}` : (ignored ? '*ignoré*' : (guardianWillCreate ? '*🤖 Guardian crée*' : (id ? '*configuré*' : `*${isRequired ? 'obligatoire' : 'optionnel'}*${requiredTag}`)));
    return `${statusIcon}${cursorIcon} ${s.emoji} **${s.label}** ${label}`;
  }).join('\n');

  const lines = [
    `## ${t('setup.step3Title', {}, { guildId })} (3/${TOTAL_STEPS})`,
    t('setup.step3Instructions', {}, { guildId }),
  ];
  if (isFreshInstall(guildId)) {
    lines.push('> Installation fraîche — seuls les channels essentiels sont à configurer.');
  }
  lines.push('', statusLines, '',
    `> Configuration en cours : **${slot.emoji} ${slot.label}**`,
    slot.desc ? `> ${slot.desc}` : '',
    currentChannel ? `> ✅ Actuellement lié à : #${currentChannel.name}` : '> Non configuré — choisir ci-dessous ou laisser Guardian le créer'
  );
  return lines.join('\n');
}

function buildStep3ChannelsComponents(guildId, guild, { CUSTOM_IDS, CHANNEL_SLOTS, isCommunityGuild, getChannelCursor, buildNavRow }) {
  const slots = getActiveSlotsForInstall(guildId, guild, CHANNEL_SLOTS, isCommunityGuild);
  const cursor = Math.min(getChannelCursor(guildId), slots.length - 1);
  const slot = slots[cursor];
  const options = buildChannelOptions(guild, slot);
  const hasNone = options.length === 1 && options[0].value === 'none';

  const currentChannelId = getGuildSetting(guildId, slot.settingSection, slot.settingKey, null);
  const currentChannel3 = (currentChannelId && currentChannelId !== 'guardian:create' && guild)
    ? guild.channels.cache.get(currentChannelId) : null;
  const channelPlaceholder = currentChannel3
    ? `#${currentChannel3.name} (changer ?)`.slice(0, 150)
    : `Lier un ${slot.label} existant`;

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`${CUSTOM_IDS.channelSelectPrefix}:${slot.key}`)
    .setPlaceholder(channelPlaceholder)
    .setDisabled(hasNone)
    .addOptions(options);

  const searchButton = new ButtonBuilder()
    .setCustomId(`${CUSTOM_IDS.channelSearch}:${slot.key}`)
    .setStyle(ButtonStyle.Secondary)
    .setLabel('🔍 Rechercher');

  const isRequired = slot.key === 'general' || slot.key === 'voiceGeneral' || (slot.key === 'rules' && isCommunityGuild(guild));
  const isLastSlot = cursor >= slots.length - 1;
  const ignoredSlots = getIgnoredChannelSlots(guildId);
  const isConfigured = Boolean(currentChannel3)
    || currentChannelId === 'guardian:create'
    || ignoredSlots.includes(slot.key);

  const selectRow = new ActionRowBuilder().addComponents(selectMenu);

  let navRow;
  if (isConfigured) {
    navRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${CUSTOM_IDS.channelSkip}:prev`).setStyle(ButtonStyle.Secondary)
        .setLabel('◀ Préc.').setDisabled(cursor === 0),
      new ButtonBuilder().setCustomId(`${CUSTOM_IDS.channelSkip}:next`).setStyle(ButtonStyle.Primary)
        .setLabel(isLastSlot ? '✅ Continuer' : 'Suivant ▶'),
    );
  } else {
    navRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${CUSTOM_IDS.channelSkip}:prev`).setStyle(ButtonStyle.Secondary)
        .setLabel('◀ Préc.').setDisabled(cursor === 0),
      new ButtonBuilder().setCustomId(`${CUSTOM_IDS.channelSkip}:next`).setStyle(ButtonStyle.Primary)
        .setLabel('🤖 Laisser Guardian créer'),
      new ButtonBuilder().setCustomId(`${CUSTOM_IDS.channelSkip}:ignore`).setStyle(ButtonStyle.Secondary)
        .setLabel('⏭️ Ignorer ce channel').setDisabled(isRequired)
    );
  }

  const searchRow = new ActionRowBuilder().addComponents(searchButton);
  return [selectRow, searchRow, navRow, buildNavRow(guildId, 3)];
}

// ─── Step 4 helpers (membres) ─────────────────────────────────────────────────

function getStep4Config(guildId, guild) {
  return {
    promotionDelayHours: Math.max(12, Number(getGuildSetting(guildId, 'members', 'promotion_delay_hours', 48))),
    bioRequired: Boolean(getGuildSetting(guildId, 'members', 'bio_required', false)),
    sponsorshipRequired: Boolean(getGuildSetting(guildId, 'members', 'sponsorship_required', false)),
    reviewerGrade: getGuildSetting(guildId, 'members', 'promotion_review_grade', GRADE_NAMES.moderateur),
    inviteExpulsionEnabled: Boolean(getGuildSetting(guildId, 'members', 'invite_expulsion_enabled', true)),
    inviteExpulsionDays: Math.max(1, Number(getGuildSetting(guildId, 'members', 'invite_expulsion_days', 30))),
    welcomeText: String(getGuildSetting(guildId, 'members', 'welcome_text', '') || ''),
    joinServerPresentation: String(getGuildSetting(guildId, 'joinserver', 'presentation', '') || ''),
    _isCommunity: guild?.features?.includes('COMMUNITY') ?? false,
  };
}

function setStep4Config(guildId, config) {
  setGuildSetting(guildId, 'members', 'promotion_delay_hours', config.promotionDelayHours);
  setGuildSetting(guildId, 'members', 'bio_required', config.bioRequired);
  setGuildSetting(guildId, 'members', 'sponsorship_required', config.sponsorshipRequired);
  setGuildSetting(guildId, 'members', 'promotion_review_grade', config.reviewerGrade);
  setGuildSetting(guildId, 'members', 'invite_expulsion_enabled', config.inviteExpulsionEnabled);
  setGuildSetting(guildId, 'members', 'invite_expulsion_days', config.inviteExpulsionDays);
  setGuildSetting(guildId, 'members', 'welcome_text', config.welcomeText);
  setGuildSetting(guildId, 'joinserver', 'presentation', config.joinServerPresentation);
}

function cycleReviewerGrade(currentGrade) {
  const sequence = [GRADE_NAMES.moderateur, GRADE_NAMES.manager, GRADE_NAMES.owner];
  const idx = sequence.indexOf(currentGrade);
  return sequence[idx < 0 ? 0 : (idx + 1) % sequence.length];
}

function buildStep4Content(guildId, guild, { TOTAL_STEPS, gradeLabel, onOff }) {
  const c = getStep4Config(guildId);
  const welcomePreview = c.welcomeText ? `"${c.welcomeText.slice(0, 60)}${c.welcomeText.length > 60 ? '…' : ''}"` : '*non défini*';
  const isCommunity = guild?.features?.includes('COMMUNITY') ?? false;

  // @premium-start
  const rulesChId = getGuildSetting(guildId, 'discord', 'rules_channel_id', guild?.rulesChannelId ?? null);
  const rulesChMention = rulesChId && guild?.channels?.cache?.get(rulesChId) ? `<#${rulesChId}>` : '*non défini*';
  const pubUpdId = getGuildSetting(guildId, 'discord', 'public_updates_channel_id', guild?.publicUpdatesChannelId ?? null);
  const pubUpdMention = pubUpdId && guild?.channels?.cache?.get(pubUpdId) ? `<#${pubUpdId}>` : '*non défini*';
  const description = getGuildSetting(guildId, 'discord', 'description', guild?.description ?? null);
  const descPreview = description ? `"${String(description).slice(0, 80)}${String(description).length > 80 ? '…' : ''}"` : '*non définie*';
  // @premium-end

  return [
    `## ${t('setup.step4Title', {}, { guildId })} (4/${TOTAL_STEPS})`,
    t('setup.step4Instructions', {}, { guildId }),
    '',
    `⏱️ **Délai de promotion** : ${c.promotionDelayHours}h`,
    "> Temps minimum qu'un invité doit passer sur le serveur avant de pouvoir devenir Membre.",
    `📝 **Bio obligatoire** : ${onOff(c.bioRequired)}`,
    "> Si actif, les invités doivent renseigner leur profil avant d'être promus.",
    `👥 **Parrainage** : ${onOff(c.sponsorshipRequired)}`,
    "> Si actif, un Membre existant doit parrainer l'invité pour qu'il soit promu.",
    `🔍 **Grade réviseur** : ${gradeLabel(c.reviewerGrade)}`,
    '> Grade minimum requis pour valider ou refuser une demande de promotion.',
    `🚪 **Expulsion des invités** : ${onOff(c.inviteExpulsionEnabled)} (après ${c.inviteExpulsionDays}j)`,
    '> Guardian expulse automatiquement les invités qui ne sont pas promus après le délai.',
    `💬 **Message de bienvenue** : ${welcomePreview}`,
    '> Message envoyé en privé à chaque nouveau membre qui rejoint le serveur.',
    (() => { const p = c.joinServerPresentation; const prev = p ? `"${p.slice(0, 60)}${p.length > 60 ? '…' : ''}"` : '*non défini*'; return `🌟 **Présentation #rejoindre-notre-serveur** : ${prev}`; })(),
    '> Texte personnalisé affiché dans le channel de recrutement des invités.',
    ...(isCommunity
      ? (isPremiumFeatureEnabled(guildId)
          // @premium-start
          ? [
              '',
              '### ⚙️ Paramètres Discord (serveur Community)',
              `📜 **Canal règles** — ${rulesChMention}`,
              '> Canal désigné comme canal des règles dans les paramètres Discord.',
              `📡 **Canal mises à jour** — ${pubUpdMention}`,
              '> Canal public updates communautaires Discord.',
              `📝 **Description du serveur** — ${descPreview}`,
              '> Texte affiché dans le profil public du serveur Discord.',
            ]
          // @premium-end
          : [
              '',
              '### 🔒 Paramètres Discord (serveur Community)',
              '> Réservés à **Guardian Premium**.',
              '> Utilisez le bouton ci-dessous pour en savoir plus.'
            ])
      : [])
  ].join('\n');
}

function buildStep4Components(guildId, guild, { CUSTOM_IDS, gradeLabel, buildNavRow }) {
  const c = getStep4Config(guildId, guild);
  const toggles = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(CUSTOM_IDS.toggleBioRequired).setStyle(c.bioRequired ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setLabel('📝 Bio'),
    new ButtonBuilder().setCustomId(CUSTOM_IDS.toggleSponsorshipRequired).setStyle(c.sponsorshipRequired ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setLabel('👥 Parrainage'),
    new ButtonBuilder().setCustomId(CUSTOM_IDS.cyclePromotionReviewerGrade).setStyle(ButtonStyle.Secondary)
      .setLabel(`🔍 Réviseur: ${gradeLabel(c.reviewerGrade)}`)
  );
  const delayAndExpulsion = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(CUSTOM_IDS.decreasePromotionDelay).setStyle(ButtonStyle.Secondary).setLabel('⏱️ -12h'),
    new ButtonBuilder().setCustomId(CUSTOM_IDS.increasePromotionDelay).setStyle(ButtonStyle.Secondary).setLabel('⏱️ +12h'),
    new ButtonBuilder().setCustomId(CUSTOM_IDS.toggleInviteExpulsion).setStyle(c.inviteExpulsionEnabled ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setLabel('🚪 Expulsion'),
    new ButtonBuilder().setCustomId(CUSTOM_IDS.decreaseInviteExpulsionDays).setStyle(ButtonStyle.Secondary).setLabel('📅 -1j'),
    new ButtonBuilder().setCustomId(CUSTOM_IDS.increaseInviteExpulsionDays).setStyle(ButtonStyle.Secondary).setLabel('📅 +1j')
  );
  const welcomeBtn = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(CUSTOM_IDS.editWelcomeText).setStyle(ButtonStyle.Secondary)
      .setLabel('💬 Modifier message de bienvenue'),
    new ButtonBuilder().setCustomId(CUSTOM_IDS.editJoinPresentation).setStyle(ButtonStyle.Secondary)
      .setLabel('🌟 Présentation #rejoindre')
  );
  const rows = [toggles, delayAndExpulsion, welcomeBtn];
  if (c._isCommunity) {
    if (isPremiumFeatureEnabled(guildId)) {
      // @premium-start
      rows.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(CUSTOM_IDS.applyRulesChannel).setStyle(ButtonStyle.Primary)
          .setLabel('📜 Appliquer canal règles'),
        new ButtonBuilder().setCustomId(CUSTOM_IDS.applyPublicUpdates).setStyle(ButtonStyle.Primary)
          .setLabel('📡 Appliquer canal updates'),
        new ButtonBuilder().setCustomId(CUSTOM_IDS.editServerDescription).setStyle(ButtonStyle.Secondary)
          .setLabel('📝 Description serveur')
      ));
      // @premium-end
    } else {
      rows.push(new ActionRowBuilder().addComponents(
        buildPremiumLockButton('discord_settings', 'Paramètres Discord Community')
      ));
    }
  }
  rows.push(buildNavRow(guildId, 4));
  return rows;
}

// ─── Step 5 helpers (vocal) ───────────────────────────────────────────────────

function getStep4VocalConfig(guildId) {
  return {
    prefix: String(getGuildSetting(guildId, 'vocal', 'prefix', '🎮') || '🎮'),
    suffix: String(getGuildSetting(guildId, 'vocal', 'suffix', '— Partie') || '— Partie'),
    memberLimit: Math.max(0, Number(getGuildSetting(guildId, 'vocal', 'member_limit', 0))),
    deleteDelayMinutes: Math.max(1, Number(getGuildSetting(guildId, 'vocal', 'delete_delay_minutes', 5)))
  };
}

const VOCAL_PREFIX_CYCLE = ['', '🎮', '🎯', '🔊', '⚔️', '🏆', '🎲'];

function cycleVocalPrefix(current) {
  const idx = VOCAL_PREFIX_CYCLE.indexOf(current);
  return VOCAL_PREFIX_CYCLE[(idx < 0 ? 1 : idx + 1) % VOCAL_PREFIX_CYCLE.length];
}

function formatDelay(minutes) {
  const totalSec = Math.round(minutes * 60);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}min`;
  return `${m}min ${s}s`;
}

function buildStep5VocalContent(guildId, { TOTAL_STEPS, onOffDot }) {
  const c = getStep4VocalConfig(guildId);
  const limitDisplay = c.memberLimit === 0 ? '\u221e illimité' : `${c.memberLimit} membre(s) max`;
  const prefixDisplay = c.prefix === '' ? '*aucun*' : c.prefix;
  const suffixEnabled = Boolean(getGuildSetting(guildId, 'vocal', 'suffix_enabled', true));
  const exampleName = `${c.prefix ? c.prefix + ' ' : ''}Partie${suffixEnabled ? ' — Partie' : ''}`;
  return [
    `## ${t('setup.step5Title', {}, { guildId })} (5/${TOTAL_STEPS})`,
    t('setup.step5Instructions', {}, { guildId }),
    '',
    `🏷️ **Préfixe** : ${prefixDisplay}`,
    '> Emoji ou texte au début du nom — identifie visuellement les rooms Guardian.',
    '',
    `🏷️ **Suffixe** : ${onOffDot(suffixEnabled)}`,
    `> Texte « — Partie » ajouté à la fin du nom (ex : \`${exampleName}\`).`,
    '',
    `👥 **Limite de membres** : ${limitDisplay}`,
    '> Capacité max par room. Laisse à 0 pour illimité.',
    '',
    `⏱️ **Délai de suppression** : ${formatDelay(c.deleteDelayMinutes)}`,
    '> Délai avant qu\'une room vocale vide soit supprimée automatiquement.'
  ].join('\n');
}

function buildStep5VocalComponents(guildId, { CUSTOM_IDS, buildNavRow }) {
  const c = getStep4VocalConfig(guildId);
  const limitDisplay = c.memberLimit === 0 ? '∞' : String(c.memberLimit);
  const prefixDisplay = c.prefix === '' ? 'Aucun' : c.prefix;
  const suffixEnabled = Boolean(getGuildSetting(guildId, 'vocal', 'suffix_enabled', true));
  const prefixRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(CUSTOM_IDS.cycleVocalPrefix).setStyle(ButtonStyle.Secondary)
      .setLabel(`🏷️ Préfixe: ${prefixDisplay} →`),
    new ButtonBuilder().setCustomId(CUSTOM_IDS.toggleVocalSuffix)
      .setStyle(suffixEnabled ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setLabel('🏷️ Suffixe')
  );
  const limitRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(CUSTOM_IDS.decreaseVocalLimit).setStyle(ButtonStyle.Secondary).setLabel('👤 -1')
      .setDisabled(c.memberLimit === 0),
    new ButtonBuilder().setCustomId(CUSTOM_IDS.increaseVocalLimit).setStyle(ButtonStyle.Secondary).setLabel(`👤 +1 (${limitDisplay})`),
    new ButtonBuilder().setCustomId(CUSTOM_IDS.decreaseVocalDelay).setStyle(ButtonStyle.Secondary).setLabel('⏱️ -30s')
      .setDisabled(c.deleteDelayMinutes <= 0.5),
    new ButtonBuilder().setCustomId(CUSTOM_IDS.increaseVocalDelay).setStyle(ButtonStyle.Secondary).setLabel(`⏱️ +30s (${formatDelay(c.deleteDelayMinutes)})`)
  );
  return [prefixRow, limitRow, buildNavRow(guildId, 5)];
}

// ─── Step 6 helpers (jeux) ────────────────────────────────────────────────────

function getStep5Cursor(guildId) {
  const cursor = getGuildSetting(guildId, 'setup', 'game_cursor', 0);
  return Number.isInteger(cursor) ? Math.max(0, cursor) : 0;
}

function setStep5Cursor(guildId, cursor) {
  const safeCursor = Math.max(0, cursor);
  setGuildSetting(guildId, 'setup', 'game_cursor', safeCursor);
  return safeCursor;
}

const GAMES_PAGE_SIZE = 3;

function getGamesPage(guildId) {
  const p = getGuildSetting(guildId, 'setup', 'games_page', 0);
  return Number.isInteger(p) ? Math.max(0, p) : 0;
}

function setGamesPage(guildId, page) {
  const games = listSetupGames(guildId);
  const maxPage = Math.max(0, Math.ceil(games.length / GAMES_PAGE_SIZE) - 1);
  const safe = Math.min(Math.max(0, page), maxPage);
  setGuildSetting(guildId, 'setup', 'games_page', safe);
  return safe;
}

function getGamesLayoutMode(guildId) {
  return getGuildSetting(guildId, 'games', 'layout_mode', 'by-type');
}

function setGamesLayoutMode(guildId, mode) {
  const valid = mode === 'by-game' ? 'by-game' : 'by-type';
  setGuildSetting(guildId, 'games', 'layout_mode', valid);
  return valid;
}

function ensureAtLeastOneSetupGame(guildId) {
  const games = listSetupGames(guildId);
  if (games.length > 0) return games;
  addSetupGame(guildId);
  return listSetupGames(guildId);
}

function getSteamCycleValue(value) {
  const sequence = [null, '440', '570', '730', '578080'];
  const idx = sequence.indexOf(value || null);
  return sequence[idx < 0 ? 0 : (idx + 1) % sequence.length];
}

function getGamesSubstep(guildId) {
  return getGuildSetting(guildId, 'setup', 'games_substep', null);
}

function setGamesSubstep(guildId, substep) {
  setGuildSetting(guildId, 'setup', 'games_substep', substep);
}

function determineGamesSubstep(guildId, guild) {
  const substep = getGamesSubstep(guildId);
  if (substep) return substep;
  // Par défaut : détection automatique au premier affichage de l'étape 6
  if (guild) return 'detect';
  return listSetupGames(guildId).length > 0 ? 'edit' : 'detect';
}

function safeGamesSubstepForRender(guildId, guild, ctx) {
  const substep = determineGamesSubstep(guildId, guild);
  if (substep === 'detect' && !guild) return 'edit';
  return substep;
}

function buildStep6EditorContent(guildId, { TOTAL_STEPS }) {
  const games = listSetupGames(guildId);
  const layoutMode = getGamesLayoutMode(guildId);
  const layoutLabel = layoutMode === 'by-game'
    ? '📁 Une catégorie par jeu (tous les channels du jeu regroupés)'
    : '🗂️ Une catégorie par type de channel (texte / galerie / updates)';
  const lines = [
    `## ${t('setup.step6Title', {}, { guildId })} (6/${TOTAL_STEPS})`,
    '',
    `**Mode d'organisation :** ${layoutLabel}`,
    '',
    '🎮 **Pourquoi une liste de jeux ?**',
    '> Guardian utilise cette liste pour créer automatiquement les channels liés à chaque jeu :',
    '> 🔊 **Salons vocaux** dédiés — Guardian sait quels salons vocaux créer et les nomme automatiquement.',
    '> 💬 **Channel texte** dédié au jeu — discussion, annonces et organisation.',
    '> 📢 **Channel updates** — mises à jour du jeu publiées automatiquement (si Steam ID fourni).',
    '> 🖼️ **Channel galerie** — screenshots partagés par les membres.',
    '',
    '🔗 **Steam ID** : identifiant numérique unique de chaque jeu sur Steam.',
    '> Exemples : `730` = CS2, `570` = Dota 2, `440` = TF2.',
    '> Guardian le détecte automatiquement depuis le nom du jeu — tu n\'as rien à chercher.',
    '> Les jeux non disponibles sur Steam peuvent être ajoutés sans Steam ID.',
    '',
  ];
  if (games.length === 0) {
    lines.push('ℹ️ **Aucun jeu configuré.** La liste vide ne bloque pas le fonctionnement du bot.');
    lines.push('> Tu peux ajouter des jeux maintenant ou plus tard via `/config games`.');
  } else {
    const page = getGamesPage(guildId);
    const totalPages = Math.ceil(games.length / GAMES_PAGE_SIZE);
    const pageGames = games.slice(page * GAMES_PAGE_SIZE, (page + 1) * GAMES_PAGE_SIZE);
    lines.push(`**${games.length} jeu(x) configuré(s)** — page ${page + 1}/${totalPages}`);
    for (const game of pageGames) {
      lines.push(
        `\n🎮 **${game.name}**`,
        `> Steam ID : \`${game.steam_app_id || 'non défini'}\``
      );
    }
  }
  return lines.join('\n');
}

function buildStep6EditorComponents(guildId, { CUSTOM_IDS, buildNavRow }) {
  const games = listSetupGames(guildId);
  const page = getGamesPage(guildId);
  const totalPages = Math.max(1, Math.ceil(games.length / GAMES_PAGE_SIZE));
  const pageGames = games.slice(page * GAMES_PAGE_SIZE, (page + 1) * GAMES_PAGE_SIZE);
  const rows = [];
  const layoutMode = getGamesLayoutMode(guildId);

  const addRowButtons = [
    new ButtonBuilder().setCustomId(CUSTOM_IDS.addGame).setStyle(ButtonStyle.Primary).setLabel('➕ Ajouter un jeu'),
    new ButtonBuilder().setCustomId(CUSTOM_IDS.gamePagePrev).setStyle(ButtonStyle.Secondary)
      .setLabel('◀').setDisabled(page === 0),
    new ButtonBuilder().setCustomId(CUSTOM_IDS.gamePageNext).setStyle(ButtonStyle.Secondary)
      .setLabel(`▶ (${page + 1}/${totalPages})`).setDisabled(page >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.toggleGameLayoutMode)
      .setStyle(ButtonStyle.Secondary)
      .setLabel(layoutMode === 'by-game' ? '🗂️ Par type' : '📁 Par jeu')
  ];
  if (games.length > 0) {
    addRowButtons.push(new ButtonBuilder().setCustomId(CUSTOM_IDS.clearAllGames).setStyle(ButtonStyle.Danger).setLabel('🧹 Tout effacer'));
  }
  const addRow = new ActionRowBuilder().addComponents(addRowButtons);
  rows.push(addRow);

  for (const game of pageGames) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CUSTOM_IDS.editGamePrefix}:${game.game_id}`)
        .setStyle(ButtonStyle.Secondary)
        .setLabel(`✏️ ${game.name.slice(0, 18)}`),
      new ButtonBuilder()
        .setCustomId(`${CUSTOM_IDS.toggleGameGallery}:${game.game_id}`)
        .setStyle(game.galerie_enabled ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setLabel('🖼️ Galerie'),
      new ButtonBuilder()
        .setCustomId(`${CUSTOM_IDS.toggleGameChangelog}:${game.game_id}`)
        .setStyle(game.changelog_enabled ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setLabel('📢 Changelog'),
      new ButtonBuilder()
        .setCustomId(`${CUSTOM_IDS.toggleGameText}:${game.game_id}`)
        .setStyle(game.text_channel_enabled ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setLabel('💬 Texte'),
      new ButtonBuilder()
        .setCustomId(`${CUSTOM_IDS.deleteGamePrefix}:${game.game_id}`)
        .setStyle(ButtonStyle.Danger)
        .setLabel('🗑️')
    ));
    if (rows.length >= 4) break;
  }
  rows.push(buildNavRow(guildId, 6));
  return rows;
}

function buildStep6Content_Games(guildId, guild, ctx) {
  const substep = safeGamesSubstepForRender(guildId, guild, ctx);
  if (substep === 'detect') return _gd.buildGameDetectContent(guildId, guild, ctx.TOTAL_STEPS);
  if (substep === 'review') return _gd.buildGameReviewContent(guildId);
  if (substep === 'link') return _gd.buildGameLinkContent(guildId);
  return buildStep6EditorContent(guildId, ctx);
}

function buildStep6Components_Games(guildId, guild, ctx) {
  const substep = safeGamesSubstepForRender(guildId, guild, ctx);
  if (substep === 'detect') return _gd.buildGameDetectComponents(guild);
  if (substep === 'review') return _gd.buildGameReviewComponents(guildId);
  if (substep === 'link') return _gd.buildGameLinkComponents(guildId, guild, ctx.buildNavRow, 6);
  return buildStep6EditorComponents(guildId, ctx);
}

// ─── Step 7 helpers (modération) ─────────────────────────────────────────────

const LOGS_LEVELS = ['minimal', 'normal', 'verbose'];
function cycleLogsLevel(current) {
  const idx = LOGS_LEVELS.indexOf(current);
  return LOGS_LEVELS[(idx < 0 ? 1 : (idx + 1) % LOGS_LEVELS.length)];
}

function getStep7Config(guildId) {
  return {
    behaviorScoreEnabled: Boolean(getGuildSetting(guildId, 'moderation', 'behavior_score_enabled', true)),
    spamThreshold: Math.max(2, Number(getGuildSetting(guildId, 'automod', 'spam_threshold', 5))),
    slowModeSeconds: Math.max(0, Number(getGuildSetting(guildId, 'automod', 'slowmode_seconds', 0))),
    blacklistWarn: getGuildSetting(guildId, 'automod', 'blacklist_mode', 'warn') === 'warn',
    blacklistWords: (() => { const w = getGuildSetting(guildId, 'automod', 'blacklist_words', []); return Array.isArray(w) ? w : []; })(),
    logsEnabled: Boolean(getGuildSetting(guildId, 'logs', 'enabled', true)),
    logsLevel: getGuildSetting(guildId, 'logs', 'level', 'normal') || 'normal'
  };
}

function setStep7Config(guildId, config) {
  setGuildSetting(guildId, 'moderation', 'behavior_score_enabled', config.behaviorScoreEnabled);
  setGuildSetting(guildId, 'automod', 'spam_threshold', config.spamThreshold);
  setGuildSetting(guildId, 'automod', 'slowmode_seconds', config.slowModeSeconds);
  setGuildSetting(guildId, 'automod', 'blacklist_mode', config.blacklistWarn ? 'warn' : 'silent');
  setGuildSetting(guildId, 'automod', 'blacklist_words', config.blacklistWords);
  setGuildSetting(guildId, 'logs', 'enabled', config.logsEnabled);
  setGuildSetting(guildId, 'logs', 'level', config.logsLevel);
}

function buildStep7Content(guildId, { TOTAL_STEPS, onOff }) {
  const c = getStep7Config(guildId);
  const wordList = c.blacklistWords.length > 0
    ? c.blacklistWords.slice(0, 8).map((w) => `\`${w}\``).join(', ') + (c.blacklistWords.length > 8 ? ` *(+${c.blacklistWords.length - 8} autres)*` : '')
    : '*aucune*';
  const slowDisplay = c.slowModeSeconds === 0 ? '*désactivé*' : `${c.slowModeSeconds}s entre messages`;
  const logsDisplay = c.logsEnabled ? `🟢 ${c.logsLevel}` : '🔴 désactivé';
  return [
    `## ${t('setup.step7Title', {}, { guildId })} (7/${TOTAL_STEPS})`,
    t('setup.step7Instructions', {}, { guildId }),
    '',
    `⚖️ **Score comportemental** — ${isPremiumFeatureEnabled(guildId) ? onOff(c.behaviorScoreEnabled) : '🔒 Premium'}`,
    '> Note chaque membre selon ses messages, sanctions et ancienneté. Réservé à Guardian Premium.',
    '',
    `🛡️ **Anti-spam** — max ${c.spamThreshold} msg / 3s`,
    '> Messages supprimés automatiquement si le seuil est dépassé.',
    '',
    `🐌 **Slow mode** — ${slowDisplay}`,
    '> Délai imposé entre deux messages dans tous les salons.',
    '',
    `🚫 **Blacklist** — ${c.blacklistWarn ? '⚠️ warn public' : '🤫 suppression silencieuse'} — ${c.blacklistWords.length} mot(s)`,
    `> ${wordList !== '*aucune*' ? wordList : 'Aucun mot banni configuré.'}`,
    '',
    `📋 **Logs Guardian** — ${logsDisplay}`,
    '> Historique des actions du bot dans un salon dédié (sanctions, promotions, erreurs).'
  ].join('\n');
}

function buildStep7Components(guildId, { CUSTOM_IDS, buildNavRow }) {
  const c = getStep7Config(guildId);
  const scoreRow = new ActionRowBuilder().addComponents(
    isPremiumFeatureEnabled(guildId)
      ? new ButtonBuilder().setCustomId(CUSTOM_IDS.toggleBehaviorScore).setStyle(c.behaviorScoreEnabled ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setLabel('⚖️ Score comport.')
      : buildPremiumLockButton('behavior_sanctions', 'Score comportemental'),
    new ButtonBuilder().setCustomId(CUSTOM_IDS.toggleBlacklistWarn).setStyle(ButtonStyle.Secondary)
      .setLabel(`🚫 Blacklist: ${c.blacklistWarn ? 'Warn' : 'Silent'}`),
    new ButtonBuilder().setCustomId(CUSTOM_IDS.cycleLogsLevel).setStyle(ButtonStyle.Secondary)
      .setLabel(`📋 Logs: ${c.logsEnabled ? c.logsLevel : 'OFF'}`)
  );
  const spamRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(CUSTOM_IDS.decreaseSpamThreshold).setStyle(ButtonStyle.Secondary).setLabel('🛡️ Spam -1'),
    new ButtonBuilder().setCustomId(CUSTOM_IDS.increaseSpamThreshold).setStyle(ButtonStyle.Secondary).setLabel('🛡️ Spam +1'),
    new ButtonBuilder().setCustomId(CUSTOM_IDS.decreaseSlowMode).setStyle(ButtonStyle.Secondary).setLabel('🐌 Slow -1s')
      .setDisabled(c.slowModeSeconds === 0),
    new ButtonBuilder().setCustomId(CUSTOM_IDS.increaseSlowMode).setStyle(ButtonStyle.Secondary).setLabel('🐌 Slow +1s')
      .setDisabled(c.slowModeSeconds >= 120)
  );
  const blacklistRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(CUSTOM_IDS.addBlacklistWord).setStyle(ButtonStyle.Primary).setLabel('✏️ Gérer mots bannis'),
    new ButtonBuilder().setCustomId(CUSTOM_IDS.clearBlacklist).setStyle(ButtonStyle.Danger).setLabel('🗑️ Vider liste')
      .setDisabled(c.blacklistWords.length === 0)
  );
  return [scoreRow, spamRow, blacklistRow, buildNavRow(guildId, 7)];
}

// ─── Step 8 — Discord settings avancés (premium) ─────────────────────────────

// @premium-start
async function buildStep8DiscordContent(guildId, guild, { TOTAL_STEPS }) {
  const automod = getAutoModConfig(guildId);
  const isCommunity = guild?.features?.includes('COMMUNITY') ?? false;

  let onboardingInfo = '';
  if (isCommunity) {
    const state = await fetchOnboardingState(guild).catch(() => null);
    if (state) {
      onboardingInfo = `\n\n### 🎟️ Onboarding Discord\n> **Prompts configurés** : ${state.promptCount} | **Canaux par défaut** : ${state.defaultChannelIds.length} | **Mode** : ${state.mode === 1 ? 'Avancé' : 'Simplifié'}\n> Guardian peut ajouter tes channels (#général, #règles, #devenir-membre) comme canaux affichés à l\'arrivée sur le serveur.`;
    } else {
      onboardingInfo = `\n\n### ⚠️ Serveur Communautaire — Configuration incomplète\n> Le mode Communautaire est activé sur ce serveur, mais son **configuration Discord n'est pas terminée** (onboarding inaccessible).\n> Pour finaliser : **Paramètres du serveur → Communauté → Onboarding** et complète les étapes requises.\n> *Guardian continuera sans configurer l'onboarding. Tu pourras le faire manuellement ensuite.*`;
    }
  }

  const lines = [
    `## 🔧 Paramètres Discord avancés (8/${TOTAL_STEPS})`,
    'Configure les règles AutoMod natives de Discord. Guardian les créera pour toi en un clic.',
    '',
    '### 🧠 AutoMod Discord',
    ...Object.entries(automod).map(([key, cfg]) =>
      `${cfg.enabled ? '✅' : '❌'} **${cfg.label}** — ${cfg.desc}`
    ),
    onboardingInfo,
  ];
  return lines.filter((l) => l !== undefined).join('\n');
}

async function buildStep8DiscordComponents(guildId, guild, { CUSTOM_IDS, buildNavRow }) {
  const automod = getAutoModConfig(guildId);
  const isCommunity = guild?.features?.includes('COMMUNITY') ?? false;
  const rows = [];

  const automodButtons = Object.entries(automod).map(([key, cfg]) =>
    new ButtonBuilder()
      .setCustomId(`${CUSTOM_IDS.toggleAutoModRule}:${key}`)
      .setStyle(cfg.enabled ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setLabel(cfg.label)
  );
  if (automodButtons.length > 0) {
    rows.push(new ActionRowBuilder().addComponents(...automodButtons.slice(0, 5)));
  }

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(CUSTOM_IDS.discordSettingsSkip)
      .setStyle(ButtonStyle.Secondary).setLabel('⏭️ Passer cette étape')
  );

  if (isCommunity) {
    const _state = await fetchOnboardingState(guild).catch(() => null);
    if (_state) {
      actionRow.addComponents(
        new ButtonBuilder().setCustomId(CUSTOM_IDS.applyOnboardingChannels)
          .setStyle(ButtonStyle.Primary).setLabel('🎟️ Ajouter channels à l\'onboarding')
      );
    }
  }
  rows.push(actionRow);
  rows.push(buildNavRow(guildId, 8));
  return rows;
}
// @premium-end

// ─── Step 9 (résumé) ──────────────────────────────────────────────────────────

function buildStep9Summary(guildId, { TOTAL_STEPS, onOff, onOffDot }) {
  const mappings = getGradeMappings(guildId);
  const modules = getStep2Config(guildId);
  const members = getStep4Config(guildId);
  const vocal = getStep4VocalConfig(guildId);
  const games = listSetupGames(guildId);
  const mod = getStep7Config(guildId);
  const modLogsEnabled = Boolean(getGuildSetting(guildId, 'modules', 'mod_logs_enabled', false));
  const modLogsChannelId = getGuildSetting(guildId, 'channels', 'moderation_logs_channel_id', null);
  const suffixEnabled = Boolean(getGuildSetting(guildId, 'vocal', 'suffix_enabled', true));

  return [
    `## ${t('setup.step8Title', {}, { guildId })} (9/${TOTAL_STEPS})`,
    t('setup.step8Instructions', {}, { guildId }),
    '',
    `**Grades mappés** : ${Object.keys(mappings).length}/5`,
    '',
    '**Modules**',
    `  💡 Suggestions: ${onOffDot(modules.suggestionsEnabled)} | 🖥️ Serveurs: ${onOffDot(modules.serverListEnabled)} | 🤖 Statut: ${onOffDot(modules.statusBotEnabled)}`,
    `  🔇 AFK: ${onOffDot(modules.afkEnabled)} | 🎮 Game Updates: ${onOffDot(modules.gameUpdatesEnabled)}`,
    '',
    '**Membres**',
    `  ⏱️ Délai: ${members.promotionDelayHours}h | 📝 Bio: ${onOffDot(members.bioRequired)} | 👥 Parrainage: ${onOffDot(members.sponsorshipRequired)}`,
    `  🚪 Expulsion: ${onOffDot(members.inviteExpulsionEnabled)} (${members.inviteExpulsionDays}j)`,
    '',
    '**Vocaux**',
    `  Préfixe: ${vocal.prefix || '*aucun*'} | Suffixe: ${onOffDot(suffixEnabled)} | Limite: ${vocal.memberLimit === 0 ? '∞' : vocal.memberLimit} | Délai supp: ${vocal.deleteDelayMinutes}min`,
    '',
    `**Jeux configurés** : ${games.length}`,
    '',
    '**Modération**',
    `  ⚖️ Score: ${onOffDot(mod.behaviorScoreEnabled)} | 🛡️ Spam max: ${mod.spamThreshold}/3s | 🚫 Blacklist: ${mod.blacklistWarn ? 'warn' : 'silent'}`,
    `  📋 Mots bannis: ${mod.blacklistWords.length}`,
    `  🛡️ Logs modération: ${onOffDot(modLogsEnabled)}${modLogsChannelId ? ` → <#${modLogsChannelId}>` : ''}`,
    '',
    `> ⚠️ ${t('setup.step8ConfirmWarning', {}, { guildId })}`
  ].join('\n');
}

function buildStep9Components(guildId, { buildNavRow, TOTAL_STEPS }) {
  return [buildNavRow(guildId, TOTAL_STEPS)];
}

// ─── Community check ──────────────────────────────────────────────────────────

function buildCommunityCheckContent(guildId, guild, { TOTAL_STEPS }) {
  const memberCount = guild?.memberCount ?? 0;
  const hasRules = guild?.rulesChannelId != null;
  const hasVerification = guild ? guild.verificationLevel >= 1 : false;
  const hasModChannel = guild?.publicUpdatesChannelId != null;

  const req = (ok, label) => `${ok ? '✅' : '❌'} ${label}`;

  return [
    `## ⚠️ Serveur classique détecté (3/${TOTAL_STEPS})`,
    '',
    '> Ton serveur n\'est pas encore en mode **Communautaire**.',
    '> **Ce n\'est pas obligatoire.** Guardian fonctionne très bien sans — seules certaines fonctionnalités Discord natives seront désactivées.',
    '> Active le mode Communautaire uniquement si tu veux utiliser : #règles officiel, #logs-modération, événements, annonces, salons Stage, etc.',
    '',
    '### 🔒 Fonctionnalités désactivées sans mode Communautaire',
    '> 📜 **#règles** — salon officiel du règlement (requis par Discord)',
    '> 🛡️ **#logs-modération** — correspond au salon « Moderator Only » de Discord',
    '> 🔒 **#maj-securite** — reçoit les mises à jour de sécurité Discord',
    '> 🎪 **Événements**, 📣 **annonces** et 🎭 **salons Stage** resteront inaccessibles',
    '',
    '### ✅ Prérequis pour activer la Communauté',
    req(memberCount >= 0, 'Serveur créé (toujours vrai)'),
    req(hasVerification, 'Niveau de vérification ≥ Faible (e-mail requis)'),
    req(hasRules, 'Salon « Règles » désigné'),
    req(hasModChannel, 'Salon « Mises à jour de la communauté » désigné'),
    '',
    '*Tu peux continuer sans activer — les fonctionnalités communautaires seront simplement ignorées.*'
  ].join('\n');
}

function buildCommunityCheckComponents(CUSTOM_IDS) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(CUSTOM_IDS.communityCheckRetry)
        .setStyle(ButtonStyle.Primary)
        .setLabel('🔄 Vérifier à nouveau'),
      new ButtonBuilder()
        .setCustomId(CUSTOM_IDS.communityCheckHelp)
        .setStyle(ButtonStyle.Secondary)
        .setLabel('ℹ️ Comment activer'),
      new ButtonBuilder()
        .setCustomId(CUSTOM_IDS.communityCheckContinue)
        .setStyle(ButtonStyle.Secondary)
        .setLabel('Continuer sans activer')
    )
  ];
}

module.exports = {
  // Channel slots & cursor
  CHANNEL_SLOTS,
  getChannelCursor,
  setChannelCursor,
  isCommunityGuild,
  // Step 1
  buildStepOneContent,
  buildStepOneComponents,
  // Step 2
  getStep2Config,
  setStep2Config,
  SYSCHANNEL_CHOICES,
  SYSCHANNEL_LABELS,
  buildStep2Content,
  buildStep2Components,
  // Step 3
  getActiveSlotsForInstall,
  normalizeChannelName,
  autoDetectGuardianChannels,
  getCachedAutoDetectedChannels,
  invalidateAutoDetectedChannels,
  buildChannelAutoDetectContent,
  buildChannelAutoDetectComponents,
  getIgnoredChannelSlots,
  addIgnoredChannelSlot,
  buildChannelOptions,
  buildStep3ChannelsContent,
  buildStep3ChannelsComponents,
  // Step 4
  getStep4Config,
  setStep4Config,
  cycleReviewerGrade,
  buildStep4Content,
  buildStep4Components,
  // Step 5
  getStep4VocalConfig,
  VOCAL_PREFIX_CYCLE,
  cycleVocalPrefix,
  formatDelay,
  buildStep5VocalContent,
  buildStep5VocalComponents,
  // Step 6
  getStep5Cursor,
  setStep5Cursor,
  GAMES_PAGE_SIZE,
  getGamesPage,
  setGamesPage,
  ensureAtLeastOneSetupGame,
  getSteamCycleValue,
  getGamesSubstep,
  setGamesSubstep,
  determineGamesSubstep,
  buildStep6Content_Games,
  buildStep6Components_Games,
  buildStep6EditorContent,
  buildStep6EditorComponents,
  // Step 7
  LOGS_LEVELS,
  cycleLogsLevel,
  getStep7Config,
  setStep7Config,
  buildStep7Content,
  buildStep7Components,
  // Step 8 (premium)
  buildStep8DiscordContent,
  buildStep8DiscordComponents,
  // Step 9
  buildStep9Summary,
  buildStep9Components,
  // Community check
  buildCommunityCheckContent,
  buildCommunityCheckComponents,
};
