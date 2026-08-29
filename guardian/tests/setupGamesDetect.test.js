const test = require('node:test');
const assert = require('node:assert/strict');
const { detectExistingGameChannels } = require('../modules/initialisation/setupGamesDetect');

function buildChannel(id, name, type = 0, parentId = null) {
  return { id, name, type, parentId };
}

function buildGuild(channels) {
  const cache = new Map();
  for (const ch of channels) {
    cache.set(ch.id, ch);
  }
  return { channels: { cache } };
}

test('detectExistingGameChannels regroupe eco, eco-galerie et eco-galerie-photo sous eco', () => {
  const guild = buildGuild([
    buildChannel('1', 'eco'),
    buildChannel('2', 'eco-galerie'),
    buildChannel('3', 'eco-galerie-photo')
  ]);
  const games = detectExistingGameChannels(guild);
  assert.strictEqual(games.length, 1, 'un seul jeu "eco" doit être détecté');
  assert.strictEqual(games[0].baseName, 'eco');
  assert.strictEqual(games[0].channels.length, 3, 'les 3 channels doivent être regroupés');
});

test('detectExistingGameChannels ignore les channels génériques', () => {
  const guild = buildGuild([
    buildChannel('1', 'general'),
    buildChannel('2', 'bienvenue'),
    buildChannel('3', 'annonces')
  ]);
  const games = detectExistingGameChannels(guild);
  assert.strictEqual(games.length, 0);
});

test('detectExistingGameChannels ne prend pas un suffixe Guardian sans base valide pour un jeu', () => {
  const guild = buildGuild([
    buildChannel('1', 'xx-galerie-photos'),
    buildChannel('2', 'xy-changelogs-news')
  ]);
  const games = detectExistingGameChannels(guild);
  assert.strictEqual(games.length, 0);
});

test('detectExistingGameChannels exclut les channels dans les catégories Guardian globales', () => {
  const guild = buildGuild([
    buildChannel('cat-info', '📋 Informations', 4),
    buildChannel('1', 'faq', 0, 'cat-info'),
    buildChannel('2', 'eco', 0, null),
    buildChannel('3', 'eco-galerie', 0, null)
  ]);
  const games = detectExistingGameChannels(guild);
  assert.strictEqual(games.length, 1);
  assert.strictEqual(games[0].baseName, 'eco');
});

test('detectExistingGameChannels regroupe eco-chat avec eco', () => {
  const guild = buildGuild([
    buildChannel('1', 'eco'),
    buildChannel('2', 'eco-galerie-photo'),
    buildChannel('3', 'eco-chat')
  ]);
  const games = detectExistingGameChannels(guild);
  assert.strictEqual(games.length, 1, 'un seul jeu "eco" doit être détecté');
  assert.strictEqual(games[0].baseName, 'eco');
  assert.strictEqual(games[0].channels.length, 3, 'les 3 channels doivent être regroupés');
});

test('detectExistingGameChannels propose un channel non-Steam isolé avec un nom valide', () => {
  const guild = buildGuild([
    buildChannel('1', 'drac-lab')
  ]);
  const games = detectExistingGameChannels(guild);
  assert.strictEqual(games.length, 1, 'un channel isolé avec un nom non-générique doit être proposé');
  assert.strictEqual(games[0].baseName, 'drac-lab');
});

test('detectExistingGameChannels propose un vrai jeu Steam même isolé', () => {
  const guild = buildGuild([
    buildChannel('1', 'counter-strike')
  ]);
  const games = detectExistingGameChannels(guild);
  assert.strictEqual(games.length, 1);
  assert.strictEqual(games[0].steamName, 'Counter-Strike 2');
});

test('detectExistingGameChannels ne propose pas un channel isolé avec un nom générique', () => {
  const guild = buildGuild([
    buildChannel('1', 'discussion')
  ]);
  const games = detectExistingGameChannels(guild);
  assert.strictEqual(games.length, 0, 'un channel avec un nom générique ne doit pas être proposé');
});
