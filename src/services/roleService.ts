import { Guild, GuildMember, Role } from 'discord.js';
import { logger } from '../utils/logger';
import { RoleApplicationResult } from '../types';

export class RoleService {
  /**
   * サーバーの付与可能なロール一覧を取得
   * @everyoneとmanagedロール、Botより上位のロールは除外
   */
  static getAssignableRoles(guild: Guild, botMember: GuildMember): Role[] {
    const botHighestRole = botMember.roles.highest;

    const roles = guild.roles.cache
      .filter((role) => {
        // @everyone除外
        if (role.id === guild.id) return false;

        // managed（ボットのロールなど）を除外
        if (role.managed) return false;

        // ボットより上位のロールは除外
        if (role.position >= botHighestRole.position) return false;

        return true;
      })
      .sort((a, b) => b.position - a.position) // ポジションの高い順
      .map((role) => role);

    logger.info(`Found ${roles.length} assignable roles in guild ${guild.id}`);
    return Array.from(roles.values());
  }

  /**
   * 複数メンバーにロールを一括付与
   */
  static async applyRoleToMembers(
    members: GuildMember[],
    roleId: string
  ): Promise<RoleApplicationResult> {
    const result: RoleApplicationResult = {
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    };

    logger.info(`Applying role ${roleId} to ${members.length} members`);

    for (const member of members) {
      try {
        // 既にロールを持っている場合はスキップ
        if (member.roles.cache.has(roleId)) {
          result.skipped++;
          logger.debug(`Member ${member.user.tag} already has role ${roleId}, skipping`);
          continue;
        }

        // ロールを付与
        await member.roles.add(roleId);
        result.success++;
        logger.debug(`Successfully added role ${roleId} to ${member.user.tag}`);

        // レート制限を避けるため少し待機
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error: any) {
        result.failed++;
        const errorMessage = error.message || String(error);
        result.errors.push({
          userId: member.user.id,
          error: errorMessage,
        });
        logger.warn(`Failed to add role ${roleId} to ${member.user.tag}`, error);
      }
    }

    logger.info(
      `Role application complete: ${result.success} success, ${result.failed} failed, ${result.skipped} skipped`
    );

    return result;
  }
}
