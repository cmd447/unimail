import { db } from "@/lib/firebase/admin";

export interface Settings {
  killSwitch: boolean;
  dailyCap: number; // 0 = unlimited
  // Seed inbox — a mailbox YOU control (e.g. a gmail) used to detect
  // whether sent mail lands in inbox or spam.
  seedEmail?: string;
  seedImapHost?: string;
  seedImapPort?: number;
  seedImapUser?: string;
  seedImapPassEnc?: string; // encrypted
}

const DOC = () => db().collection("settings").doc("global");
const DEFAULTS: Settings = { killSwitch: false, dailyCap: 0 };

export async function getSettings(): Promise<Settings> {
  const doc = await DOC().get();
  return doc.exists ? { ...DEFAULTS, ...doc.data() } : DEFAULTS;
}

export async function updateSettings(patch: Partial<Settings>) {
  await DOC().set(patch, { merge: true });
}
