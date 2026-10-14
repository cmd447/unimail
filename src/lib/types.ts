export type SmtpEncryption = "ssl" | "starttls" | "none";

export interface SmtpProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  encryption: SmtpEncryption;
  user: string;
  /** Never leaves the server — omitted from API responses */
  passEnc?: string;
  hasPassword: boolean;
  /** Optional bounce mailbox (same creds as SMTP user/pass) */
  imapHost?: string;
  imapPort?: number;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  rateLimit?: number; // emails per minute
  lastVerifiedAt?: string | null;
  lastError?: string | null;
  isDefault?: boolean;
  createdAt?: string;
}

/** Raw Firestore document shape (includes the encrypted password). */
export interface StoredProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  encryption: SmtpEncryption;
  user: string;
  passEnc: string;
  imapHost?: string;
  imapPort?: number;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  rateLimit?: number;
  isDefault?: boolean;
  lastVerifiedAt?: FirebaseFirestore.Timestamp | null;
  lastError?: string | null;
  lastBounceScanAt?: string | null;
  createdAt?: FirebaseFirestore.Timestamp | null;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  html: string;
  text: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface MailList {
  id: string;
  name: string;
  description: string;
  count: number;
  createdAt?: string | null;
}

export type ContactStatus = "active" | "suppressed" | "bounced";

export interface Contact {
  id: string; // sha256 of lowercased email — natural global dedupe
  email: string;
  firstName: string;
  lastName: string;
  fields: Record<string, string>;
  listIds: string[];
  status: ContactStatus;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export interface Campaign {
  id: string;
  name: string;
  profileId: string;
  listId: string;
  listName: string;
  /** Template snapshot — running sends are immune to later template edits */
  subject: string;
  html: string;
  text: string;
  /** Per-blast overrides — blank = inherit from profile */
  rateLimit?: number | null;
  replyTo?: string | null;
  fromName?: string | null;
  /** Wave size — send N then auto-pause for a manual "next wave". 0/null = run to end. */
  batchSize?: number | null;
  /** Sends in the current wave — reset when a wave pause fires or resumes */
  batchSent?: number;
  status: CampaignStatus;
  counters: { total: number; sent: number; failed: number; skipped: number };
  error?: string | null;
  scheduledAt?: string | null;
  createdAt?: string | null;
  completedAt?: string | null;
}

export type MessageStatus = "queued" | "inflight" | "sent" | "failed" | "skipped";

export interface CampaignMessage {
  id: string;
  email: string;
  contactId: string;
  status: MessageStatus;
  attempts: number;
  smtpResponse?: string | null;
  error?: string | null;
  sentAt?: string | null;
}

export interface MailEvent {
  id: string;
  campaignId: string;
  campaignName: string;
  email: string;
  status: MessageStatus;
  detail: string;
  at?: string | null;
}

export interface ProfileInput {
  name: string;
  host: string;
  port: number;
  encryption: SmtpEncryption;
  user: string;
  password?: string;
  imapHost?: string;
  imapPort?: number;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  rateLimit?: number;
}
