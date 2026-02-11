import { GuildMember, PermissionFlagsBits, Role } from 'discord.js';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export class PermissionService {
  /**
   * ユーザーが必要なロールを持っているか確認
   * 環境変数REQUIRED_ROLE_IDsで指定されたロールを持っているかチェック
   */
  static hasRequiredRole(member: GuildMember): boolean {
    // サーバーオーナーは常に許可
    if (member.id === member.guild.ownerId) {
      logger.debug(`${member.user.tag} is server owner, allowing access`);
      return true;
    }

    // いずれかのロールを持っていればOK
    const hasRole = env.requiredRoleIds.some((roleId) => member.roles.cache.has(roleId));

    if (hasRole) {
      logger.debug(`${member.user.tag} has required role, allowing access`);
    } else {
      logger.info(`${member.user.tag} does not have required role, denying access`);
    }

    return hasRole;
  }

  /**
   * ユーザーが指定ロールを付与する権限を持っているか
   * Discordのロール階層を考慮
   */
  static canManageRole(member: GuildMember, targetRole: Role): boolean {
    // サーバーオーナーは常に許可
    if (member.id === member.guild.ownerId) {
      logger.debug(`${member.user.tag} is server owner, can manage role ${targetRole.name}`);
      return true;
    }

    // MANAGE_ROLES権限を持っているか
    if (!member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      logger.info(
        `${member.user.tag} does not have MANAGE_ROLES permission for role ${targetRole.name}`
      );
      return false;
    }

    // 自分の最上位ロールより下位のロールのみ管理可能
    const highestRole = member.roles.highest;
    const canManage = highestRole.position > targetRole.position;

    if (!canManage) {
      logger.info(
        `${member.user.tag} cannot manage role ${targetRole.name} (user highest: ${highestRole.position}, target: ${targetRole.position})`
      );
    } else {
      logger.debug(`${member.user.tag} can manage role ${targetRole.name}`);
    }

    return canManage;
  }

  /**
   * ボットが指定ロールを付与できるか確認
   */
  static canBotManageRole(botMember: GuildMember, targetRole: Role): boolean {
    // Botの最上位ロールより下位のロールのみ管理可能
    const botHighestRole = botMember.roles.highest;
    const canManage = botHighestRole.position > targetRole.position;

    if (!canManage) {
      logger.warn(
        `Bot cannot manage role ${targetRole.name} (bot highest: ${botHighestRole.position}, target: ${targetRole.position})`
      );
    }

    return canManage;
  }
}
