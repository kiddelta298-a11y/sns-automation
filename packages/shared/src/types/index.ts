export type Platform = "threads" | "x" | "instagram";

export type PostStatus =
  | "draft"
  | "scheduled"
  | "posting"
  | "posted"
  | "failed";

export type AccountStatus = "active" | "suspended" | "rate_limited";

export type ScheduledPostStatus =
  | "pending"
  | "executing"
  | "completed"
  | "failed";

export type AppealCategory =
  | "benefit"
  | "urgency"
  | "social_proof"
  | "curiosity";

export type ConversionEventType = "lp_visit" | "line_register";
