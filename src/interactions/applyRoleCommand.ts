import { Channel, EmbedBuilder, GuildMember, MessageContextMenuCommandInteraction, TextChannel } from 'discord.js';
import { logger } from '../utils/logger';
import { ErrorHandler, BotError, ErrorType } from '../utils/errorHandler';
import { EmbedColors } from '../utils/embedColors';
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
        embeds: [new EmbedBuilder().setDescription('このコマンドはサーバー内でのみ使用できます').setColor(EmbedColors.Error)],
        ephemeral: true,
      });
      return;
    }

    // 必須ロールを持っているかチェック
    if (!PermissionService.hasRequiredRole(member)) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setDescription('このコマンドを実行する権限がありません').setColor(EmbedColors.Error)],
        ephemeral: true,
      });
      return;
    }

    const targetMessage = interaction.targetMessage;
    let channel: Channel = targetMessage.channel;

    // 対象メッセージにスレッドがある場合はスレッドを対象にする
    if (targetMessage.hasThread) {
      let thread = targetMessage.thread;
      if (!thread && 'threads' in channel) {
        try {
          thread = await (channel as TextChannel).threads.fetch(targetMessage.id) ?? null;
        } catch (error) {
          logger.warn(`Failed to fetch thread for message ${targetMessage.id}`, error);
        }
      }
      if (thread) {
        channel = thread;
      }
    }

    // チャンネル名を取得（スレッドの場合はスレッド名）
    let channelName: string;
    if (channel.isThread()) {
      channelName = `【スレッド】 ${channel.name}`;
    } else if ('name' in channel) {
      channelName = `【チャンネル】 ${channel.name}`;
    } else {
      channelName = `【チャンネル】 ${channel.id}`;
    }

    // Phase 4: メッセージ履歴取得とユーザー抽出
    await interaction.reply({
      embeds: [new EmbedBuilder().setDescription('⏳ メッセージ履歴を取得中...').setColor(EmbedColors.Info)],
      ephemeral: true,
    });

    const messages = await MessageHistoryService.fetchChannelMessages(channel);
    const userIds = MessageHistoryService.extractUniqueUsers(messages);

    if (userIds.size === 0) {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setDescription('このチャンネルには発言者がいません').setColor(EmbedColors.Error)],
      });
      return;
    }

    const members = await MessageHistoryService.filterValidMembers(userIds, interaction.guild);

    if (members.length === 0) {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setDescription('このチャンネルの発言者は全員サーバーから退出しています').setColor(EmbedColors.Error)],
      });
      return;
    }

    // Phase 5: ロール選択UIを表示
    const botMember = await interaction.guild.members.fetchMe();
    const roles = RoleService.getAssignableRoles(interaction.guild, botMember);

    if (roles.length === 0) {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setDescription('付与可能なロールがありません').setColor(EmbedColors.Error)],
      });
      return;
    }

    const selectMenuRow = RoleSelectMenu.createRoleSelectMenu(channel.id, roles);

    const resultEmbed = new EmbedBuilder()
      .setTitle('付与するロールを選択')
      .setDescription('下のメニューから付与するロールを選択してください')
      .setFields(
        { name: '対象', value: channelName },
        { name: '取得メッセージ数', value: `${messages.length}件` },
        { name: 'ユニーク発言者', value: `${userIds.size}人` },
      )
      .setColor(EmbedColors.Success);

    // チャンネルの場合は注意喚起
    if (!channel.isThread()) {
      resultEmbed.addFields({ name: '⚠️ 注意', value: 'チャンネル全体が対象です' });
    }

    await interaction.editReply({
      embeds: [resultEmbed],
      components: [selectMenuRow],
    });
  } catch (error) {
    logger.error('Error handling apply role command', error);
    await ErrorHandler.handleInteractionError(interaction, error as Error);
  }
}
