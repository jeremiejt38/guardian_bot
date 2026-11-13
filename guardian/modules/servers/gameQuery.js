const dgram = require('dgram');
const logger = require('../logs/logger');

// Requête A2S_PLAYER (protocole Source Engine) — fonctionne pour la plupart
// des jeux Steam. Retourne { players, max } ou null si non supporté/timeout.
function queryPlayers(ip, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const sock = dgram.createSocket('udp4');
    let done = false;
    const finish = (v) => { if (!done) { done = true; try { sock.close(); } catch {} resolve(v); } };
    sock.on('error', () => finish(null));
    const timer = setTimeout(() => finish(null), timeoutMs);
    sock.on('message', (buf) => {
      clearTimeout(timer);
      // Réponse challenge (type 0x41) non gérée — beaucoup de serveurs répondent directement.
      if (buf.length >= 6 && buf[4] === 0x44) {
        finish({ players: buf[5], max: buf.length > 6 ? buf[6] : null });
      } else {
        finish(null);
      }
    });
    try {
      // A2S_PLAYER : 0xFFFFFFFF header + 'U' + 0xFFFFFFFF challenge
      sock.send(Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0x55, 0xFF, 0xFF, 0xFF, 0xFF]), port, ip, (e) => { if (e) finish(null); });
    } catch (e) {
      logger.warn(`gameQuery: send failed ${ip}:${port} — ${e.message}`);
      finish(null);
    }
  });
}

module.exports = { queryPlayers };
