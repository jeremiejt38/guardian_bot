/**
 * rawgApi.js
 *
 * Thin wrapper around the RAWG Video Games Database API.
 * https://rawg.io/apidocs
 *
 * - Free tier: ~40 000 requests/month, no auth required for read-only
 *   but a personal API key is strongly recommended (avoids rate limits).
 * - Clé configurable via getGuildSetting(guildId, 'bot', 'rawg_api_key').
 * - Si pas de clé configurée, les appels utilisent l'endpoint public
 *   (fonctionne mais peut être limité en débit).
 */

const https = require('https');
const { getGuildSetting } = require('../config/settings');
const logger = require('../logs/logger');

const BASE_URL = 'https://api.rawg.io/api';
const DEFAULT_TIMEOUT_MS = 5000;

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: DEFAULT_TIMEOUT_MS }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('RAWG: invalid JSON response')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('RAWG: request timeout')); });
  });
}

function buildUrl(path, params, apiKey) {
  const qs = new URLSearchParams(params);
  if (apiKey) qs.set('key', apiKey);
  return `${BASE_URL}${path}?${qs.toString()}`;
}

/**
 * Search RAWG for a game by name.
 * Returns the best match or null.
 * @param {string} name
 * @param {string|null} apiKey  — optional RAWG API key
 * @returns {Promise<RawgGame|null>}
 */
async function searchRawgGame(name, apiKey = null) {
  if (!name) return null;
  try {
    const url = buildUrl('/games', { search: name, page_size: 5, search_precise: true }, apiKey);
    const data = await httpGet(url);
    const results = data?.results;
    if (!Array.isArray(results) || results.length === 0) return null;

    const nameLower = name.toLowerCase();
    const exact = results.find((r) => r.name?.toLowerCase() === nameLower);
    const best = exact ?? results[0];

    return {
      rawgId: String(best.id),
      name: best.name,
      backgroundImage: best.background_image ?? null,
      genres: (best.genres ?? []).map((g) => g.name),
      platforms: (best.platforms ?? []).map((p) => p.platform?.name).filter(Boolean),
      metacritic: best.metacritic ?? null,
      released: best.released ?? null,
      website: best.website ?? null,
      slug: best.slug ?? null
    };
  } catch (err) {
    logger.warn(`[rawgApi] searchRawgGame("${name}") failed: ${err?.message}`);
    return null;
  }
}

/**
 * Fetch details for a known RAWG game ID.
 * @param {string|number} rawgId
 * @param {string|null} apiKey
 * @returns {Promise<RawgGame|null>}
 */
async function getRawgGameById(rawgId, apiKey = null) {
  if (!rawgId) return null;
  try {
    const url = buildUrl(`/games/${rawgId}`, {}, apiKey);
    const best = await httpGet(url);
    if (!best?.id) return null;
    return {
      rawgId: String(best.id),
      name: best.name,
      backgroundImage: best.background_image ?? null,
      genres: (best.genres ?? []).map((g) => g.name),
      platforms: (best.platforms ?? []).map((p) => p.platform?.name).filter(Boolean),
      metacritic: best.metacritic ?? null,
      released: best.released ?? null,
      website: best.website ?? null,
      slug: best.slug ?? null
    };
  } catch (err) {
    logger.warn(`[rawgApi] getRawgGameById(${rawgId}) failed: ${err?.message}`);
    return null;
  }
}

let warnedNoKey = false;

/**
 * Convenience: get the RAWG API key configured for a guild.
 * Falls back to the global env variable RAWG_API_KEY if set.
 * Warns once when no key is configured so the degraded path is visible.
 * @param {string} guildId
 */
function getRawgApiKey(guildId) {
  const key = getGuildSetting(guildId, 'bot', 'rawg_api_key', null)
    ?? process.env.RAWG_API_KEY
    ?? null;
  if (!key && !warnedNoKey) {
    warnedNoKey = true;
    logger.warn('[rawgApi] no RAWG_API_KEY configured — non-Steam game lookups run without a key (rate limited / may fail)');
  }
  return key;
}

module.exports = { searchRawgGame, getRawgGameById, getRawgApiKey };
