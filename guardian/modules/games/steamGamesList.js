const path = require('path');
const GAMES_LIST = require(path.join(__dirname, '../../data/steamGames.json'));

// Suffixes utilisés par Guardian pour les channels dérivés d'un jeu.
// Ils ne doivent pas être considérés comme faisant partie du nom d'un jeu.
const GAME_DERIVATIVE_SUFFIXES = ['-galerie', '-changelogs', '-updates', '-texte', '-chat', '-discussion'];

const ALIASES = {
  'cs2': 'counter-strike 2',
  'csgo': 'counter-strike 2',
  'cs': 'counter-strike 2',
  'counterstrike': 'counter-strike 2',
  'gta': 'grand theft auto v',
  'gtav': 'grand theft auto v',
  'gta5': 'grand theft auto v',
  'gta-v': 'grand theft auto v',
  'tf2': 'team fortress 2',
  'poe': 'path of exile',
  'poe2': 'path of exile 2',
  'dbd': 'dead by daylight',
  'r6': 'rainbow six siege',
  'r6s': 'rainbow six siege',
  'lol': 'league of legends',
  'wow': 'world of warcraft',
  'wow2': 'world of warcraft',
  'eft': 'escape from tarkov',
  'wot': 'world of tanks',
  'wows': 'world of warships',
  'ff14': 'final fantasy xiv',
  'ffxiv': 'final fantasy xiv',
  'bdo': 'black desert online',
  'gw2': 'guild wars 2',
  'bo3': 'call of duty',
  'warzone': 'call of duty',
  'mw2': 'call of duty',
  'cod': 'call of duty',
  'hll': 'hell let loose',
  'rdr2': 'red dead redemption 2',
  'nms': 'no mans sky',
  'ror2': 'risk of rain 2',
  'sts': 'slay the spire',
  'ck3': 'crusader kings iii',
  'ck2': 'crusader kings iii',
  'eu4': 'europa universalis iv',
  'hoi4': 'hearts of iron iv',
  'vic3': 'victoria 3',
  'bg3': 'baldurs gate 3',
  'dos2': 'divinity original sin 2',
  'mhw': 'monster hunter world',
  'mhr': 'monster hunter rise',
  'mhwilds': 'monster hunter wilds',
  'ds3': 'dark souls iii',
  'er': 'elden ring',
  'sekiro': 'sekiro shadows die twice',
  'dmc5': 'devil may cry 5',
  'fc24': 'ea sports fc 25',
  'fc25': 'ea sports fc 25',
  'fc26': 'ea sports fc 26',
  'fifa24': 'ea sports fc 25',
  'v-rising': 'v rising',
  'vrising': 'v rising',
};


const GENERIC_CHANNEL_NAMES = new Set([
  'general', 'general-vocal', 'general-text', 'general-chat', 'annonces', 'announcements',
  'news', 'info', 'infos', 'help', 'aide', 'bot', 'bots', 'log', 'logs',
  'media', 'medias', 'memes', 'off-topic', 'offtopic', 'blabla', 'discussion',
  'bienvenue', 'welcome', 'rules', 'regles', 'faq', 'support', 'tickets',
  'suggestions', 'staff', 'admin', 'moderation', 'mod', 'moderateur', 'moderateur-only',
  'moderator', 'moderator-only', 'mod-only', 'admin-only', 'staff-only',
  'recrutement', 'recruitment', 'partenariat', 'partnership', 'archive', 'archives',
  'presentation', 'introductions', 'sondages', 'polls', 'giveaways',
  'stream', 'clips', 'screenshots', 'fan-art', 'artwork', 'musique', 'music',
  'vocal', 'voice', 'lobby', 'waiting', 'afk', 'setup',
  'general', 'generale', 'general-discussion', 'chat', 'tchat', 'salon', 'texte',
  'serveur', 'server', 'communaute', 'community', 'evenements', 'events',
  'buy-sell', 'commerce', 'marketplace', 'promotions', 'deals',
  'spoilers', 'spoiler', 'important', 'urgent', 'alerte', 'alert',
  'roles', 'role', 'verification', 'verify', 'captcha',
  'gaming', 'jeux', 'jeu', 'games', 'game',
]);

function normalize(str) {
  return str.toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Returns the best matching game from the top list for a given channel base name.
 * Returns null if no good match found.
 * @param {string} channelBaseName
 * @returns {{ name: string, appid: number } | null}
 */
function matchGameFromChannelName(channelBaseName) {
  const raw = channelBaseName.toLowerCase().trim();
  if (GENERIC_CHANNEL_NAMES.has(raw)) return null;
  if (GAME_DERIVATIVE_SUFFIXES.some((suffix) => raw.includes(suffix))) return null;

  const resolvedName = ALIASES[normalize(channelBaseName)] ?? channelBaseName;
  const input = normalize(resolvedName);

  if (input.length < 2) return null;

  let bestMatch = null;
  let bestScore = 0;

  for (const game of GAMES_LIST) {
    if (!game.name) continue;
    const gameName = normalize(game.name);
    if (!gameName) continue;

    let score = 0;

    if (gameName === input) {
      score = 100;
    } else if (gameName.startsWith(input) || input.startsWith(gameName)) {
      score = 80 + (input.length / Math.max(gameName.length, input.length)) * 20;
    } else if (gameName.includes(input) || input.includes(gameName)) {
      score = 50 + (Math.min(input.length, gameName.length) / Math.max(input.length, gameName.length)) * 30;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = game;
    }
  }

  if (bestScore < 70) return null;

  // Anti-faux positif : le channel ne doit pas être beaucoup plus long que le jeu
  // matché (ex: steam-curation-gz ne doit pas matcher Steam).
  const bestGameName = normalize(bestMatch.name);
  if (input.length > bestGameName.length && bestGameName.length / input.length < 0.5) {
    return null;
  }

  return bestMatch;
}

/**
 * Search games by name (for autocomplete in setup step 6).
 * Returns top matches sorted by relevance.
 * @param {string} query
 * @param {number} [limit=10]
 * @returns {{ name: string, appid: number }[]}
 */
function searchGames(query, limit = 10) {
  if (!query || query.length < 2) return GAMES_LIST.slice(0, limit);
  const q = normalize(query);

  return GAMES_LIST
    .map((game) => {
      const n = normalize(game.name);
      let score = 0;
      if (n === q) score = 100;
      else if (n.startsWith(q)) score = 80;
      else if (n.includes(q)) score = 60;
      else if (q.includes(n) && n.length >= 3) score = 40;
      return { game, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ game }) => game);
}

const NON_STEAM_PREFIX = '000';
const NON_STEAM_TOTAL_LENGTH = 10;

let _nonSteamCounter = 1;

/**
 * Generates a pseudo App ID for non-Steam games.
 * Format: 000XXXXXXX (10 digits, prefix 000 — impossible for real Steam App IDs).
 * Uses a random suffix to avoid collisions across bot restarts.
 */
function generateNonSteamId() {
  const suffix = String(Date.now()).slice(-7) + String(_nonSteamCounter++ % 10);
  const digits = (suffix).slice(-7).padStart(7, '0');
  return NON_STEAM_PREFIX + digits;
}

/**
 * Returns true if the given App ID is a Guardian non-Steam pseudo ID.
 * @param {string|number|null|undefined} appId
 */
function isNonSteamId(appId) {
  if (!appId) return false;
  const s = String(appId);
  return s.length === NON_STEAM_TOTAL_LENGTH && s.startsWith(NON_STEAM_PREFIX);
}

module.exports = { matchGameFromChannelName, searchGames, GAMES_LIST, generateNonSteamId, isNonSteamId, NON_STEAM_PREFIX, GENERIC_CHANNEL_NAMES };
