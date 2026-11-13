#!/usr/bin/env node
'use strict';

/**
 * build-free.js
 *
 * Génère un bundle "version free" de Guardian en supprimant tous les blocs
 * délimités par les balises @premium-start / @premium-end.
 *
 * Usage :
 *   node scripts/build-free.js [--dry-run] [--out <dossier>]
 *
 * Options :
 *   --dry-run   Affiche les fichiers qui seraient modifiés sans rien écrire
 *   --out <dir> Dossier de sortie (défaut : dist/guardian-free)
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const outIdx = args.indexOf('--out');
const OUT_DIR = outIdx !== -1 && args[outIdx + 1]
  ? path.resolve(args[outIdx + 1])
  : path.resolve(__dirname, '../dist/guardian-free');

const SRC_DIR = path.resolve(__dirname, '../guardian');
const REPO_ROOT = path.resolve(__dirname, '..');

const PREMIUM_START = /^\s*\/\/\s*@premium-start\s*$/;
const PREMIUM_END   = /^\s*\/\/\s*@premium-end\s*$/;

// Fichiers/dossiers à exclure entièrement du bundle free (code premium)
const EXCLUDE_PATHS = new Set([
  'modules/initialisation/discordSettings.js',
]);

// Extensions traitées (strip des blocs) — les autres sont copiées telles quelles
const PROCESSED_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

// ── Lecture du .freeignore ────────────────────────────────────────────────────

/**
 * Charge le fichier .freeignore à la racine du repo.
 * Retourne un Set de patterns (globs simples : préfixe exact ou pattern **).
 */
function loadFreeIgnore() {
  const ignorePath = path.join(REPO_ROOT, '.freeignore');
  if (!fs.existsSync(ignorePath)) return new Set();
  return new Set(
    fs.readFileSync(ignorePath, 'utf8')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'))
  );
}

const FREE_IGNORE = loadFreeIgnore();

/**
 * Vérifie si un chemin relatif (depuis REPO_ROOT) est ignoré par .freeignore.
 */
function isFreeIgnored(relFromRoot) {
  const norm = relFromRoot.replace(/\\/g, '/');
  for (const pattern of FREE_IGNORE) {
    if (norm === pattern) return true;
    if (norm.startsWith(pattern.endsWith('/') ? pattern : pattern + '/')) return true;
    if (pattern.includes('*') && new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$').test(norm)) return true;
  }
  return false;
}

let filesProcessed = 0;
let filesStripped = 0;
let filesExcluded = 0;
let filesIgnored = 0;

/**
 * Supprime les blocs @premium-start ... @premium-end d'une chaîne de texte.
 * Retourne { result, blocksRemoved }.
 */
function stripPremiumBlocks(source) {
  const lines = source.split('\n');
  const out = [];
  let inBlock = false;
  let blocksRemoved = 0;

  for (const line of lines) {
    if (PREMIUM_START.test(line)) {
      inBlock = true;
      blocksRemoved++;
      continue;
    }
    if (PREMIUM_END.test(line)) {
      inBlock = false;
      continue;
    }
    if (!inBlock) out.push(line);
  }

  return { result: out.join('\n'), blocksRemoved };
}

/**
 * Copie récursivement SRC_DIR vers OUT_DIR en appliquant le strip.
 */
function processDir(srcDir, outDir) {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const relPath = path.relative(SRC_DIR, srcPath);
    const relFromRoot = path.relative(REPO_ROOT, srcPath);
    const outPath = path.join(outDir, entry.name);

    if (entry.isDirectory()) {
      if (['node_modules', '.git'].includes(entry.name)) continue;
      if (!DRY_RUN) fs.mkdirSync(outPath, { recursive: true });
      processDir(srcPath, outPath);
      continue;
    }

    // Fichier ignoré par .freeignore
    if (isFreeIgnored(relFromRoot)) {
      console.log(`  [IGNORE]  ${relPath}`);
      filesIgnored++;
      continue;
    }

    // Fichier exclu entièrement (code premium)
    if (EXCLUDE_PATHS.has(relPath.replace(/\\/g, '/'))) {
      console.log(`  [EXCLUDE] ${relPath}`);
      filesExcluded++;
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();

    if (PROCESSED_EXTENSIONS.has(ext)) {
      const source = fs.readFileSync(srcPath, 'utf8');
      const { result, blocksRemoved } = stripPremiumBlocks(source);

      if (blocksRemoved > 0) {
        console.log(`  [STRIP x${blocksRemoved}] ${relPath}`);
        filesStripped++;
      }

      if (!DRY_RUN) {
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(outPath, result, 'utf8');
      }
    } else {
      // Copie brute (JSON, .env.example, images, etc.)
      if (!DRY_RUN) {
        fs.mkdirSync(outDir, { recursive: true });
        fs.copyFileSync(srcPath, outPath);
      }
    }

    filesProcessed++;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`\n🔨 Guardian — Build version FREE`);
console.log(`   Source  : ${SRC_DIR}`);
console.log(`   Output  : ${OUT_DIR}`);
console.log(`   Mode    : ${DRY_RUN ? 'DRY RUN (aucune écriture)' : 'production'}\n`);

if (!DRY_RUN) {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

processDir(SRC_DIR, OUT_DIR);

// Copier les fichiers racine utiles
const ROOT_FILES = ['package.json', '.env.example', 'README.md', 'LICENSE', 'CONTRIBUTING.md', 'SECURITY.md'];
for (const f of ROOT_FILES) {
  const src = path.join(REPO_ROOT, f);
  if (fs.existsSync(src)) {
    if (!DRY_RUN) fs.copyFileSync(src, path.join(OUT_DIR, f));
    console.log(`  [COPY]    ${f}`);
  }
}

// Copier les docs publiques (exclure celles listées dans .freeignore)
const docsDir = path.join(REPO_ROOT, 'docs');
if (fs.existsSync(docsDir)) {
  if (!DRY_RUN) fs.mkdirSync(path.join(OUT_DIR, 'docs'), { recursive: true });
  for (const f of fs.readdirSync(docsDir)) {
    const relDoc = `docs/${f}`;
    if (isFreeIgnored(relDoc)) {
      console.log(`  [IGNORE]  ${relDoc}`);
      continue;
    }
    const src = path.join(docsDir, f);
    if (!DRY_RUN) fs.copyFileSync(src, path.join(OUT_DIR, 'docs', f));
    console.log(`  [COPY]    ${relDoc}`);
  }
}

// Générer un .gitignore dans le bundle
if (!DRY_RUN) {
  fs.writeFileSync(path.join(OUT_DIR, '.gitignore'),
    'node_modules/\ndata/\n.env\n.env.*\n!.env.example\n*.db\n*.db-shm\n*.db-wal\n');
  console.log('  [GEN]     .gitignore');
}

// ── Vérification anti-leak premium ──────────────────────────────────────────
if (!DRY_RUN) {
  const LEAK_PATTERNS = [
    /require\(['"].*discordSettings['"]\)/,
    /\/\/\s*@premium-start/,
    /\/\/\s*@premium-end/,
  ];
  const leaks = [];
  function checkLeaks(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) { checkLeaks(p); continue; }
      if (!['.js', '.mjs', '.cjs'].includes(path.extname(entry.name))) continue;
      const src = fs.readFileSync(p, 'utf8');
      for (const pattern of LEAK_PATTERNS) {
        if (pattern.test(src)) leaks.push(`${path.relative(OUT_DIR, p)} — ${pattern}`);
      }
    }
  }
  checkLeaks(OUT_DIR);
  if (leaks.length > 0) {
    console.error('\n❌ LEAK PREMIUM DÉTECTÉ dans le bundle free :');
    for (const l of leaks) console.error(`   ${l}`);
    process.exit(1);
  }
  console.log('  [CHECK]   Aucun leak premium détecté ✅');
}

console.log(`\n✅ Build terminé`);
console.log(`   Fichiers traités  : ${filesProcessed}`);
console.log(`   Blocs strippés    : ${filesStripped} fichier(s)`);
console.log(`   Fichiers exclus   : ${filesExcluded} fichier(s)`);
console.log(`   Fichiers ignorés  : ${filesIgnored} fichier(s) (.freeignore)`);
if (DRY_RUN) console.log(`\n⚠️  DRY RUN — aucun fichier écrit.\n`);
else console.log(`\n📦 Bundle disponible dans : ${OUT_DIR}\n`);
