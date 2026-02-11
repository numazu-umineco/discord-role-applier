import { PermissionsBitField } from 'discord.js';
import type { APIRole } from 'discord.js';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export class PermissionService {
  /**
   * ユーザーが必要なロールを持っているか確認
   * 環境変数REQUIRED_ROLE_IDsで指定されたロールを持っているかチェック
   */
  static hasRequiredRole(
    memberRoles: string[],
    memberId: string,
    ownerId: string
  ): boolean {
    // サーバーオーナーは常に許可
    if (memberId === ownerId) {
      logger.debug(`${memberId} is server owner, allowing access`);
      return true;
    }

    // 必須ロールが未設定の場合は全員許可
    if (env.requiredRoleIds.length === 0) {
      return true;
    }

    // いずれかのロールを持っていればOK
    const hasRole = env.requiredRoleIds.some((roleId) => memberRoles.includes(roleId));

    if (hasRole) {
      logger.debug(`${memberId} has required role, allowing access`);
    } else {
      logger.info(`${memberId} does not have required role, denying access`);
    }

    return hasRole;
  }

  /**
   * ユーザーが指定ロールを付与する権限を持っているか
   * Discordのロール階層を考慮
   */
  static canManageRole(
    memberRoles: string[],
    memberId: string,
    ownerId: string,
    guildId: string,
    guildRoles: APIRole[],
    targetRoleId: string
  ): boolean {
    // サーバーオーナーは常に許可
    if (memberId === ownerId) {
      logger.debug(`${memberId} is server owner, can manage role ${targetRoleId}`);
      return true;
    }

    // メンバーの実効パーミッションを計算
    const permissions = this.computePermissions(memberRoles, guildId, guildRoles);

    // MANAGE_ROLES権限を持っているか
    if (!permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      logger.info(`${memberId} does not have MANAGE_ROLES permission`);
      return false;
    }

    // 自分の最上位ロールより下位のロールのみ管理可能
    const memberHighestPosition = this.getHighestRolePosition(memberRoles, guildRoles);
    const targetRole = guildRoles.find((r) => r.id === targetRoleId);
    const targetPosition = targetRole?.position ?? 0;

    const canManage = memberHighestPosition > targetPosition;

    if (!canManage) {
      logger.info(
        `${memberId} cannot manage role ${targetRoleId} (user highest: ${memberHighestPosition}, target: ${targetPosition})`
      );
    } else {
      logger.debug(`${memberId} can manage role ${targetRoleId}`);
    }

    return canManage;
  }

  /**
   * ボットが指定ロールを付与できるか確認
   */
  static canBotManageRole(
    botRoles: string[],
    guildRoles: APIRole[],
    targetRoleId: string
  ): boolean {
    const botHighestPosition = this.getHighestRolePosition(botRoles, guildRoles);
    const targetRole = guildRoles.find((r) => r.id === targetRoleId);
    const targetPosition = targetRole?.position ?? 0;

    const canManage = botHighestPosition > targetPosition;

    if (!canManage) {
      logger.warn(
        `Bot cannot manage role ${targetRoleId} (bot highest: ${botHighestPosition}, target: ${targetPosition})`
      );
    }

    return canManage;
  }

  /**
   * メンバーのロールリストからパーミッションを計算
   */
  private static computePermissions(
    memberRoleIds: string[],
    guildId: string,
    guildRoles: APIRole[]
  ): PermissionsBitField {
    let permissions = BigInt(0);

    for (const role of guildRoles) {
      // @everyoneロール（guildIdと同じID）は全員に適用
      if (role.id === guildId || memberRoleIds.includes(role.id)) {
        permissions |= BigInt(role.permissions);
      }
    }

    // ADMINISTRATORを持つ場合は全権限
    if (permissions & BigInt(PermissionsBitField.Flags.Administrator)) {
      return new PermissionsBitField(PermissionsBitField.All);
    }

    return new PermissionsBitField(permissions);
  }

  /**
   * ロールリストから最上位ロールのpositionを取得
   */
  private static getHighestRolePosition(roleIds: string[], guildRoles: APIRole[]): number {
    return Math.max(
      0,
      ...guildRoles.filter((r) => roleIds.includes(r.id)).map((r) => r.position)
    );
  }
}
