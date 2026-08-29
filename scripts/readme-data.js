/**
 * README source data — edit this file to update the README.
 * Then run: node scripts/generate-readme.js
 *
 * The generator will rebuild README.md from this data and push it.
 */

'use strict';

const GITHUB_REPO = 'jeremiejt38/guardian_bot';
const GITHUB_BASE = `https://github.com/${GITHUB_REPO}`;

// ── Tagline ──────────────────────────────────────────────────────────────────

const TAGLINE = 'Member management, games, temporary voice channels, moderation and configuration — all from an interactive Discord wizard.';

// ── Features table ───────────────────────────────────────────────────────────

const FEATURES = [
  { emoji: '🧙', module: 'Setup wizard',       desc: 'Guided 9-step configuration directly inside Discord' },
  { emoji: '👥', module: 'Members',             desc: 'Invite → Member onboarding (3 modes: Classic / Strict / Direct), sponsorship, behavior score, rules acceptance' },
  { emoji: '🎮', module: 'Games',               desc: 'Per-game opt-in, dedicated channels (chat / gallery / updates), Steam & RAWG.io integration' },
  { emoji: '🔊', module: 'Temporary voice',     desc: 'On-demand creation, auto-deletion, prefix/suffix/limit' },
  { emoji: '🛡️', module: 'Moderation',          desc: 'Anti-spam, blacklist, logs, behavior score, auto-expulsion, Discord AutoMod integration' },
  { emoji: '🖥️', module: 'Game servers',        desc: 'Proposal, approval and tracking of community game servers' },
  { emoji: '⚙️', module: 'Config panels',       desc: 'Persistent admin panels per module (channels, roles, games…)' },
  { emoji: '🔔', module: 'DM notifications',    desc: 'Per-category private alerts (bot updates, errors, moderation, promotions…)' },
  { emoji: '🔄', module: 'Migrations',          desc: 'Versioned DB & Discord migrations — zero data loss on upgrades' },
  { emoji: '📚', module: 'Server guides',       desc: 'Auto-generated read-only guide channels (getting started, promotion, games, commands)' },
  { emoji: '🌐', module: 'i18n',                desc: 'French, English, Spanish, Portuguese, Italian, German support' },
  { emoji: '🔒', module: 'Unlimited games',     desc: 'More than 15 games per server (Premium)' },
  { emoji: '🔒', module: 'Steam changelogs',   desc: 'Automatic Steam patch notes in a dedicated channel (Premium)' },
  { emoji: '🔒', module: 'Custom welcome',     desc: 'Personalized welcome DM with variables (Premium)' },
  { emoji: '🔒', module: 'Voice customization', desc: 'Custom prefix / suffix / member limit per temporary room (Premium)' },
  { emoji: '🔒', module: 'Suggestions forum',   desc: 'Structured suggestion system with statuses (Premium)' },
  { emoji: '🔒', module: 'Game server list',   desc: 'Community-approved server listing channel (Premium)' },
];

// ── Environment variables ─────────────────────────────────────────────────────

const ENV_REQUIRED = [
  { variable: 'DISCORD_TOKEN', desc: 'Bot token (Developer Portal → Bot → Token)' },
  { variable: 'CLIENT_ID',     desc: 'Application ID (Developer Portal → General Information)' },
  { variable: 'NODE_ENV',      desc: '`production` or `development`' },
];

const ENV_OPTIONAL = [
  { variable: 'BOT_ADMIN_ID',    desc: 'Discord ID of the bot system administrator — receives alerts and can trigger updates from Discord. If empty, the bot will automatically ask the first user who added it.' },
  { variable: 'RAWG_API_KEY',    desc: '[RAWG.io](https://rawg.io/apidocs) API key — enriches game profiles (description, genres, platforms). Works without it.' },
  { variable: 'DATABASE_PATH',   desc: 'Path to the SQLite database. Default: `./data/guardian.db`' },
  { variable: 'GITHUB_TOKEN',    desc: 'GitHub personal access token — used by the release script to create GitHub releases automatically.' },
];

// ── Core libraries ────────────────────────────────────────────────────────────

const LIBRARIES = [
  { lib: '[discord.js](https://discord.js.org) v14', role: 'Full Discord API interaction (events, slash commands, buttons, modals…)' },
  { lib: '`node:sqlite` *(built-in Node 22+)*',      role: 'Embedded SQLite database — no external dependency' },
  { lib: '`dotenv`',                                  role: 'Environment variable loading from `.env`' },
  { lib: '`node:child_process` *(built-in)*',        role: 'Runs `git pull` + `npm install` for automatic updates' },
  { lib: '`node:os` / `node:fs` *(built-in)*',       role: 'System info (RAM, uptime, DB size) for the admin panel' },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

const TESTS = {
  command: 'cd guardian && npm test',
  description: 'Tests run on an in-memory SQLite database and cover the setup wizard, config panels, games and moderation.',
  e2e: 'E2E tests (`tests/e2e.test.js`) cover 6 complete integration flows: setup, games, members, moderation, migrations, notifications.',
};

// ── Changelog ─────────────────────────────────────────────────────────────────
// Each entry: { version, title, desc, links }
// links: array of { label, url } or just strings (commit hashes)

const CHANGELOG = [
  {
    version: 'v0.29',
    title: 'Deployment & Hetzner updates',
    desc: 'Hetzner deployment scripts with `git pull --ff-only`, Guides category placed below Configuration category',
    links: ['012d043'],
  },
  {
    version: 'v0.28',
    title: 'Migration & premium locking',
    desc: 'Guild data export/import for free ↔ premium migration, stable CommonJS SQLite export/import, `/premium` info command, `/license` locked in free build',
    links: ['73a5fd0', 'aeec7d2', '6fd5b27'],
  },
  {
    version: 'v0.27',
    title: 'Permission check, admin recap & commands',
    desc: 'Permission startup check via DM, `/status` guild command, `/setup resume`, Recap tab in bot admin panel',
    links: ['127b066'],
  },
  {
    version: 'v0.24 – v0.26',
    title: 'Stabilization & free/premium split',
    desc: 'Free build gating, release automation, E2E tests, bug fixes',
    links: [{ label: 'Full releases on GitHub', url: `${GITHUB_BASE}/releases` }],
  },
  {
    version: 'v0.23',
    title: 'Community onboarding & invite modes',
    desc: '3 invite modes (Classic / Strict / Direct member), `#devenir-membre` ephemeral flow (prerequisites + bio modal + submit), `#rejoindre-notre-serveur` (server stats, Guardian features, owner presentation), strict invite mode blocks vocal + `#general` for guests, rules acceptance (Discord Screening + button for non-community), Discord AutoMod→behavior score integration, server guides (read-only channels or forums), new options notifier on update (DM owner with unconfigured settings)',
    links: [{ label: 'Full diff', url: `${GITHUB_BASE}/compare/v0.22.1...v0.23.5` }],
  },
  {
    version: 'v0.22',
    title: 'Security & Commands',
    desc: '`/ping` command + 2s cooldown on slash commands, security fix on bootstrap userId from interaction, prerelease confirmation validation against bot cache',
    links: ['41ab089', 'b6c18ff'],
  },
  {
    version: 'v0.21',
    title: 'Admin Panel DM',
    desc: 'Interactive system admin panel in DM, 4 views (Status/Servers/DB/Notifications), per-category alert toggles, 15min inactivity timeout, auto-bootstrap of `BOT_ADMIN_ID`, `/admin` command, guild join/leave alerts, contextual Close button, GitHub release notes fetched and auto-translated (Google Translate unofficial API, fallback to English), precise restart instructions without PM2',
    links: ['4d466bc', '390af8c', 'c5e7f3b', '0d4383e', '19eb775', '7bcf9d6'],
  },
  {
    version: 'v0.20',
    title: 'Auto-update & Bot admin',
    desc: '`BOT_ADMIN_ID` in `.env`, automatic update via DM button (`git pull` + `npm install` + PM2 restart)',
    links: ['6f5be4a'],
  },
  {
    version: 'v0.19',
    title: 'RAWG.io & non-Steam games',
    desc: 'RAWG.io integration, non-Steam pseudo App ID `000XXXXXXX`, DB migration v7, toggle button style fixes, adaptive step 3 navigation, multi-language ES/PT/IT, dynamic post-setup summary',
    links: ['39fb8e5', '2ff1aa8', '0f1ab99', '0f16d07', 'eb8e5bd', '708c684'],
  },
  {
    version: 'v0.18',
    title: 'Non-Steam games',
    desc: 'Pseudo App ID generator, `isNonSteamId()`, duplicate detection fix',
    links: ['4f1f1e4'],
  },
  {
    version: 'v0.17',
    title: 'Backup & Diagnostics',
    desc: 'Backup message protection, enriched `guardian-logs`, bot panel diagnostics, game server password',
    links: ['480a873'],
  },
  {
    version: 'v0.16',
    title: 'Setup UX & Game Requests',
    desc: 'Improved setup UX, member game requests, channel topics, role colors',
    links: ['8d6b846'],
  },
  {
    version: 'v0.15',
    title: 'Auto-update & Prerelease',
    desc: 'Stable auto-update notification, DM prerelease confirmation, `prerelease` field in `package.json`',
    links: ['c421882'],
  },
  {
    version: 'v0.14 – v0.13 – v0.12',
    title: 'Setup UX & Onboarding',
    desc: 'Per-grade role creation, game review step before linking, `#become-member` channel, enriched new member DM, bulk DM at finalize, FAQ as forum channel, channel topics',
    links: ['2102523', '54d5d9c', '536130f', '0743b5f'],
  },
  {
    version: 'v0.11',
    title: 'Resilience, Security & Setup UX',
    desc: 'Auto-detect Guardian channels, smart game channel sorting, role audit, bot role repositioning, Steam top 250 detection, rate limiting debounce, backup/restore via `#guardian-backup`',
    links: [{ label: 'Full history on GitHub', url: `${GITHUB_BASE}/releases` }],
  },
  {
    version: 'v0.10',
    title: 'Robustness & Notifications',
    desc: 'Configurable DM notifications, versioned DB/Discord migrations, Discord error handling, game list pagination, E2E integration tests',
    links: [{ label: 'Full history on GitHub', url: `${GITHUB_BASE}/releases` }],
  },
  {
    version: 'v0.1 – v0.9',
    title: 'Foundations',
    desc: 'Architecture scaffold, SQLite, setup wizard, members, games, voice, moderation, i18n FR+EN',
    links: [{ label: 'Full history on GitHub', url: `${GITHUB_BASE}/releases` }],
  },
];

// ── Roadmap pre-v1 ────────────────────────────────────────────────────────────
// done: true/false, doneVersion: string (optional)

const ROADMAP_V1 = {
  blocking: [
    { done: true,  label: 'End-to-end integration tests',       desc: '8 E2E tests, 6 complete flows, 95 tests total',                                                    doneVersion: 'v0.10.5' },
    { done: true,  label: 'Discord 50013 error handling',        desc: '`safeDiscordAction` + global interactionCreate safety net',                                        doneVersion: 'v0.10.3' },
    { done: true,  label: 'Automatic DB migration',              desc: 'Versioned `MIGRATIONS` array system',                                                               doneVersion: 'v0.10.1' },
    { done: true,  label: '`/help` command',                     desc: 'Contextual help for 7 modules, embeds, i18n',                                                       doneVersion: 'v0.10.4' },
  ],
  important: [
    { done: true,  label: 'Multi-language',                      desc: 'ES, PT, IT + DE (FR+EN already present)',                                                           doneVersion: 'v0.19.5' },
    { done: true,  label: 'Post-install summary',                desc: 'Dynamic `#welcome` message with roles, games, modules, next steps',                                 doneVersion: 'v0.19.7' },
    { done: true,  label: 'Game list pagination',                desc: '3 games per page, unlimited',                                                                        doneVersion: 'v0.10.2' },
    { done: true,  label: 'Step 3 validation',                   desc: '`#general` required before proceeding',                                                              doneVersion: 'v0.10.2' },
    { done: true,  label: 'Rate limiting',                       desc: '4-level debounce 600ms→5s, `rateLimit.js`, auto-cleanup',                                           doneVersion: 'v0.11.1' },
    { done: true,  label: 'Bot system admin panel',              desc: 'DM panel, alert toggles, auto-update, bootstrap',                                                   doneVersion: 'v0.21.0' },
  ],
  nice: [
    { done: true,  label: '`/ping`',                             desc: 'Check bot responsiveness and display latency',                                                      doneVersion: 'v0.22.0' },
    { done: true,  label: 'Slash command cooldown',              desc: 'Global rate limiting on slash commands',                                                             doneVersion: 'v0.22.0' },
    { done: true,  label: 'Discord forum support',               desc: 'Forum Channels for suggestions and reports',                                                         doneVersion: 'v0.23.x' },
    { done: true,  label: 'Permission check on startup',         desc: 'Warn bot admin via DM if `ManageChannels`/`ManageRoles` missing in a guild instead of silently failing',                          doneVersion: 'v0.27.2' },
    { done: true,  label: '`/status`',                           desc: 'Display current server configuration state (modules, channels, members) without opening wizard. Guild admins only, never bot admin.', doneVersion: 'v0.27.2' },
    { done: true,  label: 'Bot admin panel — Recap tab',         desc: '5th tab in admin DM panel showing aggregated anonymous stats for the past 30 days across all guilds (new members, active games, moderation incidents count). On-demand only, no automatic DM spam.', doneVersion: 'v0.27.2' },
    { done: true,  label: '`/setup resume`',                     desc: 'Resume the wizard from anywhere via slash command',                                                                                doneVersion: 'v0.27.2' },
  ],
};

// ── Roadmap post-v1 ───────────────────────────────────────────────────────────
// sections: array of { version, title, note?, features: [{ label, desc, done? }] }

const ROADMAP_POST_V1 = [
  {
    version: 'v1.1',
    title: 'Moderation (guild-level)',
    note: '⚠️ All moderation features target **guild admins only** via their configured channels/DM. The bot system admin (BOT_ADMIN_ID) has no visibility into per-guild users, bans or sanctions.',
    features: [
      { label: 'Temporary sanctions',       desc: 'Mute/ban with automatic expiration — stored in DB, lifted automatically' },
      { label: '`/warn` with thresholds',   desc: 'Auto-escalation per guild config: warn → mute → kick → ban' },
      { label: 'Moderation log export',     desc: 'Export `#guardian-logs` entries as CSV' },
      { label: 'Anti-raid',                 desc: 'Mass join detection and temporary channel lockdown' },
    ],
  },
  {
    version: 'v1.2',
    title: 'UX & Commands',
    features: [
      { label: 'Error watchdog counter',    desc: 'Track `uncaughtException` count in bot admin panel Status view' },
    ],
  },
  {
    version: 'v1.3',
    title: 'Games & Community',
    features: [
      { label: 'Steam notifications',       desc: 'Direct Steam API webhook instead of polling' },
      { label: 'Forum Channels support',    desc: 'Forum Channels for suggestions and reports' },
      { label: 'Behavior leaderboard',      desc: 'Member ranking by behavior score, visible in a dedicated channel' },
      { label: 'Multi-server config copy',  desc: 'Copy Guardian config from one guild to another (for multi-community managers)' },
    ],
  },
  {
    version: 'v1.4',
    title: 'Extended i18n',
    features: [
      { label: 'More languages',            desc: 'NL, PL, RU, ZH, JA, KO — structure ready, JSON files to create' },
    ],
  },
  {
    version: 'v1.5',
    title: 'Admin & Infrastructure',
    features: [
      { label: 'Config export/import',      desc: 'Save/restore a complete server configuration as JSON' },
      { label: 'Web dashboard',             desc: 'Lightweight interface to view bot-level stats and logs without Discord' },
      { label: 'Internal REST API',         desc: 'Endpoints for third-party integrations (incoming webhooks, stats)' },
    ],
  },
];

module.exports = {
  GITHUB_REPO,
  GITHUB_BASE,
  TAGLINE,
  FEATURES,
  ENV_REQUIRED,
  ENV_OPTIONAL,
  LIBRARIES,
  TESTS,
  CHANGELOG,
  ROADMAP_V1,
  ROADMAP_POST_V1,
};
