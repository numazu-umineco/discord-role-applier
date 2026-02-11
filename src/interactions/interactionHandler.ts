import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} from 'discord.js';
import type { APIChannel, APIMessageComponentInteraction } from 'discord.js';
import { logger } from '../utils/logger';
import { ErrorHandler, BotError, ErrorType } from '../utils/errorHandler';
import { MessageHistoryService } from '../services/messageHistoryService';
import { RoleService } from '../services/roleService';
import { PermissionService } from '../services/permissionService';
import { RoleSelectMenu } from './roleSelectMenu';
import { deferredUpdateResponse, updateMessageResponse } from '../lib/interactionResponse';
import {
  editOriginalInteractionResponse,
  fetchChannel,
  fetchGuildMember,
  fetchGuildRoles,
} from '../lib/discordClient';
import { env } from '../config/env';

export class InteractionHandler {
  /**
   * ロール選択後の処理（確認画面を表示）
   * deferredUpdateResponseを返し、バックグラウンドで処理する
   */
  static handleRoleSelection(interaction: APIMessageComponentInteraction) {
    const applicationId = env.clientId;
    const interactionToken = interaction.token;
    const guildId = interaction.guild_id!;

    // バックグラウンドで処理を実行
    this.processRoleSelection(interaction, applicationId, interactionToken, guildId).catch(
      (error) => {
        ErrorHandler.handleDeferredError(applicationId, interactionToken, error as Error).catch(
          (e) => logger.error('Failed to handle deferred error', e)
        );
      }
    );

    return deferredUpdateResponse();
  }

  private static async processRoleSelection(
    interaction: APIMessageComponentInteraction,
    applicationId: string,
    interactionToken: string,
    guildId: string
  ): Promise<void> {
    const member = interaction.member;
    if (!member || !guildId) {
      await editOriginalInteractionResponse(applicationId, interactionToken, {
        content: '❌ このコマンドはサーバー内でのみ使用できます。',
        components: [],
      });
      return;
    }

    // カスタムIDからチャンネルIDを抽出
    const channelId = RoleSelectMenu.extractChannelIdFromCustomId(interaction.data.custom_id);
    const selectedRoleId = (interaction.data as { custom_id: string; values: string[] }).values[0];

    logger.info(
      `Role selection by ${member.user?.id}: role ${selectedRoleId} for channel ${channelId}`
    );

    // チャンネルを取得
    let channel: APIChannel;
    try {
      channel = await fetchChannel(channelId);
    } catch {
      throw new BotError(
        ErrorType.INVALID_CHANNEL,
        `Channel ${channelId} not found`,
        'チャンネルが見つかりません。'
      );
    }

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

    // ギルドのロール一覧を取得
    const guildRoles = await fetchGuildRoles(guildId);

    // 選択されたロールを取得
    const role = guildRoles.find((r) => r.id === selectedRoleId);
    if (!role) {
      throw new BotError(
        ErrorType.INVALID_ROLE,
        `Role ${selectedRoleId} not found`,
        'ロールが見つかりません。'
      );
    }

    // 対象者を取得
    const messages = await MessageHistoryService.fetchMessages(channelId);
    const userIds = MessageHistoryService.extractUniqueUsers(messages);
    const targetMembers = await MessageHistoryService.filterValidMembers(userIds, guildId);

    // 対象者が0人の場合
    if (targetMembers.length === 0) {
      await editOriginalInteractionResponse(applicationId, interactionToken, {
        content: '❌ 対象者がいません。このチャンネル/スレッドの発言者は全員サーバーから退出しています。',
        components: [],
      });
      return;
    }

    // メンションリストを作成（最大30人、文字数制限も考慮）
    const maxDisplayUsers = 30;
    let displayMembers = targetMembers.slice(0, maxDisplayUsers);
    let remainingCount = targetMembers.length - displayMembers.length;

    let userList = displayMembers.map((m) => `<@${m.user?.id}>`).join(', ');
    if (remainingCount > 0) {
      userList += `, 他${remainingCount}人`;
    }

    // 文字数制限チェック（2000文字制限）
    const maxUserListLength = 1800;
    if (userList.length > maxUserListLength) {
      while (displayMembers.length > 1 && userList.length > maxUserListLength) {
        displayMembers = displayMembers.slice(0, -1);
        remainingCount = targetMembers.length - displayMembers.length;
        userList = displayMembers.map((m) => `<@${m.user?.id}>`).join(', ');
        if (remainingCount > 0) {
          userList += `, 他${remainingCount}人`;
        }
      }
    }

    // 権限チェック: ユーザーがこのロールを管理できるか
    if (
      !PermissionService.canManageRole(
        member.roles,
        member.user?.id ?? '',
        guildId,
        guildId,
        guildRoles,
        selectedRoleId
      )
    ) {
      await editOriginalInteractionResponse(applicationId, interactionToken, {
        content: '❌ このロールを管理する権限がありません。',
        components: [],
      });
      return;
    }

    // 権限チェック: Botがこのロールを付与できるか
    const botMember = await fetchGuildMember(guildId, env.clientId);
    if (!PermissionService.canBotManageRole(botMember.roles, guildRoles, selectedRoleId)) {
      await editOriginalInteractionResponse(applicationId, interactionToken, {
        content:
          '❌ Botがこのロールを付与する権限を持っていません。Botのロールをより上位に配置してください。',
        components: [],
      });
      return;
    }

    // 確認ボタンを作成
    const confirmButton = new ButtonBuilder()
      .setCustomId(`role_confirm_${channelId}_${selectedRoleId}`)
      .setLabel('実行')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅');

    const cancelButton = new ButtonBuilder()
      .setCustomId(`role_cancel_${channelId}_${selectedRoleId}`)
      .setLabel('キャンセル')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('❌');

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      confirmButton,
      cancelButton
    );

    // 確認メッセージに更新
    let confirmMessage = `
**確認**

${channelName}
ロール: **${role.name}**
対象者: **${targetMembers.length}人**

${userList}

上記の発言者全員にロールを付与しますか？
    `.trim();

    // チャンネルの場合は注意喚起
    const isThread =
      channel.type === ChannelType.PublicThread ||
      channel.type === ChannelType.PrivateThread ||
      channel.type === ChannelType.AnnouncementThread;
    if (!isThread) {
      confirmMessage += '\n\n⚠️ **チャンネル全体が対象です。影響範囲が大きくなる可能性があります。**';
    }

    await editOriginalInteractionResponse(applicationId, interactionToken, {
      content: confirmMessage,
      components: [row.toJSON()],
    });
  }

  /**
   * 確認ボタン押下時の処理（実際にロールを付与）
   * deferredUpdateResponseを返し、バックグラウンドで処理する
   */
  static handleRoleConfirm(interaction: APIMessageComponentInteraction) {
    const applicationId = env.clientId;
    const interactionToken = interaction.token;
    const guildId = interaction.guild_id!;

    // バックグラウンドで処理を実行
    this.processRoleConfirm(interaction, applicationId, interactionToken, guildId).catch(
      (error) => {
        ErrorHandler.handleDeferredError(applicationId, interactionToken, error as Error).catch(
          (e) => logger.error('Failed to handle deferred error', e)
        );
      }
    );

    return deferredUpdateResponse();
  }

  private static async processRoleConfirm(
    interaction: APIMessageComponentInteraction,
    applicationId: string,
    interactionToken: string,
    guildId: string
  ): Promise<void> {
    const member = interaction.member;
    if (!member || !guildId) {
      await editOriginalInteractionResponse(applicationId, interactionToken, {
        content: '❌ このコマンドはサーバー内でのみ使用できます。',
        components: [],
      });
      return;
    }

    // カスタムIDからチャンネルIDとロールIDを抽出
    const parts = interaction.data.custom_id.split('_');
    const channelId = parts[2];
    const roleId = parts[3];

    logger.info(`Role confirm by ${member.user?.id}: role ${roleId} for channel ${channelId}`);

    // ローディング状態を表示
    await editOriginalInteractionResponse(applicationId, interactionToken, {
      content: '⏳ ロールを付与中...',
      components: [],
    });

    // チャンネルを取得
    let channel: APIChannel;
    try {
      channel = await fetchChannel(channelId);
    } catch {
      throw new BotError(
        ErrorType.INVALID_CHANNEL,
        `Channel ${channelId} not found`,
        'チャンネルが見つかりません。'
      );
    }

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

    // ロール名を取得
    const guildRoles = await fetchGuildRoles(guildId);
    const role = guildRoles.find((r) => r.id === roleId);
    if (!role) {
      throw new BotError(
        ErrorType.INVALID_ROLE,
        `Role ${roleId} not found`,
        'ロールが見つかりません。'
      );
    }

    // メッセージ履歴を取得
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

    // ロールを一括付与
    const result = await RoleService.applyRoleToMembers(guildId, members, roleId);

    // 結果をフィードバック
    let resultMessage = `
✅ ロール付与完了！

**${channelName}**
**付与したロール:** ${role.name}

✅ 成功: ${result.success}人
⏭️ スキップ: ${result.skipped}人（既に保持）
    `.trim();

    if (result.failed > 0) {
      resultMessage += `\n❌ 失敗: ${result.failed}人`;
    }

    await editOriginalInteractionResponse(applicationId, interactionToken, {
      content: resultMessage,
    });
  }

  /**
   * キャンセルボタン押下時の処理
   * 即座にupdateMessageResponseを返す
   */
  static handleRoleCancel(interaction: APIMessageComponentInteraction) {
    logger.info(`Role cancel by ${interaction.member?.user?.id ?? interaction.user?.id}`);

    return updateMessageResponse('❌ キャンセルしました。', []);
  }
}
