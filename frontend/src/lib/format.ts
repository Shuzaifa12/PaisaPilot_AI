import type { ForecastApiError, ValidationIssue } from "@/lib/types";

export function displayApiAmount(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  return value;
}

export function formatApiError(payload: ForecastApiError | null, fallback: string): string {
  if (!payload) {
    return fallback;
  }
  if (payload.error) {
    return payload.error;
  }
  if (typeof payload.detail === "string") {
    return payload.detail;
  }
  if (Array.isArray(payload.detail)) {
    const lines = payload.detail.map(formatValidationIssue).filter(Boolean);
    if (lines.length > 0) {
      return lines.join(" ");
    }
  }
  return fallback;
}

function formatValidationIssue(issue: ValidationIssue): string {
  const path = (issue.loc ?? []).filter((part) => part !== "body").join(".");
  const message = issue.msg ?? "Invalid value";
  return path ? `${path}: ${message}` : message;
}

/** Calendar shift for a what-if *input* date. Does not compute balances. */
export function shiftIsoDate(isoDate: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    return isoDate;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}
