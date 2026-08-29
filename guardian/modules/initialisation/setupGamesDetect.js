'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { CHANNELS, CATEGORIES } = require('../../config');
const { matchGameFromChannelName, isNonSteamId, GENERIC_CHANNEL_NAMES } = require('../games/steamGamesList');
const { getGuildSetting, setGuildSetting } = require('../config/settings');
const { CUSTOM_IDS, TOTAL_STEPS } = require('./setupConstants');
const logger = require('../logs/logger');

const MAX_REVIEW_GAMES = 15;

// Suffixes utilisés par Guardian pour les channels dérivés d'un jeu.
// On les recherche n'importe où dans le nom pour éviter qu'un channel
// renommé (ex: eco-galerie-photo) soit pris pour un jeu à part entière.
const GAME_DERIVATIVE_SUFFIXES = ['-galerie', '-changelogs', '-updates', '-texte', '-chat', '-discussion'];

// ── Détection jeux existants ──────────────────────────────────────────────────

function normalizeGameSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function extractGameBaseName(channelName) {
  const lower = channelName.toLowerCase();
  for (const suffix of GAME_DERIVATIVE_SUFFIXES) {
    const idx = lower.indexOf(suffix);
    if (idx !== -1) {
      const base = lower.slice(0, idx).replace(/-+$/, '');
      return base.length >= 3 ? base : null;
    }
  }
  return lower;
}

const GUARDIAN_RESERVED_CHANNEL_NAMES = new Set(Object.values(CHANNELS));
const GUARDIAN_RESERVED_CATEGORY_NAMES = new Set(Object.values(CATEGORIES));
const GUARDIAN_RESERVED_BASE_NAMES = new Set(Object.values(CHANNELS).map((n) => n.replace(/-changelogs?|-updates?|-galerie|-texte$/, '').toLowerCase()));

function detectExistingGameChannels(guild) {
  const guardianCategoryIds = new Set(
    [...guild.channels.cache.values()]
      .filter((c) => c.type === 4 && GUARDIAN_RESERVED_CATEGORY_NAMES.has(c.name))
      .map((c) => c.id)
  );

  const allText = [...guild.channels.cache.values()].filter((c) => {
    if (c.type !== 0 && c.type !== 5 && c.type !== 15) return false;
    if (GUARDIAN_RESERVED_CHANNEL_NAMES.has(c.name)) return false;
    if (c.parentId && guardianCategoryIds.has(c.parentId)) return false;
    return true;
  });

  logger.info('detectExistingGameChannels: candidate channels', { guildId: guild.id, count: allText.length, names: allText.slice(0, 50).map((c) => c.name) });

  const gameMap = new Map();
  for (const ch of allText) {
    const n = ch.name;
    const baseName = extractGameBaseName(n);
    if (!baseName) {
      logger.debug('detectExistingGameChannels: no baseName extracted', { guildId: guild.id, channel: n });
      continue;
    }
    const isForum = ch.type === 15;
    let type = 'text';
    if (n.endsWith('-galerie')) type = 'galerie';
    else if (n.endsWith('-changelogs') || n.endsWith('-updates')) type = 'changelog';
    else if (n.endsWith('-chat') || n.endsWith('-discussion')) type = 'chat';
    if (isForum) type = 'forum';
    if (!gameMap.has(baseName)) gameMap.set(baseName, { baseName, channels: [] });
    gameMap.get(baseName).channels.push({ id: ch.id, name: ch.name, type });
  }
  const stripAccents = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const resolved = [...gameMap.values()]
    .filter((g) => g.channels.length >= 1 && g.baseName.length >= 3)
    .filter((g) => !GUARDIAN_RESERVED_BASE_NAMES.has(g.baseName.toLowerCase()))
    .filter((g) => {
      const norm = stripAccents(g.baseName.toLowerCase());
      const rejected = GENERIC_CHANNEL_NAMES.has(norm) || GENERIC_CHANNEL_NAMES.has(g.baseName.toLowerCase());
      if (rejected) {
        logger.info('detectExistingGameChannels: rejected generic name', { guildId: guild.id, baseName: g.baseName });
      }
      return !rejected;
    })
    .map((g) => {
      const steamMatch = matchGameFromChannelName(g.baseName);
      return {
        ...g,
        steamName: steamMatch?.name ?? null,
        steamAppId: steamMatch?.appid != null ? String(steamMatch.appid) : null
      };
    })
    .filter((g) => {
      // Proposer automatiquement les jeux reconnus Steam,
      // ou les noms non-génériques même avec un seul channel (permet de ratrapper les jeux non-Steam).
      const keep = g.steamAppId || g.baseName.length >= 3;
      if (!keep) {
        logger.info('detectExistingGameChannels: rejected after steam match', { guildId: guild.id, baseName: g.baseName, channels: g.channels.length, steamAppId: g.steamAppId });
      }
      return keep;
    });

  logger.info('detectExistingGameChannels: resolved games', { guildId: guild.id, count: resolved.length, games: resolved.map((g) => ({ baseName: g.baseName, steamAppId: g.steamAppId, channels: g.channels.length })) });

  const seenAppIds = new Set();
  const seenNames = new Set();
  return resolved.filter((g) => {
    if (g.steamAppId) {
      const key = String(g.steamAppId);
      if (seenAppIds.has(key)) return false;
      seenAppIds.add(key);
    } else {
      const nameKey = g.baseName.toLowerCase();
      if (seenNames.has(nameKey)) return false;
      seenNames.add(nameKey);
    }
    return true;
  });
}

function getDetectedGames(guildId) {
  const raw = getGuildSetting(guildId, 'setup', 'detected_games', null);
  if (!raw) return [];
  try {
    const games = JSON.parse(raw);
    const seenAppIds = new Set();
    const seenNames = new Set();
    return games.filter((g) => {
      const appKey = g.steamAppId ? String(g.steamAppId) : null;
      const nameKey = (g.steamName || g.baseName || '').toLowerCase();
      if (appKey) {
        if (seenAppIds.has(appKey)) return false;
        seenAppIds.add(appKey);
      } else {
        if (seenNames.has(nameKey)) return false;
        seenNames.add(nameKey);
      }
      return true;
    });
  } catch { return []; }
}

function setDetectedGames(guildId, games) {
  setGuildSetting(guildId, 'setup', 'detected_games', JSON.stringify(games));
}

function getGameLinkCursor(guildId) {
  return Math.max(0, Number(getGuildSetting(guildId, 'setup', 'game_link_cursor', 0)) || 0);
}

function setGameLinkCursor(guildId, v) {
  setGuildSetting(guildId, 'setup', 'game_link_cursor', Math.max(0, v));
}

function getGameReviewPage(guildId) {
  const games = getDetectedGames(guildId);
  const totalPages = Math.max(1, Math.ceil(games.length / MAX_REVIEW_GAMES));
  const p = Number(getGuildSetting(guildId, 'setup', 'detected_games_review_page', 0)) || 0;
  return Math.min(Math.max(0, p), totalPages - 1);
}

function setGameReviewPage(guildId, v) {
  setGuildSetting(guildId, 'setup', 'detected_games_review_page', Math.max(0, v));
}

function buildGameDetectContent(guildId, guild, _TOTAL_STEPS) {
  const stepTotal = _TOTAL_STEPS || TOTAL_STEPS;
  const games = detectExistingGameChannels(guild);
  const lines = [
    `## 🎮 Jeux détectés (6/${stepTotal})`,
    '',
  ];
  if (games.length === 0) {
    lines.push(
      'Aucun channel ressemblant à un jeu n\'a été détecté sur ce serveur.',
      '> Guardian va créer automatiquement la structure pour les jeux que tu ajouteras à l\'étape suivante.'
    );
  } else {
    lines.push(
      `**${games.length} jeu(x) potentiel(s) détecté(s)** dans les channels existants :`,
      ''
    );
    for (const g of games.slice(0, 10)) {
      const types = g.channels.map((c) => {
        if (c.type === 'galerie') return '🖼️';
        if (c.type === 'changelog') return '📢';
        if (c.type === 'forum') return '🗂️';
        return '💬';
      }).join(' ');
      const steamLabel = g.steamName ? ` → **${g.steamName}**${g.steamAppId ? ` \`(#${g.steamAppId})\`` : ''}` : '';
      lines.push(`> 🎮 \`${g.baseName}\`${steamLabel} — ${types} (${g.channels.length} salon(s))`);
    }
    lines.push(
      '',
      '**Veux-tu que Guardian récupère ces channels ?**',
      '> ✅ **Oui** — Guardian va te demander de lier chaque channel à un jeu.',
      '> ⏭️ **Non / Ignorer** — Guardian ignore ces channels et en crée de nouveaux.'
    );
  }
  return lines.join('\n');
}

function buildGameDetectComponents(guild) {
  const games = detectExistingGameChannels(guild);
  if (games.length === 0) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(CUSTOM_IDS.gameDetectSkip).setStyle(ButtonStyle.Primary).setLabel('➡️ Continuer')
      )
    ];
  }
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(CUSTOM_IDS.gameDetectAdopt).setStyle(ButtonStyle.Success).setLabel('✅ Récupérer ces channels'),
      new ButtonBuilder().setCustomId(CUSTOM_IDS.gameDetectSkip).setStyle(ButtonStyle.Secondary).setLabel('⏭️ Ignorer')
    )
  ];
}

function buildGameReviewContent(guildId) {
  const games = getDetectedGames(guildId);
  const page = getGameReviewPage(guildId);
  const totalPages = Math.max(1, Math.ceil(games.length / MAX_REVIEW_GAMES));
  const start = page * MAX_REVIEW_GAMES;
  const pageGames = games.slice(start, start + MAX_REVIEW_GAMES);
  const lines = [
    `## 🎮 Révision des jeux détectés (page ${page + 1}/${totalPages})`,
    ''
  ];
  if (games.length === 0) {
    lines.push('Aucun jeu dans la liste. Tu peux en ajouter manuellement ou continuer sans jeux.');
  } else {
    lines.push(`**${games.length} jeu(x) dans ta liste :**`, '');
    for (const [i, g] of pageGames.entries()) {
      const displayName = g.steamName || g.baseName;
      const steamLabel = g.steamAppId && !isNonSteamId(g.steamAppId) ? ` \`#${g.steamAppId}\`` : ' *(non-Steam)*';
      const chCount = g.channels?.length ?? 0;
      const globalIndex = start + i + 1;
      lines.push(`> **${globalIndex}.** 🎮 **${displayName}**${steamLabel}${chCount > 0 ? ` — ${chCount} salon(s) détecté(s)` : ''}`);
    }
    if (pageGames.length === 0) {
      lines.push('> *Aucun jeu sur cette page.*');
    }
  }
  const isLast = page >= totalPages - 1;
  const footer = isLast
    ? '> Supprime les jeux indésirables avec les boutons 🗑️ ci-dessous, puis clique sur **Continuer** pour passer à l\'association des channels.'
    : '> Supprime les jeux indésirables avec les boutons 🗑️ ci-dessous, puis clique sur **Continuer** pour voir les suivants.';
  lines.push('', footer);
  return lines.join('\n');
}

function buildGameReviewComponents(guildId) {
  const games = getDetectedGames(guildId);
  const page = getGameReviewPage(guildId);
  const totalPages = Math.max(1, Math.ceil(games.length / MAX_REVIEW_GAMES));
  const start = page * MAX_REVIEW_GAMES;
  const pageGames = games.slice(start, start + MAX_REVIEW_GAMES);
  const rows = [];

  const removeButtons = pageGames.map((g, i) => {
    const label = (g.steamName || g.baseName).slice(0, 25);
    return new ButtonBuilder()
      .setCustomId(`${CUSTOM_IDS.gameReviewRemovePrefix}${start + i}`)
      .setEmoji('🗑️')
      .setLabel(label)
      .setStyle(ButtonStyle.Danger);
  });

  if (removeButtons.length > 0) {
    for (let i = 0; i < removeButtons.length; i += 5) {
      rows.push(new ActionRowBuilder().addComponents(removeButtons.slice(i, i + 5)));
    }
  }

  const navButtons = [
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.gameReviewAdd)
      .setLabel('➕ Ajouter un jeu')
      .setStyle(ButtonStyle.Secondary)
  ];
  if (page > 0) {
    navButtons.unshift(new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.gameReviewPrev)
      .setLabel('◀ Précédent')
      .setStyle(ButtonStyle.Secondary));
  }
  const isLast = page >= totalPages - 1;
  navButtons.push(new ButtonBuilder()
    .setCustomId(CUSTOM_IDS.gameReviewContinue)
    .setLabel(isLast ? 'Continuer ➡️' : 'Suite ➡️')
    .setStyle(ButtonStyle.Primary));

  rows.push(new ActionRowBuilder().addComponents(navButtons));

  return rows;
}

const GAMELINK_TYPE_LABELS = Object.freeze({
  text:      { icon: '💬', label: 'Chat texte' },
  changelog: { icon: '📢', label: 'Annonces/Updates' },
  forum:     { icon: '🗂️', label: 'Forum' },
  galerie:   { icon: '🖼️', label: 'Galerie' }
});
const GAMELINK_LINKABLE_TYPES = ['text', 'changelog', 'forum', 'galerie'];

function getGameLinkActiveType(guildId) {
  return getGuildSetting(guildId, 'setup', 'gamelink_active_type', null);
}
function setGameLinkActiveType(guildId, type) {
  setGuildSetting(guildId, 'setup', 'gamelink_active_type', type);
}

function buildGameLinkContent(guildId) {
  const games = getDetectedGames(guildId);
  const cursor = getGameLinkCursor(guildId);
  const game = games[cursor];
  if (!game) return '## Configuration des jeux\n\nAucun jeu à configurer.';

  const total = games.length;
  const activeType = getGameLinkActiveType(guildId);
  const displayName = game.steamName || game.baseName;
  const lines = [
    `## 🎮 Lier les channels — **${displayName}** (${cursor + 1}/${total})`,
    '',
    `Associe tes channels existants à **${displayName}** :`,
    '> Clique sur un type puis sélectionne le channel correspondant.',
    '> Tu peux ignorer les types que tu n\'as pas.',
    ''
  ];

  for (const type of GAMELINK_LINKABLE_TYPES) {
    const ch = game.channels.find((c) => c.type === type);
    const { icon, label } = GAMELINK_TYPE_LABELS[type];
    const linked = ch?.linkedId ? `✅ \`#${ch.linkedName}\`` : '❌ *non lié*';
    const active = activeType === type ? ' ◀ en cours' : '';
    lines.push(`> ${icon} **${label}** : ${linked}${active}`);
  }

  return lines.join('\n');
}

function buildGameLinkComponents(guildId, guild, buildNavRow, step = 6) {
  const games = getDetectedGames(guildId);
  const cursor = getGameLinkCursor(guildId);
  const game = games[cursor];
  if (!game) return buildNavRow ? [buildNavRow(guildId, step)] : [];

  const activeType = getGameLinkActiveType(guildId);
  const rows = [];

  const typeButtons = GAMELINK_LINKABLE_TYPES.map((type) => {
    const { icon, label } = GAMELINK_TYPE_LABELS[type];
    const ch = game.channels.find((c) => c.type === type);
    const linked = ch?.linkedId;
    const isActive = activeType === type;
    return new ButtonBuilder()
      .setCustomId(`${CUSTOM_IDS.gameLinkTypeSelect}:${cursor}:${type}`)
      .setLabel(`${icon} ${label}${linked ? ' ✅' : ''}`)
      .setStyle(isActive ? ButtonStyle.Primary : (linked ? ButtonStyle.Success : ButtonStyle.Secondary));
  });
  rows.push(new ActionRowBuilder().addComponents(...typeButtons));

  if (activeType) {
    const slug = normalizeGameSlug(game.baseName);
    const allowedDiscordTypesForType = activeType === 'forum' ? [15] : [0, 5];
    const TYPE_SUFFIXES = { text: ['texte', 'chat', 'discussion', 'general'], changelog: ['changelogs', 'updates', 'annonces', 'news'], forum: ['forum', 'discussion'], galerie: ['galerie', 'gallery', 'screenshots', 'photos'] };
    const suffixes = TYPE_SUFFIXES[activeType] || [];
    const allCompatible = [...guild.channels.cache.values()].filter((c) => allowedDiscordTypesForType.includes(c.type));
    const scored = allCompatible.map((c) => {
      const n = c.name.toLowerCase();
      let score = 0;
      if (n === slug) score = 100;
      else if (n.startsWith(slug)) score = 90;
      else if (n.includes(slug)) score = 70;
      else if (slug.split('-').some((part) => part.length >= 3 && n.includes(part))) score = 40;
      if (suffixes.some((s) => n.endsWith(s) || n.includes(`-${s}`))) score += 15;
      return { c, score };
    });
    const candidates = scored
      .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name))
      .slice(0, 25)
      .map(({ c }) => ({ label: c.name.slice(0, 25), value: c.id, description: `#${c.name}`.slice(0, 50) }));
    if (candidates.length > 0) {
      const alreadyLinkedCh = game.channels.find((c) => c.type === activeType);
      const alreadyLinkedId = alreadyLinkedCh?.linkedId;
      const alreadyLinkedName = alreadyLinkedId ? guild.channels.cache.get(alreadyLinkedId)?.name : null;
      const gameLinkPlaceholder = alreadyLinkedName
        ? `#${alreadyLinkedName} (changer ?)`.slice(0, 150)
        : `${GAMELINK_TYPE_LABELS[activeType].icon} Choisir le channel ${GAMELINK_TYPE_LABELS[activeType].label}`;
      rows.push(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${CUSTOM_IDS.gameLinkChannelPrefix}:${cursor}:${activeType}`)
          .setPlaceholder(gameLinkPlaceholder)
          .addOptions(candidates)
      ));
    }
  }

  const navButtons = [
    new ButtonBuilder().setCustomId(CUSTOM_IDS.gameLinkSkip).setStyle(ButtonStyle.Secondary).setLabel('⏭️ Passer ce jeu')
  ];
  if (cursor < games.length - 1) {
    navButtons.push(new ButtonBuilder().setCustomId(CUSTOM_IDS.gameLinkNext).setStyle(ButtonStyle.Primary).setLabel('➡️ Jeu suivant'));
  } else {
    navButtons.push(new ButtonBuilder().setCustomId(CUSTOM_IDS.gameLinkNext).setStyle(ButtonStyle.Primary).setLabel('✅ Terminer'));
  }
  rows.push(new ActionRowBuilder().addComponents(...navButtons));
  return rows;
}

module.exports = {
  normalizeGameSlug,
  detectExistingGameChannels,
  getDetectedGames,
  setDetectedGames,
  getGameLinkCursor,
  setGameLinkCursor,
  getGameReviewPage,
  setGameReviewPage,
  MAX_REVIEW_GAMES,
  buildGameDetectContent,
  buildGameDetectComponents,
  buildGameReviewContent,
  buildGameReviewComponents,
  GAMELINK_TYPE_LABELS,
  GAMELINK_LINKABLE_TYPES,
  getGameLinkActiveType,
  setGameLinkActiveType,
  buildGameLinkContent,
  buildGameLinkComponents,
};
