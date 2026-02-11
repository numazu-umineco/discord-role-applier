import { logger } from './logger';
import { immediateResponse } from '../lib/interactionResponse';
import { editOriginalInteractionResponse } from '../lib/discordClient';

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
  /**
   * HTTPレスポンスとしてエラーを即座に返す
   */
  static immediateErrorResponse(error: Error) {
    const userMessage = this.getUserFriendlyMessage(error);
    return immediateResponse(`❌ ${userMessage}`, true);
  }

  /**
   * 遅延レスポンス中のエラーをREST API経由で送信
   */
  static async handleDeferredError(
    applicationId: string,
    interactionToken: string,
    error: Error
  ): Promise<void> {
    logger.error('Deferred interaction error', {
      error: error.message,
      stack: error.stack,
    });

    const userMessage = this.getUserFriendlyMessage(error);

    try {
      await editOriginalInteractionResponse(applicationId, interactionToken, {
        content: `❌ ${userMessage}`,
      });
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
