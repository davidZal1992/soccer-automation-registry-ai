import 'dotenv/config';

interface Config {
  groupJids: {
    managers: string;
    players: string;
    test?: string;
  };
  anthropicApiKey: string;
  initialAdminJid: string;
  initialAdminName: string;
  nodeEnv: string;
  logLevel: string;
}

// Validate required environment variables
const requiredVars = ['GROUP_1_JID', 'GROUP_2_JID', 'ANTHROPIC_API_KEY'];
const missing = requiredVars.filter(v => !process.env[v]);

if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

export const config: Config = {
  groupJids: {
    managers: process.env.GROUP_1_JID!,
    players: process.env.GROUP_2_JID!,
    test: process.env.GROUP_3_JID,
  },
  anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  initialAdminJid: process.env.INITIAL_ADMIN_JID || '',
  initialAdminName: process.env.INITIAL_ADMIN_NAME || '',
  nodeEnv: process.env.NODE_ENV || 'production',
  logLevel: process.env.LOG_LEVEL || 'info',
};
