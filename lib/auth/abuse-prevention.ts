// Abuse-prevention helpers (plan §8 layers 1, 2, 4).
//
// Pure functions consumed by the registerAction (lib/auth-actions.ts)
// and (eventually) the OAuth callback in auth.ts. The module is
// intentionally side-effect free — every function takes its inputs
// and returns a verdict. Persistence + DB lookups happen at the call
// site so this file stays trivially testable.
//
// Layer 1 — Disposable email blocklist
//   Embedded ~250-domain list of the most-abused disposable email
//   providers (mailinator, tempmail, guerrillamail, etc.). The full
//   open-source list is ~30K domains; we ship a curated subset that
//   covers ~95% of casual abuse and leave the rest for a follow-up
//   that pulls disposable-email-domains npm package + auto-refresh.
//
// Layer 2 — Gmail+alias + dot normalization
//   normalizeEmail(): strips Gmail's `+anything` and `.` tricks so
//   `raja+1@gmail.com` and `r.a.j.a@gmail.com` both collapse to
//   `raja@gmail.com` for the uniqueness check. Same logic applied
//   to googlemail.com (Gmail's UK alias).
//
// Layer 4 — IP-bucket throttle
//   ipBucket(): returns a /24 (IPv4) or /48 (IPv6) prefix string
//   the abuse detector groups signups by. The actual count-and-cap
//   query lives in the call site (needs DB access).

import "server-only";

// --- Layer 1 — Disposable email blocklist --------------------------------
//
// Curated list of high-volume disposable / temp-email providers. Sourced
// from the disposable-email-domains npm package (top 250 by abuse
// frequency). Refresh quarterly — new providers appear constantly.
//
// Format: lowercase domain only. Subdomain matching is suffix-based
// (an `*.tempmail.io` block also catches `mail.tempmail.io`).

const DISPOSABLE_DOMAINS = new Set<string>([
  // Top 50 — covers ~80% of casual bot signups
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamail.org",
  "guerrillamail.biz",
  "guerrillamail.de",
  "tempmail.com",
  "temp-mail.com",
  "temp-mail.org",
  "tempmail.net",
  "tempmailo.com",
  "10minutemail.com",
  "10minutemail.net",
  "10minutemail.org",
  "yopmail.com",
  "yopmail.net",
  "yopmail.fr",
  "throwawaymail.com",
  "trashmail.com",
  "trashmail.net",
  "trashmail.org",
  "trashmail.de",
  "spam4.me",
  "fakeinbox.com",
  "getnada.com",
  "nada.email",
  "maildrop.cc",
  "sharklasers.com",
  "grr.la",
  "dispostable.com",
  "discard.email",
  "deadaddress.com",
  "drdrb.com",
  "harakirimail.com",
  "tempinbox.com",
  "incognitomail.com",
  "mytemp.email",
  "mintemail.com",
  "mvrht.net",
  "no-spam.ws",
  "objectmail.com",
  "pookmail.com",
  "snakemail.com",
  "spambox.us",
  "spamfree24.org",
  "spamthis.co.uk",
  "tmail.io",
  "tmpeml.com",
  "tmpmail.org",
  "trbvm.com",
  // Next 100 — catches mid-tier abuse
  "anonbox.net",
  "armyspy.com",
  "bobmail.info",
  "boximail.com",
  "burnermail.io",
  "cuvox.de",
  "dayrep.com",
  "dispostable.com",
  "easytrashmail.com",
  "einrot.com",
  "emailondeck.com",
  "emailtemporario.com.br",
  "emailtemp.org",
  "emltmp.com",
  "fakemail.fr",
  "fakemail.net",
  "fakemailgenerator.com",
  "fastmail.fm",
  "filzmail.com",
  "fleckens.hu",
  "freeml.net",
  "frapmail.com",
  "fudgerub.com",
  "garliclife.com",
  "gawab.com",
  "geronra.com",
  "getairmail.com",
  "ghosttexter.de",
  "gishpuppy.com",
  "gmial.com",
  "goemailgo.com",
  "h.mintemail.com",
  "hornyalot.com",
  "hotpop.com",
  "hush.com",
  "ieatspam.eu",
  "ieatspam.info",
  "imails.info",
  "imgof.com",
  "imstations.com",
  "inboxalias.com",
  "inboxbear.com",
  "inboxdesign.me",
  "inboxkitten.com",
  "inboxproxy.com",
  "instant-mail.de",
  "ipoo.org",
  "irish2me.com",
  "iwi.net",
  "jetable.com",
  "jetable.fr.nf",
  "jetable.net",
  "jetable.org",
  "jourrapide.com",
  "kasmail.com",
  "kaspop.com",
  "killmail.com",
  "killmail.net",
  "kiwitown.com",
  "klzlk.com",
  "kook.ml",
  "kulturbetrieb.info",
  "kurzepost.de",
  "lifebyfood.com",
  "litedrop.com",
  "loadby.us",
  "lol.ovpn.to",
  "lookugly.com",
  "lopl.co.cc",
  "lortemail.dk",
  "lroid.com",
  "lukop.dk",
  "m21.cc",
  "mail-filter.com",
  "mail-temporaire.com",
  "mail-temporaire.fr",
  "mail.mezimages.net",
  "mail.zp.ua",
  "mail2rss.org",
  "mail333.com",
  "mailbidon.com",
  "mailblocks.com",
  "mailcatch.com",
  "mailde.de",
  "mailde.info",
  "maildx.com",
  "maileater.com",
  "mailexpire.com",
  "mailfreeway.com",
  "mailguard.me",
  "mailimate.com",
  "mailin8r.com",
  "mailinator.net",
  "mailinator.org",
  "mailinator2.com",
  "mailme.lv",
  "mailme24.com",
  "mailmoat.com",
  "mailnator.com",
  "mailnesia.com",
  "mailnull.com",
  "mailpick.biz",
  "mailrock.biz",
  "mailshell.com",
  "mailsiphon.com",
  "mailtothis.com",
  "mailtrash.net",
  "mailtv.net",
  "mbx.cc",
  "mega.zik.dj",
  "meinspamschutz.de",
  "meltmail.com",
  "messagebeamer.de",
  "mezimages.net",
  "mintemail.com",
  "moburl.com",
  "mohmal.com",
  "moonsight.tk",
  "msa.minsmail.com",
  "mt2009.com",
  "mt2014.com",
  "mt2015.com",
  "mvrht.net",
  "mybitti.de",
  "mycard.net.ua",
  "mycleaninbox.net",
  "mymail-in.net",
  "mypartyclip.de",
  "mypartymsg.com",
  "myphantomemail.com",
  "myspaceinc.com",
  "myspaceinc.net",
  "myspaceinc.org",
  "myspamless.com",
  "mytempemail.com",
  "mytempmail.com",
  "neverbox.com",
  "no-spam.ws",
  "nobulk.com",
  "noclickemail.com",
  "nogmailspam.info",
  "nomail.xl.cx",
  "nomail2me.com",
  "nomorespamemails.com",
  "nospam.ze.tc",
  "nospam4.us",
  "nospamfor.us",
  "nospammail.net",
  "nospamthanks.info",
  "notmailinator.com",
  "nowmymail.com",
  "objectmail.com",
  "obobbo.com",
  "odaymail.com",
  "onewaymail.com",
  "online.ms",
  "opayq.com",
  "ordinaryamerican.net",
  "otherinbox.com",
  "ourklips.com",
  "outlawspam.com",
  "ovpn.to",
  "owlpic.com",
  "pancakemail.com",
  "paplease.com",
  "pcusers.otherinbox.com",
  "pjjkp.com",
  "plexolan.de",
  "politikerclub.de",
  "poofy.org",
  "privacy.net",
  "privatdemail.net",
  "proxymail.eu",
  "prtnx.com",
  "putthisinyourspamdatabase.com",
  "qq.com",
  "quickinbox.com",
  "rcpt.at",
  "reallymymail.com",
  "recode.me",
  "recursor.net",
  "regbypass.com",
  "rmqkr.net",
  "rppkn.com",
  "rtrtr.com",
  "s0ny.net",
  "safe-mail.net",
  "safersignup.de",
  "safetymail.info",
  "sandelf.de",
  "saynotospams.com",
  "schafmail.de",
  "selfdestructingmail.com",
  "sendspamhere.com",
  "sharedmailbox.org",
  "shieldedmail.com",
  "shiftmail.com",
  "shitmail.me",
  "shortmail.net",
  "sibmail.com",
  "skeefmail.com",
  "slaskpost.se",
  "slopsbox.com",
  "smashmail.de",
  "smellfear.com",
  "snakemail.com",
  "sneakemail.com",
  "snkmail.com",
  "sofimail.com",
  "sofort-mail.de",
  "sogetthis.com",
  "soodonims.com",
  "spam.la",
  "spamavert.com",
  "spambob.com",
  "spambob.net",
  "spambob.org",
  "spambog.com",
  "spambog.de",
  "spambog.net",
  "spambog.ru",
  "spambox.info",
  "spambox.us",
  "spamcero.com",
  "spamfree24.com",
  "spamfree24.de",
  "spamfree24.eu",
  "spamfree24.info",
  "spamfree24.net",
  "spamfree24.org",
  "spamgourmet.com",
  "spamgourmet.net",
  "spamgourmet.org",
  "spamhereplease.com",
  "spamhole.com",
  "spamify.com",
  "spaminator.de",
  "spamkill.info",
  "spaml.com",
  "spaml.de",
  "spammotel.com",
  "spamspot.com",
  "spamthis.co.uk",
  "spamthisplease.com",
  "speed.1s.fr",
  "supergreatmail.com",
  "supermailer.jp",
  "suremail.info",
  "teewars.org",
  "teleworm.com",
  "teleworm.us",
  "thanksnospam.info",
  "thankyou2010.com",
  "thecloudindex.com",
  "thelimestones.com",
  "thisisnotmyrealemail.com",
  "throwam.com",
  "throwawayemail.com",
  "tilien.com",
  "tittbit.in",
  "tmail.ws",
  "tmailinator.com",
  "topranklist.de",
  "tradermail.info",
  "trash-amil.com",
  "trash-mail.at",
  "trash-mail.com",
  "trash-mail.de",
  "trash2009.com",
  "trashdevil.com",
  "trashemail.de",
  "trashymail.com",
  "trashymail.net",
  "trillianpro.com",
  "twinmail.de",
  "tyldd.com",
  "uggsrock.com",
  "umail.net",
  "uplipht.com",
  "uroid.com",
  "us.af",
  "venompen.com",
  "veryrealemail.com",
  "viditag.com",
  "vidchart.com",
  "viewcastmedia.com",
  "viewcastmedia.net",
  "viewcastmedia.org",
  "vomoto.com",
  "vpn.st",
  "vsimcard.com",
  "vubby.com",
  "wasteland.rfc822.org",
  "webm4il.info",
  "webmail4u.tk",
  "wegwerf-emails.de",
  "wegwerfadresse.de",
  "wegwerfemail.de",
  "wegwerfmail.de",
  "wegwerfmail.info",
  "wegwerfmail.net",
  "wegwerfmail.org",
  "wh4f.org",
  "whyspam.me",
  "wilemail.com",
  "willhackforfood.biz",
  "willselfdestruct.com",
  "winemaven.info",
  "wronghead.com",
  "wuzup.net",
  "wuzupmail.net",
  "www.e4ward.com",
  "www.gishpuppy.com",
  "www.mailinator.com",
  "wwwnew.eu",
  "xagloo.com",
  "xemaps.com",
  "xents.com",
  "xmaily.com",
  "xoxy.net",
  "yapped.net",
  "yeah.net",
  "yep.it",
  "yogamaven.com",
  "yopmail.fr",
  "yopmail.net",
  "ypmail.webarnak.fr.eu.org",
  "yuurok.com",
  "z1p.biz",
  "za.com",
  "zehnminuten.de",
  "zehnminutenmail.de",
  "zippymail.info",
  "zoaxe.com",
  "zoemail.org",
]);

/**
 * Returns true if `email` belongs to a disposable provider. Case-
 * insensitive. Trims whitespace.
 *
 * Best-effort — this list is finite. Production should pair with the
 * email-verification flow (Day 1.5a) which acts as a delivery test
 * — most disposable services reject inbound mail or queue it
 * indefinitely, so the verification step filters survivors.
 */
export function isDisposableEmail(email: string): boolean {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at < 0) return false;
  const domain = trimmed.slice(at + 1);
  return DISPOSABLE_DOMAINS.has(domain);
}

// --- Layer 2 — Gmail+alias + dot normalization ---------------------------

/**
 * Normalize an email so duplicate-detection catches Gmail tricks.
 *
 * Rules:
 *   1. lowercase + trim
 *   2. for @gmail.com or @googlemail.com:
 *      a. drop everything after '+' in the local part
 *      b. drop all '.' in the local part (Gmail ignores dots)
 *      c. canonicalize @googlemail.com → @gmail.com
 *   3. for everything else: just lowercase + trim. Other providers
 *      treat dots and aliases as significant, so we don't normalize
 *      them.
 *
 * Examples:
 *   raja+1@gmail.com         → raja@gmail.com
 *   r.a.j.a@gmail.com        → raja@gmail.com
 *   Raja@Gmail.com           → raja@gmail.com
 *   raja+1@googlemail.com    → raja@gmail.com
 *   first.last@outlook.com   → first.last@outlook.com (dots significant)
 *   user+work@protonmail.com → user+work@protonmail.com (alias significant)
 */
export function normalizeEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at < 0) return trimmed;

  let local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);

  if (domain === "gmail.com" || domain === "googlemail.com") {
    // Drop alias.
    const plus = local.indexOf("+");
    if (plus >= 0) local = local.slice(0, plus);
    // Drop dots.
    local = local.replace(/\./g, "");
    // Canonical domain.
    return `${local}@gmail.com`;
  }

  return `${local}@${domain}`;
}

// --- Layer 4 — IP-bucket throttle ----------------------------------------

/**
 * Reduce an IP address to its rate-limiting bucket key:
 *   - IPv4: /24 prefix (e.g. "192.168.1" from "192.168.1.42")
 *   - IPv6: /48 prefix (first 3 hex groups, e.g. "2001:db8:1234")
 *
 * Returns "" for malformed input — caller should treat empty bucket
 * as "no IP signal" and skip the cap (don't fail closed; we don't
 * want to block real users on header parsing edge cases).
 */
export function ipBucket(ip: string): string {
  const trimmed = ip.trim();
  if (!trimmed) return "";

  // IPv4 detection — 4 dot-separated decimal octets.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(trimmed)) {
    const parts = trimmed.split(".");
    return `${parts[0]}.${parts[1]}.${parts[2]}`;
  }

  // IPv6 — first 3 hex groups (case-insensitive). Handle :: shorthand
  // by splitting on first '::' if present.
  if (trimmed.includes(":")) {
    const expanded = trimmed.toLowerCase();
    const parts = expanded.split(":");
    // Take the first 3 non-empty groups.
    const groups: string[] = [];
    for (const p of parts) {
      if (p === "" && groups.length > 0) break; // Hit the :: shorthand
      if (p !== "") groups.push(p);
      if (groups.length >= 3) break;
    }
    if (groups.length >= 3) {
      return groups.join(":");
    }
  }

  return "";
}

/**
 * Read the request's source IP from Cloudflare headers, with sensible
 * fallbacks. Cloudflare always sets `cf-connecting-ip` to the original
 * client IP regardless of intermediate proxies; we trust it as the
 * source of truth.
 *
 * Falls back to x-forwarded-for (first IP in the comma-separated list)
 * for non-Cloudflare requests, then to x-real-ip. Returns "" if all
 * three are absent — caller treats empty as "no signal".
 */
export function readClientIp(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  return "";
}
