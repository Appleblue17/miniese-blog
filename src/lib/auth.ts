/**
 * @file auth.ts — 权限检查工具函数
 *
 * 提供统一的权限检查逻辑，适用于 Article、WikiEntry、ArticleImageOverride 等实体。
 *
 * 权限模型（AND 匹配）：
 * - 用户拥有 roles: string[]（如 ["admin"]、["user"]、["admin", "school"]）
 * - 内容拥有 accessGroup: string[]（如 ["admin"]、["school"]、[] = 公开）
 * - 用户必须有 accessGroup 中所有要求的角色才能访问
 * - 空数组表示公开，无需任何角色
 */

/**
 * 检查用户是否有权限访问受保护的内容。
 *
 * @param userRoles - 用户的角色列表
 * @param requiredGroups - 内容要求的权限组列表（空数组 = 公开）
 * @returns 是否有权限
 */
export function checkAccess(
  userRoles: string[],
  requiredGroups: string[],
): boolean {
  // 空数组 = 公开，无需任何角色
  if (requiredGroups.length === 0) return true;
  // 用户必须有所有要求的角色（AND 匹配）
  return requiredGroups.every((group) => userRoles.includes(group));
}

/**
 * 检查用户是否有管理员角色。
 * 注意：这仅检查 roles 中是否包含 "admin"，不涉及多租户场景。
 */
export function isAdmin(roles: string[]): boolean {
  return roles.includes("admin");
}
