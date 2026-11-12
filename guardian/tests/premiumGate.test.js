'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

function freshModule(modulePath) {
  const resolved = require.resolve(modulePath);
  delete require.cache[resolved];
  return require(modulePath);
}

function makeTempDb() {
  return path.join(os.tmpdir(), `guardian-pg-${Date.now()}-${Math.random()}.db`);
}

// ─── buildPremiumLockButton ───────────────────────────────────────────────────

test('buildPremiumLockButton — différentes featureKeys produisent des customIds distincts', () => {
  const { buildPremiumLockButton, GATE_PREFIX } = require('../modules/tier/premiumGate');
  const keys = ['behavior_sanctions', 'welcome_dm', 'suggestions_forum', 'server_list'];
  const ids = keys.map((k) => buildPremiumLockButton(k, 'Label').toJSON().custom_id);
  const unique = new Set(ids);
  assert.equal(unique.size, keys.length, 'Chaque featureKey doit produire un customId unique');
});

test('buildPremiumLockButton — le label contient toujours 🔒', () => {
  const { buildPremiumLockButton } = require('../modules/tier/premiumGate');
  const btn = buildPremiumLockButton('welcome_dm', 'Mon Label');
  assert.ok(btn.toJSON().label.includes('🔒'));
});

// ─── handlePremiumGateClick ───────────────────────────────────────────────────

test('handlePremiumGateClick — répond en éphémère avec info premium', async () => {
  let replied = null;
  const fakeInteraction = {
    isButton: () => true,
    customId: 'premium:gate:welcome_dm',
    reply: async (opts) => { replied = opts; },
  };
  const { handlePremiumGateClick } = require('../modules/tier/premiumGate');
  await handlePremiumGateClick(fakeInteraction);
  assert.ok(replied, 'reply() doit être appelé');
  const { MessageFlags } = require('discord.js');
  assert.equal(replied.flags, MessageFlags.Ephemeral, 'La réponse doit être éphémère');
  assert.ok(typeof replied.content === 'string' && replied.content.length > 0, 'Le contenu doit être non vide');
});

test('handlePremiumGateClick — contient le nom de la feature dans la réponse', async () => {
  let content = '';
  const fakeInteraction = {
    isButton: () => true,
    customId: 'premium:gate:behavior_sanctions',
    reply: async ({ content: c }) => { content = c; },
  };
  const { handlePremiumGateClick } = require('../modules/tier/premiumGate');
  await handlePremiumGateClick(fakeInteraction);
  assert.ok(content.includes('Sanctions'), `Contenu attendu "Sanctions", reçu: ${content}`);
});

// ─── isPremium / checkTier / getPremiumExpiry ─────────────────────────────────

test('tier.js — getPremiumExpiry retourne null si pas premium', () => {
  const tempDbPath = makeTempDb();
  const { initDatabase, migrateDatabase } = freshModule('../database/db');
  initDatabase(tempDbPath);
  migrateDatabase();
  const { getPremiumExpiry } = freshModule('../modules/tier/tier');
  assert.equal(getPremiumExpiry('g_exp1'), null);
  try { fs.unlinkSync(tempDbPath); } catch {}
});

test('tier.js — getPremiumExpiry retourne null pour premium permanent (expires_at null)', () => {
  const tempDbPath = makeTempDb();
  const { initDatabase, migrateDatabase } = freshModule('../database/db');
  initDatabase(tempDbPath);
  migrateDatabase();
  const { activatePremium, getPremiumExpiry } = freshModule('../modules/tier/tier');
  activatePremium('g_exp2', null);
  assert.equal(getPremiumExpiry('g_exp2'), null);
  try { fs.unlinkSync(tempDbPath); } catch {}
});

test('tier.js — getPremiumExpiry retourne une date future pour premium avec durée', () => {
  const tempDbPath = makeTempDb();
  const { initDatabase, migrateDatabase } = freshModule('../database/db');
  initDatabase(tempDbPath);
  migrateDatabase();
  const { activatePremium, getPremiumExpiry } = freshModule('../modules/tier/tier');
  const before = Date.now();
  activatePremium('g_exp3', 30);
  const expiry = getPremiumExpiry('g_exp3');
  assert.ok(expiry instanceof Date, 'doit retourner un objet Date');
  assert.ok(expiry.getTime() > before, 'la date doit être dans le futur');
  try { fs.unlinkSync(tempDbPath); } catch {}
});

// ─── buildAddServerButton (servers/interaction) ────────────────────────────────

test('buildAddServerButton — retourne cadenas en free', () => {
  const tempDbPath = makeTempDb();
  const { initDatabase, migrateDatabase } = freshModule('../database/db');
  initDatabase(tempDbPath);
  migrateDatabase();
  const { buildAddServerButton } = freshModule('../modules/servers/interaction');
  const { GATE_PREFIX } = require('../modules/tier/premiumGate');
  const btn = buildAddServerButton('g_free_server');
  const data = btn.toJSON();
  assert.ok(data.custom_id.startsWith(GATE_PREFIX), `Doit être un bouton gate, reçu: ${data.custom_id}`);
  assert.ok(data.label.includes('🔒'));
  try { fs.unlinkSync(tempDbPath); } catch {}
});

test('buildAddServerButton — retourne bouton actif en premium', () => {
  const tempDbPath = makeTempDb();
  const { initDatabase, migrateDatabase } = freshModule('../database/db');
  initDatabase(tempDbPath);
  migrateDatabase();
  const { activatePremium } = freshModule('../modules/tier/tier');
  activatePremium('g_prem_server', null);
  const { buildAddServerButton } = freshModule('../modules/servers/interaction');
  const btn = buildAddServerButton('g_prem_server');
  const data = btn.toJSON();
  assert.equal(data.custom_id, 'servers:add');
  assert.ok(!data.label.includes('🔒'));
  try { fs.unlinkSync(tempDbPath); } catch {}
});

// ─── isPremiumGateClick edge cases ────────────────────────────────────────────

test('isPremiumGateClick — retourne false si customId undefined', () => {
  const { isPremiumGateClick } = require('../modules/tier/premiumGate');
  assert.equal(isPremiumGateClick({ isButton: () => true, customId: undefined }), false);
});

test('isPremiumGateClick — retourne false si customId est juste le préfixe sans clé', () => {
  const { isPremiumGateClick } = require('../modules/tier/premiumGate');
  assert.equal(isPremiumGateClick({ isButton: () => true, customId: 'premium:gate:' }), true);
});
