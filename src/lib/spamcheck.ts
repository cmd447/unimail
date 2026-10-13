import { extractTags, htmlToText } from "@/lib/render";

export interface Draft {
  subject: string;
  html: string;
  text: string;
}

export interface SpamIssue {
  id: string;
  severity: "critical" | "warn" | "info";
  message: string;
  fix: string;
  /** auto-fix — rewrites the draft. absent = needs human hands. */
  auto?: string;
  patch?: (d: Draft) => Draft;
}

export interface SpamReport {
  score: number; // 0-100, higher = cleaner
  grade: "clean" | "meh" | "spammy";
  issues: SpamIssue[];
}

// phrase banks — weighted by how hard filters punish them

// near-guaranteed junk folder — scams, pharma, casino, crypto-bait
const HARD_PHRASES: [RegExp, string][] = [
  [/viagra|cialis|pharmacy|pills? (online|without)/i, "pharma spam vocab"],
  [/casino|blackjack|roulette|slot ?machine|poker online|sports betting/i, "gambling vocab"],
  [/lottery|jackpot|prize (draw|winner)|you (have )?won|claim your (prize|reward|winnings)/i, "prize/lottery vocab"],
  [/nigerian prince|inheritance fund|unclaimed funds|wire transfer/i, "advance-fee scam vocab"],
  [/crypto(currency)? (profit|invest|earn)|bitcoin (profit|earn)|btc profits|forex signals|binary options?|guaranteed (returns|profit)|passive income guaranteed/i, "crypto/forex bait"],
  [/make money (fast|online|from home)|earn \$?\d+ ?(k|per|\/)\s?(day|week|hr|hour)|work from home earn|get rich/i, "money-bait phrases"],
  [/weight ?loss (pill|tea|gummies)|keto gummies|cbd (oil|gummies)|miracle (cure|pill)|burn fat/i, "miracle-product vocab"],
  [/adult (dating|content)|hookup|onlyfans|live cams?|hot singles/i, "adult vocab"],
  [/100% free|free money|cash bonus|free gift card|free iphone|free trial (of|for) \w+ enhancement/i, "free-stuff bait"],
  [/debt relief|bad credit|no credit check|loan (approved|pre-?approved)|credit repair|refinance now/i, "finance-scam vocab"],
  [/you'?ve been (selected|chosen)|congratulations,? (you|dear)|winner notification/i, "winner-scam vocab"],
];

// heavy but survivable — urgency/pressure + generic CTA spam-speak
const MED_PHRASES: [RegExp, string][] = [
  [/act now|limited time|offer (expires|ends)|last chance|don'?t miss out|hurry|today only|expires (today|soon|tonight)|final notice|instant(ly)? (access|results)/i, "urgency pressure"],
  [/risk-?free|no obligation|satisfaction guaranteed|money-?back guaranteed|guaranteed (results|approval|acceptance)/i, "guarantee claims"],
  [/no questions asked|as seen on|doctors (hate|recommend)|secret (trick|method)|one weird trick|shocking truth/i, "clickbait tropes"],
  [/pre-?approved|no credit check|unsecured (credit|loan)|collect your payment|payment (waiting|pending)/i, "finance pressure"],
  [/click here|click (below|this link)|tap here|hit (this|the) link/i, "generic-link CTA"],
  [/call now|apply now|order now|buy now|subscribe now|sign up free|register now/i, "imperative CTA spam-speak"],
  [/\bunbelievable\b|\binsane (deal|discount|offer)\b|massive (discount|savings)|save big|huge (discount|savings)|\b\d{2,3}% off\b/i, "hype discounting"],
  [/\bfree\b/i, "the word 'free'"],
];

const SHORTENERS = [
  "bit.ly", "tinyurl.com", "rb.gy", "cutt.ly", "is.gd", "tiny.cc",
  "ow.ly", "buff.ly", "shorturl.at", "rebrand.ly", "tinyl.co", "soo.gd",
];

const KNOWN_TAGS = new Set([
  "email", "first_name", "last_name", "name", "unsubscribe_url",
]);

// helpers

const HREF = /href\s*=\s*["']([^"']+)["']/gi;
const ANCHOR = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

const domainOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

const stripTags = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

// auto-fix helpers

/** Run a transform on text nodes only — never inside tags/attrs/urls. */
const mapTextNodes = (html: string, fn: (s: string) => string) =>
  html
    .split(/(<[^>]+>)/g)
    .map((seg) => (seg.startsWith("<") ? seg : fn(seg)))
    .join("");

const MERGE = /(\{\{[^}]*\}\})/g;
const titleCase = (s: string) =>
  s
    .split(MERGE)
    .map((p) =>
      p.startsWith("{{")
        ? p
        : p.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()),
    )
    .join("");

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
const keepFirstEmoji = (s: string) => {
  let n = 0;
  return s.replace(EMOJI, (m) => (++n === 1 ? m : ""));
};
const singleBang = (s: string) => {
  let n = 0;
  return s.replace(/!+/g, () => (++n === 1 ? "!" : ""));
};

/* word-swap dictionary — text nodes only, case-insensitive */
const SWAPS: [RegExp, string][] = [
  [/\b100% free\b/gi, "no charge"],
  [/\bfree\b/gi, "no charge"],
  [/\bclick here\b/gi, "see it"],
  [/\bbuy now\b/gi, "get it"],
  [/\border now\b/gi, "get yours"],
  [/\bcall now\b/gi, "call us"],
  [/\bapply now\b/gi, "apply here"],
  [/\bsign up free\b/gi, "sign up"],
  [/\bregister now\b/gi, "register"],
  [/\bsubscribe now\b/gi, "subscribe"],
  [/\bact now\b/gi, "while it lasts"],
  [/\blimited time\b/gi, "this week"],
  [/\blast chance\b/gi, "ending soon"],
  [/\bdon'?t miss out\b/gi, "don't skip this"],
  [/\btoday only\b/gi, "this week"],
  [/\bexpires? (today|soon|tonight)\b/gi, "ends soon"],
  [/\bfinal notice\b/gi, "last heads-up"],
  [/\burgent\b/gi, "heads up"],
  [/\bhurry\b/gi, "soon"],
  [/\brisk-?free\b/gi, "easy"],
  [/\bguaranteed\b/gi, "proven"],
  [/\bno obligation\b/gi, "no strings"],
  [/\bmoney-?back guaranteed\b/gi, "refundable"],
  [/\bsatisfaction guaranteed\b/gi, "we'll make it right"],
  [/\bwinner(s)?\b/gi, "picked"],
  [/\bcash bonus\b/gi, "credit"],
  [/\bprize\b/gi, "reward"],
  [/\bcongratulations\b/gi, "good news"],
  [/\bmake money fast\b/gi, "earn extra"],
  [/\bno credit check\b/gi, "no credit pull"],
  [/\bsave big\b/gi, "save"],
  [/\bunbelievable\b/gi, "wild"],
];
const swapWords = (s: string) => {
  let out = s;
  for (const [re, rep] of SWAPS) out = out.replace(re, rep);
  return out;
};

const LEET: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "$": "s",
};
const deLeet = (s: string) =>
  s.replace(/\b[a-z$]*[a-z$][0-9]+[a-z0-9$]*\b|\b[a-z0-9$]*[0-9]+[a-z$]+\b/gi, (w) =>
    w.length > 3 && !/^(h[1-6]|mp[34]|202\d)$/i.test(w)
      ? w.replace(/[0134578$]/g, (c) => LEET[c] ?? c)
      : w,
  );

const collapseSpaced = (s: string) =>
  s.replace(/(?:\b[a-zA-Z]\s){3,}[a-zA-Z]\b/g, (m) => m.replace(/\s/g, ""));

const stripInvisible = (s: string) => s.replace(/[\u200B-\u200D\uFEFF]/g, "");

const stripInteractive = (html: string) =>
  html
    .replace(/<(script|iframe|object|embed|video|audio)[\s\S]*?<\/\1>/gi, "")
    .replace(/<(input|embed|source|track)\b[^>]*\/?>/gi, "")
    .replace(/<\/?(form|select|option|button|textarea)\b[^>]*>/gi, "");

// an element whose style hides it goes out entirely — stray decls get stripped
const stripHidden = (html: string) =>
  html
    .replace(
      /<(div|span|p|td)[^>]*?style\s*=\s*["'][^"']*?(?:display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*(?:0|1px)|opacity\s*:\s*0|mso-hide\s*:\s*all|max-height\s*:\s*0|max-width\s*:\s*0)[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi,
      "",
    )
    .replace(/display\s*:\s*none\s*;?/gi, "")
    .replace(/visibility\s*:\s*hidden\s*;?/gi, "")
    .replace(/font-size\s*:\s*(0|1px)\s*;?/gi, "")
    .replace(/opacity\s*:\s*0(\.0+)?\s*;?/gi, "")
    .replace(/mso-hide\s*:\s*all\s*;?/gi, "")
    .replace(/max-height\s*:\s*0\s*;?/gi, "")
    .replace(/max-width\s*:\s*0\s*;?/gi, "");

const upgradeLinks = (html: string) =>
  html.replace(/(href\s*=\s*["'])http:\/\//gi, "$1https://");

const UNSUB_BLOCK =
  '\n<div style="margin-top:32px;padding-top:12px;border-top:1px solid #e5e5e5;font-size:11px;color:#888">Don\'t want these emails? <a href="{{unsubscribe_url}}">Unsubscribe</a></div>';

const fixAnchor = (html: string) =>
  html.replace(
    /<a\b([^>]*href\s*=\s*["']([^"']+)["'][^>]*)>(click here|here|link|this link|open|download|go|>>|read more)<\/a>/gi,
    (_m, attrs, href, _label) => `<a${attrs}>see ${domainOf(href) ?? "the link"}</a>`,
  );

const vis = (text: string) =>
  text
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

// main

export function spamReport(subject: string, html: string, text: string): SpamReport {
  const issues: SpamIssue[] = [];
  const add = (
    id: string,
    severity: SpamIssue["severity"],
    message: string,
    fix: string,
    auto?: string,
    patch?: (d: Draft) => Draft,
  ) => issues.push({ id, severity, message, fix, auto, patch });

  const cleanHtml = vis(html);
  const bodyText = stripTags(cleanHtml).trim();
  const hay = `${subject}\n${bodyText}`;
  const hrefs = [...cleanHtml.matchAll(HREF)].map((m) => m[1]);
  const anchors = [...cleanHtml.matchAll(ANCHOR)].map((m) => ({
    href: m[1],
    label: stripTags(m[2]).trim(),
  }));

  // subject

  const caps = (subject.match(/[A-Z]/g) ?? []).length;
  if (subject.length > 8 && caps / subject.length > 0.5) {
    add("caps-subject", "warn", "Subject is mostly CAPS", "Lowercase it or use title case — 'GET 50% OFF' reads as shouting to filters. Try 'Get 50% off' or 'your 50% is inside'.",
      "title-case it", (d) => ({ ...d, subject: titleCase(d.subject) }));
  }
  const bangs = (subject.match(/!/g) ?? []).length;
  if (bangs > 1) {
    add("subject-bangs", "warn", `Subject has ${bangs} exclamation marks`, "Keep it to zero or one. 'Big news inside!' beats 'BIG NEWS INSIDE!!!'.",
      "keep one !", (d) => ({ ...d, subject: singleBang(d.subject) }));
  }
  if (/^(re|fwd?|fw)\s*:/i.test(subject)) {
    add("fake-re", "critical", "Fake 'Re:'/'Fwd:' prefix", "Filters check for reply chains that don't exist — drop it and write an honest subject.",
      "strip the prefix", (d) => ({ ...d, subject: d.subject.replace(/^(re|fwd?|fw)\s*:\s*/i, "") }));
  }
  const emojis = (subject.match(EMOJI) ?? []).length;
  if (emojis > 2) {
    add("emoji-overload", "warn", `${emojis} emojis in subject`, "One tasteful emoji max — emoji strings scream promo tab.",
      "keep the first", (d) => ({ ...d, subject: keepFirstEmoji(d.subject) }));
  }
  if (subject.length > 60) {
    add("subject-length", "info", "Subject over 60 chars", "Inbox previews cut ~60 chars on mobile — front-load the hook.");
  }
  if (!subject.trim()) {
    add("empty-subject", "critical", "Empty subject", "No subject = near-guaranteed spam folder.");
  }
  if (/[\u200B-\u200D\uFEFF]/.test(subject + html)) {
    add("invisible-chars", "critical", "Invisible/zero-width characters detected", "Spammers use these to dodge word filters — filters know the trick. Re-type the affected text cleanly.",
      "strip them", (d) => ({ ...d, subject: stripInvisible(d.subject), html: stripInvisible(d.html) }));
  }

  // phrase hits

  const hard = HARD_PHRASES.filter(([r]) => r.test(hay)).map(([, l]) => l);
  const med = MED_PHRASES.filter(([r]) => r.test(hay)).map(([, l]) => l);
  if (hard.length) {
    add("phrase-hard", "critical", `Toxic phrase categories: ${hard.slice(0, 3).join(", ")}`, "These vocab classes are spam-folder fuel — rewrite the claim instead of hyping it. Sell the benefit plainly ('how it helps you') instead of promising outcomes.");
  }
  if (med.length) {
    add("phrase-med", med.length > 2 ? "critical" : "warn", `Pressure/spam-speak: ${med.slice(0, 3).join(", ")}`, "Swap the pressure for specifics — 'act now' → 'while it lasts', 'click here' → name what they're clicking, 'free' → 'no charge' or 'on us'.",
      "swap the words", (d) => ({
        ...d,
        subject: swapWords(d.subject),
        html: mapTextNodes(d.html, swapWords),
      }));
  }

  // obfuscation

  if (/(?:\b[a-zA-Z]\s){3,}[a-zA-Z]\b/.test(bodyText)) {
    add("spaced-letters", "critical", "Spaced-out letters detected (F R E E style)", "Obfuscation = instant spam flag. Just write the words normally.",
      "collapse them", (d) => ({
        ...d,
        subject: collapseSpaced(d.subject),
        html: mapTextNodes(d.html, collapseSpaced),
      }));
  }
  const obfWords = bodyText.match(/\b[a-z]*[a-z][0-9]+[a-z0-9]*\b|\b[a-z0-9]*[0-9]+[a-z]+\b/gi)
    ?.filter((w) => /[a-z]/i.test(w) && /[0-9]/.test(w) && w.length > 3 && !/^(h[1-6]|mp[34]|202\d)$/i.test(w));
  if (obfWords?.length) {
    add("leet-words", "warn", `Leet/obfuscated words: ${obfWords.slice(0, 3).join(", ")}`, "'fr33' and 'w1n' fool nobody — filters normalize digits. Write the real word or rephrase.",
      "de-obfuscate", (d) => ({
        ...d,
        subject: deLeet(d.subject),
        html: mapTextNodes(d.html, deLeet),
      }));
  }

  // html

  const kb = Math.round(new TextEncoder().encode(html).length / 1024);
  if (kb > 102) {
    add("size-clip", "warn", `Letter is ${kb}KB — Gmail clips at 102KB`, "Trim inline styles, cut nested tables, drop unused markup — or the email shows a '[Message clipped]' link.");
  } else if (kb > 70) {
    add("size-warn", "info", `Letter is ${kb}KB`, "Getting close to Gmail's 102KB clip line — slim it where you can.");
  }

  if (/<(form|script|iframe|object|embed|video|audio|input|button|select|textarea)\b/i.test(html)) {
    add("interactive-tags", "critical", "Interactive tags (form/script/iframe/input…)", "Email clients strip or hard-flag these — no forms, no scripts, no iframes. Link to a real page instead.",
      "strip the tags", (d) => ({ ...d, html: stripInteractive(d.html) }));
  }

  const hiddenText = /(display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*(0|1px)|opacity\s*:\s*0|mso-hide\s*:\s*all|max-height\s*:\s*0|max-width\s*:\s*0|color\s*:\s*(#fff(fff)?|white)\s*[;"].*background)/i.test(html);
  if (hiddenText) {
    add("hidden-text", "critical", "Hidden text detected", "Invisible keyword-stuffing (incl. ghost preheaders) is one of the oldest spam tricks — filters pattern-match it. Remove it entirely.",
      "remove hidden elements", (d) => ({ ...d, html: stripHidden(d.html) }));
  }

  const imgCount = (cleanHtml.match(/<img\b/gi) ?? []).length;
  const words = bodyText.split(/\s+/).filter(Boolean).length;
  if (imgCount > 0 && words < 25) {
    add("image-only", "critical", "Image-only letter (basically no text)", "Spam filters can't read images — this is the #1 deliverability killer. Rebuild with real text: headline + paragraphs + a button.");
  } else if (imgCount > 0 && words / imgCount < 40) {
    add("image-heavy", "warn", `Heavy image-to-text ratio (${imgCount} imgs / ${words} words)`, "More words, fewer pixels — image-heavy mail goes to promo or spam.");
  }

  const pixels = (cleanHtml.match(/<img[^>]*(width|height)\s*=\s*["']?1["'\s>]/gi) ?? []).length;
  if (pixels > 1) {
    add("tracking-pixels", "info", `${pixels} 1px tracking images`, "One tracking pixel is normal; several looks like beacon stuffing.");
  }

  if (/src\s*=\s*["']data:/i.test(html)) {
    add("base64-imgs", "warn", "Base64-embedded images", "Some clients strip data: URIs and filters read them as evasion — host the images instead.");
  }

  // links

  const urls = hrefs.filter((h) => /^https?:/i.test(h));
  const domains = [...new Set(urls.map(domainOf).filter(Boolean) as string[])];

  if (hrefs.length > 20) {
    add("links-many", "critical", `${hrefs.length} links in the letter`, "Way too many — keep it to 1-3 real CTAs. Every extra link is another chance to look like a phish.");
  } else if (hrefs.length > 8) {
    add("links-some", "warn", `${hrefs.length} links`, "Trim to the essentials — one main CTA + unsubscribe is usually enough.");
  }
  if (urls.length && words / urls.length < 60) {
    add("link-ratio", "warn", "High link-to-text ratio", "More copy, fewer links — text-heavy letters read as real mail.");
  }
  if (domains.length > 3) {
    add("link-domains", "warn", `Links span ${domains.length} domains (${domains.slice(0, 3).join(", ")}…)`, "Consolidate to your own domain — each foreign domain is a redirect filters don't trust.");
  }

  const short = domains.filter((d) => SHORTENERS.includes(d!));
  if (short.length) {
    add("shorteners", "critical", `URL shortener links (${short.join(", ")})`, "Filters can't see where short links go — always use full URLs to your real domain.");
  }
  const ipLinks = urls.filter((u) => /^https?:\/\/\d+\.\d+\.\d+\.\d+/.test(u));
  if (ipLinks.length) {
    add("ip-links", "critical", "Raw IP-address links", "Instant phish signal — never link to IPs.");
  }
  const insecure = urls.filter((u) => /^http:\/\//i.test(u));
  if (insecure.length) {
    add("insecure-links", "warn", `${insecure.length} insecure http:// link(s)`, "Switch to https — plain http links hurt trust scores.",
      "upgrade to https", (d) => ({ ...d, html: upgradeLinks(d.html) }));
  }

  const genericAnchors = anchors.filter((a) =>
    /^(click here|here|link|this link|open|download|go|>>|read more)$/i.test(a.label),
  );
  if (genericAnchors.length) {
    add("generic-anchor", "warn", `Generic anchor text ("${genericAnchors[0].label}")`, "Name the destination instead — 'see the report', 'get the guide'. 'click here' is classic spam-speak.",
      "name the links", (d) => ({ ...d, html: fixAnchor(d.html) }));
  }
  const mismatched = anchors.filter((a) => {
    const labelDomain = domainOf(a.label.startsWith("http") ? a.label : "");
    const hrefDomain = domainOf(a.href);
    return labelDomain && hrefDomain && labelDomain !== hrefDomain;
  });
  if (mismatched.length) {
    add("anchor-mismatch", "critical", "Link text shows a different domain than the URL", "That's the exact phishing pattern filters hunt — make the visible text match the real destination.");
  }

  // compliance

  if (!/unsubscribe|opt.?out|manage (your )?preferences/i.test(cleanHtml)) {
    add("no-unsub", "critical", "No unsubscribe mechanism in the body", "Drop {{unsubscribe_url}} in a footer — the engine also auto-appends one if the tag is absent, but bulk senders are required to offer opt-out.",
      "append unsub footer", (d) => ({ ...d, html: d.html + UNSUB_BLOCK }));
  }

  const hasAddress = /\d+\s+[a-z0-9\s.,'-]+\s(st|street|ave|avenue|rd|road|blvd|lane|ln|drive|dr|way|suite|ste|unit|floor|fl)\b|\b(po box|p\.?o\.? box)\s*\d+|registered office/i.test(bodyText);
  if (!hasAddress) {
    add("no-address", "warn", "No postal address found", "CAN-SPAM/GDPR-flavored filters look for a real address in the footer — add one line: '© 2025 Co, 12 Market St, Lagos'.");
  }

  if (!text.trim()) {
    add("no-plain", "warn", "No plain-text version", "Auto-derive fills it, but a hand-written plain version reads better to filters — use the 'plain' tab.",
      "derive it now", (d) => ({ ...d, text: htmlToText(d.html) }));
  }

  const unresolved = extractTags(html + " " + subject).filter(
    (t) => !KNOWN_TAGS.has(t) && !t.startsWith("fields."),
  );
  if (unresolved.length) {
    add("merge-tags", "warn", `Custom merge tags: ${unresolved.join(", ")}`, "These pull from lead CSV fields — fine if your packs have those columns, dead text if not.");
  }

  // score

  const W = { critical: 28, warn: 8, info: 3 };
  const score = Math.max(0, 100 - issues.reduce((s, i) => s + W[i.severity], 0));
  const grade = score >= 85 ? "clean" : score >= 60 ? "meh" : "spammy";
  return { score, grade, issues };
}

/** Run every auto-fixable patch over the draft, in report order. */
export function applyAllFixes(d: Draft): { draft: Draft; applied: string[] } {
  const { issues } = spamReport(d.subject, d.html, d.text);
  const applied: string[] = [];
  let out = d;
  for (const i of issues) {
    if (i.patch) {
      out = i.patch(out);
      applied.push(i.auto ?? i.id);
    }
  }
  return { draft: out, applied };
}
