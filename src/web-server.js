const logger = require('./logger');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const config = require('../config/config');

class WebServer {
  constructor(bot) {
    this.bot = bot;
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketIo(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketHandlers();
  }

  setupMiddleware() {
    this.app.use((req, res, next) => {
      res.setHeader('Origin-Agent-Cluster', '?1');
      next();
    });

    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Serve static files
    this.app.use(express.static(path.join(__dirname, '../public')));
  }

  setupRoutes() {
    // Authentication middleware
    const requireAuth = (req, res, next) => {
      const auth = req.headers.authorization;
      if (!auth || auth !== `Bearer ${config.security.jwtSecret}`) {
        // Simple auth for demo - in production use proper JWT
        const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
        const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

        if (login !== 'admin' || password !== config.security.adminPassword) {
          res.set('WWW-Authenticate', 'Basic realm="WhatsApp Bot Admin"');
          return res.status(401).json({ error: 'Authentication required' });
        }
      }
      next();
    };

    // API Routes
    this.app.get('/api/status', requireAuth, (req, res) => {
      res.json(this.bot.getStatus());
    });

    this.app.get('/api/stats', requireAuth, async (req, res) => {
      try {
        const stats = await this.bot.getStats();
        res.json(stats);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/triggers', requireAuth, async (req, res) => {
      try {
        if (!this.bot.messageHandler || !this.bot.messageHandler.db) {
          return res.status(500).json({ error: 'Database not available' });
        }
        const triggers = await this.bot.messageHandler.db.getActiveTriggers();
        res.json(triggers);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/triggers', requireAuth, async (req, res) => {
      try {
        const { keyword, response, matchType = 'exact', caseSensitive = false } = req.body;

        if (!keyword || !response) {
          return res.status(400).json({ error: 'Keyword and response are required' });
        }

        const success = await this.bot.addTrigger(keyword, response, { matchType, caseSensitive });

        if (success) {
          res.json({ message: 'Trigger added successfully' });
        } else {
          res.status(500).json({ error: 'Failed to add trigger' });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.delete('/api/triggers/:keyword', requireAuth, async (req, res) => {
      try {
        const { keyword } = req.params;
        const success = await this.bot.removeTrigger(keyword);

        if (success) {
          res.json({ message: 'Trigger removed successfully' });
        } else {
          res.status(500).json({ error: 'Failed to remove trigger' });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/send', requireAuth, async (req, res) => {
      try {
        const { jid, message } = req.body;

        if (!jid || !message) {
          return res.status(400).json({ error: 'JID and message are required' });
        }

        const success = await this.bot.sendMessage(jid, message);

        if (success) {
          res.json({ message: 'Message sent successfully' });
        } else {
          res.status(500).json({ error: 'Failed to send message' });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/users', requireAuth, async (req, res) => {
      try {
        if (!this.bot.messageHandler || !this.bot.messageHandler.db) {
          return res.status(500).json({ error: 'Database not available' });
        }

        const users = await this.bot.messageHandler.db.all(
          'SELECT * FROM users ORDER BY last_seen DESC LIMIT 100'
        );
        res.json(users);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/messages', requireAuth, async (req, res) => {
      try {
        if (!this.bot.messageHandler || !this.bot.messageHandler.db) {
          return res.status(500).json({ error: 'Database not available' });
        }

        const limit = parseInt(req.query.limit) || 50;
        const messages = await this.bot.messageHandler.db.all(
          'SELECT * FROM messages ORDER BY timestamp DESC LIMIT ?',
          [limit]
        );
        res.json(messages);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Serve the main dashboard
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../public/index.html'));
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Endpoint not found' });
    });

    // Error handler
    this.app.use((error, req, res, next) => {
      logger.error('Web server error:', error);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      logger.info('Client connected to web dashboard');

      // Send initial status
      socket.emit('status', this.bot.getStatus());

      // Handle client requests
      socket.on('get-stats', async () => {
        try {
          const stats = await this.bot.getStats();
          socket.emit('stats', stats);
        } catch (error) {
          socket.emit('error', { message: error.message });
        }
      });

      socket.on('disconnect', () => {
        logger.info('Client disconnected from web dashboard');
      });
    });

    // Broadcast updates to all connected clients
    this.broadcastStatus = () => {
      this.io.emit('status', this.bot.getStatus());
    };

    this.broadcastStats = async () => {
      try {
        const stats = await this.bot.getStats();
        this.io.emit('stats', stats);
      } catch (error) {
        logger.error('Error broadcasting stats:', error);
      }
    };
  }

  async start() {
    return new Promise((resolve, reject) => {
      try {
        this.server.listen(config.server.port, config.server.host, () => {
          logger.info(`🌐 Web dashboard available at http://${config.server.host}:${config.server.port}`);
          logger.info(`🔐 Admin login: admin / ${config.security.adminPassword}`);
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async stop() {
    return new Promise((resolve) => {
      this.server.close(() => {
        logger.info('Web server stopped');
        resolve();
      });
    });
  }

  // Broadcast methods for external use
  broadcastUpdate(type, data) {
    this.io.emit(type, data);
  }
}

module.exports = WebServer;