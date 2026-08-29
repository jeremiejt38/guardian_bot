#!/usr/bin/env node
/**
 * Guardian release script
 *
 * Release:
 *   node scripts/release.js patch              # 0.23.5 → 0.23.6
 *   node scripts/release.js minor              # 0.23.5 → 0.24.0
 *   node scripts/release.js major              # 0.23.5 → 1.0.0
 *   node scripts/release.js 0.24.1             # explicit version
 *
 * Roadmap — pre-v1:
 *   node scripts/release.js roadmap add "Feature description"
 *   node scripts/release.js roadmap done "Feature description" "v0.24.0"
 *
 * Roadmap — post-v1:
 *   node scripts/release.js roadmap post-add "v1.2" "Feature" "Description"
 *   node scripts/release.js roadmap post-done "Feature"
 *
 * Requirements:
 *   - GITHUB_TOKEN env var (or in guardian/.env)
 *   - git configured with push access
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ── Load .env from repo root ────────────────────────────────────────────────
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = 'jeremiejt38/guardian_bot';
const GITHUB_FREE_TOKEN = process.env.GITHUB_FREE_RELEASE_TOKEN;
const GITHUB_FREE_REPO = process.env.GITHUB_FREE_REPO ?? 'jeremiejt38/guardian_bot_Free';
const PKG_PATH = path.resolve(__dirname, '../guardian/package.json');
const README_PATH = path.resolve(__dirname, '../README.md');
const FREE_BUILD_SCRIPT = path.resolve(__dirname, 'build-free.js');
const FREE_OUT_DIR = path.resolve(__dirname, '../dist/guardian-free');

// ── Helpers ──────────────────────────────────────────────────────────────────

function run(cmd, opts = {}) {
  const result = execSync(cmd, { encoding: 'utf8', stdio: opts.silent ? 'pipe' : 'inherit', ...opts });
  return result ? result.trim() : '';
}

function bumpVersion(current, bump) {
  const [major, minor, patch] = current.split('.').map(Number);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
  if (/^\d+\.\d+\.\d+$/.test(bump)) return bump;
  throw new Error(`Invalid bump type: ${bump}. Use major | minor | patch | x.y.z`);
}

function getCommitsSince(tag) {
  try {
    return run(`git log ${tag}..HEAD --pretty=format:"%s" --no-merges`, { silent: true });
  } catch {
    return run(`git log --pretty=format:"%s" --no-merges -50`, { silent: true });
  }
}

function getLastTag() {
  try {
    return run('git describe --tags --abbrev=0', { silent: true });
  } catch {
    return null;
  }
}

function categorizeCommits(rawLog) {
  const lines = rawLog.split('\n').map((l) => l.trim()).filter(Boolean);

  const categories = {
    feat:     { label: '✨ New features', items: [] },
    fix:      { label: '🐛 Bug fixes', items: [] },
    refactor: { label: '♻️ Refactoring', items: [] },
    perf:     { label: '⚡ Performance', items: [] },
    docs:     { label: '📝 Documentation', items: [] },
    chore:    { label: '🔧 Chores', items: [] },
    other:    { label: '📦 Other', items: [] }
  };

  for (const line of lines) {
    const m = line.match(/^(feat|fix|refactor|perf|docs|chore|test|style|build|ci)(\(.+?\))?!?:\s*(.+)$/i);
    if (m) {
      const type = m[1].toLowerCase();
      const scope = m[2] ? m[2].slice(1, -1) : null;
      const msg = m[3];
      const display = scope ? `**${scope}**: ${msg}` : msg;
      const cat = categories[type] ?? categories.other;
      cat.items.push(display);
    } else {
      categories.other.items.push(line);
    }
  }

  const sections = [];
  for (const cat of Object.values(categories)) {
    if (cat.items.length === 0) continue;
    sections.push(`### ${cat.label}`);
    for (const item of cat.items) sections.push(`- ${item}`);
    sections.push('');
  }

  return sections.join('\n').trim();
}

function buildCommitSummary(changelog) {
  const lines = (changelog || '').split('\n').filter((l) => l.trim() && !l.startsWith('###'));
  return lines
    .map((l) => l.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 6)
    .join(' · ');
}

function updateReadme(newVersion, newTag, lastTag, changelog) {
  if (!fs.existsSync(README_PATH)) {
    console.warn('⚠️  README.md not found — skipping README update.');
    return false;
  }

  let content = fs.readFileSync(README_PATH, 'utf8');

  // 1. Update version badge
  content = content.replace(
    /version-v[\d.]+(?:-[a-z]+)?-blue/,
    `version-${newTag}-blue`
  );

  // 2. Update changelog table — group by minor version
  const minor = newVersion.split('.').slice(0, 2).join('.');
  const minorLabel = `**v${minor}**`;
  const commitRange = lastTag
    ? `[Full diff](https://github.com/${GITHUB_REPO}/compare/${lastTag}...${newTag})`
    : `[Full history](https://github.com/${GITHUB_REPO}/releases)`;
  const summary = buildCommitSummary(changelog);

  const tableHeaderRe = /(\| Version \| Description \|\n\|[-| ]+\|\n)/;

  // Check if an entry for this minor version already exists in the table
  // Pattern: | **v0.23** | ... |\n| | ... |
  const existingMinorRe = new RegExp(
    `(\\| ${minorLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\| )([^\\n]*)( \\|\\n\\| \\| )([^\\n]*)( \\|)`,
    ''
  );

  if (existingMinorRe.test(content)) {
    // Merge: prepend new patch summary to description, update the Full diff link end tag
    content = content.replace(existingMinorRe, (_, p1, oldDesc, p3, oldCommits, p5) => {
      // Update description: prepend new items (skip if empty or already present)
      const newDesc = summary && summary !== oldDesc
        ? (oldDesc === '*See full changelog*' ? summary : `${summary} · ${oldDesc}`)
        : oldDesc;
      // Update the diff link: replace the end tag in the existing Full diff link
      // e.g. compare/v0.22.1...v0.23.16 → compare/v0.22.1...v0.23.17
      const newCommits = oldCommits.replace(
        /(\[Full diff\]\(https:\/\/github\.com\/[^)]+\/compare\/[^.]+\.[^.]+\.[^.]+\.\.\.)v[\d.]+(\))/,
        `$1${newTag}$2`
      );
      return `${p1}${newDesc}${p3}${newCommits}${p5}`;
    });
    console.log(`✅ README changelog: merged into existing ${minorLabel} entry`);
  } else if (tableHeaderRe.test(content)) {
    // Create new minor entry
    const newRow = [
      `| ${minorLabel} | ${summary || '*See full changelog*'} |`,
      `| | ${commitRange} |`
    ].join('\n');
    content = content.replace(tableHeaderRe, `$1${newRow}\n`);
    console.log(`✅ README changelog: created new ${minorLabel} entry`);
  } else {
    console.warn('⚠️  Could not find changelog table in README.md — skipping changelog insertion.');
  }

  fs.writeFileSync(README_PATH, content, 'utf8');
  return true;
}

async function createGithubRelease(tag, body, prerelease = false) {
  if (!GITHUB_TOKEN) {
    console.warn('⚠️  GITHUB_TOKEN not set — skipping GitHub release creation.');
    console.warn('   Set GITHUB_TOKEN in your .env file to enable automatic releases.');
    return null;
  }

  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'Guardian-Discord-Bot',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      tag_name: tag,
      name: tag,
      body,
      draft: false,
      prerelease
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${err}`);
  }
  return await res.json();
}

// ── Roadmap helpers ──────────────────────────────────────────────────────────

function roadmapAdd(description) {
  if (!fs.existsSync(README_PATH)) throw new Error('README.md not found');
  let content = fs.readFileSync(README_PATH, 'utf8');

  const marker = '### 🟡 Nice-to-have (pre-V1)';
  const idx = content.indexOf(marker);
  if (idx === -1) throw new Error('Could not find "🟡 Nice-to-have" section in README');

  const lineEnd = content.indexOf('\n', idx);
  const newItem = `\n- [ ] **${description}**`;
  content = content.slice(0, lineEnd + 1) + newItem + content.slice(lineEnd + 1);

  fs.writeFileSync(README_PATH, content, 'utf8');
  console.log(`✅ Added to pre-v1 roadmap: ${description}`);
}

function roadmapDone(description, version) {
  if (!fs.existsSync(README_PATH)) throw new Error('README.md not found');
  let content = fs.readFileSync(README_PATH, 'utf8');

  const escapedDesc = description.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`- \\[ \\] \\*\\*${escapedDesc}\\*\\*([^\n]*)`, 'g');
  if (!re.test(content)) throw new Error(`Item not found: "${description}"`);

  const suffix = version ? ` ✅ ${version}` : ' ✅';
  content = content.replace(
    new RegExp(`- \\[ \\] \\*\\*${escapedDesc}\\*\\*([^\n]*)`, 'g'),
    (_, rest) => `- [x] **${description}**${rest.replace(/ ✅.*$/, '')}${suffix}`
  );

  fs.writeFileSync(README_PATH, content, 'utf8');
  console.log(`✅ Marked as done: ${description} ${suffix}`);
}

function roadmapPostAdd(section, feature, description) {
  if (!fs.existsSync(README_PATH)) throw new Error('README.md not found');
  let content = fs.readFileSync(README_PATH, 'utf8');

  // Find the section header (e.g. "### v1.2")
  const sectionRe = new RegExp(`(### ${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\n]*\n(?:>[^\n]*\n)?\n\| Feature[^\n]*\n\|[-| ]+\|\n)`);
  const match = content.match(sectionRe);
  if (!match) throw new Error(`Section "${section}" not found in post-v1 roadmap`);

  const newRow = `| ${feature} | ${description} |\n`;
  content = content.replace(sectionRe, `$1${newRow}`);

  fs.writeFileSync(README_PATH, content, 'utf8');
  console.log(`✅ Added to post-v1 roadmap section ${section}: ${feature}`);
}

function roadmapPostDone(feature) {
  if (!fs.existsSync(README_PATH)) throw new Error('README.md not found');
  let content = fs.readFileSync(README_PATH, 'utf8');

  const escapedFeature = feature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(\\| )${escapedFeature}( \\| )`);
  if (!re.test(content)) throw new Error(`Feature "${feature}" not found in post-v1 roadmap`);

  content = content.replace(re, `$1~~${feature}~~ ✅$2`);
  fs.writeFileSync(README_PATH, content, 'utf8');
  console.log(`✅ Marked as done in post-v1 roadmap: ${feature}`);
}

// ── Free bundle helpers ───────────────────────────────────────────────────────

/**
 * Génère un zip du dossier FREE_OUT_DIR.
 * Retourne le chemin du zip généré.
 */
function buildFreeZip(version) {
  const zipName = `guardian-free-v${version}.zip`;
  const zipPath = path.resolve(__dirname, '../dist', zipName);
  fs.mkdirSync(path.resolve(__dirname, '../dist'), { recursive: true });
  const zipExcludes = [
    '*.DS_Store', '.env', 'node_modules/*', 'data/*',
    'tests/*', 'e2e/*', 'docs/E2E_CHECKLIST.md',
  ].map(p => `-x "${p}"`).join(' ');
  run(`zip -r "${zipPath}" . ${zipExcludes}`, { cwd: FREE_OUT_DIR });
  console.log(`✅ Free bundle zipped: ${zipPath}`);
  return zipPath;
}

/**
 * Crée une GitHub Release sur le repo Free et uploade le zip en asset.
 */
async function publishFreeRelease(tag, releaseBody, zipPath, prerelease = false, lastTag = null) {
  if (!GITHUB_FREE_TOKEN) {
    console.warn('⚠️  GITHUB_FREE_RELEASE_TOKEN non défini — publication free ignorée.');
    return null;
  }

  const zipName = path.basename(zipPath);
  const zipData = fs.readFileSync(zipPath);

  const releaseRes = await fetch(`https://api.github.com/repos/${GITHUB_FREE_REPO}/releases`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GITHUB_FREE_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'guardian-release-script'
    },
    body: JSON.stringify({ tag_name: tag, name: `Guardian Free ${tag}`, body: releaseBody, draft: false, prerelease })
  });

  if (!releaseRes.ok) {
    const err = await releaseRes.text();
    console.error(`❌ GitHub Free release creation failed: ${releaseRes.status} ${err}`);
    return null;
  }

  const release = await releaseRes.json();
  console.log(`✅ Free release created: ${release.html_url}`);

  const uploadUrl = release.upload_url.replace('{?name,label}', '');
  const uploadRes = await fetch(`${uploadUrl}?name=${encodeURIComponent(zipName)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GITHUB_FREE_TOKEN}`,
      'Content-Type': 'application/zip',
      'User-Agent': 'guardian-release-script'
    },
    body: zipData
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    console.error(`❌ Asset upload failed: ${uploadRes.status} ${err}`);
    return release;
  }

  const asset = await uploadRes.json();
  console.log(`✅ Asset uploaded: ${asset.browser_download_url}`);

  // Push full source bundle to free repo via git
  const repoRoot = path.resolve(__dirname, '..');
  const tmpDir = path.resolve(__dirname, '../dist/free-repo-tmp');
  const freeRepoUrl = `https://${GITHUB_FREE_TOKEN}@github.com/${GITHUB_FREE_REPO}.git`;

  console.log('\n📤 Pushing source bundle to free repo...');

  // Copy legal files into bundle before push
  for (const f of ['LICENSE', 'CONTRIBUTING.md', 'SECURITY.md']) {
    const src = path.join(repoRoot, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(FREE_OUT_DIR, f));
  }

  // Clone free repo, overwrite with bundle, commit, push
  fs.rmSync(tmpDir, { recursive: true, force: true });
  run(`git clone --depth=1 "${freeRepoUrl}" "${tmpDir}"`);

  // Remove all tracked files except .git
  run(`git rm -rf --ignore-unmatch .`, { cwd: tmpDir });

  // Copy bundle content into cloned repo
  run(`cp -r "${FREE_OUT_DIR}/." "${tmpDir}/"`);

  // Commit and push
  run(`git config user.email "release-bot@guardian"`, { cwd: tmpDir });
  run(`git config user.name "Guardian Release Bot"`, { cwd: tmpDir });
  run(`git add -A`, { cwd: tmpDir });

  const patchList = releaseBody
    .split('\n')
    .filter(l => l.match(/^[-*] \*\*/))
    .slice(0, 15)
    .join('\n');
  const freeCommitBody = patchList
    ? `Patches included since ${lastTag ?? 'previous release'}:\n${patchList}`
    : 'See release notes for details.';

  run(`git commit -m "release: ${tag}" -m "${freeCommitBody.replace(/"/g, "'")}" --allow-empty`, { cwd: tmpDir });
  run(`git push origin main`, { cwd: tmpDir });

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`✅ Source bundle pushed to free repo`);

  return release;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const bumpArg = process.argv[2] ?? 'patch';

  // ── Roadmap sub-commands ──────────────────────────────────────────────────
  if (bumpArg === 'roadmap') {
    const sub = process.argv[3];
    if (sub === 'add') {
      const desc = process.argv[4];
      if (!desc) { console.error('Usage: roadmap add "Feature description"'); process.exit(1); }
      roadmapAdd(desc);
    } else if (sub === 'done') {
      const desc = process.argv[4];
      const ver = process.argv[5] ?? '';
      if (!desc) { console.error('Usage: roadmap done "Feature description" "v0.24.0"'); process.exit(1); }
      roadmapDone(desc, ver);
    } else if (sub === 'post-add') {
      const section = process.argv[4];
      const feature = process.argv[5];
      const description = process.argv[6];
      if (!section || !feature || !description) { console.error('Usage: roadmap post-add "v1.2" "Feature" "Description"'); process.exit(1); }
      roadmapPostAdd(section, feature, description);
    } else if (sub === 'post-done') {
      const feature = process.argv[4];
      if (!feature) { console.error('Usage: roadmap post-done "Feature"'); process.exit(1); }
      roadmapPostDone(feature);
    } else {
      console.error('Unknown roadmap sub-command. Use: add | done | post-add | post-done');
      process.exit(1);
    }
    run('git add README.md');
    run(`git commit -m "docs: roadmap update"`);
    run('git push origin main');
    console.log('✅ README committed and pushed.');
    return;
  }

  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  const oldVersion = pkg.version;
  const newVersion = bumpVersion(oldVersion, bumpArg);
  const newTag = `v${newVersion}`;

  console.log(`\n🚀 Guardian release: v${oldVersion} → ${newTag}\n`);

  // 1. Check working tree is clean
  // 1a. Check we are on main
  const currentBranch = run('git rev-parse --abbrev-ref HEAD', { silent: true });
  if (currentBranch !== 'main') {
    console.error(`❌ Release must be run from 'main' branch (current: '${currentBranch}').`);
    console.error(`   Run: git checkout main && git merge beta && node scripts/release.js ${bumpArg}`);
    process.exit(1);
  }

  const dirty = run('git status --porcelain', { silent: true });
  if (dirty) {
    console.error('❌ Working tree is dirty. Commit or stash changes first.');
    process.exit(1);
  }

  // 2. Check tag doesn't already exist
  const existingTags = run('git tag', { silent: true }).split('\n');
  if (existingTags.includes(newTag)) {
    console.error(`❌ Tag ${newTag} already exists.`);
    process.exit(1);
  }

  // 3. Generate changelog
  const lastTag = getLastTag();
  console.log(`📋 Generating changelog since ${lastTag ?? 'beginning'}...`);
  const rawLog = getCommitsSince(lastTag);
  const changelog = categorizeCommits(rawLog);

  if (!changelog) {
    console.warn('⚠️  No commits found since last tag.');
  }

  const releaseBody = [
    `## What's new in ${newTag}`,
    '',
    changelog || '*No changes documented.*',
    '',
    `**Full diff**: https://github.com/${GITHUB_REPO}/compare/${lastTag ?? 'HEAD'}...${newTag}`
  ].join('\n');

  console.log('\n── Release notes preview ──────────────────────────────');
  console.log(releaseBody);
  console.log('────────────────────────────────────────────────────────\n');

  // 4. Bump version in package.json
  pkg.version = newVersion;
  fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`✅ package.json updated → ${newVersion}`);

  // 5. Update README (badge + changelog table)
  const readmeUpdated = updateReadme(newVersion, newTag, lastTag, changelog);
  if (readmeUpdated) console.log('✅ README.md updated (badge + changelog entry)');

  // 6. Commit + tag + push
  run('git add guardian/package.json');
  if (readmeUpdated) run('git add README.md');

  const commitBody = [
    `- package.json: ${pkg.version.replace(newVersion, lastTag ?? '?')} → ${newVersion}`,
    readmeUpdated ? '- README: badge + changelog entry updated' : null,
    `- tag: ${newTag}`,
    '',
    changelog ? `Changes since ${lastTag ?? 'beginning'}:` : null,
    changelog ? changelog.split('\n').filter(l => l.match(/^[-*]/)).slice(0, 10).join('\n') : null,
  ].filter(l => l !== null).join('\n');

  run(`git commit -m "chore: bump version to ${newVersion}" -m "${commitBody.replace(/"/g, "'")}"`);
  run(`git tag -a ${newTag} HEAD -m "release ${newTag}"`);
  console.log(`✅ Committed and tagged ${newTag}`);

  run('git push origin main --tags');
  console.log('✅ Pushed to origin');

  // 7. Create GitHub release
  console.log('📡 Creating GitHub release...');
  const release = await createGithubRelease(newTag, releaseBody, pkg.prerelease ?? false);
  if (release) {
    console.log(`✅ GitHub release created: ${release.html_url}`);
  }

  // 8. Build free bundle
  if (GITHUB_FREE_TOKEN) {
    console.log('\n📦 Building free bundle...');
    run(`node "${FREE_BUILD_SCRIPT}" --out "${FREE_OUT_DIR}"`);

    // 9. Zip + publish on free repo
    console.log('🚀 Publishing free release...');
    const freeReleaseBody = [
      `## Guardian Free ${newTag}`,
      '',
      '> Version auto-hébergée — sans les features Premium.',
      '',
      changelog || '*No changes documented.*',
      '',
      `**Diff complet** : https://github.com/${GITHUB_REPO}/compare/${lastTag ?? 'HEAD'}...${newTag}`,
      '',
      '### Installation',
      '1. Télécharge le `.zip` ci-dessous',
      '2. Décompresse et configure ton `.env` (voir `.env.example`)',
      '3. `npm install && npm start`'
    ].join('\n');

    const zipPath = buildFreeZip(newVersion);
    await publishFreeRelease(newTag, freeReleaseBody, zipPath, pkg.prerelease ?? false, lastTag);
  } else {
    console.warn('\n⚠️  GITHUB_FREE_RELEASE_TOKEN absent — étape free ignorée.');
    console.warn('   Définis GITHUB_FREE_RELEASE_TOKEN dans guardian/.env pour activer la publication free.\n');
  }

  // 10. Backport bump commit to beta and dev
  console.log('\n🔄 Backporting version bump to beta and dev...');
  for (const branch of ['beta', 'dev']) {
    try {
      run(`git checkout ${branch}`);
      run(`git merge main --no-edit -m "chore: sync ${branch} with main after release ${newTag}"`);
      run(`git push origin ${branch}`);
      console.log(`✅ ${branch} synced`);
    } catch (err) {
      console.warn(`⚠️  Could not sync ${branch}: ${err.message}`);
      console.warn(`   Run manually: git checkout ${branch} && git merge main && git push origin ${branch}`);
    } finally {
      run(`git checkout main`);
    }
  }

  console.log(`\n🎉 Release ${newTag} complete!\n`);
}

main().catch((err) => {
  console.error('❌ Release failed:', err.message);
  process.exit(1);
});
