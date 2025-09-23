#!/usr/bin/env node

const DatabaseManager = require('../src/database');
const config = require('../config/config');

async function initializeDatabase() {
  console.log('🚀 Initializing WhatsApp Bot Database...');

  try {
    const db = new DatabaseManager();
    await db.initialize();

    console.log('✅ Database initialized successfully!');
    console.log(`📁 Database location: ${config.database.path}`);

    // Insert some default triggers
    console.log('📝 Adding default triggers...');

    const defaultTriggers = [
      { keyword: 'help', response: 'Available commands:\n• help - Show this help\n• info - Bot information\n• stats - Group statistics' },
      { keyword: 'info', response: `🤖 WhatsApp Bot v${config.bot.version}\nBuilt with Baileys library\nFor support, contact the admin.` },
      { keyword: 'ping', response: '🏓 Pong! Bot is active.' }
    ];

    for (const trigger of defaultTriggers) {
      try {
        await db.addTrigger(trigger.keyword, trigger.response);
        console.log(`✅ Added trigger: ${trigger.keyword}`);
      } catch (error) {
        console.log(`⚠️  Trigger "${trigger.keyword}" already exists or failed to add:`, error.message);
      }
    }

    console.log('🎉 Database setup complete!');
    db.close();

  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  initializeDatabase();
}

module.exports = initializeDatabase;