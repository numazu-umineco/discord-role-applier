import { Events } from 'discord.js';
import { client } from './bot';
import { env } from './config/env';
import { logger } from './utils/logger';
import { handleApplyRoleCommand } from './commands/applyRole';
import { InteractionHandler } from './interactions/interactionHandler';

client.once(Events.ClientReady, (c) => {
  logger.info(`✅ Bot is ready! Logged in as ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  // Message Context Menu Command
  if (interaction.isMessageContextMenuCommand()) {
    if (interaction.commandName === env.commandName) {
      await handleApplyRoleCommand(interaction);
    }
    return;
  }

  // String Select Menu (ロール選択)
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId.startsWith('role_select_')) {
      await InteractionHandler.handleRoleSelection(interaction);
    }
    return;
  }

  // Button (確認・キャンセル)
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('role_confirm_')) {
      await InteractionHandler.handleRoleConfirm(interaction);
    } else if (interaction.customId.startsWith('role_cancel_')) {
      await InteractionHandler.handleRoleCancel(interaction);
    }
    return;
  }
});

client.on(Events.Error, (error) => {
  logger.error('Discord client error', error);
});

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled promise rejection', error);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  process.exit(1);
});

async function main() {
  try {
    logger.info('Starting Discord bot...');
    await client.login(env.discordToken);
  } catch (error) {
    logger.error('Failed to start bot', error);
    process.exit(1);
  }
}

main();
