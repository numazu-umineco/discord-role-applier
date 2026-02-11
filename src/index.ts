import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { verifyKey } from 'discord-interactions';
import type { APIInteraction } from 'discord.js';
import { InteractionType } from 'discord.js';
import { env } from './config/env';
import { logger } from './utils/logger';
import { handleApplyRoleCommand } from './interactions/applyRoleCommand';
import { InteractionHandler } from './interactions/interactionHandler';

const app = new Hono();

// ヘルスチェック
app.get('/health', (c) => c.json({ status: 'ok' }));

// Discord Interactions Endpoint
app.post('/interactions', async (c) => {
  const signature = c.req.header('x-signature-ed25519');
  const timestamp = c.req.header('x-signature-timestamp');
  const body = await c.req.text();

  if (!signature || !timestamp) {
    return c.text('Missing signature headers', 401);
  }

  const isValid = await verifyKey(body, signature, timestamp, env.publicKey);
  if (!isValid) {
    return c.text('Invalid signature', 401);
  }

  const interaction: APIInteraction = JSON.parse(body);

  // PING (type 1)
  if (interaction.type === InteractionType.Ping) {
    return c.json({ type: 1 });
  }

  // Application Command (type 2)
  if (interaction.type === InteractionType.ApplicationCommand) {
    if (interaction.data.name === env.commandName) {
      const response = handleApplyRoleCommand(interaction as any);
      return c.json(response);
    }
  }

  // Message Component (type 3)
  if (interaction.type === InteractionType.MessageComponent) {
    const customId = interaction.data.custom_id;

    if (customId.startsWith('role_select_')) {
      const response = InteractionHandler.handleRoleSelection(interaction);
      return c.json(response);
    }

    if (customId.startsWith('role_confirm_')) {
      const response = InteractionHandler.handleRoleConfirm(interaction);
      return c.json(response);
    }

    if (customId.startsWith('role_cancel_')) {
      const response = InteractionHandler.handleRoleCancel(interaction);
      return c.json(response);
    }
  }

  return c.text('Unknown interaction', 400);
});

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled promise rejection', error);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  process.exit(1);
});

serve({ fetch: app.fetch, port: env.port }, () => {
  logger.info(`HTTP server started on port ${env.port}`);
});
