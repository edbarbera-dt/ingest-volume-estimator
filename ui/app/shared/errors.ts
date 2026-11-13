import { isObject } from "./parsing";

const PERMISSION_PATTERN = /forbidden|permission|not authori[sz]ed|\b403\b|access denied/i;

/** True if an SDK / query error looks like a missing scope or IAM permission. */
export function isPermissionError(error: unknown): boolean {
  if (!isObject(error)) return false;
  const details = isObject(error.errorDetails) ? error.errorDetails : {};
  const response = isObject(error.response) ? error.response : {};
  const body = isObject(error.body) && isObject(error.body.error) ? error.body.error : {};
  if (details.code === 403 || response.status === 403 || body.code === 403) return true;
  return typeof error.message === "string" && PERMISSION_PATTERN.test(error.message);
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isObject(error) && typeof error.message === "string") return error.message;
  return "Unknown error";
}
