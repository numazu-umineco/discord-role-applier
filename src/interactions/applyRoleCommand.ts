import type { APIChannel, APIMessageApplicationCommandInteraction } from 'discord.js';
import { ChannelType } from 'discord.js';
import { logger } from '../utils/logger';
import { ErrorHandler } from '../utils/errorHandler';
import { PermissionService } from '../services/permissionService';
import { MessageHistoryService } from '../services/messageHistoryService';
import { RoleService } from '../services/roleService';
import { RoleSelectMenu } from '../interactions/roleSelectMenu';
import { deferredResponse } from '../lib/interactionResponse';
import { editOriginalInteractionResponse, fetchChannel } from '../lib/discordClient';
import { env } from '../config/env';

/**
 * コマンド実行時のHTTPレスポンスを返し、バックグラウンドで処理を実行
 */
export function handleApplyRoleCommand(
  interaction: APIMessageApplicationCommandInteraction
) {
  const applicationId = env.clientId;
  const interactionToken = interaction.token;
  const guildId = interaction.guild_id;

  // バックグラウンドで処理を実行
  processApplyRoleCommand(interaction, applicationId, interactionToken, guildId!).catch(
    (error) => {
      ErrorHandler.handleDeferredError(applicationId, interactionToken, error as Error).catch(
        (e) => logger.error('Failed to handle deferred error', e)
      );
    }
  );

  // 即座にdeferred responseを返す
  return deferredResponse(true);
}

async function processApplyRoleCommand(
  interaction: APIMessageApplicationCommandInteraction,
  applicationId: string,
  interactionToken: string,
  guildId: string
): Promise<void> {
  const member = interaction.member;
  if (!member || !guildId) {
    await editOriginalInteractionResponse(applicationId, interactionToken, {
      content: '❌ このコマンドはサーバー内でのみ使用できます。',
    });
    return;
  }

  logger.info(
    `Command executed by ${member.user?.id} in channel ${interaction.channel?.id}`
  );

  // 権限チェック
  if (!PermissionService.hasRequiredRole(member.roles, member.user?.id ?? '', interaction.data?.guild_id ?? guildId)) {
    await editOriginalInteractionResponse(applicationId, interactionToken, {
      content: '❌ このコマンドを実行する権限がありません。',
    });
    return;
  }

  // ターゲットメッセージのチャンネルIDを取得
  const targetMessage = interaction.data.resolved.messages[interaction.data.target_id];
  const channelId = targetMessage.channel_id;

  // チャンネル情報を取得
  let channel: APIChannel;
  try {
    channel = await fetchChannel(channelId);
  } catch {
    await editOriginalInteractionResponse(applicationId, interactionToken, {
      content: '❌ チャンネル情報の取得に失敗しました。',
    });
    return;
  }

  // チャンネル名を取得
  let channelName: string;
  if (
    channel.type === ChannelType.PublicThread ||
    channel.type === ChannelType.PrivateThread ||
    channel.type === ChannelType.AnnouncementThread
  ) {
    channelName = `スレッド: ${'name' in channel ? channel.name : channelId}`;
  } else if ('name' in channel && channel.name) {
    channelName = `チャンネル: ${channel.name}`;
  } else {
    channelName = `チャンネル: ${channelId}`;
  }

  // メッセージ履歴取得とユーザー抽出
  const messages = await MessageHistoryService.fetchMessages(channelId);
  const userIds = MessageHistoryService.extractUniqueUsers(messages);

  if (userIds.size === 0) {
    await editOriginalInteractionResponse(applicationId, interactionToken, {
      content: '❌ このチャンネルには発言者がいません。',
    });
    return;
  }

  const members = await MessageHistoryService.filterValidMembers(userIds, guildId);

  if (members.length === 0) {
    await editOriginalInteractionResponse(applicationId, interactionToken, {
      content: '❌ このチャンネルの発言者は全員サーバーから退出しています。',
    });
    return;
  }

  // ロール選択UIを表示
  const roles = await RoleService.getAssignableRoles(guildId);

  if (roles.length === 0) {
    await editOriginalInteractionResponse(applicationId, interactionToken, {
      content: '❌ 付与可能なロールがありません。',
    });
    return;
  }

  const selectMenuRow = RoleSelectMenu.createRoleSelectMenu(channelId, roles);

  let resultMessage = `
✅ メッセージ履歴の取得完了！

${channelName}
取得メッセージ数: ${messages.length}件
ユニーク発言者: ${userIds.size}人
現在サーバーにいる発言者: ${members.length}人
  `.trim();

  // チャンネルの場合は注意喚起
  const isThread =
    channel.type === ChannelType.PublicThread ||
    channel.type === ChannelType.PrivateThread ||
    channel.type === ChannelType.AnnouncementThread;
  if (!isThread) {
    resultMessage += '\n\n⚠️ **チャンネル全体が対象です**';
  }

  resultMessage += '\n\n下のメニューから付与するロールを選択してください👇';

  await editOriginalInteractionResponse(applicationId, interactionToken, {
    content: resultMessage,
    components: [selectMenuRow],
  });
}
