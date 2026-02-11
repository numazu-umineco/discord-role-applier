import type { APIGuildMember, APIMessage } from 'discord.js';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { BotError, ErrorType } from '../utils/errorHandler';
import { fetchChannelMessages, fetchGuildMember } from '../lib/discordClient';

export class MessageHistoryService {
  /**
   * チャンネルのメッセージ履歴を取得
   * 100件ずつバッチ取得し、最大limit件まで取得する
   */
  static async fetchMessages(
    channelId: string,
    limit: number = env.maxMessageFetch
  ): Promise<APIMessage[]> {
    const messages: APIMessage[] = [];
    let lastId: string | undefined;
    const batchSize = 100; // Discord APIの制限

    logger.info(`Fetching messages from channel ${channelId} (max: ${limit})`);

    try {
      while (messages.length < limit) {
        const remaining = limit - messages.length;
        const fetchCount = Math.min(batchSize, remaining);

        const fetched = await fetchChannelMessages(channelId, fetchCount, lastId);

        if (fetched.length === 0) {
          logger.info(`No more messages to fetch from channel ${channelId}`);
          break;
        }

        messages.push(...fetched);
        lastId = fetched[fetched.length - 1]?.id;

        logger.debug(`Fetched ${fetched.length} messages, total: ${messages.length}`);

        // レート制限を避けるため、少し待機
        if (messages.length < limit && fetched.length === batchSize) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      logger.info(`Fetched ${messages.length} messages from channel ${channelId}`);
      return messages;
    } catch (error: any) {
      if (error.code === 50001) {
        throw new BotError(
          ErrorType.DISCORD_API_ERROR,
          `Missing access to channel ${channelId}`,
          'このチャンネルにアクセスできません。Botの権限を確認してください。'
        );
      }

      throw new BotError(
        ErrorType.DISCORD_API_ERROR,
        `Failed to fetch messages from channel ${channelId}: ${error.message}`,
        'メッセージの取得中にエラーが発生しました。',
        error
      );
    }
  }

  /**
   * メッセージから重複のないユーザーIDを抽出
   * ボットとシステムメッセージは除外
   */
  static extractUniqueUsers(messages: APIMessage[]): Set<string> {
    const userIds = new Set<string>();

    for (const message of messages) {
      // ボットを除外
      if (message.author.bot) {
        continue;
      }

      // システムメッセージを除外（type 0 = DEFAULT, 19 = REPLY）
      if (message.type !== 0 && message.type !== 19) {
        continue;
      }

      userIds.add(message.author.id);
    }

    logger.info(`Extracted ${userIds.size} unique users from ${messages.length} messages`);
    return userIds;
  }

  /**
   * ユーザーIDからサーバーメンバーを取得
   * 退出済みユーザーは除外される
   */
  static async filterValidMembers(
    userIds: Set<string>,
    guildId: string
  ): Promise<APIGuildMember[]> {
    const members: APIGuildMember[] = [];
    const notFound: string[] = [];

    logger.info(`Fetching ${userIds.size} members from guild ${guildId}`);

    for (const userId of userIds) {
      try {
        const member = await fetchGuildMember(guildId, userId);
        if (member) {
          members.push(member);
        }
      } catch (error: any) {
        // メンバーが見つからない場合（退出済み）
        if (error.code === 10007 || error.code === 10013) {
          notFound.push(userId);
          logger.debug(`Member ${userId} not found in guild ${guildId} (likely left)`);
        } else {
          logger.warn(`Failed to fetch member ${userId} from guild ${guildId}`, error);
        }
      }
    }

    if (notFound.length > 0) {
      logger.info(`${notFound.length} users are no longer in the server`);
    }

    logger.info(`Found ${members.length} valid members out of ${userIds.size} users`);
    return members;
  }
}
