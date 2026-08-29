#!/usr/bin/env node
/**
 * Guardian tag script
 *
 * Bump package.json version, update README badge/changelog, create and push an annotated tag.
 * Works on any branch (dev/beta/main). Does not build or publish the free bundle.
 *
 * Usage:
 *   node scripts/tag.js patch              # 0.23.5 -> 0.23.6
 *   node scripts/tag.js minor              # 0.23.5 -> 0.24.0
 *   node scripts/tag.js major              # 0.23.5 -> 1.0.0
 *   node scripts/tag.js 0.24.1             # explicit version
 *
 * Roadmap helpers:
 *   node scripts/tag.js roadmap add "Feature description"
 *   node scripts/tag.js roadmap done "Feature description" "v0.24.0"
 *   node scripts/tag.js roadmap post-add "v1.2" "Feature" "Description"
 *   node scripts/tag.js roadmap post-done "Feature"
 */

const fs = require('fs');
const path = require('path');

const {
  run,
  loadEnv,
  bumpVersion,
  getCommitsSince,
  getLastTag,
  categorizeCommits,
  updateReadme,
  REPO_ROOT,
  README_PATH,
  PKG_PATH,
} = require('./release-helpers');

loadEnv();

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
  const re = new RegExp(`- \\[[ x]\\] \\*\\*${escapedDesc}\\*\\*([^\n]*)`, 'g');
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

function runOrLog(dryRun, cmd, label) {
  if (dryRun) {
    console.log(`[dry-run] ${label ?? cmd}`);
    return '';
  }
  return run(cmd);
}

function writeOrLog(dryRun, filePath, data, label) {
  if (dryRun) {
    console.log(`[dry-run] would write ${path.relative(REPO_ROOT, filePath)}`);
    return;
  }
  fs.writeFileSync(filePath, data);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const bumpArg = args.find((a) => a !== '--dry-run') ?? 'patch';

  if (dryRun) {
    console.log('🏷️  DRY RUN — no files will be written and no git commands executed\n');
  }

  // Roadmap sub-commands
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
    runOrLog(dryRun, 'git add README.md');
    runOrLog(dryRun, 'git commit -m "docs: roadmap update"');
    runOrLog(dryRun, 'git push origin HEAD');
    console.log('✅ README committed and pushed.');
    return;
  }

  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  const oldVersion = pkg.version;
  const newVersion = bumpVersion(oldVersion, bumpArg);
  const newTag = `v${newVersion}`;

  console.log(`\n🏷️  Guardian tag: v${oldVersion} → ${newTag}\n`);

  const dirty = run('git status --porcelain', { silent: true });
  if (dirty) {
    console.error('❌ Working tree is dirty. Commit or stash changes first.');
    process.exit(1);
  }

  const existingTags = run('git tag', { silent: true }).split('\n');
  if (existingTags.includes(newTag)) {
    console.error(`❌ Tag ${newTag} already exists.`);
    process.exit(1);
  }

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
    `**Full diff**: https://github.com/jeremiejt38/guardian_bot/compare/${lastTag ?? 'HEAD'}...${newTag}`
  ].join('\n');

  console.log('\n── Tag notes preview ───────────────────────────────────');
  console.log(releaseBody);
  console.log('────────────────────────────────────────────────────────\n');

  pkg.version = newVersion;
  writeOrLog(dryRun, PKG_PATH, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`✅ package.json updated → ${newVersion}`);

  const isMinorOrMajor = bumpArg === 'minor' || bumpArg === 'major' || /^\d+\.\d+\.0$/.test(newVersion);
  let readmeUpdated = false;
  if (isMinorOrMajor) {
    const originalReadme = fs.readFileSync(README_PATH, 'utf8');
    const newReadme = updateReadme(newVersion, newTag, lastTag, changelog, { updateChangelog: true });
    if (newReadme) {
      readmeUpdated = true;
      writeOrLog(dryRun, README_PATH, fs.readFileSync(README_PATH, 'utf8'), 'README.md');
      // restore original in dry-run so updateReadme mutation is not persisted
      if (dryRun) fs.writeFileSync(README_PATH, originalReadme, 'utf8');
    }
  } else {
    // still update badge for patch
    const originalReadme = fs.readFileSync(README_PATH, 'utf8');
    const newReadme = updateReadme(newVersion, newTag, lastTag, changelog, { updateChangelog: false });
    if (newReadme) {
      readmeUpdated = true;
      writeOrLog(dryRun, README_PATH, fs.readFileSync(README_PATH, 'utf8'), 'README.md');
      if (dryRun) fs.writeFileSync(README_PATH, originalReadme, 'utf8');
    }
  }
  if (readmeUpdated) console.log(`✅ README.md updated (${isMinorOrMajor ? 'badge + changelog' : 'badge only'})`);

  runOrLog(dryRun, 'git add guardian/package.json');
  if (readmeUpdated) runOrLog(dryRun, 'git add README.md');

  const commitBody = [
    `- package.json: ${oldVersion} → ${newVersion}`,
    readmeUpdated ? '- README: badge + changelog entry updated' : '- README: badge updated',
    `- tag: ${newTag}`,
    '',
    changelog ? `Changes since ${lastTag ?? 'beginning'}:` : null,
    changelog ? changelog.split('\n').filter(l => l.match(/^[-*]/)).slice(0, 10).join('\n') : null,
  ].filter(l => l !== null).join('\n');

  runOrLog(dryRun, `git commit -m "chore(release): bump v${newVersion}" -m "${commitBody.replace(/"/g, "'")}"`, 'git commit');
  runOrLog(dryRun, `git tag -a ${newTag} HEAD -m "${releaseBody.replace(/"/g, "'")}"`, 'git tag');
  console.log(`✅ Committed and tagged ${newTag}`);

  runOrLog(dryRun, 'git push origin HEAD --tags', 'git push');
  console.log('✅ Pushed commit and tag to origin\n');
}

main().catch((err) => {
  console.error('❌ Tag failed:', err.message);
  process.exit(1);
});
