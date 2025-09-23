const logger = require('./logger');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const config = require('../config/config');

class DatabaseManager {
  constructor() {
    this.db = null;
    this.isInitialized = false;
  }

  async initialize() {
    try {
      // Ensure database directory exists
      const dbDir = path.dirname(config.database.path);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // Connect to database
      this.db = new sqlite3.Database(config.database.path);

      // Enable foreign keys
      await this.run('PRAGMA foreign_keys = ON');

      // Run schema
      await this.runSchema();

      this.isInitialized = true;
      logger.info('✅ Database initialized successfully.');
    } catch (error) {
      logger.error('❌ Failed to initialize database:', error);
      throw error;
    }
  }

  async runSchema() {
    try {
      const schemaPath = path.join(__dirname, '../database/schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf8');

      // Split schema into individual statements
      const statements = schema.split(';').filter(stmt => stmt.trim().length > 0);

      for (const statement of statements) {
        if (statement.trim()) {
          await this.run(statement);
        }
      }

      logger.info('✅ Database schema applied successfully.');
    } catch (error) {
      logger.error('❌ Failed to run database schema:', error);
      throw error;
    }
  }

  // Generic query execution
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }

  // Get single row
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // Get all rows
  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // User operations
  async createUser(userData) {
    const { jid, name, phone, profile_pic } = userData;
    return this.run(
      `INSERT OR REPLACE INTO users (jid, name, phone, profile_pic, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [jid, name, phone, profile_pic]
    );
  }

  async getUser(jid) {
    return this.get('SELECT * FROM users WHERE jid = ?', [jid]);
  }

  async updateUserActivity(jid) {
    return this.run(
      'UPDATE users SET last_seen = CURRENT_TIMESTAMP, message_count = message_count + 1 WHERE jid = ?',
      [jid]
    );
  }

  // Group operations
  async createGroup(groupData) {
    const { jid, name, description, owner_jid, profile_pic, member_count } = groupData;
    return this.run(
      `INSERT OR REPLACE INTO groups (jid, name, description, owner_jid, profile_pic, member_count, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [jid, name, description, owner_jid, profile_pic, member_count]
    );
  }

  async getGroup(jid) {
    return this.get('SELECT * FROM groups WHERE jid = ?', [jid]);
  }

  async updateGroupMembers(jid, memberCount) {
    return this.run(
      'UPDATE groups SET member_count = ?, updated_at = CURRENT_TIMESTAMP WHERE jid = ?',
      [memberCount, jid]
    );
  }

  // Message operations
  async saveMessage(messageData) {
    const {
      message_id, jid, sender_jid, message_type, content,
      media_url, media_type, timestamp, is_group, group_jid, reply_to, is_forwarded
    } = messageData;

    return this.run(
      `INSERT OR IGNORE INTO messages
       (message_id, jid, sender_jid, message_type, content, media_url, media_type, timestamp, is_group, group_jid, reply_to, is_forwarded)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [message_id, jid, sender_jid, message_type, content, media_url, media_type, timestamp, is_group, group_jid, reply_to, is_forwarded]
    );
  }

  async getMessages(jid, limit = 50) {
    return this.all(
      'SELECT * FROM messages WHERE jid = ? ORDER BY timestamp DESC LIMIT ?',
      [jid, limit]
    );
  }

  // Group members operations
  async updateGroupMembers(groupJid, members) {
    // First, mark all existing members as inactive
    await this.run('UPDATE group_members SET is_active = 0 WHERE group_jid = ?', [groupJid]);

    // Insert or update members
    for (const member of members) {
      await this.run(
        `INSERT OR REPLACE INTO group_members (group_jid, user_jid, role, is_active)
         VALUES (?, ?, ?, 1)`,
        [groupJid, member.jid, member.role || 'member']
      );
    }
  }

  // Trigger operations
  async getActiveTriggers() {
    return this.all('SELECT * FROM triggers WHERE is_active = 1');
  }

  async addTrigger(keyword, response, matchType = 'exact', caseSensitive = false) {
    return this.run(
      'INSERT INTO triggers (keyword, response, match_type, case_sensitive) VALUES (?, ?, ?, ?)',
      [keyword, response, matchType, caseSensitive ? 1 : 0]
    );
  }

  async removeTrigger(keyword) {
    return this.run('DELETE FROM triggers WHERE keyword = ?', [keyword]);
  }

  // Spam operations
  async logSpam(userJid, messageId, reason, severity = 'low', action = null) {
    return this.run(
      'INSERT INTO spam_logs (user_jid, message_id, reason, severity, action_taken) VALUES (?, ?, ?, ?, ?)',
      [userJid, messageId, reason, severity, action]
    );
  }

  async getSpamLogs(userJid, limit = 10) {
    return this.all(
      'SELECT * FROM spam_logs WHERE user_jid = ? ORDER BY timestamp DESC LIMIT ?',
      [userJid, limit]
    );
  }

  // Analytics operations
  async updateAnalytics(date, data) {
    const { total_messages = 0, total_users = 0, active_groups = 0, spam_detected = 0 } = data;

    return this.run(
      `INSERT OR REPLACE INTO analytics (date, total_messages, total_users, active_groups, spam_detected)
       VALUES (?, ?, ?, ?, ?)`,
      [date, total_messages, total_users, active_groups, spam_detected]
    );
  }

  async getAnalytics(date) {
    return this.get('SELECT * FROM analytics WHERE date = ?', [date]);
  }

  // Data collection operations
  async saveCollectedData(type, value, sourceJid, messageId = null, context = null) {
    return this.run(
      'INSERT INTO collected_data (type, value, source_jid, message_id, context) VALUES (?, ?, ?, ?, ?)',
      [type, value, sourceJid, messageId, context]
    );
  }

  async getCollectedData(type, limit = 100) {
    return this.all(
      'SELECT * FROM collected_data WHERE type = ? ORDER BY created_at DESC LIMIT ?',
      [type, limit]
    );
  }

  // Logging operations
  async log(level, message, context = null) {
    return this.run(
      'INSERT INTO bot_logs (level, message, context) VALUES (?, ?, ?)',
      [level, message, context ? JSON.stringify(context) : null]
    );
  }

  async getLogs(level = null, limit = 100) {
    let sql = 'SELECT * FROM bot_logs';
    let params = [];

    if (level) {
      sql += ' WHERE level = ?';
      params.push(level);
    }

    sql += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    return this.all(sql, params);
  }

  // Rate limiting operations
  async checkRateLimit(userJid, actionType, windowMs = 60000, maxRequests = 10) {
    const windowStart = new Date(Date.now() - windowMs);

    // Clean old entries
    await this.run('DELETE FROM rate_limits WHERE window_start < ?', [windowStart.toISOString()]);

    // Count current requests in window
    const result = await this.get(
      'SELECT COUNT(*) as count FROM rate_limits WHERE user_jid = ? AND action_type = ? AND window_start >= ?',
      [userJid, actionType, windowStart.toISOString()]
    );

    const currentCount = result ? result.count : 0;

    if (currentCount >= maxRequests) {
      return { allowed: false, remaining: 0 };
    }

    // Record this request
    await this.run(
      'INSERT INTO rate_limits (user_jid, action_type, window_start) VALUES (?, ?, ?)',
      [userJid, actionType, windowStart.toISOString()]
    );

    return { allowed: true, remaining: maxRequests - currentCount - 1 };
  }

  // Close database connection
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isInitialized = false;
      logger.info('Database connection closed.');
    }
  }
}

module.exports = DatabaseManager;