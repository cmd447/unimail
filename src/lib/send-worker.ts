import { FieldValue, Timestamp } from "firebase-admin/firestore";
import crypto from "crypto";
import { db } from "@/lib/firebase/admin";
import { getCampaign, remainingQueued, setCampaignStatus } from "@/lib/campaigns";
import { getProfile } from "@/lib/profiles";
import { fromHeader, makeTransport } from "@/lib/mailer";
import { mergeData, renderMerge } from "@/lib/render";
import { suppressedSet } from "@/lib/suppressions";
import { getSettings } from "@/lib/settings";

const BATCH = 8;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function unsubFooter(appUrl: string, campaignId: string, msgId: string) {
  // Header → API endpoint (POST executes, per RFC 8058 one-click).
  // Footer → human confirm page.
  const url = `${appUrl}/unsubscribe?c=${campaignId}&m=${msgId}`;
  const api = `${appUrl}/api/unsubscribe?c=${campaignId}&m=${msgId}`;
  return {
    url,
    api,
    html: `<div style="margin-top:32px;padding-top:12px;border-top:1px solid #e5e5e5;font-size:11px;color:#888">Don't want these emails? <a href="${url}">Unsubscribe</a></div>`,
  };
}

async function logEvent(
  campaignId: string,
  campaignName: string,
  email: string,
  status: string,
  detail: string,
  meta?: Record<string, unknown>,
) {
  await db().collection("events").add({
    campaignId,
    campaignName,
    email,
    status,
    detail,
    ...(meta && { meta }),
    at: FieldValue.serverTimestamp(),
  });
}

/**
 * Process one batch of queued messages for a campaign.
 * Returns whether the campaign is still sending and how many remain queued.
 */
export async function processBatch(campaignId: string) {
  const campaign = await getCampaign(campaignId);
  if (!campaign) return { active: false, remaining: 0, note: "not found" };
  if (campaign.status !== "sending") {
    return { active: false, remaining: 0, note: campaign.status };
  }

  const settings = await getSettings();
  if (settings.killSwitch) {
    await setCampaignStatus(campaignId, "paused", "kill switch engaged");
    return { active: false, remaining: 0, note: "kill switch" };
  }
  if (settings.dailyCap > 0) {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    // range on one field only (no composite index), status counted in code
    const today = await db()
      .collection("events")
      .where("at", ">=", dayStart)
      .select("status")
      .get();
    const sentToday = today.docs.filter((d) => d.data().status === "sent").length;
    if (sentToday >= settings.dailyCap) {
      await setCampaignStatus(campaignId, "paused", "daily cap reached");
      return { active: false, remaining: 0, note: "daily cap" };
    }
  }

  const profile = await getProfile(campaign.profileId);
  if (!profile?.passEnc) {
    await setCampaignStatus(campaignId, "failed", "SMTP profile missing or unusable");
    return { active: false, remaining: 0, note: "profile missing" };
  }

  const msgsRef = db()
    .collection("campaigns")
    .doc(campaignId)
    .collection("messages");

  // rescue messages a crashed tick left claimed (>10min old) — they'd stick
  // as "inflight" forever otherwise
  const stuck = await msgsRef.where("status", "==", "inflight").limit(100).get();
  const rescue = stuck.docs.filter(
    (d) => (d.data().claimedAt?.toMillis?.() ?? 0) < Date.now() - 10 * 60_000,
  );
  if (rescue.length) {
    const b = db().batch();
    rescue.forEach((d) =>
      b.update(d.ref, { status: "queued", claimedBy: null, claimedAt: null }),
    );
    await b.commit();
  }

  // pace = the configured rate, honestly. slow rates get smaller ticks so the
  // function still finishes inside maxDuration — no silent speed-ups
  const pace = Math.max(
    0,
    Math.ceil(60_000 / (campaign.rateLimit || profile.rateLimit || 60)),
  );
  const tickBatch = Math.max(1, Math.min(BATCH, Math.floor(48_000 / Math.max(pace, 1))));

  // no orderBy — equality+orderBy needs a composite index; doc order is fine
  const snap = await msgsRef
    .where("status", "==", "queued")
    .limit(tickBatch)
    .get();

  if (snap.empty) {
    // peers mid-send? their writes land shortly — chain until they're done
    const mid = await msgsRef.where("status", "==", "inflight").count().get();
    if (mid.data().count > 0) {
      return { active: true, remaining: mid.data().count, note: "peers in flight" };
    }
    await setCampaignStatus(campaignId, "completed");
    return { active: false, remaining: 0, note: "completed" };
  }

  // claim before send — two overlapping ticks must never touch one contact
  const tickId = crypto.randomUUID();
  const claimed: typeof snap.docs = [];
  for (const doc of snap.docs) {
    const won = await db()
      .runTransaction(async (t) => {
        const fresh = await t.get(doc.ref);
        if (!fresh.exists || fresh.data()?.status !== "queued") return false;
        t.update(doc.ref, {
          status: "inflight",
          claimedBy: tickId,
          claimedAt: Timestamp.now(),
        });
        return true;
      })
      .catch(() => false);
    if (won) claimed.push(doc);
  }
  if (!claimed.length) {
    // a concurrent tick beat us to the whole batch — try again next hop
    return { active: true, remaining: snap.size, note: "claimed by another tick" };
  }

  const suppressed = await suppressedSet(claimed.map((d) => d.data().email));
  // wave cap — batchSize contacts per run, then auto-pause for a manual next wave
  const waveCap = campaign.batchSize || Infinity;
  let waveSent = campaign.batchSent ?? 0;
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const transport = makeTransport(profile, true);
  const cRef = db().collection("campaigns").doc(campaignId);
  const from = campaign.fromName
    ? `"${campaign.fromName.replace(/"/g, "")}" <${profile.fromEmail}>`
    : fromHeader(profile);
  const replyTo = campaign.replyTo || profile.replyTo || undefined;

  // Auto-probe: once per campaign, fire the real letter at the seed inbox —
  // cron later checks whether it landed INBOX or SPAM.
  if (settings.seedEmail && !(campaign as any).probeSent) {
    try {
      const pdata = mergeData({ email: settings.seedEmail });
      const info = await transport.sendMail({
        from,
        replyTo,
        to: settings.seedEmail,
        subject: renderMerge(campaign.subject, pdata),
        html: renderMerge(campaign.html, pdata),
        text: renderMerge(campaign.text, pdata),
        headers: {
          "List-Unsubscribe": `<${unsubFooter(appUrl, campaignId, "probe").api}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
      await db().collection("probes").add({
        subject: renderMerge(campaign.subject, pdata),
        campaignId,
        campaignName: campaign.name,
        smtpMessageId: info.messageId ?? null,
        sentAt: FieldValue.serverTimestamp(),
        placement: null,
      });
      await cRef.update({ probeSent: true });
      await logEvent(campaignId, campaign.name, settings.seedEmail, "probe", `probe fired → ${settings.seedEmail}`);
    } catch {
      /* probe is advisory — never block the blast */
    }
  }

  try {
    for (let i = 0; i < claimed.length; i++) {
      const doc = claimed[i];
      const m = doc.data();
      const msgId = doc.id;
      const email: string = m.email;

      if (suppressed.has(email)) {
        await doc.ref.update({ status: "skipped", error: "suppressed" });
        await cRef.update({ "counters.skipped": FieldValue.increment(1) });
        await logEvent(campaignId, campaign.name, email, "skipped", "suppression list");
        continue;
      }

      const unsub = unsubFooter(appUrl, campaignId, msgId);
      const data = {
        ...mergeData(m),
        unsubscribe_url: unsub.url,
      };
      const html = /\{\{\s*unsubscribe_url\s*\}\}/.test(campaign.html)
        ? renderMerge(campaign.html, data)
        : renderMerge(campaign.html, data) + unsub.html;

      const subject = renderMerge(campaign.subject, data);
      const text = renderMerge(campaign.text, data);
      const rendered = { subject, html, text };
      const attempt = (m.attempts ?? 0) + 1;
      await logEvent(
        campaignId,
        campaign.name,
        email,
        "sending",
        `→ ${profile.host}:${profile.port} (${profile.encryption}) attempt ${attempt}`,
        { profile: `${profile.host}:${profile.port}`, attempt, subject, messageId: msgId },
      );

      const t0 = Date.now();
      try {
        const info = await transport.sendMail({
          from,
          replyTo,
          to: email,
          subject,
          html,
          text,
          headers: {
            "List-Unsubscribe": `<${unsub.api}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });
        const ms = Date.now() - t0;
        await doc.ref.update({
          status: "sent",
          attempts: FieldValue.increment(1),
          smtpResponse: info.response ?? "",
          smtpMessageId: info.messageId ?? null,
          rendered,
          sentAt: FieldValue.serverTimestamp(),
          error: null,
        });
        await cRef.update({
          "counters.sent": FieldValue.increment(1),
          batchSent: FieldValue.increment(1),
        });
        waveSent++;
        await logEvent(
          campaignId,
          campaign.name,
          email,
          "sent",
          `${info.response ?? "accepted"} (${ms}ms)`,
          {
            smtpResponse: info.response ?? null,
            messageId: msgId,
            smtpMessageId: info.messageId ?? null,
            envelope: info.envelope ?? null,
            accepted: info.accepted ?? [],
            rejected: info.rejected ?? [],
            ms,
            attempt,
            profile: `${profile.host}:${profile.port}`,
          },
        );
      } catch (e) {
        const ms = Date.now() - t0;
        const err = e as any;
        const msg = err instanceof Error ? err.message : "send failed";
        await doc.ref.update({
          status: "failed",
          attempts: FieldValue.increment(1),
          rendered,
          error: msg,
        });
        await cRef.update({ "counters.failed": FieldValue.increment(1) });
        await logEvent(
          campaignId,
          campaign.name,
          email,
          "failed",
          `${msg} (${ms}ms)`,
          {
            error: msg,
            code: err?.code ?? null,
            command: err?.command ?? null,
            responseCode: err?.responseCode ?? null,
            response: err?.response ?? null,
            ms,
            attempt,
            profile: `${profile.host}:${profile.port}`,
            messageId: msgId,
          },
        );
      }

      if (pace && i < claimed.length - 1) await sleep(pace); // no pause after the last one
      if (waveSent >= waveCap) break; // wave boundary mid-batch — stop here
    }
  } finally {
    transport.close();
  }

  const remaining = await remainingQueued(campaignId);
  if (!remaining) {
    // peers still mid-send? chain keeps going until every claim resolves
    const mid = await msgsRef.where("status", "==", "inflight").count().get();
    if (mid.data().count > 0) {
      return { active: true, remaining: mid.data().count, note: "peers in flight" };
    }
    await setCampaignStatus(campaignId, "completed");
    return { active: false, remaining: 0, note: "completed" };
  }
  if (waveSent >= waveCap) {
    await cRef.update({
      status: "paused",
      batchSent: 0,
      error: `wave done — ${campaign.batchSize} sent · resume fires the next ${Math.min(campaign.batchSize!, remaining)}`,
    });
    return { active: false, remaining, note: "wave done" };
  }
  return { active: true, remaining, note: "batch done" };
}
