export interface RoleApplicationResult {
  success: number;
  failed: number;
  skipped: number;
  errors: Array<{ userId: string; error: string }>;
}
