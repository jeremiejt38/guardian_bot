// Détection de mise à jour Steam pour les serveurs Pelican.
// Compare le buildid installé (appmanifest_*.acf dans /steamapps, lu via
// l'API fichiers Pelican) au buildid public publié (api.steamcmd.net).
const pelican = require('./pelicanApi');
const logger = require('../logs/logger');

// Source 1 — l'update manager de l'egg log 'Installed version: X, latest public patch: Y' dans /update.log.
async function checkUpdateLog(identifier) {
  const raw = await pelican.getFileContents(identifier, '/update.log').catch(() => null);
  if (!raw) return null;
  const last = [...raw.matchAll(/Installed version:\s*([^,]+),\s*latest public patch:\s*(\S+)/g)].pop();
  if (!last) return null;
  const [, installed, latest] = last;
  return { update: installed.trim() !== latest.trim(), appid: null, installed: installed.trim(), latest: latest.trim() };
}

// Retourne { update: bool, installed, latest } ou null si vérif impossible (jeu non-Steam, fichier absent…).
async function checkSteamUpdate(identifier) {
  const viaLog = await checkUpdateLog(identifier);
  if (viaLog) return viaLog;
  const files = await pelican.listFiles(identifier, '/steamapps').catch(() => []);
  const manifest = files.find((f) => /appmanifest_\d+\.acf$/.test(f?.attributes?.name || ''));
  if (!manifest) return null;
  const appid = Number(manifest.attributes.name.match(/appmanifest_(\d+)\.acf/)[1]);
  const raw = await pelican.getFileContents(identifier, `/steamapps/${manifest.attributes.name}`).catch(() => null);
  const installed = Number(raw?.match(/"buildid"\s+"(\d+)"/)?.[1] || 0);
  if (!installed) return null;
  const info = await fetch(`https://api.steamcmd.net/v1/info/${appid}`, { signal: AbortSignal.timeout(8000) })
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const depots = info?.data?.[appid]?.depots || {};
  const publicIds = Object.values(depots).map((d) => Number(d?.branches?.public?.buildid || 0)).filter(Boolean);
  if (!publicIds.length) return null;
  const latest = Math.max(...publicIds);
  logger.info(`UpdateCheck ${identifier}: appid=${appid} installed=${installed} latest=${latest}`);
  return { update: installed < latest, appid, installed, latest };
}

module.exports = { checkSteamUpdate };
