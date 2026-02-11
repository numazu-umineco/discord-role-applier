import {
  ActionRowBuilder,
  Role,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { logger } from '../utils/logger';

export class RoleSelectMenu {
  /**
   * ロール選択メニューを生成
   */
  static createRoleSelectMenu(
    channelId: string,
    roles: Role[]
  ): ActionRowBuilder<StringSelectMenuBuilder> {
    // Discordの制限で最大25個まで
    const displayRoles = roles.slice(0, 25);

    if (roles.length > 25) {
      logger.warn(`Guild has more than 25 assignable roles, only showing first 25`);
    }

    const options = displayRoles.map((role) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(role.name)
        .setValue(role.id)
        .setDescription(`@${role.name} を付与します`)
    );

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`role_select_${channelId}`)
      .setPlaceholder('付与するロールを選択してください')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    return row;
  }

  /**
   * カスタムIDからチャンネルIDを抽出
   */
  static extractChannelIdFromCustomId(customId: string): string {
    const parts = customId.split('_');
    return parts[2]; // role_select_CHANNEL_ID
  }
}
