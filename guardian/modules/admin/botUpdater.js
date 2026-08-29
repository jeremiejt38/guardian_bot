const { execFile } = require('child_process');
const path = require('path');
const logger = require('../logs/logger');
const { setConfig, getConfig } = require('../../database/db');
const { sendAdminDmMessage } = require('./adminPanel');

const GLOBAL = '__global__';
const ROOT_DIR = path.resolve(__dirname, '../../');

function getBotAdminId() {
  return process.env.BOT_ADMIN_ID || getConfig(GLOBAL, 'admin', 'bot_admin_id', null);
}

function setBotAdminId(id) {
  setConfig(GLOBAL, 'admin', 'bot_admin_id', id);
}

function isBotAdmin(userId) {
  const id = getBotAdminId();
  if (!id) return false;
  return userId === id;
}

async function bootstrapAdminIfNeeded(client, guilds) {
  if (getBotAdminId()) return;
  const sorted = [...guilds.values()].sort((a, b) => {
    const aJoined = getConfig(a.id, 'setup', 'inviter_id', null) ? 0 : 1;
    const bJoined = getConfig(b.id, 'setup', 'inviter_id', null) ? 0 : 1;
    return aJoined - bJoined;
  });
  for (const guild of sorted) {
    const inviterId = getConfig(guild.id, 'setup', 'inviter_id', null)
      ?? getConfig(guild.id, 'setup', 'owner_id', null)
      ?? guild.ownerId;
    if (!inviterId) continue;
    try {
      const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
      const user = await client.users.fetch(inviterId).catch(() => null);
      if (!user) continue;
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`bot:admin:bootstrap:confirm:${inviterId}`)
          .setLabel('✅ Oui, je suis l\'admin bot')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('bot:admin:bootstrap:skip')
          .setLabel('Non')
          .setStyle(ButtonStyle.Secondary)
      );
      await user.send({
        content: [
          `## 🛡️ Guardian — Configuration Admin Système`,
          ``,
          `Tu es la première personne à avoir ajouté **Guardian**. Veux-tu être désigné comme **administrateur système** du bot ?`,
          ``,
          `> L'admin système reçoit les alertes bot (mises à jour, erreurs, serveurs) et peut déclencher les mises à jour depuis Discord.`,
          `> Tu peux aussi définir \`BOT_ADMIN_ID\` manuellement dans le fichier \`.env\`.`,
        ].join('\n'),
        components: [row],
      });
      logger.info(`botUpdater: bootstrap DM envoyé à ${inviterId} (guild ${guild.id})`);
      break;
    } catch (err) {
      logger.warn(`botUpdater: bootstrap DM échoué pour ${inviterId}`, err);
    }
  }
}

function isRunningUnderPM2() {
  return Boolean(process.env.PM2_HOME || process.env.pm_id !== undefined);
}

const GITHUB_REPO = process.env.GITHUB_FREE_REPO ?? 'jeremiejt38/Guardian_Discord_Bot_Free';

async function fetchReleaseNotes(version) {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/tags/v${version}`, {
      headers: { 'User-Agent': 'Guardian-Discord-Bot', 'Accept': 'application/vnd.github+json' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.body?.trim() || null;
  } catch {
    return null;
  }
}

async function fetchChangelogRange(fromVersion, toVersion) {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=50`, {
      headers: { 'User-Agent': 'Guardian-Discord-Bot', 'Accept': 'application/vnd.github+json' }
    });
    if (!res.ok) return null;
    const releases = await res.json();
    if (!Array.isArray(releases)) return null;

    const parseV = (v) => v.replace(/^v/, '').split('.').map(Number);
    const gt = (a, b) => {
      for (let i = 0; i < 3; i++) {
        if ((a[i] ?? 0) > (b[i] ?? 0)) return true;
        if ((a[i] ?? 0) < (b[i] ?? 0)) return false;
      }
      return false;
    };

    const from = parseV(fromVersion);
    const to = parseV(toVersion);

    const relevant = releases
      .filter((r) => {
        const v = parseV(r.tag_name);
        return gt(v, from) && !gt(v, to);
      })
      .sort((a, b) => {
        const va = parseV(a.tag_name);
        const vb = parseV(b.tag_name);
        return gt(vb, va) ? -1 : 1;
      });

    if (relevant.length === 0) return await fetchReleaseNotes(toVersion);

    const parts = [];
    for (const r of relevant) {
      const body = r.body?.trim();
      if (body) parts.push(`### ${r.tag_name}\n${body}`);
    }
    return parts.length > 0 ? parts.join('\n\n') : null;
  } catch {
    return null;
  }
}

async function translateText(text, targetLang) {
  if (!targetLang || targetLang === 'en') return text;
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Guardian-Discord-Bot' }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return text;
    const data = await res.json();
    const translated = data[0]?.map(seg => seg[0]).join('') ?? text;
    return translated || text;
  } catch {
    return text;
  }
}

async function notifyBotAdminUpdate(client, fromVersion, toVersion) {
  const adminId = getBotAdminId();
  if (!adminId) return;
  try {
    const adminUser = await client.users.fetch(adminId).catch(() => null);
    if (!adminUser) {
      logger.warn(`botUpdater: BOT_ADMIN_ID=${adminId} introuvable sur Discord`);
      return;
    }

    const pm2Running = isRunningUnderPM2();
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const releaseNotes = await fetchChangelogRange(fromVersion, toVersion);

    const locale = adminUser.locale ?? 'en';
    const langCode = locale.split('-')[0];

    const lines = [
      `## 🔄 Guardian updated — v${fromVersion} → **v${toVersion}**`,
      ``,
      `> You receive this message as the bot system administrator.`,
      ``,
    ];

    if (releaseNotes) {
      const raw = releaseNotes.length > 800 ? releaseNotes.slice(0, 800) + '\n*(truncated — see full changelog below)*' : releaseNotes;
      const body = await translateText(raw, langCode);
      lines.push(`### What's new in v${toVersion}`);
      lines.push(body);
      lines.push(``);
    }

    lines.push(
      pm2Running
        ? `> ✅ PM2 detected — the bot will restart automatically after the update.`
        : `> ⚠️ PM2 not detected — you will need to restart the bot manually.`,
      ``,
      `📋 Full changelog : https://github.com/${GITHUB_REPO}/releases/tag/v${toVersion}`
    );

    const msg = lines.join('\n');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`bot:admin:update:confirm`)
        .setLabel('🚀 Mettre à jour maintenant')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`bot:admin:update:skip`)
        .setLabel('⏭️ Ignorer')
        .setStyle(ButtonStyle.Secondary)
    );

    await sendAdminDmMessage(client, { content: msg, components: [row] });
    logger.info(`botUpdater: notification MAJ envoyée à BOT_ADMIN_ID=${adminId}`);
  } catch (err) {
    logger.error('botUpdater: erreur notification admin', err);
  }
}

async function performUpdate(interaction) {
  if (!isBotAdmin(interaction.user.id)) {
    await interaction.reply({ content: '❌ Tu n\'es pas autorisé à effectuer cette action.', ephemeral: true }).catch(() => {});
    return;
  }

  await interaction.deferUpdate().catch(() => {});

  const pm2Running = isRunningUnderPM2();

  const updating = [
    `## ⏳ Mise à jour en cours…`,
    ``,
    `\`git pull\` + \`npm install\` en cours d'exécution.`,
    pm2Running
      ? `> Le bot redémarrera automatiquement via PM2 dans quelques secondes.`
      : `> ⚠️ Redémarre le bot manuellement une fois la mise à jour terminée.`
  ].join('\n');

  await interaction.message?.edit({ content: updating, components: [] }).catch(() => {});

  execFile('git', ['pull', '--ff-only'], { cwd: ROOT_DIR }, (gitErr, gitOut, gitStderr) => {
    if (gitErr) {
      logger.error('botUpdater: git pull échoué', gitErr);
      interaction.message?.edit({
        content: `## ❌ Échec git pull\n\`\`\`\n${gitStderr || gitErr.message}\n\`\`\``,
        components: []
      }).catch(() => {});
      return;
    }

    logger.info(`botUpdater: git pull OK\n${gitOut}`);

    execFile('npm', ['install', '--omit=dev'], { cwd: ROOT_DIR }, (npmErr, npmOut, npmStderr) => {
      if (npmErr) {
        logger.error('botUpdater: npm install échoué', npmErr);
        interaction.message?.edit({
          content: `## ❌ Échec npm install\n\`\`\`\n${npmStderr || npmErr.message}\n\`\`\``,
          components: []
        }).catch(() => {});
        return;
      }

      logger.info(`botUpdater: npm install OK`);

      const done = pm2Running
        ? `## ✅ Mise à jour appliquée — redémarrage automatique dans 3s…`
        : [
            `## ✅ Mise à jour appliquée`,
            ``,
            `> Le nouveau code est en place, mais le bot tourne encore sur l'ancienne version en mémoire.`,
            `> **Redémarre-le pour appliquer les changements :**`,
            `> 1. Arrête le terminal avec \`Ctrl+C\``,
            `> 2. Relance avec \`npm start\` (ou \`node index.js\`)`,
            ``,
            `> 💡 Pour éviter cette étape à l'avenir, utilise **PM2** : \`pm2 start index.js --name guardian\``,
          ].join('\n');

      interaction.message?.edit({ content: done, components: [] }).catch(() => {});

      if (pm2Running) {
        setTimeout(() => process.exit(0), 3000);
      }
    });
  });
}

module.exports = { getBotAdminId, setBotAdminId, isBotAdmin, isRunningUnderPM2, notifyBotAdminUpdate, performUpdate, bootstrapAdminIfNeeded };
