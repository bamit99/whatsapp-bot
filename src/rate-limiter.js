class RateLimiter {
  constructor() {
    this.userLimits = new Map();
    this.globalLimits = new Map();
    this.warnings = new Map();
    this.blockedUsers = new Map();

    // Default limits (messages per time window)
    this.limits = {
      messages: {
        perMinute: 20,    // Max messages per minute
        perHour: 100,     // Max messages per hour
        perDay: 500       // Max messages per day
      },
      media: {
        perMinute: 5,     // Max media messages per minute
        perHour: 30,      // Max media messages per hour
        perDay: 100       // Max media messages per day
      },
      commands: {
        perMinute: 10,    // Max bot commands per minute
        perHour: 50,      // Max bot commands per hour
        perDay: 200       // Max bot commands per day
      }
    };

    // Warning thresholds (percentage of limit)
    this.warningThresholds = {
      messages: 0.8,    // Warn at 80% of message limit
      media: 0.7,       // Warn at 70% of media limit
      commands: 0.9     // Warn at 90% of command limit
    };

    // Block durations (in milliseconds)
    this.blockDurations = {
      warning: 0,       // No block for warnings
      soft: 5 * 60 * 1000,    // 5 minutes for soft blocks
      hard: 30 * 60 * 1000,   // 30 minutes for hard blocks
      severe: 2 * 60 * 60 * 1000  // 2 hours for severe violations
    };

    // Cleanup blocked users every 10 minutes
    setInterval(() => this.cleanupBlockedUsers(), 10 * 60 * 1000);
  }

  // Check if user can send a message
  canSendMessage(userJid, messageType = 'text') {
    const now = Date.now();
    const userKey = `${userJid}:${messageType}`;

    // Check if user is blocked
    if (this.isBlocked(userJid)) {
      return { allowed: false, reason: 'blocked', blockInfo: this.getBlockInfo(userJid) };
    }

    // Initialize user limits if not exists
    if (!this.userLimits.has(userKey)) {
      this.userLimits.set(userKey, {
        messages: [],
        media: [],
        commands: [],
        lastWarning: 0,
        warningCount: 0
      });
    }

    const userData = this.userLimits.get(userKey);
    const limitKey = messageType === 'media' ? 'media' : 'messages';
    const limits = this.limits[limitKey];

    // Clean old entries
    this.cleanOldEntries(userData, limitKey, now);

    // Check limits
    const violations = this.checkLimits(userData, limitKey, limits, now);

    if (violations.length > 0) {
      return this.handleViolations(userJid, violations, messageType);
    }

    // Check if should warn
    const warningResult = this.shouldWarn(userData, limitKey, limits, now);
    if (warningResult.shouldWarn) {
      return { allowed: true, warning: warningResult.message };
    }

    return { allowed: true };
  }

  // Record a message/command
  recordAction(userJid, actionType, messageType = 'text') {
    const now = Date.now();
    const userKey = `${userJid}:${messageType}`;

    if (!this.userLimits.has(userKey)) {
      this.userLimits.set(userKey, {
        messages: [],
        media: [],
        commands: [],
        lastWarning: 0,
        warningCount: 0
      });
    }

    const userData = this.userLimits.get(userKey);
    const limitKey = actionType === 'command' ? 'commands' : (messageType === 'media' ? 'media' : 'messages');

    userData[limitKey].push(now);
  }

  // Check current limits
  checkLimits(userData, limitKey, limits, now) {
    const violations = [];
    const actions = userData[limitKey];

    // Check per minute limit
    const minuteAgo = now - (60 * 1000);
    const perMinute = actions.filter(time => time > minuteAgo).length;
    if (perMinute >= limits.perMinute) {
      violations.push({ type: 'perMinute', count: perMinute, limit: limits.perMinute });
    }

    // Check per hour limit
    const hourAgo = now - (60 * 60 * 1000);
    const perHour = actions.filter(time => time > hourAgo).length;
    if (perHour >= limits.perHour) {
      violations.push({ type: 'perHour', count: perHour, limit: limits.perHour });
    }

    // Check per day limit
    const dayAgo = now - (24 * 60 * 60 * 1000);
    const perDay = actions.filter(time => time > dayAgo).length;
    if (perDay >= limits.perDay) {
      violations.push({ type: 'perDay', count: perDay, limit: limits.perDay });
    }

    return violations;
  }

  // Handle rate limit violations
  handleViolations(userJid, violations, messageType) {
    const maxViolation = violations.reduce((max, v) =>
      this.getViolationSeverity(v) > this.getViolationSeverity(max) ? v : max
    );

    const severity = this.getViolationSeverity(maxViolation);
    const blockDuration = this.blockDurations[severity];

    // Block user
    this.blockedUsers.set(userJid, {
      blockedAt: Date.now(),
      duration: blockDuration,
      reason: `Rate limit exceeded: ${maxViolation.count}/${maxViolation.limit} ${maxViolation.type}`,
      violations: violations,
      messageType: messageType
    });

    return {
      allowed: false,
      reason: 'blocked',
      severity: severity,
      blockDuration: blockDuration,
      violations: violations
    };
  }

  // Check if should warn user
  shouldWarn(userData, limitKey, limits, now) {
    const actions = userData[limitKey];
    const warningThreshold = this.warningThresholds[limitKey];

    // Check per minute warning
    const minuteAgo = now - (60 * 1000);
    const perMinute = actions.filter(time => time > minuteAgo).length;
    const minuteThreshold = Math.floor(limits.perMinute * warningThreshold);

    if (perMinute >= minuteThreshold && now - userData.lastWarning > 5 * 60 * 1000) {
      userData.lastWarning = now;
      userData.warningCount++;

      return {
        shouldWarn: true,
        message: `⚠️ Warning: You're sending messages quickly (${perMinute}/${limits.perMinute} per minute). Please slow down to avoid being temporarily blocked.`
      };
    }

    return { shouldWarn: false };
  }

  // Get violation severity
  getViolationSeverity(violation) {
    const ratio = violation.count / violation.limit;

    if (ratio >= 2.0) return 'severe';
    if (ratio >= 1.5) return 'hard';
    if (ratio >= 1.0) return 'soft';
    return 'warning';
  }

  // Check if user is blocked
  isBlocked(userJid) {
    const blockInfo = this.blockedUsers.get(userJid);
    if (!blockInfo) return false;

    const now = Date.now();
    const unblockTime = blockInfo.blockedAt + blockInfo.duration;

    if (now >= unblockTime) {
      this.blockedUsers.delete(userJid);
      return false;
    }

    return true;
  }

  // Get block information
  getBlockInfo(userJid) {
    return this.blockedUsers.get(userJid);
  }

  // Clean old entries from user data
  cleanOldEntries(userData, limitKey, now) {
    const cutoff = now - (24 * 60 * 60 * 1000); // Keep last 24 hours
    userData[limitKey] = userData[limitKey].filter(time => time > cutoff);
  }

  // Cleanup expired blocks
  cleanupBlockedUsers() {
    const now = Date.now();
    for (const [userJid, blockInfo] of this.blockedUsers.entries()) {
      if (now >= blockInfo.blockedAt + blockInfo.duration) {
        this.blockedUsers.delete(userJid);
      }
    }
  }

  // Get user statistics
  getUserStats(userJid, messageType = 'text') {
    const userKey = `${userJid}:${messageType}`;
    const userData = this.userLimits.get(userKey);

    if (!userData) return null;

    const now = Date.now();
    const hourAgo = now - (60 * 60 * 1000);
    const dayAgo = now - (24 * 60 * 60 * 1000);

    const limitKey = messageType === 'media' ? 'media' : 'messages';
    const actions = userData[limitKey];

    return {
      perHour: actions.filter(time => time > hourAgo).length,
      perDay: actions.filter(time => time > dayAgo).length,
      total: actions.length,
      lastWarning: userData.lastWarning,
      warningCount: userData.warningCount,
      isBlocked: this.isBlocked(userJid)
    };
  }

  // Get global statistics
  getGlobalStats() {
    const stats = {
      totalUsers: this.userLimits.size,
      blockedUsers: this.blockedUsers.size,
      activeUsers: 0
    };

    const now = Date.now();
    const hourAgo = now - (60 * 60 * 1000);

    for (const userData of this.userLimits.values()) {
      const recentMessages = userData.messages.filter(time => time > hourAgo).length;
      const recentMedia = userData.media.filter(time => time > hourAgo).length;
      const recentCommands = userData.commands.filter(time => time > hourAgo).length;

      if (recentMessages > 0 || recentMedia > 0 || recentCommands > 0) {
        stats.activeUsers++;
      }
    }

    return stats;
  }

  // Update limits (for admin use)
  updateLimits(newLimits) {
    this.limits = { ...this.limits, ...newLimits };
  }

  // Clear user data (for admin use)
  clearUserData(userJid) {
    for (const messageType of ['text', 'media']) {
      const userKey = `${userJid}:${messageType}`;
      this.userLimits.delete(userKey);
    }
    this.blockedUsers.delete(userJid);
    this.warnings.delete(userJid);
  }

  // Get blocked users list
  getBlockedUsers() {
    const now = Date.now();
    const blocked = [];

    for (const [userJid, blockInfo] of this.blockedUsers.entries()) {
      const remaining = Math.max(0, blockInfo.blockedAt + blockInfo.duration - now);
      blocked.push({
        userJid,
        reason: blockInfo.reason,
        remainingTime: remaining,
        blockedAt: new Date(blockInfo.blockedAt).toISOString()
      });
    }

    return blocked;
  }
}

module.exports = RateLimiter;