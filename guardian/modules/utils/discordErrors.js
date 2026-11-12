const { MessageFlags } = require('discord.js');
const logger = require('../logs/logger');

const DISCORD_ERROR_CODES = Object.freeze({
  50013: 'Missing Permissions — le bot manque de permissions pour effectuer cette action.',
  50001: 'Missing Access — le bot n\'a pas accès à ce channel ou ressource.',
  50007: 'Cannot send messages to this user — l\'utilisateur a désactivé les DMs.',
  50035: 'Invalid Form Body — données invalides envoyées à Discord.',
  10008: 'Unknown Message — le message n\'existe plus.',
  10003: 'Unknown Channel — le channel n\'existe plus.',
  10004: 'Unknown Guild — le serveur n\'existe plus.',
  30005: 'Maximum number of guild channels reached.',
  30013: 'Maximum number of guild roles reached.',
  40032: 'This channel is already of that type.',
});

/**
 * Returns true if the error is a known Discord API error.
 */
function isDiscordError(err) {
  return err?.code != null && typeof err.code === 'number';
}

/**
 * Returns a human-readable description for a Discord error code.
 */
function describeDiscordError(err) {
  const known = DISCORD_ERROR_CODES[err?.code];
  if (known) return `[Discord ${err.code}] ${known}`;
  return `[Discord ${err?.code ?? 'unknown'}] ${err?.message ?? 'Erreur inconnue'}`;
}

/**
 * Wraps an async Discord operation with structured error logging.
 * Returns the result or null on error.
 *
 * @param {Function} fn - async function to execute
 * @param {string} context - human-readable description for logging
 * @param {object} [opts]
 * @param {boolean} [opts.silent] - suppress logging for non-critical errors (default false)
 * @param {any} [opts.fallback] - value to return on error (default null)
 */
async function safeDiscordAction(fn, context, { silent = false, fallback = null } = {}) {
  try {
    return await fn();
  } catch (err) {
    if (isDiscordError(err)) {
      const desc = describeDiscordError(err);
      if (!silent) {
        logger.warn(`Discord API error in [${context}]: ${desc}`);
      }
      if (err.code === 50013) {
        logger.error(`MISSING PERMISSIONS in [${context}] — vérifie les permissions du bot sur ce serveur.`, { code: err.code });
      }
    } else {
      logger.error(`Unexpected error in [${context}]`, { message: err?.message, stack: err?.stack });
    }
    return fallback;
  }
}

/**
 * Handles a Discord error from an interaction and replies with a user-friendly message.
 * Returns true if the error was handled, false if it should be rethrown.
 */
async function handleInteractionError(interaction, err, context = 'interaction') {
  if (isDiscordError(err)) {
    const desc = describeDiscordError(err);
    logger.warn(`Discord API error in [${context}]: ${desc}`);

    if (err.code === 50013 || err.code === 50001) {
      const msg = '⚠️ Le bot manque de permissions pour effectuer cette action. Vérifie que Guardian a bien les droits nécessaires sur ce serveur.';
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral });
        } else {
          await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
        }
      } catch { /* interaction may already be expired */ }
      return true;
    }

    if (err.code === 10008 || err.code === 10003) {
      logger.warn(`Resource no longer exists in [${context}] — ignoring.`);
      return true;
    }
  }
  return false;
}

module.exports = { safeDiscordAction, handleInteractionError, isDiscordError, describeDiscordError };
