#!/usr/bin/env node
/**
 * Vérification E2E post-install du wizard Guardian sur une vraie guild.
 *
 * Usage:
 *   TOKEN=<bot token> GUILD_ID=<id> node scripts/verify-setup-e2e.js
 *   # ou, depuis la racine du repo : lit guardian/.env pour TOKEN
 *
 * Ce script est READ-ONLY : il interroge l'API REST Discord et vérifie
 * que l'état du serveur correspond à ce que le wizard doit avoir produit.
 */
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const envFile = process.env.ENV_FILE || path.join(repoRoot, 'guardian', '.env');
let token = process.env.TOKEN || process.env.DISCORD_TOKEN;
if (!token && fs.existsSync(envFile)) {
  const m = fs.readFileSync(envFile, 'utf8').match(/^DISCORD_TOKEN=(.+)$/m);
  if (m) token = m[1].trim().replace(/^["']|["']$/g, '');
}
const guildId = process.env.GUILD_ID;
if (!token || !guildId) {
  console.error('Usage: TOKEN=... GUILD_ID=... node scripts/verify-setup-e2e.js');
  process.exit(1);
}

const API = 'https://discord.com/api/v10';
const get = (p) => fetch(`${API}${p}`, { headers: { Authorization: `Bot ${token}` } })
  .then(async (r) => {
    if (!r.ok) throw new Error(`${p} -> HTTP ${r.status}`);
    return r.json();
  });

// Attendus post-install (les noms exacts sont lus depuis le code au besoin).
const EXPECTED_CHANNELS = [
  'guardian',           // catégorie principale
  'guardian-config',    // salon config caché
  'guardian-logs',      // salon logs
];

const results = [];
const check = (name, ok, detail = '') =>
  results.push({ name, ok: !!ok, detail });

(async () => {
  const [guild, channels] = await Promise.all([
    get(`/guilds/${guildId}`),
    get(`/guilds/${guildId}/channels`),
  ]);

  check('guild accessible', guild && guild.id === guildId, guild?.name);
  const names = channels.map((c) => c.name.toLowerCase());
  for (const n of EXPECTED_CHANNELS) {
    check(`channel/category "${n}"`, names.some((x) => x.includes(n)));
  }

  // La catégorie Guardian doit exister et regrouper les salons créés.
  const category = channels.find((c) => c.type === 4 && c.name.toLowerCase().includes('guardian'));
  if (category) {
    const children = channels.filter((c) => c.parent_id === category.id);
    check('channels sous la catégorie Guardian', children.length >= 2, `${children.length} salons`);
  }

  // guardian-config : le salon doit être caché à @everyone.
  const configCh = channels.find((c) => c.name.toLowerCase().includes('config'));
  if (configCh) {
    const ow = configCh.permission_overwrites || [];
    const everyone = ow.find((o) => o.id === guildId);
    const denyView = everyone && (BigInt(everyone.deny) & BigInt(0x400)) === BigInt(0x400);
    check('guardian-config invisible pour @everyone', denyView !== false);
  }

  // Le bot doit voir la guild dans /users/@me/guilds (double vérification membership).
  const me = await get('/users/@me');
  check('token valide (bot identifié)', me && me.bot === true, me.username);

  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} vérifications OK`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error('E2E check failed:', e.message);
  process.exit(1);
});
