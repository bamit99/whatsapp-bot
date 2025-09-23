const logger = require('./logger');
const DatabaseManager = require('./database');
const RateLimiter = require('./rate-limiter');
const config = require('../config/config');

class MessageHandler {
  constructor(whatsappHandler) {
    this.whatsapp = whatsappHandler;
    this.db = new DatabaseManager();
    this.triggers = [];
    this.isInitialized = false;
  }

  async initialize() {
    try {
      await this.db.initialize();
      await this.loadTriggers();
      this.setupMessageProcessing();
      this.isInitialized = true;
      logger.info('✅ Message Handler initialized successfully.');
    } catch (error) {
      logger.error('❌ Failed to initialize Message Handler:', error);
      throw error;
    }
  }

  setupMessageProcessing() {
    // Register message handler with WhatsApp handler
    this.whatsapp.onMessage(async (message, sock) => {
      try {
        await this.processMessage(message, sock);
      } catch (error) {
        logger.error('Error processing message:', error);
        await this.db.log('error', 'Message processing failed', { error: error.message, messageId: message.key.id });
      }
    });

    // Register group update handler
    this.whatsapp.onGroupUpdate(async (update, sock) => {
      try {
        await this.processGroupUpdate(update, sock);
      } catch (error) {
        logger.error('Error processing group update:', error);
        await this.db.log('error', 'Group update processing failed', { error: error.message });
      }
    });
  }

  async processMessage(message, sock) {
    const messageId = message.key.id;
    const senderJid = message.key.remoteJid;
    const isGroup = senderJid.endsWith('@g.us');
    const groupJid = isGroup ? senderJid : null;
    const participantJid = message.key.participant || senderJid;

    // Skip own messages
    if (message.key.fromMe) return;

    // Extract message content
    const messageData = this.extractMessageData(message, senderJid, isGroup, groupJid);

    // Save message to database
    await this.saveMessageToDatabase(messageData);

    // Update user activity
    await this.updateUserActivity(participantJid);

    // Process triggers
    await this.processTriggers(messageData, sock);

    // Collect data
    await this.collectData(messageData);

    // Check for spam
    await this.checkSpam(messageData, sock);

    // Log message processing
    await this.db.log('info', 'Message processed', {
      messageId,
      sender: participantJid,
      isGroup,
      type: messageData.type
    });
  }

  extractMessageData(message, senderJid, isGroup, groupJid) {
    const messageId = message.key.id;
    const timestamp = new Date(message.messageTimestamp * 1000);

    let content = '';
    let mediaUrl = null;
    let mediaType = null;
    let messageType = 'text';

    if (message.message) {
      if (message.message.conversation) {
        content = message.message.conversation;
      } else if (message.message.extendedTextMessage) {
        content = message.message.extendedTextMessage.text;
      } else if (message.message.imageMessage) {
        messageType = 'image';
        content = message.message.imageMessage.caption || '';
        mediaUrl = message.message.imageMessage.url;
        mediaType = message.message.imageMessage.mimetype;
      } else if (message.message.videoMessage) {
        messageType = 'video';
        content = message.message.videoMessage.caption || '';
        mediaUrl = message.message.videoMessage.url;
        mediaType = message.message.videoMessage.mimetype;
      } else if (message.message.audioMessage) {
        messageType = 'audio';
        mediaUrl = message.message.audioMessage.url;
        mediaType = message.message.audioMessage.mimetype;
      } else if (message.message.documentMessage) {
        messageType = 'document';
        content = message.message.documentMessage.caption || '';
        mediaUrl = message.message.documentMessage.url;
        mediaType = message.message.documentMessage.mimetype;
      } else if (message.message.stickerMessage) {
        messageType = 'sticker';
        mediaUrl = message.message.stickerMessage.url;
        mediaType = message.message.stickerMessage.mimetype;
      }
    }

    return {
      message_id: messageId,
      jid: senderJid,
      sender_jid: message.key.participant || senderJid,
      message_type: messageType,
      content: content,
      media_url: mediaUrl,
      media_type: mediaType,
      timestamp: timestamp.toISOString(),
      is_group: isGroup,
      group_jid: groupJid,
      reply_to: message.message?.extendedTextMessage?.contextInfo?.stanzaId || null,
      is_forwarded: message.message?.extendedTextMessage?.contextInfo?.isForwarded || false
    };
  }

  async saveMessageToDatabase(messageData) {
    try {
      await this.db.saveMessage(messageData);
    } catch (error) {
      logger.error('Error saving message to database:', error);
    }
  }

  async updateUserActivity(jid) {
    try {
      // Create or update user
      const userData = {
        jid: jid,
        name: null, // Will be updated when we get contact info
        phone: jid.split('@')[0]
      };
      await this.db.createUser(userData);

      // Update activity
      await this.db.updateUserActivity(jid);
    } catch (error) {
      logger.error('Error updating user activity:', error);
    }
  }

  async loadTriggers() {
    try {
      this.triggers = await this.db.getActiveTriggers();
      logger.info(`✅ Loaded ${this.triggers.length} active triggers.`);
    } catch (error) {
      logger.error('Error loading triggers:', error);
    }
  }

  async processTriggers(messageData, sock) {
    if (!messageData.content) return;

    const content = messageData.content.toLowerCase();

    for (const trigger of this.triggers) {
      let shouldRespond = false;

      switch (trigger.match_type) {
        case 'exact':
          const triggerWord = trigger.case_sensitive ? trigger.keyword : trigger.keyword.toLowerCase();
          const messageWord = trigger.case_sensitive ? messageData.content : content;
          shouldRespond = messageWord === triggerWord;
          break;

        case 'contains':
          const keyword = trigger.case_sensitive ? trigger.keyword : trigger.keyword.toLowerCase();
          shouldRespond = content.includes(keyword);
          break;

        case 'regex':
          try {
            const regex = new RegExp(trigger.keyword, trigger.case_sensitive ? 'g' : 'gi');
            shouldRespond = regex.test(messageData.content);
          } catch (error) {
            logger.error('Invalid regex in trigger:', trigger.keyword);
            continue;
          }
          break;
      }

      if (shouldRespond) {
        try {
          await this.whatsapp.sendText(messageData.jid, trigger.response);
          await this.db.log('info', 'Trigger response sent', {
            trigger: trigger.keyword,
            response: trigger.response,
            to: messageData.jid
          });
        } catch (error) {
          logger.error('Error sending trigger response:', error);
        }
      }
    }
  }

  async collectData(messageData) {
    if (!config.dataCollection.collectPhoneNumbers &&
        !config.dataCollection.collectUrls &&
        !config.dataCollection.collectMedia) {
      return;
    }

    try {
      // Extract phone numbers
      if (config.dataCollection.collectPhoneNumbers) {
        const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/g;
        const phones = messageData.content.match(phoneRegex);
        if (phones) {
          for (const phone of phones) {
            await this.db.saveCollectedData('phone', phone, messageData.sender_jid, messageData.message_id);
          }
        }
      }

      // Extract URLs
      if (config.dataCollection.collectUrls) {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urls = messageData.content.match(urlRegex);
        if (urls) {
          for (const url of urls) {
            await this.db.saveCollectedData('url', url, messageData.sender_jid, messageData.message_id);
          }
        }
      }

      // Collect media information
      if (config.dataCollection.collectMedia && messageData.media_url) {
        await this.db.saveCollectedData('media', messageData.media_url, messageData.sender_jid, messageData.message_id, {
          type: messageData.media_type,
          message_type: messageData.message_type
        });
      }
    } catch (error) {
      logger.error('Error collecting data:', error);
    }
  }

  async checkSpam(messageData, sock) {
    try {
      const userJid = messageData.sender_jid;

      // Check message frequency (simple spam detection)
      const recentMessages = await this.db.all(
        'SELECT COUNT(*) as count FROM messages WHERE sender_jid = ? AND timestamp > datetime("now", "-5 minutes")',
        [userJid]
      );

      const messageCount = recentMessages[0]?.count || 0;

      if (messageCount > config.moderation.spamThreshold) {
        // Log spam
        await this.db.logSpam(userJid, messageData.message_id, 'High message frequency', 'medium', 'flagged');

        // Optional: Send warning message
        if (messageData.is_group) {
          await this.whatsapp.sendText(
            messageData.jid,
            `⚠️ @${userJid.split('@')[0]}, please slow down your messages to avoid being flagged as spam.`,
            { mentions: [userJid] }
          );
        }

        logger.info(`🚨 Spam detected from ${userJid}: ${messageCount} messages in 5 minutes`);
      }
    } catch (error) {
      logger.error('Error checking spam:', error);
    }
  }

  async processGroupUpdate(update, sock) {
    try {
      if (update.participants) {
        // Handle participant updates (joins/leaves)
        const groupJid = update.id;
        const action = update.action; // 'add', 'remove', 'promote', 'demote'

        for (const participant of update.participants) {
          if (action === 'add') {
            // Welcome new member
            const welcomeMessage = `👋 Welcome to the group, @${participant.split('@')[0]}!`;
            await this.whatsapp.sendText(groupJid, welcomeMessage, { mentions: [participant] });

            await this.db.log('info', 'New member joined group', {
              group: groupJid,
              member: participant
            });
          } else if (action === 'remove') {
            await this.db.log('info', 'Member left group', {
              group: groupJid,
              member: participant
            });
          }
        }

        // Update group member count in database
        const groupMetadata = await this.whatsapp.getGroupMetadata(groupJid);
        if (groupMetadata) {
          await this.db.updateGroupMembers(groupJid, groupMetadata.participants.length);
        }
      }
    } catch (error) {
      logger.error('Error processing group update:', error);
    }
  }

  // Add new trigger
  async addTrigger(keyword, response, matchType = 'exact', caseSensitive = false) {
    try {
      await this.db.addTrigger(keyword, response, matchType, caseSensitive);
      await this.loadTriggers(); // Reload triggers
      return true;
    } catch (error) {
      logger.error('Error adding trigger:', error);
      return false;
    }
  }

  // Remove trigger
  async removeTrigger(keyword) {
    try {
      await this.db.removeTrigger(keyword);
      await this.loadTriggers(); // Reload triggers
      return true;
    } catch (error) {
      logger.error('Error removing trigger:', error);
      return false;
    }
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = MessageHandler;