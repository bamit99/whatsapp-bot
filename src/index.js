#!/usr/bin/env node

const logger = require('./logger');
const WhatsAppHandler = require('./whatsapp-handler');
const MessageHandler = require('./message-handler');
const config = require('../config/config');

class WhatsAppBot {
  constructor() {
    this.whatsapp = null;
    this.messageHandler = null;
    this.isRunning = false;
  }

  async start() {
    try {
      logger.info('🤖 Starting WhatsApp Bot...');
      logger.info(`📋 Version: ${config.bot.name} v${config.bot.version}`);
      logger.info(`🔧 Database: ${config.database.path}`);
      logger.info(`🌐 Server: ${config.server.host}:${config.server.port}`);

      // Initialize WhatsApp handler
      this.whatsapp = new WhatsAppHandler();

      // Initialize message handler
      this.messageHandler = new MessageHandler(this.whatsapp);

      // Initialize components
      await this.messageHandler.initialize();

      // Initialize WhatsApp connection
      await this.whatsapp.initialize();

      this.isRunning = true;
      logger.info('✅ WhatsApp Bot started successfully!');
      logger.info('📱 Scan the QR code above to authenticate your WhatsApp account.');
      logger.info('💡 Type "help" in any chat to see available commands.');

      // Keep the process running
      this.keepAlive();

    } catch (error) {
      logger.error('❌ Failed to start WhatsApp Bot:', error);
      process.exit(1);
    }
  }

  async stop() {
    try {
      logger.info('🛑 Stopping WhatsApp Bot...');

      if (this.whatsapp) {
        await this.whatsapp.logout();
      }

      if (this.messageHandler) {
        this.messageHandler.close();
      }

      this.isRunning = false;
      logger.info('✅ WhatsApp Bot stopped successfully.');
    } catch (error) {
      logger.error('❌ Error stopping bot:', error);
    }
  }

  keepAlive() {
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('\n⚠️  Received SIGINT, shutting down gracefully...');
      await this.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('\n⚠️  Received SIGTERM, shutting down gracefully...');
      await this.stop();
      process.exit(0);
    });

    // Keep process alive
    setInterval(() => {
      if (!this.isRunning) {
        logger.info('Bot is no longer running, exiting...');
        process.exit(1);
      }
    }, 30000); // Check every 30 seconds
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      whatsapp: this.whatsapp ? this.whatsapp.getStatus() : null,
      config: {
        name: config.bot.name,
        version: config.bot.version,
        database: config.database.path,
        server: `${config.server.host}:${config.server.port}`
      }
    };
  }

  // CLI Commands
  async addTrigger(keyword, response, options = {}) {
    if (!this.messageHandler) {
      throw new Error('Message handler not initialized');
    }

    const { matchType = 'exact', caseSensitive = false } = options;
    const success = await this.messageHandler.addTrigger(keyword, response, matchType, caseSensitive);

    if (success) {
      logger.info(`✅ Trigger added: "${keyword}" -> "${response}"`);
    } else {
      logger.info(`❌ Failed to add trigger: "${keyword}"`);
    }

    return success;
  }

  async removeTrigger(keyword) {
    if (!this.messageHandler) {
      throw new Error('Message handler not initialized');
    }

    const success = await this.messageHandler.removeTrigger(keyword);

    if (success) {
      logger.info(`✅ Trigger removed: "${keyword}"`);
    } else {
      logger.info(`❌ Failed to remove trigger: "${keyword}"`);
    }

    return success;
  }

  async sendMessage(jid, message) {
    if (!this.whatsapp) {
      throw new Error('WhatsApp handler not initialized');
    }

    try {
      await this.whatsapp.sendText(jid, message);
      logger.info(`✅ Message sent to ${jid}`);
      return true;
    } catch (error) {
      logger.error(`❌ Failed to send message to ${jid}:`, error.message);
      return false;
    }
  }

  async getStats() {
    if (!this.messageHandler || !this.messageHandler.db) {
      throw new Error('Database not initialized');
    }

    try {
      const db = this.messageHandler.db;

      // Get basic stats
      const totalMessages = await db.get('SELECT COUNT(*) as count FROM messages');
      const totalUsers = await db.get('SELECT COUNT(*) as count FROM users');
      const totalGroups = await db.get('SELECT COUNT(*) as count FROM groups');
      const activeTriggers = await db.get('SELECT COUNT(*) as count FROM triggers WHERE is_active = 1');

      // Get today's stats
      const today = new Date().toISOString().split('T')[0];
      const todayStats = await db.get('SELECT * FROM analytics WHERE date = ?', [today]);

      return {
        total: {
          messages: totalMessages?.count || 0,
          users: totalUsers?.count || 0,
          groups: totalGroups?.count || 0,
          triggers: activeTriggers?.count || 0
        },
        today: todayStats || {
          total_messages: 0,
          total_users: 0,
          active_groups: 0,
          spam_detected: 0
        },
        status: this.getStatus()
      };
    } catch (error) {
      logger.error('Error getting stats:', error);
      throw error;
    }
  }
}

// CLI Interface
function showHelp() {
  logger.info(`
🤖 WhatsApp Bot CLI

USAGE:
  node src/index.js <command> [options]

COMMANDS:
  start                    Start the bot
  stop                     Stop the bot
  status                   Show bot status
  stats                    Show bot statistics
  add-trigger <keyword> <response> [options]  Add a trigger
  remove-trigger <keyword>                    Remove a trigger
  send <jid> <message>                        Send a message
  help                     Show this help

TRIGGER OPTIONS:
  --match-type <type>      Match type: exact, contains, regex (default: exact)
  --case-sensitive         Case sensitive matching

EXAMPLES:
  node src/index.js start
  node src/index.js add-trigger hello "Hi there!"
  node src/index.js add-trigger "support.*" "Contact support@example.com" --match-type regex
  node src/index.js send "1234567890@s.whatsapp.net" "Hello from bot!"
  node src/index.js stats
`);
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    showHelp();
    process.exit(1);
  }

  const bot = new WhatsAppBot();

  try {
    switch (command) {
      case 'start':
        await bot.start();
        break;

      case 'stop':
        await bot.stop();
        break;

      case 'status':
        const status = bot.getStatus();
        logger.info('Bot Status:', JSON.stringify(status, null, 2));
        break;

      case 'stats':
        const stats = await bot.getStats();
        logger.info('Bot Statistics:', JSON.stringify(stats, null, 2));
        break;

      case 'add-trigger':
        if (args.length < 3) {
          logger.error('❌ Usage: add-trigger <keyword> <response> [options]');
          process.exit(1);
        }

        const keyword = args[1];
        const response = args[2];

        // Parse options
        const options = {};
        for (let i = 3; i < args.length; i++) {
          if (args[i] === '--match-type' && args[i + 1]) {
            options.matchType = args[i + 1];
            i++;
          } else if (args[i] === '--case-sensitive') {
            options.caseSensitive = true;
          }
        }

        await bot.addTrigger(keyword, response, options);
        break;

      case 'remove-trigger':
        if (args.length < 2) {
          logger.error('❌ Usage: remove-trigger <keyword>');
          process.exit(1);
        }

        await bot.removeTrigger(args[1]);
        break;

      case 'send':
        if (args.length < 3) {
          logger.error('❌ Usage: send <jid> <message>');
          process.exit(1);
        }

        const jid = args[1];
        const message = args.slice(2).join(' ');
        await bot.sendMessage(jid, message);
        break;

      case 'help':
      default:
        showHelp();
        break;
    }
  } catch (error) {
    logger.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = WhatsAppBot;