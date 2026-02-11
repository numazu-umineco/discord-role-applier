import { REST, Routes, ContextMenuCommandBuilder, ApplicationCommandType } from 'discord.js';
import { env } from '../src/config/env';
import { logger } from '../src/utils/logger';

const command = new ContextMenuCommandBuilder()
  .setName(env.commandName)
  .setType(ApplicationCommandType.Message)
  .setDMPermission(false);

const rest = new REST().setToken(env.discordToken);

async function deployCommands() {
  try {
    logger.info('Started refreshing application (/) commands.');

    if (env.guildId) {
      // ギルド固有のコマンド登録（開発用、即座に反映される）
      await rest.put(Routes.applicationGuildCommands(env.clientId, env.guildId), {
        body: [command.toJSON()],
      });
      logger.info(`Successfully registered guild commands for guild ${env.guildId}`);
    } else {
      // グローバルコマンド登録（本番用、反映に最大1時間かかる）
      await rest.put(Routes.applicationCommands(env.clientId), {
        body: [command.toJSON()],
      });
      logger.info('Successfully registered global commands');
    }
  } catch (error) {
    logger.error('Failed to deploy commands', error);
    process.exit(1);
  }
}

deployCommands();
