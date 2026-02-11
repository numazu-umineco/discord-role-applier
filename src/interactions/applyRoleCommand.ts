import { GuildMember, MessageContextMenuCommandInteraction } from 'discord.js';
import { logger } from '../utils/logger';
import { ErrorHandler, BotError, ErrorType } from '../utils/errorHandler';
import { PermissionService } from '../services/permissionService';
import { MessageHistoryService } from '../services/messageHistoryService';
import { RoleService } from '../services/roleService';
import { RoleSelectMenu } from '../interactions/roleSelectMenu';

export async function handleApplyRoleCommand(
  interaction: MessageContextMenuCommandInteraction
): Promise<void> {
  try {
    logger.info(`Command executed by ${interaction.user.tag} in channel ${interaction.channelId}`);

    // Phase 3: 権限チェック
    const member = interaction.member as GuildMember;
    if (!member || !interaction.guild) {
      await interaction.reply({
        content: '❌ このコマンドはサーバー内でのみ使用できます。',
        ephemeral: true,
      });
      return;
    }

    // 必須ロールを持っているかチェック
    if (!PermissionService.hasRequiredRole(member)) {
      await interaction.reply({
        content: '❌ このコマンドを実行する権限がありません。',
        ephemeral: true,
      });
      return;
    }

    const targetMessage = interaction.targetMessage;
    const channel = targetMessage.channel;

    // チャンネル名を取得（スレッドの場合はスレッド名）
    let channelName: string;
    if (channel.isThread()) {
      channelName = `スレッド: ${channel.name}`;
    } else if ('name' in channel) {
      channelName = `チャンネル: ${channel.name}`;
    } else {
      channelName = `チャンネル: ${channel.id}`;
    }

    // Phase 4: メッセージ履歴取得とユーザー抽出
    await interaction.reply({
      content: '⏳ メッセージ履歴を取得中...',
      ephemeral: true,
    });

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

    // Phase 5: ロール選択UIを表示
    const botMember = await interaction.guild.members.fetchMe();
    const roles = RoleService.getAssignableRoles(interaction.guild, botMember);

    if (roles.length === 0) {
      await interaction.editReply({
        content: '❌ 付与可能なロールがありません。',
      });
      return;
    }

    const selectMenuRow = RoleSelectMenu.createRoleSelectMenu(channel.id, roles);

    let resultMessage = `
✅ メッセージ履歴の取得完了！

${channelName}
取得メッセージ数: ${messages.length}件
ユニーク発言者: ${userIds.size}人
現在サーバーにいる発言者: ${members.length}人
    `.trim();

    // チャンネルの場合は注意喚起
    if (!channel.isThread()) {
      resultMessage += '\n\n⚠️ **チャンネル全体が対象です**';
    }

    resultMessage += '\n\n下のメニューから付与するロールを選択してください👇';

    await interaction.editReply({
      content: resultMessage,
      components: [selectMenuRow],
    });
  } catch (error) {
    logger.error('Error handling apply role command', error);
    await ErrorHandler.handleInteractionError(interaction, error as Error);
  }
}
