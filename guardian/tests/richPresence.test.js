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
  return path.join(os.tmpdir(), `guardian-rp-${Date.now()}-${Math.random()}.db`);
}

function freshDb(tempDbPath) {
  const { initDatabase, migrateDatabase } = freshModule('../database/db');
  initDatabase(tempDbPath);
  migrateDatabase();
}

function cleanup(tempDbPath) {
  try { fs.unlinkSync(tempDbPath); } catch {}
}

test('richPresence: opt-in/out lifecycle', () => {
  const dbPath = makeTempDb();
  freshDb(dbPath);
  const { giveConsent, revokeConsent, isConsented } = freshModule('../modules/richPresence/richPresence');

  assert.equal(isConsented('g1', 'u1'), false);
  assert.equal(giveConsent('g1', 'u1'), true);
  assert.equal(isConsented('g1', 'u1'), true);
  assert.equal(revokeConsent('g1', 'u1'), true);
  assert.equal(isConsented('g1', 'u1'), false);

  cleanup(dbPath);
});

test('richPresence: session tracking', () => {
  const dbPath = makeTempDb();
  freshDb(dbPath);
  const {
    giveConsent,
    startSession,
    endSession,
    getCurrentlyPlaying,
    getUserStats,
    getLeaderboard
  } = freshModule('../modules/richPresence/richPresence');

  giveConsent('g1', 'u1');

  assert.equal(startSession('g1', 'u1', 'Rocket League'), true);
  const playing = getCurrentlyPlaying('g1');
  assert.equal(playing.length, 1);
  assert.equal(playing[0].game_name, 'Rocket League');

  endSession('g1', 'u1');
  assert.equal(getCurrentlyPlaying('g1').length, 0);

  const stats = getUserStats('g1', 'u1');
  assert.equal(stats.sessions, 1);
  assert.ok(stats.total_seconds >= 0);

  const board = getLeaderboard('g1');
  assert.equal(board.length, 1);
  assert.equal(board[0].game_name, 'Rocket League');
  assert.equal(board[0].sessions, 1);

  cleanup(dbPath);
});

test('richPresence: only consented users are tracked', () => {
  const dbPath = makeTempDb();
  freshDb(dbPath);
  const { startSession, getCurrentlyPlaying } = freshModule('../modules/richPresence/richPresence');

  assert.equal(startSession('g1', 'u2', 'Some Game'), false);
  assert.equal(getCurrentlyPlaying('g1').length, 0);

  cleanup(dbPath);
});

test('richPresence: switching games closes previous session', () => {
  const dbPath = makeTempDb();
  freshDb(dbPath);
  const { giveConsent, handlePresenceUpdate, getCurrentlyPlaying } = freshModule('../modules/richPresence/richPresence');

  giveConsent('g1', 'u1');

  const rocketPresence = {
    activities: [{ type: 0, name: 'Rocket League' }]
  };
  const factorioPresence = {
    activities: [{ type: 0, name: 'Factorio' }]
  };

  handlePresenceUpdate('g1', 'u1', rocketPresence);
  assert.equal(getCurrentlyPlaying('g1')[0].game_name, 'Rocket League');

  handlePresenceUpdate('g1', 'u1', factorioPresence);
  const playing = getCurrentlyPlaying('g1');
  assert.equal(playing.length, 1);
  assert.equal(playing[0].game_name, 'Factorio');

  cleanup(dbPath);
});

test('richPresence: stopping activity ends session', () => {
  const dbPath = makeTempDb();
  freshDb(dbPath);
  const { giveConsent, handlePresenceUpdate, getCurrentlyPlaying } = freshModule('../modules/richPresence/richPresence');

  giveConsent('g1', 'u1');
  handlePresenceUpdate('g1', 'u1', { activities: [{ type: 0, name: 'Game' }] });
  handlePresenceUpdate('g1', 'u1', { activities: [] });
  assert.equal(getCurrentlyPlaying('g1').length, 0);

  cleanup(dbPath);
});
