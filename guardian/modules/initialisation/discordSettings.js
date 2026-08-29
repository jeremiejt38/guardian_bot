// @premium-start
'use strict';

/**
 * discordSettings.js
 *
 * Utilitaire de synchronisation entre les paramètres Guardian et les paramètres
 * natifs du serveur Discord (guild.edit, AutoMod rules, Onboarding).
 *
 * Toutes les fonctions sont safe (try/catch) et retournent { ok, error }.
 */

const { PermissionFlagsBits } = require('discord.js');
const { getGuildSetting, setGuildSetting } = require('../config/settings');
const logger = require('../logs/logger');

// ── Constantes ────────────────────────────────────────────────────────────────

const AFK_TIMEOUTS = [60, 300, 900, 1800, 3600]; // secondes → 1/5/15/30/60 min
const AFK_TIMEOUT_LABELS = { 60: '1 min', 300: '5 min', 900: '15 min', 1800: '30 min', 3600: '1 heure' };

const AUTOMOD_RULES = Object.freeze({
  mentionSpam: {
    key: 'automod_rule_mention_spam',
    label: '📣 Anti mention-spam',
    desc: 'Supprime les messages mentionnant plus de 5 personnes à la fois.',
    build: (guildId) => ({
      name: 'Guardian — Anti mention-spam',
      eventType: 1,
      triggerType: 5,
      triggerMetadata: { mentionTotalLimit: 5, mentionRaidProtectionEnabled: true },
      actions: [{ type: 1 }],
      enabled: true,
      reason: `Guardian setup — guild ${guildId}`
    })
  },
  keywordFilter: {
    key: 'automod_rule_keyword',
    label: '🚫 Filtre mots bannis',
    desc: 'Bloque les mots de la blacklist Guardian dans AutoMod Discord.',
    build: (guildId, words = []) => ({
      name: 'Guardian — Filtre mots bannis',
      eventType: 1,
      triggerType: 1,
      triggerMetadata: { keywordFilter: words.slice(0, 1000) },
      actions: [{ type: 1 }, { type: 2, metadata: { channel_id: null } }],
      enabled: true,
      reason: `Guardian setup — guild ${guildId}`
    })
  },
  spamContent: {
    key: 'automod_rule_spam',
    label: '🛡️ Anti-spam contenu',
    desc: 'Détecte et bloque les messages répétitifs ou contenant des liens suspects.',
    build: (guildId) => ({
      name: 'Guardian — Anti-spam contenu',
      eventType: 1,
      triggerType: 3,
      triggerMetadata: {},
      actions: [{ type: 1 }],
      enabled: true,
      reason: `Guardian setup — guild ${guildId}`
    })
  }
});

// ── Lecture état Discord → Guardian ──────────────────────────────────────────

/**
 * Lit les paramètres Discord natifs et les stocke dans les settings Guardian.
 * Appelé au démarrage du step 2 et step 4 pour initialiser les valeurs.
 */
async function syncFromDiscord(guild) {
  const guildId = guild.id;
  try {
    // AFK
    if (guild.afkChannelId) {
      setGuildSetting(guildId, 'discord', 'afk_channel_id', guild.afkChannelId);
    }
    if (guild.afkTimeout) {
      setGuildSetting(guildId, 'discord', 'afk_timeout', guild.afkTimeout);
    }

    // Notifications système
    if (guild.systemChannelId !== undefined) {
      setGuildSetting(guildId, 'discord', 'system_channel_id', guild.systemChannelId ?? null);
    }

    // Langue
    if (guild.preferredLocale) {
      setGuildSetting(guildId, 'discord', 'preferred_locale', guild.preferredLocale);
    }

    // Community
    if (guild.rulesChannelId !== undefined) {
      setGuildSetting(guildId, 'discord', 'rules_channel_id', guild.rulesChannelId ?? null);
    }
    if (guild.publicUpdatesChannelId !== undefined) {
      setGuildSetting(guildId, 'discord', 'public_updates_channel_id', guild.publicUpdatesChannelId ?? null);
    }
    if (guild.description !== undefined) {
      setGuildSetting(guildId, 'discord', 'description', guild.description ?? null);
    }

    return { ok: true };
  } catch (err) {
    logger.warn(`discordSettings.syncFromDiscord failed for guild ${guildId}: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

// ── AFK ───────────────────────────────────────────────────────────────────────

/**
 * Applique le canal AFK et le délai sur le serveur Discord.
 * @param {Guild} guild
 * @param {string|null} channelId  null = désactiver
 * @param {number} timeoutSeconds
 */
async function applyAfkSettings(guild, channelId, timeoutSeconds) {
  try {
    await guild.edit({
      afkChannel: channelId ?? null,
      afkTimeout: timeoutSeconds
    }, 'Guardian — configuration canal AFK');

    setGuildSetting(guild.id, 'discord', 'afk_channel_id', channelId ?? null);
    setGuildSetting(guild.id, 'discord', 'afk_timeout', timeoutSeconds);
    logger.info(`discordSettings: AFK set — channel=${channelId}, timeout=${timeoutSeconds}s for guild ${guild.id}`);
    return { ok: true };
  } catch (err) {
    logger.warn(`discordSettings.applyAfkSettings failed for guild ${guild.id}: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

function getAfkConfig(guildId, guild) {
  return {
    channelId: getGuildSetting(guildId, 'discord', 'afk_channel_id', guild?.afkChannelId ?? null),
    timeout: Number(getGuildSetting(guildId, 'discord', 'afk_timeout', guild?.afkTimeout ?? 300)),
  };
}

function cycleAfkTimeout(current) {
  const idx = AFK_TIMEOUTS.indexOf(current);
  return AFK_TIMEOUTS[(idx < 0 ? 1 : (idx + 1) % AFK_TIMEOUTS.length)];
}

// ── Notifications système ─────────────────────────────────────────────────────

/**
 * Applique le canal de notifications système.
 * @param {Guild} guild
 * @param {string|null} channelId  null = désactiver
 */
async function applySystemChannel(guild, channelId) {
  try {
    await guild.edit({
      systemChannel: channelId ?? null
    }, 'Guardian — canal notifications système');

    setGuildSetting(guild.id, 'discord', 'system_channel_id', channelId ?? null);
    logger.info(`discordSettings: systemChannel set to ${channelId} for guild ${guild.id}`);
    return { ok: true };
  } catch (err) {
    logger.warn(`discordSettings.applySystemChannel failed for guild ${guild.id}: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

function getSystemChannelConfig(guildId, guild) {
  return {
    channelId: getGuildSetting(guildId, 'discord', 'system_channel_id', guild?.systemChannelId ?? null),
  };
}

// ── Langue ────────────────────────────────────────────────────────────────────

/**
 * Synchronise la langue Discord avec celle choisie dans Guardian.
 * @param {Guild} guild
 * @param {string} guardianLang  ex: 'fr', 'en'
 */
async function syncLocaleToDiscord(guild, guardianLang) {
  const LOCALE_MAP = {
    fr: 'fr',
    en: 'en-US',
    es: 'es-ES',
    pt: 'pt-BR',
    it: 'it',
    de: 'de'
  };
  const locale = LOCALE_MAP[guardianLang] ?? 'en-US';
  try {
    await guild.edit({ preferredLocale: locale }, 'Guardian — synchronisation langue');
    setGuildSetting(guild.id, 'discord', 'preferred_locale', locale);
    logger.info(`discordSettings: preferredLocale set to ${locale} for guild ${guild.id}`);
    return { ok: true };
  } catch (err) {
    logger.warn(`discordSettings.syncLocaleToDiscord failed for guild ${guild.id}: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

function getLocaleConfig(guildId, guild) {
  const LOCALE_TO_GUARDIAN = {
    'fr': 'fr', 'en-US': 'en', 'en-GB': 'en',
    'es-ES': 'es', 'pt-BR': 'pt', 'it': 'it', 'de': 'de'
  };
  const discordLocale = getGuildSetting(guildId, 'discord', 'preferred_locale', guild?.preferredLocale ?? 'en-US');
  const { getGuildLanguage } = require('../i18n');
  const guardianLang = getGuildLanguage(guildId);
  const discordLangNormalized = LOCALE_TO_GUARDIAN[discordLocale] ?? 'en';
  return {
    discordLocale,
    guardianLang,
    inSync: discordLangNormalized === guardianLang
  };
}

// ── Community : canal règles + public updates + description ──────────────────

async function applyRulesChannel(guild, channelId) {
  try {
    await guild.edit({ rulesChannel: channelId ?? null }, 'Guardian — canal règles');
    setGuildSetting(guild.id, 'discord', 'rules_channel_id', channelId ?? null);
    logger.info(`discordSettings: rulesChannel set to ${channelId} for guild ${guild.id}`);
    return { ok: true };
  } catch (err) {
    logger.warn(`discordSettings.applyRulesChannel failed for guild ${guild.id}: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

async function applyPublicUpdatesChannel(guild, channelId) {
  try {
    await guild.edit({ publicUpdatesChannel: channelId ?? null }, 'Guardian — canal mises à jour communauté');
    setGuildSetting(guild.id, 'discord', 'public_updates_channel_id', channelId ?? null);
    logger.info(`discordSettings: publicUpdatesChannel set to ${channelId} for guild ${guild.id}`);
    return { ok: true };
  } catch (err) {
    logger.warn(`discordSettings.applyPublicUpdatesChannel failed for guild ${guild.id}: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

async function applyDescription(guild, description) {
  try {
    await guild.edit({ description: description || null }, 'Guardian — description du serveur');
    setGuildSetting(guild.id, 'discord', 'description', description || null);
    logger.info(`discordSettings: description updated for guild ${guild.id}`);
    return { ok: true };
  } catch (err) {
    logger.warn(`discordSettings.applyDescription failed for guild ${guild.id}: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

// ── AutoMod ───────────────────────────────────────────────────────────────────

/**
 * Crée ou met à jour une règle AutoMod Discord.
 * @param {Guild} guild
 * @param {string} ruleKey  clé dans AUTOMOD_RULES
 * @param {string[]} [extraWords]  pour keywordFilter
 */
async function applyAutoModRule(guild, ruleKey, extraWords = []) {
  const rule = AUTOMOD_RULES[ruleKey];
  if (!rule) return { ok: false, error: `Unknown rule key: ${ruleKey}` };

  const existingRuleId = getGuildSetting(guild.id, 'discord', rule.key, null);

  try {
    const body = rule.build(guild.id, extraWords);

    if (existingRuleId) {
      await guild.client.rest.patch(`/guilds/${guild.id}/auto-moderation/rules/${existingRuleId}`, { body });
      logger.info(`discordSettings: updated AutoMod rule ${ruleKey} (${existingRuleId}) for guild ${guild.id}`);
    } else {
      const created = await guild.client.rest.post(`/guilds/${guild.id}/auto-moderation/rules`, { body });
      setGuildSetting(guild.id, 'discord', rule.key, created.id);
      logger.info(`discordSettings: created AutoMod rule ${ruleKey} (${created.id}) for guild ${guild.id}`);
    }
    setGuildSetting(guild.id, 'discord', `${rule.key}_enabled`, true);
    return { ok: true };
  } catch (err) {
    logger.warn(`discordSettings.applyAutoModRule(${ruleKey}) failed for guild ${guild.id}: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

async function disableAutoModRule(guild, ruleKey) {
  const rule = AUTOMOD_RULES[ruleKey];
  if (!rule) return { ok: false, error: `Unknown rule key: ${ruleKey}` };
  const existingRuleId = getGuildSetting(guild.id, 'discord', rule.key, null);
  if (!existingRuleId) return { ok: true };
  try {
    await guild.client.rest.patch(`/guilds/${guild.id}/auto-moderation/rules/${existingRuleId}`, {
      body: { enabled: false }
    });
    setGuildSetting(guild.id, 'discord', `${rule.key}_enabled`, false);
    return { ok: true };
  } catch (err) {
    logger.warn(`discordSettings.disableAutoModRule(${ruleKey}) failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

function getAutoModConfig(guildId) {
  return Object.fromEntries(
    Object.entries(AUTOMOD_RULES).map(([key, rule]) => [
      key,
      {
        enabled: Boolean(getGuildSetting(guildId, 'discord', `${rule.key}_enabled`, false)),
        ruleId: getGuildSetting(guildId, 'discord', rule.key, null),
        label: rule.label,
        desc: rule.desc,
      }
    ])
  );
}

// ── Onboarding ────────────────────────────────────────────────────────────────

/**
 * Ajoute des channels dans la liste des canaux par défaut de l'onboarding Discord.
 * Merge avec les canaux existants (pas de suppression).
 */
async function addOnboardingDefaultChannels(guild, channelIds) {
  try {
    const current = await guild.fetchOnboarding().catch(() => null);
    if (!current) return { ok: false, error: 'Onboarding non disponible (serveur non Community ?)' };

    const existing = (current.defaultChannels || []).filter(Boolean).map((c) => c.id);
    const validIds = [];
    const skipped = [];
    const everyone = guild.roles.everyone;
    if (!everyone) {
      logger.warn(`discordSettings: everyone role missing for guild ${guild.id}`);
      return { ok: false, error: 'Rôle everyone introuvable' };
    }

    for (const id of [...new Set(channelIds)]) {
      const channel = guild.channels.cache.get(id);
      if (!channel) {
        skipped.push({ id, reason: 'introuvable' });
        continue;
      }

      const perms = channel.permissionsFor(everyone);
      if (perms?.has(PermissionFlagsBits.ViewChannel)) {
        validIds.push(id);
        continue;
      }

      try {
        await channel.permissionOverwrites.create(everyone, { ViewChannel: true });
        validIds.push(id);
      } catch (err) {
        logger.warn(`discordSettings: cannot grant ViewChannel to @everyone for onboarding channel ${id}: ${err.message}`);
        skipped.push({ id, reason: 'pas d\'acces @everyone' });
      }
    }

    const merged = [...new Set([...existing, ...validIds])];

    await guild.client.rest.put(`/guilds/${guild.id}/onboarding`, {
      body: { default_channel_ids: merged }
    });
    logger.info(`discordSettings: onboarding default_channel_ids updated for guild ${guild.id}`);
    const message = skipped.length > 0
      ? `${validIds.length} ajoute(s), ${skipped.length} ignore(s) (besoin d'acces @everyone)`
      : `${validIds.length} channel(s) ajoute(s) a l'onboarding Discord.`;
    return { ok: true, skipped, message };
  } catch (err) {
    logger.warn(`discordSettings.addOnboardingDefaultChannels failed for guild ${guild.id}: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

/**
 * Retourne l'état actuel de l'onboarding Discord.
 */
async function fetchOnboardingState(guild) {
  try {
    const onboarding = await guild.fetchOnboarding().catch(() => null);
    if (!onboarding) return null;
    return {
      enabled: onboarding.enabled ?? false,
      mode: onboarding.mode ?? 0,
      defaultChannelIds: onboarding.defaultChannels?.map((c) => c.id) ?? [],
      promptCount: onboarding.prompts?.length ?? 0,
    };
  } catch {
    return null;
  }
}

module.exports = {
  AFK_TIMEOUTS,
  AFK_TIMEOUT_LABELS,
  AUTOMOD_RULES,
  syncFromDiscord,
  getAfkConfig,
  cycleAfkTimeout,
  applyAfkSettings,
  getSystemChannelConfig,
  applySystemChannel,
  getLocaleConfig,
  syncLocaleToDiscord,
  applyRulesChannel,
  applyPublicUpdatesChannel,
  applyDescription,
  getAutoModConfig,
  applyAutoModRule,
  disableAutoModRule,
  addOnboardingDefaultChannels,
  fetchOnboardingState,
};
// @premium-end
