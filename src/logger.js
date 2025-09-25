const winston = require('winston');
const config = require('../config/config');

// Add trace level to Winston
const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
    trace: 4
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    debug: 'blue',
    trace: 'magenta'
  }
};

winston.addColors(customLevels.colors);

const logger = winston.createLogger({
  level: config.logging.level,
  levels: customLevels.levels,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'debug.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.splat(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const processMessage = (m) => {
            if (typeof m === 'object' && m !== null) {
              const keys = Object.keys(m);
              if (keys.length > 0 && keys.every((k, i) => String(i) === k)) {
                return Object.values(m).join('');
              }
              return JSON.stringify(m);
            }
            return m;
          };

          const msg = processMessage(message);
          const metaMsg = processMessage(meta);

          if (msg === '{}' || msg === '""') {
            return `${timestamp} ${level}: ${metaMsg}`;
          }
          
          if (Object.keys(meta).length === 0) {
            return `${timestamp} ${level}: ${msg}`;
          }

          return `${timestamp} ${level}: ${msg} ${metaMsg}`;
        })
      )
    })
  ]
});

// Add trace method if it doesn't exist
if (!logger.trace) {
  logger.trace = logger.debug;
}

module.exports = logger;
