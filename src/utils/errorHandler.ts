import { Interaction } from 'discord.js';
import { logger } from './logger';

export enum ErrorType {
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  RATE_LIMIT = 'RATE_LIMIT',
  DISCORD_API_ERROR = 'DISCORD_API_ERROR',
  INVALID_CHANNEL = 'INVALID_CHANNEL',
  INVALID_ROLE = 'INVALID_ROLE',
  MEMBER_NOT_FOUND = 'MEMBER_NOT_FOUND',
  UNKNOWN = 'UNKNOWN',
}

export class BotError extends Error {
  constructor(
    public type: ErrorType,
    public message: string,
    public userMessage: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'BotError';
  }
}

export class ErrorHandler {
  static async handleInteractionError(
    interaction: Interaction,
    error: Error
  ): Promise<void> {
    logger.error('Interaction error', {
      error: error.message,
      stack: error.stack,
      interactionId: interaction.id,
      userId: interaction.user.id,
    });

    const userMessage = this.getUserFriendlyMessage(error);

    try {
      if (interaction.isRepliable()) {
        const method = interaction.replied || interaction.deferred ? 'followUp' : 'reply';

        await (interaction as any)[method]({
          content: `❌ ${userMessage}`,
          ephemeral: true,
        });
      }
    } catch (replyError) {
      logger.error('Failed to send error message', { replyError });
    }
  }

  static getUserFriendlyMessage(error: Error): string {
    if (error instanceof BotError) {
      return error.userMessage;
    }

    if (error.message.includes('Missing Permissions')) {
      return 'ボットに必要な権限がありません。サーバー管理者に確認してください。';
    }

    if (error.message.includes('Unknown Channel')) {
      return 'チャンネルが見つかりません。';
    }

    if (error.message.includes('Unknown Role')) {
      return 'ロールが見つかりません。';
    }

    if (error.message.includes('Missing Access')) {
      return 'このチャンネルにアクセスできません。';
    }

    return 'エラーが発生しました。しばらく経ってから再度お試しください。';
  }
}
