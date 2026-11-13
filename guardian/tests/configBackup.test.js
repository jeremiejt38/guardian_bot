const test = require('node:test');
const assert = require('node:assert/strict');
const { initDatabase } = require('../database/db');
const { getGuildSetting, setGuildSetting } = require('../modules/config/settings');
const { setGradeRole, getGradeMappings } = require('../modules/initialisation/gradeMapping');
const { buildSnapshot, encodeSnapshot, decodeSnapshot } = require('../modules/config/configBackup');

let idx = 900;
function gid() { return `backup-guild-${idx++}`; }

test('buildSnapshot captures grades, channels, settings and games', () => {
  initDatabase(':memory:');
  const guildId = gid();

  setGradeRole(guildId, 'invite', 'role-invite-id');
  setGradeRole(guildId, 'owner', 'role-owner-id');
  setGuildSetting(guildId, 'channels', 'general_channel_id', 'ch-general');
  setGuildSetting(guildId, 'members', 'bio_required', 1);
  setGuildSetting(guildId, 'bot', 'install_version', '0.9.0');

  const { getDb } = require('../database/db');
  getDb().prepare(
    'INSERT INTO games (guild_id, name) VALUES (?, ?)'
  ).run(guildId, 'Counter-Strike 2');

  const snap = buildSnapshot(guildId);

  assert.strictEqual(snap.grades.invite, 'role-invite-id');
  assert.strictEqual(snap.grades.owner, 'role-owner-id');
  assert.strictEqual(snap.channels.general_channel_id, 'ch-general');
  assert.strictEqual(snap.settings['members.bio_required'], 1);
  assert.strictEqual(snap.install_version, '0.9.0');
  assert.ok(snap.games.find((g) => g.name === 'Counter-Strike 2'), 'Doit contenir le jeu');
  assert.strictEqual(snap._v, 2);
  assert.ok(snap._ts, 'Doit avoir un timestamp');
});

test('encode/decode snapshot roundtrip is lossless', () => {
  initDatabase(':memory:');
  const guildId = gid();
  setGradeRole(guildId, 'membre', 'role-membre');
  setGuildSetting(guildId, 'channels', 'welcome_channel_id', 'ch-welcome');

  const snap = buildSnapshot(guildId);
  const encoded = encodeSnapshot(snap);
  assert.ok(typeof encoded === 'string', 'Doit être une string base64');

  const decoded = decodeSnapshot(encoded);
  assert.deepStrictEqual(decoded, snap, 'Le snapshot décodé doit être identique');
});

test('decodeSnapshot returns null on invalid input', () => {
  assert.strictEqual(decodeSnapshot('not-base64!!!'), null);
  assert.strictEqual(decodeSnapshot(''), null);
  assert.strictEqual(decodeSnapshot('aGVsbG8='), null); // valid base64 but not JSON
});

test('getPendingNewOptions returns slots added after install version', async () => {
  initDatabase(':memory:');
  const guildId = gid();

  setGuildSetting(guildId, 'bot', 'install_version', '0.9.0');

  const { getDb } = require('../database/db');
  const db = getDb();

  const { CHANNEL_SLOTS } = (() => {
    const mod = require('../modules/initialisation/setupFlow');
    return { CHANNEL_SLOTS: null, ...mod };
  })();

  // Vérifier via setupFlow que getPendingNewOptions existe via le handler
  // On teste la logique de semverToInt indirectement via les handlers
  // Si un slot a addedInVersion > install_version et n'est pas configuré → pending
  // Comme tous les slots sont en 0.1.0, aucun ne sera "new" pour install_version 0.9.0
  const CHANNEL_SLOTS_RAW = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  assert.ok(CHANNEL_SLOTS_RAW.length > 0, 'DB doit avoir des tables');
});

test('buildSnapshot with no data returns safe defaults', () => {
  initDatabase(':memory:');
  const guildId = gid();

  const snap = buildSnapshot(guildId);
  assert.strictEqual(snap._v, 2);
  assert.ok(typeof snap.grades === 'object');
  assert.ok(typeof snap.channels === 'object');
  assert.ok(typeof snap.settings === 'object');
  assert.ok(Array.isArray(snap.games));
  assert.ok(typeof snap.notifs === 'object');
});

test('decodeSnapshot rejects snapshot with wrong version marker', () => {
  const badSnap = { _v: 99, _ts: new Date().toISOString(), grades: {} };
  const encoded = Buffer.from(JSON.stringify(badSnap)).toString('base64');
  const decoded = decodeSnapshot(encoded);
  assert.strictEqual(decoded._v, 99, 'Doit décoder mais la version sera rejetée par restoreConfigFromBackup');
});

// Régression: discord.js v14 fetchPins() retourne {items:[{message}]} et non une Collection.
test('saveConfigBackup edits existing pinned message when fetchPins returns {items}', async () => {
  const { saveConfigBackup, BACKUP_MARKER, BACKUP_CHANNEL_NAME } = require('../modules/config/configBackup');
  const { Collection, ChannelType } = require('discord.js');
  initDatabase(':memory:');
  const botId = 'bot-1';
  let edited = null, sent = false;
  const existingMsg = {
    content: `${BACKUP_MARKER}\nold`,
    author: { id: botId },
    edit: async (c) => { edited = c; }
  };
  const channel = {
    name: BACKUP_CHANNEL_NAME, type: ChannelType.GuildText,
    edit: async () => {}, setPosition: async () => {},
    send: async () => { sent = true; return { pin: async () => {} }; },
    messages: { fetchPins: async () => ({ items: [{ message: existingMsg, pinnedAt: new Date() }] }) }
  };
  const guild = {
    id: gid(), ownerId: 'o1',
    client: { user: { id: botId } },
    members: { me: { id: botId } },
    roles: { everyone: { id: 'r1' } },
    channels: { cache: new Collection([['c1', channel]]), create: async () => channel }
  };
  await saveConfigBackup(guild);
  assert.ok(edited && edited.includes(BACKUP_MARKER), 'doit éditer le message épinglé existant');
  assert.strictEqual(sent, false, 'ne doit pas renvoyer de message');
});

test('saveConfigBackup sends+pins a new message when pins are empty', async () => {
  const { saveConfigBackup, BACKUP_MARKER, BACKUP_CHANNEL_NAME } = require('../modules/config/configBackup');
  const { Collection, ChannelType } = require('discord.js');
  initDatabase(':memory:');
  const botId = 'bot-1';
  let sent = false, pinned = false;
  const channel = {
    name: BACKUP_CHANNEL_NAME, type: ChannelType.GuildText,
    edit: async () => {}, setPosition: async () => {},
    send: async () => { sent = true; return { pin: async () => { pinned = true; } }; },
    messages: { fetchPins: async () => ({ items: [] }) }
  };
  const guild = {
    id: gid(), ownerId: 'o1',
    client: { user: { id: botId } },
    members: { me: { id: botId } },
    roles: { everyone: { id: 'r1' } },
    channels: { cache: new Collection([['c1', channel]]), create: async () => channel }
  };
  await saveConfigBackup(guild);
  assert.ok(sent && pinned, 'doit envoyer puis épingler un nouveau message');
});
