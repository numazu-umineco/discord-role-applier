import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  GuildMember,
  StringSelectMenuInteraction,
} from 'discord.js';
import { logger } from '../utils/logger';
import { ErrorHandler, BotError, ErrorType } from '../utils/errorHandler';
import { MessageHistoryService } from '../services/messageHistoryService';
import { RoleService } from '../services/roleService';
import { PermissionService } from '../services/permissionService';
import { RoleSelectMenu } from './roleSelectMenu';

export class InteractionHandler {
  /**
   * ロール選択後の処理（確認画面を表示）
   */
  static async handleRoleSelection(interaction: StringSelectMenuInteraction): Promise<void> {
    try {
      const member = interaction.member as GuildMember;
      if (!member || !interaction.guild) {
        await interaction.reply({
          content: '❌ このコマンドはサーバー内でのみ使用できます。',
          ephemeral: true,
        });
        return;
      }

      // カスタムIDからチャンネルIDを抽出
      const channelId = RoleSelectMenu.extractChannelIdFromCustomId(interaction.customId);
      const selectedRoleId = interaction.values[0];

      logger.info(
        `Role selection by ${member.user.tag}: role ${selectedRoleId} for channel ${channelId}`
      );

      // 選択されたロールを取得
      const role = await interaction.guild.roles.fetch(selectedRoleId);
      if (!role) {
        throw new BotError(
          ErrorType.INVALID_ROLE,
          `Role ${selectedRoleId} not found`,
          'ロールが見つかりません。'
        );
      }

      // 権限チェック: ユーザーがこのロールを管理できるか
      if (!PermissionService.canManageRole(member, role)) {
        await interaction.update({
          content: '❌ このロールを管理する権限がありません。',
          components: [],
        });
        return;
      }

      // 権限チェック: Botがこのロールを付与できるか
      const botMember = await interaction.guild.members.fetchMe();
      if (!PermissionService.canBotManageRole(botMember, role)) {
        await interaction.update({
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
      await interaction.update({
        content: `**確認**\n\nチャンネル <#${channelId}> の発言者全員に\nロール **${role.name}** を付与しますか？`,
        components: [row],
      });
    } catch (error) {
      logger.error('Error handling role selection', error);
      await ErrorHandler.handleInteractionError(interaction, error as Error);
    }
  }

  /**
   * 確認ボタン押下時の処理（実際にロールを付与）
   */
  static async handleRoleConfirm(interaction: ButtonInteraction): Promise<void> {
    try {
      const member = interaction.member as GuildMember;
      if (!member || !interaction.guild) {
        await interaction.reply({
          content: '❌ このコマンドはサーバー内でのみ使用できます。',
          ephemeral: true,
        });
        return;
      }

      // カスタムIDからチャンネルIDとロールIDを抽出
      const parts = interaction.customId.split('_');
      const channelId = parts[2];
      const roleId = parts[3];

      logger.info(`Role confirm by ${member.user.tag}: role ${roleId} for channel ${channelId}`);

      // ローディング状態を表示
      await interaction.update({
        content: '⏳ ロールを付与中...',
        components: [],
      });

      // チャンネルを取得
      const channel = await interaction.guild.channels.fetch(channelId);
      if (!channel) {
        throw new BotError(
          ErrorType.INVALID_CHANNEL,
          `Channel ${channelId} not found`,
          'チャンネルが見つかりません。'
        );
      }

      // ロールを取得
      const role = await interaction.guild.roles.fetch(roleId);
      if (!role) {
        throw new BotError(
          ErrorType.INVALID_ROLE,
          `Role ${roleId} not found`,
          'ロールが見つかりません。'
        );
      }

      // メッセージ履歴を取得
      const messages = await MessageHistoryService.fetchChannelMessages(channel);
      const userIds = MessageHistoryService.extractUniqueUsers(messages);

      if (userIds.size === 0) {
        await interaction.editReply({
          content: '❌ このチャンネルには発言者がいません。',
        });
        return;
      }

      const members = await MessageHistoryService.filterValidMembers(userIds, interaction.guild);

      if (members.length === 0) {
        await interaction.editReply({
          content: '❌ このチャンネルの発言者は全員サーバーから退出しています。',
        });
        return;
      }

      // ロールを一括付与
      const result = await RoleService.applyRoleToMembers(members, roleId);

      // 結果をフィードバック
      const lines = [
        '✅ ロール付与完了！',
        '',
        `**対象チャンネル:** <#${channelId}>`,
        `**付与したロール:** ${role.name}`,
        '',
        `✅ 成功: ${result.success}人`,
        `⏭️ スキップ: ${result.skipped}人（既に保持）`,
      ];

      if (result.failed > 0) {
        lines.push(`❌ 失敗: ${result.failed}人`);
      }

      await interaction.editReply({
        content: lines.join('\n'),
      });
    } catch (error) {
      logger.error('Error handling role confirm', error);
      await ErrorHandler.handleInteractionError(interaction, error as Error);
    }
  }

  /**
   * キャンセルボタン押下時の処理
   */
  static async handleRoleCancel(interaction: ButtonInteraction): Promise<void> {
    try {
      logger.info(`Role cancel by ${interaction.user.tag}`);

      await interaction.update({
        content: '❌ キャンセルしました。',
        components: [],
      });
    } catch (error) {
      logger.error('Error handling role cancel', error);
      await ErrorHandler.handleInteractionError(interaction, error as Error);
    }
  }
}
