const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { DATABASE_PATH, GRADE_NAMES } = require('../config');
const logger = require('../modules/logs/logger');

let db;

class StatementCompat {
  constructor(statement) {
    this.statement = statement;
  }

  run(...params) {
    return this.statement.run(...params);
  }

  get(...params) {
    return this.statement.get(...params);
  }

  all(...params) {
    return this.statement.all(...params);
  }
}

class DatabaseCompat {
  constructor(filePath) {
    this.db = new DatabaseSync(filePath);
  }

  pragma(query) {
    this.db.exec(`PRAGMA ${query}`);
  }

  exec(sql) {
    this.db.exec(sql);
  }

  prepare(sql) {
    return new StatementCompat(this.db.prepare(sql));
  }

  transaction(fn) {
    return (...args) => {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        const result = fn(...args);
        this.db.exec('COMMIT');
        return result;
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    };
  }

  close() {
    this.db.close();
  }
}

function initDatabase(customPath = DATABASE_PATH) {
  if (db) {
    return db;
  }

  const dir = path.dirname(customPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new DatabaseCompat(customPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS guilds (
      guild_id TEXT PRIMARY KEY,
      setup_done INTEGER NOT NULL DEFAULT 0,
      setup_hash TEXT,
      owner_id TEXT,
      language TEXT NOT NULL DEFAULT 'fr'
    );

    CREATE TABLE IF NOT EXISTS guild_config (
      guild_id TEXT NOT NULL,
      module TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (guild_id, module, key)
    );

    CREATE TABLE IF NOT EXISTS grades (
      guild_id TEXT NOT NULL,
      grade_name TEXT NOT NULL CHECK (grade_name IN ('invite', 'membre', 'moderateur', 'manager', 'owner')),
      role_id TEXT NOT NULL,
      PRIMARY KEY (guild_id, grade_name)
    );

    CREATE TABLE IF NOT EXISTS games (
      game_id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      steam_app_id TEXT,
      role_id TEXT,
      channel_text_id TEXT,
      channel_galerie_id TEXT,
      channel_changelog_id TEXT,
      category_id TEXT,
      galerie_enabled INTEGER NOT NULL DEFAULT 0,
      changelog_enabled INTEGER NOT NULL DEFAULT 1,
      text_channel_enabled INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS member_games (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      game_id INTEGER NOT NULL,
      PRIMARY KEY (guild_id, user_id, game_id)
    );

    CREATE TABLE IF NOT EXISTS members (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      grade TEXT NOT NULL,
      join_date TEXT NOT NULL,
      bio TEXT,
      parrain_id TEXT,
      score_comportement INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS sanctions (
      sanction_id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('warn', 'mute', 'kick', 'ban')),
      reason TEXT NOT NULL,
      applied_by TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      duration TEXT,
      auto INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS changelogs_seen (
      game_id INTEGER PRIMARY KEY,
      last_changelog_id TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS servers_jeu (
      server_id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      game TEXT NOT NULL,
      ip TEXT NOT NULL,
      port INTEGER NOT NULL,
      password TEXT,
      approved INTEGER NOT NULL DEFAULT 1,
      last_status TEXT CHECK (last_status IN ('online', 'offline', 'unstable')),
      last_check TEXT,
      status_message_id TEXT
    );

    CREATE TABLE IF NOT EXISTS parrainage (
      guild_id TEXT NOT NULL,
      parrain_id TEXT NOT NULL,
      invite_id TEXT NOT NULL,
      date TEXT NOT NULL,
      PRIMARY KEY (guild_id, invite_id)
    );

    CREATE TABLE IF NOT EXISTS vocal_temp (
      channel_id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      game_id INTEGER NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS promotion_requests (
      request_id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')) DEFAULT 'pending',
      bio TEXT,
      sponsorship_id TEXT,
      message_id TEXT,
      created_at TEXT NOT NULL,
      reviewed_at TEXT,
      reviewed_by TEXT,
      reason TEXT
    );

    CREATE TABLE IF NOT EXISTS reports (
      report_id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      reporter_id TEXT NOT NULL,
      target_text TEXT NOT NULL,
      reason TEXT NOT NULL,
      evidence TEXT,
      status TEXT NOT NULL CHECK (status IN ('open', 'handled')) DEFAULT 'open',
      message_id TEXT,
      created_at TEXT NOT NULL,
      handled_at TEXT,
      handled_by TEXT
    );
  `);
  db.prepare('INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (1, ?)').run(new Date().toISOString());

  return db;
}

/**
 * Versioned migrations. Each entry runs once and is tracked in schema_version.
 * Add new entries at the END only — never edit existing ones.
 */
const MIGRATIONS = [
  {
    version: 2,
    description: 'servers_jeu: add status_message_id',
    up(conn) {
      const cols = conn.prepare('PRAGMA table_info(servers_jeu)').all().map((c) => c.name);
      if (!cols.includes('status_message_id')) {
        conn.exec('ALTER TABLE servers_jeu ADD COLUMN status_message_id TEXT');
      }
    }
  },
  {
    version: 3,
    description: 'servers_jeu: add approved',
    up(conn) {
      const cols = conn.prepare('PRAGMA table_info(servers_jeu)').all().map((c) => c.name);
      if (!cols.includes('approved')) {
        conn.exec('ALTER TABLE servers_jeu ADD COLUMN approved INTEGER NOT NULL DEFAULT 1');
      }
    }
  },
  {
    version: 4,
    description: 'members: add last_regen_at',
    up(conn) {
      const cols = conn.prepare('PRAGMA table_info(members)').all().map((c) => c.name);
      if (!cols.includes('last_regen_at')) {
        conn.exec('ALTER TABLE members ADD COLUMN last_regen_at TEXT');
      }
    }
  },
  {
    version: 5,
    description: 'games: add text_channel_enabled (default 0)',
    up(conn) {
      const cols = conn.prepare('PRAGMA table_info(games)').all().map((c) => c.name);
      if (!cols.includes('text_channel_enabled')) {
        conn.exec('ALTER TABLE games ADD COLUMN text_channel_enabled INTEGER NOT NULL DEFAULT 0');
      }
    }
  },
  {
    version: 7,
    description: 'games: add rawg_id for non-Steam game metadata',
    up(conn) {
      const cols = conn.prepare('PRAGMA table_info(games)').all().map((c) => c.name);
      if (!cols.includes('rawg_id')) {
        conn.exec('ALTER TABLE games ADD COLUMN rawg_id TEXT');
      }
    }
  },
  {
    version: 8,
    description: 'members: add rules_accepted flag for rule acknowledgement tracking',
    up(conn) {
      const cols = conn.prepare('PRAGMA table_info(members)').all().map((c) => c.name);
      if (!cols.includes('rules_accepted')) {
        conn.exec('ALTER TABLE members ADD COLUMN rules_accepted INTEGER NOT NULL DEFAULT 0');
      }
    }
  },
  {
    version: 6,
    description: 'game_requests: table for member game addition requests',
    up(conn) {
      conn.exec(`
        CREATE TABLE IF NOT EXISTS game_requests (
          request_id   INTEGER PRIMARY KEY AUTOINCREMENT,
          guild_id     TEXT NOT NULL,
          requester_id TEXT NOT NULL,
          name         TEXT NOT NULL,
          steam_app_id TEXT,
          status       TEXT NOT NULL DEFAULT 'pending',
          reviewed_by  TEXT,
          created_at   TEXT NOT NULL,
          reviewed_at  TEXT
        )
      `);
    }
  },
  // @premium-start
  {
    version: 9,
    description: 'guild_tier: premium tier per guild with optional expiry',
    up(conn) {
      conn.exec(`
        CREATE TABLE IF NOT EXISTS guild_tier (
          guild_id   TEXT PRIMARY KEY,
          tier       TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'premium')),
          expires_at INTEGER,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
    }
  },
  // @premium-end
  {
    version: 10,
    description: 'games: add forum_enabled and channel_forum_id',
    up(conn) {
      const cols = conn.prepare('PRAGMA table_info(games)').all().map((c) => c.name);
      if (!cols.includes('forum_enabled')) {
        conn.exec('ALTER TABLE games ADD COLUMN forum_enabled INTEGER NOT NULL DEFAULT 0');
      }
      if (!cols.includes('channel_forum_id')) {
        conn.exec('ALTER TABLE games ADD COLUMN channel_forum_id TEXT');
      }
    }
  },
  {
    version: 11,
    description: 'servers_jeu: add text_channel_enabled, galerie_enabled, changelog_enabled, forum_enabled',
    up(conn) {
      const cols = conn.prepare('PRAGMA table_info(servers_jeu)').all().map((c) => c.name);
      if (!cols.includes('text_channel_enabled')) conn.exec('ALTER TABLE servers_jeu ADD COLUMN text_channel_enabled INTEGER NOT NULL DEFAULT 0');
      if (!cols.includes('galerie_enabled'))      conn.exec('ALTER TABLE servers_jeu ADD COLUMN galerie_enabled INTEGER NOT NULL DEFAULT 0');
      if (!cols.includes('changelog_enabled'))    conn.exec('ALTER TABLE servers_jeu ADD COLUMN changelog_enabled INTEGER NOT NULL DEFAULT 0');
      if (!cols.includes('forum_enabled'))        conn.exec('ALTER TABLE servers_jeu ADD COLUMN forum_enabled INTEGER NOT NULL DEFAULT 0');
    }
  },
  // @premium-start
  {
    version: 12,
    description: 'guild_licenses: license keys for premium activation',
    up(conn) {
      conn.exec(`
        CREATE TABLE IF NOT EXISTS guild_licenses (
          license_key TEXT PRIMARY KEY,
          guild_id    TEXT UNIQUE,
          created_at  TEXT NOT NULL DEFAULT (datetime('now')),
          expires_at  INTEGER,
          active      INTEGER NOT NULL DEFAULT 1
        )
      `);
    }
  },
  // @premium-end
  {
    version: 13,
    description: 'rich_presence: consent and session tracking tables',
    up(conn) {
      conn.exec(`
        CREATE TABLE IF NOT EXISTS rich_presence_consent (
          guild_id TEXT NOT NULL,
          user_id  TEXT NOT NULL,
          consented_at TEXT NOT NULL,
          PRIMARY KEY (guild_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS rich_presence_sessions (
          session_id INTEGER PRIMARY KEY AUTOINCREMENT,
          guild_id   TEXT NOT NULL,
          user_id    TEXT NOT NULL,
          game_name  TEXT NOT NULL,
          started_at TEXT NOT NULL,
          ended_at   TEXT,
          duration_seconds INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_rps_guild_user ON rich_presence_sessions(guild_id, user_id);
        CREATE INDEX IF NOT EXISTS idx_rps_game ON rich_presence_sessions(guild_id, game_name);
      `);
    }
  }
];

function migrateDatabase() {
  const conn = getDb();
  const applied = new Set(
    conn.prepare('SELECT version FROM schema_version').all().map((r) => r.version)
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    try {
      migration.up(conn);
      conn.prepare('INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (?, ?)').run(
        migration.version,
        new Date().toISOString()
      );
    } catch (e) {
      logger.error(`Migration v${migration.version} failed: ${migration.description}`, e);
    }
  }
}


function getDb() {
  if (!db) {
    throw new Error('Database is not initialized. Call initDatabase() first.');
  }

  return db;
}

function setConfig(guildId, moduleName, key, value) {
  const conn = getDb();
  conn.prepare(
    `INSERT INTO guild_config (guild_id, module, key, value)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id, module, key)
     DO UPDATE SET value = excluded.value`
  ).run(guildId, moduleName, key, JSON.stringify(value));
}

function getConfig(guildId, moduleName, key, fallback = null) {
  const conn = getDb();
  const row = conn
    .prepare('SELECT value FROM guild_config WHERE guild_id = ? AND module = ? AND key = ?')
    .get(guildId, moduleName, key);

  if (!row) {
    return fallback;
  }

  try {
    return JSON.parse(row.value);
  } catch {
    return fallback;
  }
}

function setGrade(guildId, gradeName, roleId) {
  const conn = getDb();
  conn.prepare(
    `INSERT INTO grades (guild_id, grade_name, role_id)
     VALUES (?, ?, ?)
     ON CONFLICT(guild_id, grade_name)
     DO UPDATE SET role_id = excluded.role_id`
  ).run(guildId, gradeName, roleId);
}

function getGrade(guildId, gradeName) {
  const conn = getDb();
  const row = conn
    .prepare('SELECT role_id FROM grades WHERE guild_id = ? AND grade_name = ?')
    .get(guildId, gradeName);

  return row?.role_id || null;
}

function getModerationRoleIds(guildId) {
  const conn = getDb();
  const rows = conn
    .prepare('SELECT role_id FROM grades WHERE guild_id = ? AND grade_name IN (?, ?, ?)')
    .all(guildId, GRADE_NAMES.moderateur, GRADE_NAMES.manager, GRADE_NAMES.owner);

  return rows.map((row) => row.role_id).filter(Boolean);
}

// @premium-start
/**
 * Retourne le tier actuel d'un guild ('free' | 'premium').
 * Si expires_at est dépassé, on retourne 'free' et on purge la ligne.
 * @param {string} guildId
 * @returns {'free'|'premium'}
 */
function getGuildTier(guildId) {
  try {
    const conn = getDb();
    const row = conn.prepare('SELECT tier, expires_at FROM guild_tier WHERE guild_id = ?').get(guildId);
    if (!row) return 'free';
    if (row.expires_at && Date.now() > row.expires_at) {
      conn.prepare('DELETE FROM guild_tier WHERE guild_id = ?').run(guildId);
      return 'free';
    }
    return row.tier === 'premium' ? 'premium' : 'free';
  } catch {
    return 'free';
  }
}

/**
 * Définit le tier d'un guild.
 * @param {string} guildId
 * @param {'free'|'premium'} tier
 * @param {number|null} expiresAt - timestamp ms Unix (null = pas d'expiration)
 */
function setGuildTier(guildId, tier, expiresAt = null) {
  const conn = getDb();
  const safeTier = tier === 'premium' ? 'premium' : 'free';
  conn.prepare(`
    INSERT INTO guild_tier (guild_id, tier, expires_at, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(guild_id) DO UPDATE SET
      tier = excluded.tier,
      expires_at = excluded.expires_at,
      updated_at = datetime('now')
  `).run(guildId, safeTier, expiresAt ?? null);
}
// @premium-end

module.exports = {
  initDatabase,
  migrateDatabase,
  getDb,
  setConfig,
  getConfig,
  setGrade,
  getGrade,
  getModerationRoleIds,
  // @premium-start
  getGuildTier,
  setGuildTier,
  // @premium-end
};
