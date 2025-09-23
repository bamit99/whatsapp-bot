# WhatsApp Bot 🤖

A comprehensive WhatsApp automation tool built with the Baileys library for seamless integration with WhatsApp groups. This bot provides message monitoring, automated responses, data collection, spam detection, and administrative controls.

## Features ✨

### Core Features
- **QR Code Authentication**: Secure login using WhatsApp Web QR codes
- **Persistent Sessions**: Automatic session management and reconnection
- **Message Monitoring**: Real-time monitoring of group and private messages
- **Automated Responses**: Configurable trigger-based responses
- **Data Collection**: Extract and store phone numbers, URLs, and media links

### Advanced Features
- **Auto-Moderation**: Spam detection and rule enforcement
- **Rate Limiting**: Prevent WhatsApp bans with intelligent rate limiting
- **Multimedia Support**: Handle images, videos, documents, and stickers
- **Group Management**: Join groups, manage participants, and settings
- **Analytics**: User engagement tracking and message statistics
- **Web Dashboard**: Real-time monitoring and configuration
- **CLI Interface**: Command-line management tools

### Security & Compliance
- **Data Sanitization**: Secure data handling and storage
- **Access Controls**: Admin-only features and permissions
- **Logging**: Comprehensive audit trails
- **Error Handling**: Robust error recovery mechanisms

## Installation 🚀

### Prerequisites
- Node.js 16.x or higher
- npm or yarn
- A WhatsApp account (personal number)

### Quick Start

1. **Clone and Setup**
   ```bash
   git clone <repository-url>
   cd whatsapp-bot
   npm install
   ```

2. **Initialize Database**
   ```bash
   npm run init-db
   ```

3. **Configure Environment** (optional)
   Edit `.env` file to customize settings:
   ```env
   BOT_NAME=Your Bot Name
   ADMIN_PASSWORD=your-secure-password
   # ... other settings
   ```

4. **Start the Bot**
   ```bash
   npm start
   ```

5. **Scan QR Code**
   - Open WhatsApp on your phone
   - Go to Settings → Linked Devices → Link a Device
   - Scan the QR code displayed in the terminal

## Configuration ⚙️

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BOT_NAME` | WhatsApp Bot | Name displayed for the bot |
| `BOT_VERSION` | 1.0.0 | Bot version |
| `DB_PATH` | ./database/whatsapp-bot.db | SQLite database path |
| `PORT` | 3000 | Web dashboard port |
| `SESSION_DIR` | ./auth_info_baileys | Session storage directory |
| `LOG_LEVEL` | info | Logging level (error, warn, info, debug) |
| `ADMIN_PASSWORD` | admin123 | Admin dashboard password |
| `RATE_LIMIT_WINDOW` | 60000 | Rate limit window in ms |
| `RATE_LIMIT_MAX` | 10 | Max requests per window |
| `SPAM_THRESHOLD` | 5 | Messages per time window before spam detection |
| `COLLECT_PHONE_NUMBERS` | true | Enable phone number collection |
| `COLLECT_URLS` | true | Enable URL collection |
| `COLLECT_MEDIA` | true | Enable media collection |

## Usage 📱

### CLI Commands

```bash
# Start the bot
npm start

# CLI management
node src/index.js status          # Show bot status
node src/index.js stats           # Show statistics
node src/index.js add-trigger "hello" "Hi there!"  # Add trigger
node src/index.js remove-trigger "hello"           # Remove trigger
node src/index.js send "1234567890@s.whatsapp.net" "Message"  # Send message
```

### Trigger System

Add automated responses to specific keywords:

```bash
# Exact match (case-insensitive)
node src/index.js add-trigger "help" "Available commands: help, info, stats"

# Contains match
node src/index.js add-trigger "support" "Contact support@example.com" --match-type contains

# Regex match
node src/index.js add-trigger "ticket.*" "Your ticket has been created" --match-type regex
```

### Default Triggers

The bot comes with these pre-configured triggers:
- `help` - Show available commands
- `info` - Bot information
- `ping` - Test response

## Web Dashboard 🌐

Access the web dashboard at `http://localhost:3000` (default port).

### Features:
- **Real-time Statistics**: Message counts, user activity, spam detection
- **Trigger Management**: Add, edit, and remove triggers
- **User Management**: View user profiles and activity
- **Group Management**: Monitor group activity and settings
- **Log Viewer**: View bot logs and error messages
- **Configuration**: Update bot settings

### Authentication:
- Username: `admin`
- Password: Set in `.env` file (`ADMIN_PASSWORD`)

## API Endpoints 📡

### REST API

```
GET  /api/status          # Bot status
GET  /api/stats           # Statistics
GET  /api/triggers        # List triggers
POST /api/triggers        # Add trigger
DELETE /api/triggers/:id  # Remove trigger
GET  /api/users           # List users
GET  /api/messages        # List messages
POST /api/send            # Send message
```

### WebSocket Events

```javascript
// Connect to WebSocket
const socket = io('http://localhost:3000');

// Listen for events
socket.on('message', (data) => {
  console.log('New message:', data);
});

socket.on('stats', (data) => {
  console.log('Updated stats:', data);
});
```

## Database Schema 🗄️

### Tables Overview

- **users**: User profiles and activity tracking
- **groups**: Group information and metadata
- **messages**: All message history
- **group_members**: Group membership data
- **triggers**: Automated response triggers
- **spam_logs**: Spam detection logs
- **analytics**: Daily statistics
- **collected_data**: Extracted phone numbers, URLs, media
- **bot_logs**: Bot operation logs
- **rate_limits**: Rate limiting data

## Security Considerations 🔒

### Data Protection
- All sensitive data is stored locally in SQLite
- No data is transmitted to external servers
- Session files are encrypted and stored securely

### Rate Limiting
- Automatic rate limiting prevents WhatsApp bans
- Configurable limits per user and time window
- Exponential backoff for failed requests

### Access Control
- Admin-only features require authentication
- CLI commands can be restricted
- Web dashboard requires login

## Troubleshooting 🔧

### Common Issues

**QR Code not scanning:**
- Ensure WhatsApp is updated on your phone
- Try restarting the bot
- Check internet connection

**Connection drops:**
- Check network stability
- Verify WhatsApp Web is not blocked
- Restart the bot

**Database errors:**
- Run `npm run init-db` to reinitialize
- Check file permissions on database directory
- Ensure sufficient disk space

### Logs

View logs in `./logs/bot.log` or use the web dashboard log viewer.

### Debug Mode

Set `LOG_LEVEL=debug` in `.env` for detailed logging.

## Development 🛠️

### Project Structure

```
whatsapp-bot/
├── src/
│   ├── index.js           # Main application entry
│   ├── auth.js            # WhatsApp authentication
│   ├── whatsapp-handler.js # Connection management
│   ├── message-handler.js # Message processing
│   └── database.js        # Database operations
├── config/
│   └── config.js          # Configuration loader
├── database/
│   └── schema.sql         # Database schema
├── scripts/
│   └── init-db.js         # Database initialization
├── public/                # Web dashboard assets
├── logs/                  # Log files
├── .env                   # Environment configuration
└── package.json           # Dependencies and scripts
```

### Adding Features

1. **New Message Handlers**: Extend `MessageHandler` class
2. **Database Operations**: Add methods to `DatabaseManager`
3. **Web Endpoints**: Add routes to Express app
4. **CLI Commands**: Extend the CLI in `index.js`

### Testing

```bash
# Run tests
npm test

# Development mode with auto-restart
npm run dev
```

## Contributing 🤝

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License 📄

This project is licensed under the ISC License.

## Disclaimer ⚠️

This bot is for educational and personal use only. Ensure compliance with WhatsApp's Terms of Service. The authors are not responsible for any misuse or violations of WhatsApp's policies.

## Support 💬

- **Issues**: Create an issue on GitHub
- **Documentation**: Check the `/docs` directory
- **Community**: Join our Discord server

---

**Happy automating! 🚀**