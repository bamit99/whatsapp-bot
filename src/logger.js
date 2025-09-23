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
    new winston.transports.File({ filename: 'debug.log', level: 'trace' }),
    new winston.transports.Console({
      level: 'trace',
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Add trace method if it doesn't exist
if (!logger.trace) {
  logger.trace = logger.debug;
}

module.exports = logger;
