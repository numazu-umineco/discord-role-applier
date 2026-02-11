import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  GuildMember,
  StringSelectMenuInteraction,
  EmbedBuilder,
  TextChannel,
} from 'discord.js';
import { env } from '../config/env';
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

      // チャンネルを取得してスレッドかどうか判定
      const channel = await interaction.guild.channels.fetch(channelId);
      if (!channel) {
        throw new BotError(
          ErrorType.INVALID_CHANNEL,
          `Channel ${channelId} not found`,
          'チャンネルが見つかりません。'
        );
      }
      let channelName: string;
      if (channel.isThread()) {
        channelName = `スレッド: ${channel.name}`;
      } else if ('name' in channel) {
        channelName = `チャンネル: ${channel.name}`;
      } else {
        channelName = `チャンネル: ${channelId}`;
      }

      // 選択されたロールを取得
      const role = await interaction.guild.roles.fetch(selectedRoleId);
      if (!role) {
        throw new BotError(
          ErrorType.INVALID_ROLE,
          `Role ${selectedRoleId} not found`,
          'ロールが見つかりません。'
        );
      }

      // 対象者を取得
      const messages = await MessageHistoryService.fetchChannelMessages(channel);
      const userIds = MessageHistoryService.extractUniqueUsers(messages);
      const targetMembers = await MessageHistoryService.filterValidMembers(userIds, interaction.guild);

      // 対象者が0人の場合
      if (targetMembers.length === 0) {
        await interaction.update({
          content: '❌ 対象者がいません。このチャンネル/スレッドの発言者は全員サーバーから退出しています。',
          components: [],
        });
        return;
      }

      // メンションリストを作成（最大30人、文字数制限も考慮）
      const maxDisplayUsers = 30;
      let displayMembers = targetMembers.slice(0, maxDisplayUsers);
      let remainingCount = targetMembers.length - displayMembers.length;

      let userList = displayMembers.map(m => `<@${m.user.id}>`).join(', ');
      if (remainingCount > 0) {
        userList += `, 他${remainingCount}人`;
      }

      // 文字数制限チェック（2000文字制限）
      const baseMessageLength = 200; // 固定テキストの概算
      const maxUserListLength = 1800;
      if (userList.length > maxUserListLength) {
        // 文字数オーバーの場合は表示人数を減らす
        while (displayMembers.length > 1 && userList.length > maxUserListLength) {
          displayMembers = displayMembers.slice(0, -1);
          remainingCount = targetMembers.length - displayMembers.length;
          userList = displayMembers.map(m => `<@${m.user.id}>`).join(', ');
          if (remainingCount > 0) {
            userList += `, 他${remainingCount}人`;
          }
        }
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
      let confirmMessage = `
**確認**

${channelName}
ロール: **${role.name}**
対象者: **${targetMembers.length}人**

${userList}

上記の発言者全員にロールを付与しますか？
      `.trim();

      // チャンネルの場合は注意喚起
      if (!channel.isThread()) {
        confirmMessage += '\n\n⚠️ **チャンネル全体が対象です。影響範囲が大きくなる可能性があります。**';
      }

      await interaction.update({
        content: confirmMessage,
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
      let channelName: string;
      if (channel.isThread()) {
        channelName = `スレッド: ${channel.name}`;
      } else if ('name' in channel) {
        channelName = `チャンネル: ${channel.name}`;
      } else {
        channelName = `チャンネル: ${channelId}`;
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

      await interaction.editReply({
        content: resultMessage,
      });

      // 監査ログチャンネルへの投稿
      if (env.auditLogChannelId) {
        try {
          const auditChannel = await interaction.client.channels.fetch(env.auditLogChannelId);
          if (auditChannel?.isTextBased() && 'send' in auditChannel) {
            let resultText = `✅ 成功 ${result.success}人 / ⏭️ スキップ ${result.skipped}人`;
            if (result.failed > 0) {
              resultText += ` / ❌ 失敗 ${result.failed}人`;
            }

            const embed = new EmbedBuilder()
              .setTitle('ロール付与ログ')
              .setFields(
                { name: '実行者', value: `<@${member.user.id}>`, inline: true },
                { name: '対象', value: channelName, inline: true },
                { name: 'ロール', value: role.name, inline: true },
                { name: '結果', value: resultText },
              )
              .setTimestamp()
              .setColor(result.failed > 0 ? 0xED4245 : 0x57F287);

            await (auditChannel as TextChannel).send({ embeds: [embed] });
            logger.info(`Audit log sent to channel ${env.auditLogChannelId}`);
          } else {
            logger.warn(`Audit log channel ${env.auditLogChannelId} is not a text channel`);
          }
        } catch (auditError) {
          logger.error('Failed to send audit log', auditError);
        }
      }
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
