import dotenv from 'dotenv';

dotenv.config();

export interface EnvConfig {
  discordToken: string;
  clientId: string;
  publicKey: string;
  port: number;
  guildId?: string;
  requiredRoleIds: string[];
  maxMessageFetch: number;
  logLevel: string;
  nodeEnv: string;
  commandName: string;
}

function parseEnv(): EnvConfig {
  const requiredVars = ['DISCORD_TOKEN', 'CLIENT_ID', 'DISCORD_PUBLIC_KEY'];
  const missing = requiredVars.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const requiredRoleIdsStr = process.env.REQUIRED_ROLE_IDS || '';
  const requiredRoleIds = requiredRoleIdsStr
    ? requiredRoleIdsStr.split(',').map((id) => id.trim()).filter((id) => id.length > 0)
    : [];

  return {
    discordToken: process.env.DISCORD_TOKEN!,
    clientId: process.env.CLIENT_ID!,
    publicKey: process.env.DISCORD_PUBLIC_KEY!,
    port: parseInt(process.env.PORT || '8080', 10),
    guildId: process.env.GUILD_ID,
    requiredRoleIds,
    maxMessageFetch: parseInt(process.env.MAX_MESSAGE_FETCH || '1000', 10),
    logLevel: process.env.LOG_LEVEL || 'info',
    nodeEnv: process.env.NODE_ENV || 'development',
    commandName: process.env.COMMAND_NAME || '発言者にロールを適用する',
  };
}

export const env = parseEnv();
