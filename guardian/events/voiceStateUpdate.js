const { getDb } = require('../database/db');
const { untrackTempVoice } = require('../modules/games/gamesVocal');
const { pendingJoinMessages } = require('../modules/games/tempVoiceInteraction');

const deletionTimers = new Map();

function scheduleDeletion(channel, delayMs) {
  clearTimeout(deletionTimers.get(channel.id));
  const timer = setTimeout(async () => {
    if (channel.members.size === 0) {
      await channel.delete('Guardian: temporary channel cleanup').catch(() => undefined);
      untrackTempVoice(channel.id);
    }
    deletionTimers.delete(channel.id);
  }, delayMs);

  deletionTimers.set(channel.id, timer);
}

module.exports = {
  name: 'voiceStateUpdate',
  async execute(client, oldState, newState) {
    const db = getDb();

    // Si l'utilisateur rejoint un vocal temporaire, supprimer le message éphémère d'invitation
    const newChannel = newState.channel;
    const oldChannel = oldState.channel;
    if (newChannel && newChannel.id !== oldChannel?.id) {
      const tracked = db.prepare('SELECT channel_id FROM vocal_temp WHERE channel_id = ?').get(newChannel.id);
      if (tracked) {
        const key = `${newState.member.id}:${newChannel.id}`;
        const msg = pendingJoinMessages.get(key);
        if (msg) {
          await msg.delete().catch(() => {});
          pendingJoinMessages.delete(key);
        }
      }
    }

    for (const state of [oldState, newState]) {
      const channel = state.channel;
      if (!channel) {
        continue;
      }

      const tracked = db.prepare('SELECT channel_id FROM vocal_temp WHERE channel_id = ?').get(channel.id);
      if (!tracked) {
        continue;
      }

      if (channel.members.size === 0) {
        scheduleDeletion(channel, 0);
      } else if (deletionTimers.has(channel.id)) {
        clearTimeout(deletionTimers.get(channel.id));
        deletionTimers.delete(channel.id);
      }
    }
  }
};
