require('dotenv').config();

const config = {
  // Bot Configuration
  bot: {
    name: process.env.BOT_NAME || 'WhatsApp Bot',
    version: process.env.BOT_VERSION || '1.0.0'
  },

  // Database Configuration
  database: {
    path: process.env.DB_PATH || './database/whatsapp-bot.db'
  },

  // Server Configuration
  server: {
    port: parseInt(process.env.PORT) || 3000,
    host: process.env.HOST || '0.0.0.0'
  },

  // WhatsApp Configuration
  whatsapp: {
    sessionDir: process.env.SESSION_DIR || './auth_info_baileys'
  },

  // Logging Configuration
  logging: {
    level: process.argv.includes('--trace') ? 'trace' : (process.env.LOG_LEVEL || 'info'),
    file: process.env.LOG_FILE || './logs/bot.log'
  },

  // Security Configuration
  security: {
    adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
    jwtSecret: process.env.JWT_SECRET || 'your-secret-key-here'
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 60000,
    max: parseInt(process.env.RATE_LIMIT_MAX) || 10
  },

  // Auto Moderation
  moderation: {
    spamThreshold: parseInt(process.env.SPAM_THRESHOLD) || 5,
    spamTimeWindow: parseInt(process.env.SPAM_TIME_WINDOW) || 300000
  },

  // Data Collection
  dataCollection: {
    collectPhoneNumbers: process.env.COLLECT_PHONE_NUMBERS === 'true',
    collectUrls: process.env.COLLECT_URLS === 'true',
    collectMedia: process.env.COLLECT_MEDIA === 'true'
  }
};

module.exports = config;