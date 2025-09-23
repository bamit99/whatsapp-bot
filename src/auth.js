const logger = require('./logger');
const open = require('open');
const { makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');

class WhatsAppAuth {
  constructor() {
    this.sock = null;
    this.authState = null;
    this.saveCreds = null;
    this.isConnected = false;
    this.isAuthenticated = false;
  }

  async initialize() {
    try {
      // Ensure auth directory exists
      const authDir = path.resolve(config.whatsapp.sessionDir);
      if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true });
      }

      // Load or create auth state
      const { state, saveCreds } = await useMultiFileAuthState(authDir);
      this.authState = state;
      this.saveCreds = saveCreds;

      logger.info('Initializing WhatsApp connection...');

      // Create WhatsApp socket with proven working configuration
      this.sock = makeWASocket({
        auth: state,
        browser: ['Firefox', 'Windows', '114.0'], // Use a different browser to see if it resolves the issue
        logger,
        // Essential options for Baileys 6.7.x
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        // Fix for QR code issues
        qrTimeout: 60000, // 60 seconds timeout
        authTimeout: 60000, // 60 seconds auth timeout
        // Disable features that might cause issues
        takeoverTimeoutMs: 30000,
        // Add connection retry options
        retryRequestDelayMs: 200,
        customBrowser: 'Gemini',
        maxRetries: 5
      });

      this.setupEventHandlers();

      return this.sock;
    } catch (error) {
      logger.error('Failed to initialize WhatsApp auth:', error);
      throw error;
    }
  }

  setupEventHandlers() {
    if (!this.sock) return;

    // Connection update handler
    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        logger.info('\n🔗 WhatsApp QR Code Generated!');
        logger.info('Scan this QR code with your WhatsApp mobile app:');
        logger.info('=' .repeat(50));

        // Display QR code in terminal using qrcode-terminal
        try {
          // The qr parameter from Baileys is a base64 string
          // Try to decode it first to get the actual QR data
          let qrData = qr;
          if (qr.startsWith('data:image/png;base64,')) {
            qrData = qr.replace(/^data:image\/png;base64,/, '');
          }

          qrcode.generate(qr, { small: true });
          logger.info('✅ QR code displayed in terminal above');
        } catch (err) {
          logger.error('Error displaying QR code in terminal:', err);
          logger.info('💡 QR code data (first 100 chars):', qr.substring(0, 100) + '...');
          logger.info('💡 Try using the qr.png file instead');
        }

        // Save QR code to file
        try {
          // Remove data URL prefix if present, otherwise use as-is
          const base64Data = qr.replace(/^data:image\/png;base64,/, '');
          fs.writeFileSync('qr.png', base64Data, 'base64');
          logger.info('✅ QR code saved to qr.png');
          logger.info('📱 Alternative: Open qr.png file to scan with your WhatsApp mobile app');
        } catch (err) {
          logger.error('Error saving QR code to file:', err);
          logger.info('💡 Try scanning the QR code displayed in the terminal above');
        }

        logger.info('=' .repeat(50));
        logger.info('Note: The QR code will expire in 60 seconds. If it expires, a new one will be generated.');
      }

      if (connection === 'close') {
        this.isConnected = false;
        this.isAuthenticated = false;

        const shouldReconnect = (lastDisconnect?.error instanceof Boom)
          ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
          : true;

        logger.info(`Connection closed due to ${lastDisconnect?.error?.message || 'unknown reason'}`);

        if (shouldReconnect) {
          logger.info('Attempting to reconnect...');
          setTimeout(() => this.initialize(), 5000);
        } else {
          logger.info('Logged out. Please scan QR code again.');
        }
      } else if (connection === 'open') {
        this.isConnected = true;
        this.isAuthenticated = true;
        logger.info('✅ WhatsApp connected successfully!');
        logger.info(`Logged in as: ${this.sock.user?.name || 'Unknown'} (${this.sock.user?.id?.split('@')[0] || 'Unknown'})`);
      }
    });

    // Credentials update handler
    this.sock.ev.on('creds.update', async () => {
      if (this.saveCreds) {
        await this.saveCreds();
        logger.info('Session credentials saved.');
      }
    });

    // Handle authentication failures
    this.sock.ev.on('auth.failure', (error) => {
      logger.error('Authentication failed:', error);
      this.isAuthenticated = false;
    });
  }

  async logout() {
    try {
      if (this.sock && this.isConnected) {
        await this.sock.logout();
        this.isConnected = false;
        this.isAuthenticated = false;
        logger.info('Successfully logged out from WhatsApp.');
      }

      // Clean up auth files
      const authDir = path.resolve(config.whatsapp.sessionDir);
      if (fs.existsSync(authDir)) {
        const files = fs.readdirSync(authDir);
        for (const file of files) {
          fs.unlinkSync(path.join(authDir, file));
        }
        logger.info('Auth files cleaned up.');
      }
    } catch (error) {
      logger.error('Error during logout:', error);
      throw error;
    }
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      isAuthenticated: this.isAuthenticated,
      user: this.sock?.user ? {
        name: this.sock.user.name,
        id: this.sock.user.id,
        phone: this.sock.user.id.split('@')[0]
      } : null
    };
  }

  getSocket() {
    return this.sock;
  }
}

module.exports = WhatsAppAuth;
