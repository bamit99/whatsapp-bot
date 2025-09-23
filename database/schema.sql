-- WhatsApp Bot Database Schema

-- Users table: Store user information
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jid TEXT UNIQUE NOT NULL,
    name TEXT,
    phone TEXT,
    profile_pic TEXT,
    is_admin BOOLEAN DEFAULT 0,
    is_banned BOOLEAN DEFAULT 0,
    join_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME,
    message_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Groups table: Store group information
CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jid TEXT UNIQUE NOT NULL,
    name TEXT,
    description TEXT,
    owner_jid TEXT,
    profile_pic TEXT,
    member_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Messages table: Store all messages
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT UNIQUE NOT NULL,
    jid TEXT NOT NULL, -- Can be user JID or group JID
    sender_jid TEXT NOT NULL,
    message_type TEXT NOT NULL, -- text, image, video, audio, document, etc.
    content TEXT, -- Message content or caption
    media_url TEXT, -- URL to media file if applicable
    media_type TEXT, -- mime type for media
    timestamp DATETIME NOT NULL,
    is_group BOOLEAN DEFAULT 0,
    group_jid TEXT, -- If it's a group message
    reply_to TEXT, -- Message ID this is replying to
    is_forwarded BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Group members table: Store group membership
CREATE TABLE IF NOT EXISTS group_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_jid TEXT NOT NULL,
    user_jid TEXT NOT NULL,
    role TEXT DEFAULT 'member', -- admin, member
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT 1,
    UNIQUE(group_jid, user_jid)
);

-- Triggers table: Store automated response triggers
CREATE TABLE IF NOT EXISTS triggers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword TEXT UNIQUE NOT NULL,
    response TEXT NOT NULL,
    is_active BOOLEAN DEFAULT 1,
    match_type TEXT DEFAULT 'exact', -- exact, contains, regex
    case_sensitive BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Spam logs table: Track spam detection
CREATE TABLE IF NOT EXISTS spam_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_jid TEXT NOT NULL,
    message_id TEXT,
    reason TEXT NOT NULL,
    severity TEXT DEFAULT 'low', -- low, medium, high
    action_taken TEXT, -- warned, muted, banned, etc.
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Analytics table: Store usage statistics
CREATE TABLE IF NOT EXISTS analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    total_messages INTEGER DEFAULT 0,
    total_users INTEGER DEFAULT 0,
    active_groups INTEGER DEFAULT 0,
    spam_detected INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(date)
);

-- Data collection table: Store extracted data
CREATE TABLE IF NOT EXISTS collected_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, -- phone, url, media
    value TEXT NOT NULL,
    source_jid TEXT NOT NULL,
    message_id TEXT,
    context TEXT, -- Additional context
    is_valid BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Bot logs table: Store bot actions and errors
CREATE TABLE IF NOT EXISTS bot_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT NOT NULL, -- info, warn, error
    message TEXT NOT NULL,
    context TEXT, -- JSON string with additional data
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Rate limiting table: Track user activity for rate limiting
CREATE TABLE IF NOT EXISTS rate_limits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_jid TEXT NOT NULL,
    action_type TEXT NOT NULL, -- message, command, etc.
    count INTEGER DEFAULT 1,
    window_start DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_jid, action_type, window_start)
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_messages_jid_timestamp ON messages(jid, timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_sender_timestamp ON messages(sender_jid, timestamp);
CREATE INDEX IF NOT EXISTS idx_users_jid ON users(jid);
CREATE INDEX IF NOT EXISTS idx_groups_jid ON groups(jid);
CREATE INDEX IF NOT EXISTS idx_triggers_keyword ON triggers(keyword);
CREATE INDEX IF NOT EXISTS idx_spam_logs_user ON spam_logs(user_jid);
CREATE INDEX IF NOT EXISTS idx_analytics_date ON analytics(date);
CREATE INDEX IF NOT EXISTS idx_collected_data_type ON collected_data(type);
CREATE INDEX IF NOT EXISTS idx_bot_logs_level_timestamp ON bot_logs(level, timestamp);
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_action ON rate_limits(user_jid, action_type);