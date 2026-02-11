import type { APIGuildMember, APIRole } from 'discord.js';
import { logger } from '../utils/logger';
import { RoleApplicationResult } from '../types';
import { addMemberRole, fetchGuildMember, fetchGuildRoles } from '../lib/discordClient';
import { env } from '../config/env';

export class RoleService {
  /**
   * サーバーの付与可能なロール一覧を取得
   * @everyoneとmanagedロール、Botより上位のロールは除外
   */
  static async getAssignableRoles(guildId: string): Promise<APIRole[]> {
    const allRoles = await fetchGuildRoles(guildId);
    const botMember = await fetchGuildMember(guildId, env.clientId);

    // Botの最上位ロールのpositionを計算
    const botRoleIds = botMember.roles;
    const botHighestPosition = Math.max(
      0,
      ...allRoles.filter((r) => botRoleIds.includes(r.id)).map((r) => r.position)
    );

    const roles = allRoles
      .filter((role) => {
        // @everyone除外
        if (role.id === guildId) return false;

        // managed（ボットのロールなど）を除外
        if (role.managed) return false;

        // ボットより上位のロールは除外
        if (role.position >= botHighestPosition) return false;

        return true;
      })
      .sort((a, b) => b.position - a.position);

    logger.info(`Found ${roles.length} assignable roles in guild ${guildId}`);
    return roles;
  }

  /**
   * 複数メンバーにロールを一括付与
   */
  static async applyRoleToMembers(
    guildId: string,
    members: APIGuildMember[],
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
      const userId = member.user?.id;
      if (!userId) {
        result.failed++;
        continue;
      }

      try {
        // 既にロールを持っている場合はスキップ
        if (member.roles.includes(roleId)) {
          result.skipped++;
          logger.debug(`Member ${userId} already has role ${roleId}, skipping`);
          continue;
        }

        // ロールを付与
        await addMemberRole(guildId, userId, roleId);
        result.success++;
        logger.debug(`Successfully added role ${roleId} to ${userId}`);

        // レート制限を避けるため少し待機
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error: any) {
        result.failed++;
        const errorMessage = error.message || String(error);
        result.errors.push({
          userId,
          error: errorMessage,
        });
        logger.warn(`Failed to add role ${roleId} to ${userId}`, error);
      }
    }

    logger.info(
      `Role application complete: ${result.success} success, ${result.failed} failed, ${result.skipped} skipped`
    );

    return result;
  }
}
