const logger = require('./logger');
const WhatsAppAuth = require('./auth');
const config = require('../config/config');

class WhatsAppHandler {
  constructor() {
    this.auth = new WhatsAppAuth();
    this.sock = null;
    this.messageHandlers = [];
    this.groupHandlers = [];
    this.isInitialized = false;
  }

  async initialize() {
    try {
      logger.info('🚀 Initializing WhatsApp Handler...');

      this.sock = await this.auth.initialize();
      this.setupMessageHandlers();
      this.setupGroupHandlers();
      this.setupErrorHandlers();

      this.isInitialized = true;
      logger.info('✅ WhatsApp Handler initialized successfully.');

      return this.sock;
    } catch (error) {
      logger.error('❌ Failed to initialize WhatsApp Handler:', error);
      throw error;
    }
  }

  setupMessageHandlers() {
    if (!this.sock) return;

    // Handle incoming messages
    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      try {
        for (const message of messages) {
          if (message.key.fromMe) continue; // Skip own messages

          // Call all registered message handlers
          for (const handler of this.messageHandlers) {
            try {
              await handler(message, this.sock);
            } catch (error) {
              logger.error('Error in message handler:', error);
            }
          }
        }
      } catch (error) {
        logger.error('Error processing messages:', error);
      }
    });

    // Handle message updates (reactions, edits, etc.)
    this.sock.ev.on('messages.update', async (updates) => {
      try {
        for (const update of updates) {
          // Handle reactions, edits, etc.
          logger.info('Message update:', update);
        }
      } catch (error) {
        logger.error('Error processing message updates:', error);
      }
    });
  }

  setupGroupHandlers() {
    if (!this.sock) return;

    // Handle group updates
    this.sock.ev.on('groups.update', async (updates) => {
      try {
        for (const update of updates) {
          logger.info('Group update:', update);

          // Call all registered group handlers
          for (const handler of this.groupHandlers) {
            try {
              await handler(update, this.sock);
            } catch (error) {
              logger.error('Error in group handler:', error);
            }
          }
        }
      } catch (error) {
        logger.error('Error processing group updates:', error);
      }
    });

    // Handle group participants updates
    this.sock.ev.on('group-participants.update', async (update) => {
      try {
        logger.info('Group participants update:', update);

        // Call all registered group handlers
        for (const handler of this.groupHandlers) {
          try {
            await handler(update, this.sock);
          } catch (error) {
            logger.error('Error in group participants handler:', error);
          }
        }
      } catch (error) {
        logger.error('Error processing group participants updates:', error);
      }
    });
  }

  setupErrorHandlers() {
    if (!this.sock) return;

    // Handle authentication failures
    this.sock.ev.on('auth.failure', (error) => {
      logger.error('Authentication failure:', error);
      this.handleReconnection();
    });

    // Handle connection issues
    this.sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'close' && lastDisconnect) {
        logger.info('Connection closed, attempting reconnection...');
        this.handleReconnection();
      }
    });
  }

  async handleReconnection() {
    try {
      logger.info('🔄 Attempting to reconnect...');
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

      this.sock = await this.auth.initialize();
      this.setupMessageHandlers();
      this.setupGroupHandlers();
      this.setupErrorHandlers();

      logger.info('✅ Reconnected successfully.');
    } catch (error) {
      logger.error('❌ Reconnection failed:', error);
      // Retry after longer delay
      setTimeout(() => this.handleReconnection(), 30000);
    }
  }

  // Register message handlers
  onMessage(handler) {
    this.messageHandlers.push(handler);
  }

  // Register group handlers
  onGroupUpdate(handler) {
    this.groupHandlers.push(handler);
  }

  // Send message
  async sendMessage(jid, content) {
    try {
      if (!this.sock || !this.auth.isAuthenticated) {
        throw new Error('WhatsApp not connected');
      }

      const result = await this.sock.sendMessage(jid, content);
      logger.info('Message sent successfully to:', jid);
      return result;
    } catch (error) {
      logger.error('Error sending message:', error);
      throw error;
    }
  }

  // Send text message
  async sendText(jid, text) {
    return this.sendMessage(jid, { text });
  }

  // Get group metadata
  async getGroupMetadata(jid) {
    try {
      if (!this.sock) throw new Error('WhatsApp not connected');
      return await this.sock.groupMetadata(jid);
    } catch (error) {
      logger.error('Error getting group metadata:', error);
      throw error;
    }
  }

  // Get user status
  getStatus() {
    return this.auth.getConnectionStatus();
  }

  // Logout
  async logout() {
    return this.auth.logout();
  }

  // Get socket instance
  getSocket() {
    return this.sock;
  }
}

module.exports = WhatsAppHandler;