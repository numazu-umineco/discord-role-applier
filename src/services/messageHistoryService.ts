import { Channel, Guild, GuildMember, Message, TextBasedChannel } from 'discord.js';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { BotError, ErrorType } from '../utils/errorHandler';

export class MessageHistoryService {
  /**
   * チャンネルのメッセージ履歴を取得
   * 100件ずつバッチ取得し、最大limit件まで取得する
   */
  static async fetchChannelMessages(
    channel: Channel,
    limit: number = env.maxMessageFetch
  ): Promise<Message[]> {
    if (!channel.isTextBased()) {
      throw new BotError(
        ErrorType.INVALID_CHANNEL,
        `Channel ${channel.id} is not text-based`,
        'このチャンネルではメッセージを取得できません'
      );
    }

    const textChannel = channel as TextBasedChannel;
    const messages: Message[] = [];
    let lastId: string | undefined;
    const batchSize = 100; // Discord APIの制限

    logger.info(`Fetching messages from channel ${channel.id} (max: ${limit})`);

    try {
      while (messages.length < limit) {
        const remaining = limit - messages.length;
        const fetchCount = Math.min(batchSize, remaining);

        const fetchOptions: { limit: number; before?: string } = { limit: fetchCount };
        if (lastId) {
          fetchOptions.before = lastId;
        }

        const fetched = await textChannel.messages.fetch(fetchOptions);

        if (fetched.size === 0) {
          logger.info(`No more messages to fetch from channel ${channel.id}`);
          break;
        }

        messages.push(...fetched.values());
        lastId = fetched.last()?.id;

        logger.debug(`Fetched ${fetched.size} messages, total: ${messages.length}`);

        // レート制限を避けるため、少し待機
        if (messages.length < limit && fetched.size === batchSize) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      logger.info(`Fetched ${messages.length} messages from channel ${channel.id}`);
      return messages;
    } catch (error: any) {
      if (error.code === 50001) {
        throw new BotError(
          ErrorType.DISCORD_API_ERROR,
          `Missing access to channel ${channel.id}`,
          'このチャンネルにアクセスできません\nBotの権限を確認してください'
        );
      }

      throw new BotError(
        ErrorType.DISCORD_API_ERROR,
        `Failed to fetch messages from channel ${channel.id}: ${error.message}`,
        'メッセージの取得中にエラーが発生しました',
        error
      );
    }
  }

  /**
   * メッセージから重複のないユーザーIDを抽出
   * ボットとシステムメッセージは除外
   */
  static extractUniqueUsers(messages: Message[]): Set<string> {
    const userIds = new Set<string>();

    for (const message of messages) {
      // ボットを除外
      if (message.author.bot) {
        continue;
      }

      // システムメッセージを除外
      if (message.system) {
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
  static async filterValidMembers(userIds: Set<string>, guild: Guild): Promise<GuildMember[]> {
    const members: GuildMember[] = [];
    const notFound: string[] = [];

    logger.info(`Fetching ${userIds.size} members from guild ${guild.id}`);

    for (const userId of userIds) {
      try {
        const member = await guild.members.fetch(userId);
        if (member) {
          members.push(member);
        }
      } catch (error: any) {
        // メンバーが見つからない場合（退出済み）
        if (error.code === 10007 || error.code === 10013) {
          notFound.push(userId);
          logger.debug(`Member ${userId} not found in guild ${guild.id} (likely left)`);
        } else {
          logger.warn(`Failed to fetch member ${userId} from guild ${guild.id}`, error);
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
