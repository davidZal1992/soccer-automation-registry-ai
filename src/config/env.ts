import 'dotenv/config';

interface Config {
  groupJids: {
    managers: string;
    players: string;
  };
  nodeEnv: string;
  logLevel: string;
}

// Validate required environment variables
const requiredVars = ['GROUP_1_JID', 'GROUP_2_JID'];
const missing = requiredVars.filter(v => !process.env[v]);

if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

export const config: Config = {
  groupJids: {
    managers: process.env.GROUP_1_JID!,
    players: process.env.GROUP_2_JID!,
  },
  nodeEnv: process.env.NODE_ENV || 'production',
  logLevel: process.env.LOG_LEVEL || 'info',
};
