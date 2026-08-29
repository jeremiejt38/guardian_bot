#!/usr/bin/env node
/**
 * Shared helpers for Guardian release/tag scripts.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const PKG_PATH = path.resolve(REPO_ROOT, 'guardian/package.json');
const README_PATH = path.resolve(REPO_ROOT, 'README.md');
const GITHUB_REPO = 'jeremiejt38/guardian_bot';
const GITHUB_FREE_REPO = process.env.GITHUB_FREE_REPO ?? 'jeremiejt38/guardian_bot_Free';

function run(cmd, opts = {}) {
  const result = execSync(cmd, { encoding: 'utf8', stdio: opts.silent ? 'pipe' : 'inherit', ...opts });
  return result ? result.trim() : '';
}

function loadEnv() {
  const envPath = path.resolve(REPO_ROOT, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

function bumpVersion(current, bump) {
  const base = current.replace(/-.*$/, '');
  const [major, minor, patch] = base.split('.').map(Number);
  if (Number.isNaN(major) || Number.isNaN(minor) || Number.isNaN(patch)) {
    throw new Error(`Invalid current version: ${current}`);
  }
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
    return run('git log --pretty=format:"%s" --no-merges -50', { silent: true });
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

function updateVersionBadge(content, newTag) {
  return content.replace(
    /version-v[\d.]+(?:-[a-z]+)?-blue/,
    `version-${newTag}-blue`
  );
}

function updateReadmeChangelog(content, newVersion, newTag, lastTag, changelog) {
  const minor = newVersion.split('.').slice(0, 2).join('.');
  const minorLabel = `**v${minor}**`;
  const commitRange = lastTag
    ? `[Full diff](https://github.com/${GITHUB_REPO}/compare/${lastTag}...${newTag})`
    : `[Full history](https://github.com/${GITHUB_REPO}/releases)`;
  const summary = buildCommitSummary(changelog);

  const tableHeaderRe = /(\| Version \| Description \|\n\|[-| ]+\|\n)/;
  const escapedMinor = minorLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const existingMinorRe = new RegExp(
    `(\\| ${escapedMinor} \\| )([^\\n]*)( \\|\\n\\| \\| )([^\\n]*)( \\|)`,
    ''
  );

  if (existingMinorRe.test(content)) {
    content = content.replace(existingMinorRe, (_, p1, oldDesc, p3, oldCommits, p5) => {
      const newDesc = summary && summary !== oldDesc
        ? (oldDesc === '*See full changelog*' ? summary : `${summary} · ${oldDesc}`)
        : oldDesc;
      const newCommits = oldCommits.replace(
        /(\[Full diff\]\(https:\/\/github\.com\/[^)]+\/compare\/[^.]+\.[^.]+\.[^.]+\.\.\.)v[\d.]+(\))/,
        `$1${newTag}$2`
      );
      return `${p1}${newDesc}${p3}${newCommits}${p5}`;
    });
  } else if (tableHeaderRe.test(content)) {
    const newRow = [
      `| ${minorLabel} | ${summary || '*See full changelog*'} |`,
      `| | ${commitRange} |`
    ].join('\n');
    content = content.replace(tableHeaderRe, `$1${newRow}\n`);
  } else {
    console.warn('⚠️  Could not find changelog table in README.md — skipping changelog insertion.');
  }

  return content;
}

function updateReadme(newVersion, newTag, lastTag, changelog, { updateChangelog = true } = {}) {
  if (!fs.existsSync(README_PATH)) {
    console.warn('⚠️  README.md not found — skipping README update.');
    return false;
  }

  let content = fs.readFileSync(README_PATH, 'utf8');
  content = updateVersionBadge(content, newTag);
  if (updateChangelog) {
    content = updateReadmeChangelog(content, newVersion, newTag, lastTag, changelog);
  }

  fs.writeFileSync(README_PATH, content, 'utf8');
  return true;
}

async function createGithubRelease(repo, token, tag, body, prerelease = false) {
  if (!token) {
    console.warn('⚠️  Token not set — skipping GitHub release creation.');
    return null;
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/releases`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
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

function buildFreeZip(version, freeOutDir) {
  const zipName = `guardian-free-v${version}.zip`;
  const zipPath = path.resolve(REPO_ROOT, 'dist', zipName);
  fs.mkdirSync(path.resolve(REPO_ROOT, 'dist'), { recursive: true });
  const zipExcludes = [
    '*.DS_Store', '.env', 'node_modules/*', 'data/*',
    'tests/*', 'e2e/*', 'docs/E2E_CHECKLIST.md',
  ].map(p => `-x "${p}"`).join(' ');
  run(`zip -r "${zipPath}" . ${zipExcludes}`, { cwd: freeOutDir });
  console.log(`✅ Free bundle zipped: ${zipPath}`);
  return zipPath;
}

async function publishFreeRelease(tag, releaseBody, zipPath, lastTag, prerelease = false) {
  const freeToken = process.env.GITHUB_FREE_RELEASE_TOKEN;
  if (!freeToken) {
    console.warn('⚠️  GITHUB_FREE_RELEASE_TOKEN non défini — publication free ignorée.');
    return null;
  }

  const zipName = path.basename(zipPath);
  const zipData = fs.readFileSync(zipPath);

  const releaseRes = await fetch(`https://api.github.com/repos/${GITHUB_FREE_REPO}/releases`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${freeToken}`,
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
      Authorization: `Bearer ${freeToken}`,
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

  const tmpDir = path.resolve(REPO_ROOT, 'dist/free-repo-tmp');
  const freeRepoUrl = `https://${freeToken}@github.com/${GITHUB_FREE_REPO}.git`;

  console.log('\n📤 Pushing source bundle to free repo...');

  for (const f of ['LICENSE', 'CONTRIBUTING.md', 'SECURITY.md']) {
    const src = path.join(REPO_ROOT, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(freeOutDir, f));
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
  run(`git clone --depth=1 "${freeRepoUrl}" "${tmpDir}"`);
  run('git rm -rf --ignore-unmatch .', { cwd: tmpDir });
  run(`cp -r "${freeOutDir}/." "${tmpDir}/"`);
  run('git config user.email "release-bot@guardian"', { cwd: tmpDir });
  run('git config user.name "Guardian Release Bot"', { cwd: tmpDir });
  run('git add -A', { cwd: tmpDir });

  const patchList = releaseBody
    .split('\n')
    .filter(l => l.match(/^[-*] \*\*/))
    .slice(0, 15)
    .join('\n');
  const freeCommitBody = patchList
    ? `Patches included since ${lastTag ?? 'previous release'}:\n${patchList}`
    : 'See release notes for details.';

  run(`git commit -m "release: ${tag}" -m "${freeCommitBody.replace(/"/g, "'")}" --allow-empty`, { cwd: tmpDir });
  run('git push origin main', { cwd: tmpDir });

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`✅ Source bundle pushed to free repo`);

  return release;
}

module.exports = {
  REPO_ROOT,
  PKG_PATH,
  README_PATH,
  GITHUB_REPO,
  GITHUB_FREE_REPO,
  run,
  loadEnv,
  bumpVersion,
  getCommitsSince,
  getLastTag,
  categorizeCommits,
  buildCommitSummary,
  updateReadme,
  createGithubRelease,
  buildFreeZip,
  publishFreeRelease,
};
