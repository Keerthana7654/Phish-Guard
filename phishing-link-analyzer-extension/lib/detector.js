/**
 * detector.js
 * Local heuristic phishing-detection engine for the extension.
 *
 * This runs entirely client-side so the extension is fully functional
 * standalone. When a backend (Spring Boot analysis service) is configured
 * in Options, background.js will prefer calling it and fall back to this
 * engine automatically if the backend is unreachable.
 *
 * Implements:
 *  - Typosquat detection (Levenshtein distance vs top brand domains)
 *  - Punycode / IDN homograph detection
 *  - Direct-IP URL detection
 *  - Suspicious keyword detection
 *  - Suspicious subdomain / brand-impersonation detection
 *  - Domain entropy (randomness) scoring
 *  - HTTPS / protocol check
 *  - Excessive subdomain depth check
 */

const KNOWN_BRAND_DOMAINS = [
  // Tech / social
  "google.com", "github.com", "amazon.com", "microsoft.com",
  "linkedin.com", "facebook.com", "instagram.com", "apple.com",
  "openai.com", "netflix.com", "twitter.com", "x.com", "whatsapp.com",
  "dropbox.com", "adobe.com", "yahoo.com",
  // Global banking / payments
  "paypal.com", "chase.com", "bankofamerica.com", "wellsfargo.com",
  "citibank.com", "hsbc.com", "americanexpress.com", "venmo.com", "stripe.com",
  // Indian banking / payments — public sector banks (all 12, per RBI's
  // 2025 mandate that regulated banks migrate to .bank.in; both legacy and
  // new domains listed where confirmed). See the "any *.bank.in" rule
  // further down for why this list doesn't need to be exhaustive going
  // forward — .bank.in itself is registrar-restricted to real banks.
  "sbi.co.in", "sbi.bank.in",                              // State Bank of India
  "pnbindia.in", "pnb.bank.in",                            // Punjab National Bank
  "bankofbaroda.in", "bankofbaroda.bank.in",               // Bank of Baroda
  "canarabank.com", "canarabank.bank.in",                  // Canara Bank
  "unionbankofindia.co.in", "unionbankofindia.bank.in", "unionbankonline.bank.in", // Union Bank of India
  "bankofindia.co.in",                                     // Bank of India
  "centralbank.bank.in",                                   // Central Bank of India
  "iob.bank.in",                                           // Indian Overseas Bank
  "bankofmaharashtra.bank.in", "mahaconnect.bank.in",      // Bank of Maharashtra
  "punjabandsind.bank.in",                                 // Punjab & Sind Bank
  // Indian banking — major private banks
  "icicibank.com", "icici.bank.in",                        // ICICI Bank
  "hdfcbank.com", "hdfc.bank.in",                          // HDFC Bank
  "axisbank.com", "axis.bank.in",                          // Axis Bank
  "kotak.com", "kotak.bank.in",                            // Kotak Mahindra Bank
  "indusind.com",                                          // IndusInd Bank
  "federal.bank.in",                                       // Federal Bank
  "idfcfirst.bank.in",                                     // IDFC FIRST Bank
  // Indian payments
  "paytm.com", "phonepe.com", "idbibank.in"
];

/**
 * Legacy domain -> current official .bank.in domain, for banks that have
 * completed the RBI-mandated migration. These legacy domains are still
 * owned and operated by the banks themselves (verified via WHOIS for
 * icicibank.com; Canara Bank's own 2026 SEBI filing still lists
 * canarabank.com as its official email domain) — so they are NOT flagged
 * dangerous. But they're no longer the bank's current official address and
 * the banks themselves are telling customers to stop using them, so they
 * score into "moderate" rather than being left fully clean. Only pairs
 * where both domains are independently confirmed are listed — not guessed.
 */
// Names of Indian banks (core label only). Since the RBI's .bank.in mandate,
// a bank's official site should live on <name>.bank.in — so one of these
// names on any other address deserves a closer look, even when it doesn't
// look like a typo of something we already know.
const INDIAN_BANK_NAMES = ["indianbank", "ucobank", "yesbank", "idfcfirstbank", "rblbank", "bandhanbank", "federalbank", "southindianbank", "karnatakabank", "jkbank", "dcbbank", "aubank", "equitasbank", "statebankofindia", "centralbankofindia", "indianoverseasbank", "bankofmaharashtra", "punjabandsindbank", "unionbank", "canarabank", "bankofindia", "bankofbaroda", "punjabnationalbank", "hdfcbank", "icicibank", "axisbank", "kotakbank", "kotakmahindrabank", "indusindbank", "idbibank", "sbi", "pnb", "iob", "uco", "hdfc", "icici", "kotak"];

const LEGACY_TO_BANKIN = {
  "sbi.co.in": "sbi.bank.in",
  "bankofbaroda.in": "bankofbaroda.bank.in",
  "canarabank.com": "canarabank.bank.in",
  "unionbankofindia.co.in": "unionbankofindia.bank.in",
  "icicibank.com": "icici.bank.in",
  "hdfcbank.com": "hdfc.bank.in",
  "axisbank.com": "axis.bank.in",
  "kotak.com": "kotak.bank.in",
  "pnbindia.in": "pnb.bank.in",
};

const SUSPICIOUS_KEYWORDS = [
  "login", "secure", "verify", "update", "bank", "gift", "bonus",
  "reward", "claim", "account", "payment", "invoice", "signin",
  "wallet", "confirm", "suspend", "unlock", "billing", "recover",
  "password", "authenticate", "security-alert",
  // Banking/payment-specific
  "netbanking", "upi", "otp", "kyc", "creditcard", "debitcard", "ifsc", "atm"
];

function getHostname(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch (e) {
    return null;
  }
}

function isIpLiteral(hostname) {
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6 = /^\[?[0-9a-fA-F:]+\]?$/;
  if (ipv4.test(hostname)) return true;
  if (hostname.includes(":") && ipv6.test(hostname)) return true;
  return false;
}

function isPunycode(hostname) {
  return hostname.split(".").some((label) => label.startsWith("xn--"));
}

function shannonEntropy(str) {
  if (!str.length) return 0;
  const freq = {};
  for (const ch of str) freq[ch] = (freq[ch] || 0) + 1;
  let entropy = 0;
  for (const ch in freq) {
    const p = freq[ch] / str.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

// A small curated set of common compound/multi-part public suffixes.
// This is NOT a full public-suffix-list implementation (that's a
// several-thousand-entry list Mozilla maintains) — it's deliberately
// scoped to the country-code TLD patterns most likely to matter here
// (India especially, given many Indian banks use .co.in/.bank.in rather
// than .com), so domains like "sbi.co.in" or "canarabank.bank.in" are
// correctly recognized as the registrant's real domain instead of being
// misread as a suspicious subdomain of "co.in"/"bank.in".
const MULTI_PART_SUFFIXES = new Set([
  "co.in", "net.in", "org.in", "gov.in", "ac.in", "res.in", "bank.in", "nic.in", "gen.in",
  "co.uk", "org.uk", "gov.uk", "ac.uk", "net.uk", "sch.uk",
  "com.au", "net.au", "org.au", "gov.au", "edu.au",
  "co.nz", "org.nz", "govt.nz",
  "co.jp", "or.jp", "ne.jp",
  "co.za", "org.za", "gov.za",
  "com.br", "net.br", "org.br", "gov.br",
  "com.sg", "co.id", "com.my"
]);

/** Number of trailing labels that make up the public suffix (1 normally, 2 for compound TLDs like co.in). */
function suffixLabelCount(hostname) {
  const parts = hostname.split(".");
  if (parts.length >= 2 && MULTI_PART_SUFFIXES.has(parts.slice(-2).join("."))) return 2;
  return 1;
}

function registrableDomain(hostname) {
  const parts = hostname.split(".");
  const suffixLen = suffixLabelCount(hostname);
  if (parts.length <= suffixLen + 1) return hostname;
  return parts.slice(-(suffixLen + 1)).join(".");
}

/**
 * Recognizes ANY domain ending in ".bank.in" as an inherently trustworthy
 * banking domain — not via a curated list, but architecturally. Since
 * October 2025, India's RBI has mandated that only IDRBT/NIXI-vetted,
 * RBI-regulated banks may register under this TLD at all (see
 * https://www.rbi.org.in — the ".bank.in" domain initiative); an
 * unregulated party or phishing operation cannot obtain one. This means
 * the curated KNOWN_BRAND_DOMAINS list never needs to keep up with every
 * bank's own dedicated .bank.in registration (many banks register several,
 * e.g. Bank of Maharashtra's "mahaconnect.bank.in" for net banking) —
 * this single rule covers all of them, present and future, without manual
 * upkeep. It does NOT cover banks' legacy .com/.co.in domains from before
 * the migration — those still rely on the curated list below.
 */
function isBankInDomain(hostname) {
  const parts = hostname.split(".");
  return parts.length >= 3 && parts.slice(-2).join(".") === "bank.in";
}

/**
 * Splits a domain label like "paypai-secure-login" into ["paypai", "secure",
 * "login"] so typosquat matching compares against each meaningful word
 * instead of the whole hyphenated string (which almost never resembles a
 * short brand name once "-secure-login" etc. is appended, letting the real
 * typosquat hide in plain sight). Filters out very short fragments (< 3
 * chars) to avoid noisy matches against single letters/numbers.
 */
function tokenize(label) {
  const tokens = label.split(/[^a-z0-9]+/i).filter((t) => t.length >= 3);
  if (!tokens.includes(label)) tokens.push(label); // also try the whole label
  return tokens;
}

/**
 * Core analysis entry point.
 * Returns { score, level, reasons, breakdown }
 */
function analyzeUrl(rawUrl) {
  const reasons = [];
  const breakdown = {};
  let score = 0;

  let urlObj;
  try {
    urlObj = new URL(rawUrl);
  } catch (e) {
    return {
      score: 0,
      level: "unknown",
      reasons: ["URL could not be parsed."],
      breakdown: {},
    };
  }

  const hostname = urlObj.hostname.toLowerCase();
  const fullPath = (urlObj.pathname + urlObj.search).toLowerCase();
  const domain = registrableDomain(hostname);
  const labels = hostname.split(".");

  // Computed once, used by several checks below: is this domain already
  // independently confirmed legitimate (architecturally via .bank.in, or
  // explicitly via the curated brand list)? A bank's own name almost
  // always contains words like "bank"/"pay" that would otherwise trip the
  // suspicious-keyword check below — that's not a meaningful signal once
  // the domain itself is already verified safe.
  const alreadyKnownLegit = isBankInDomain(hostname) || KNOWN_BRAND_DOMAINS.includes(domain);

  // A. Protocol / HTTPS check
  if (urlObj.protocol !== "https:") {
    score += 12;
    breakdown.protocol = 12;
    reasons.push("Site does not use HTTPS.");
  } else {
    breakdown.protocol = 0;
  }

  // B. Direct IP URL
  if (isIpLiteral(hostname)) {
    score += 25;
    breakdown.ipLiteral = 25;
    reasons.push("URL uses a raw IP address instead of a domain name.");
  } else {
    breakdown.ipLiteral = 0;
  }

  // C. Punycode / homograph domains
  if (isPunycode(hostname)) {
    score += 20;
    breakdown.punycode = 20;
    reasons.push("Domain uses Punycode encoding (possible homograph attack).");
  } else {
    breakdown.punycode = 0;
  }

  // D. Typosquat / brand-embedding detection, checked against each word-token
  // in the label (not the whole hyphenated label — that's what missed
  // "paypaI-secure-login.tk" originally). Two complementary signals:
  //  1. Levenshtein similarity — catches near-miss typos of similar length
  //     ("paypaI" vs "paypal").
  //  2. Prefix/containment — catches a real brand name or a distinctive
  //     prefix of one embedded whole inside a longer fake label
  //     ("icici" in "icici-bank-kyc-update", "hdfcbank" in
  //     "hdfcbank-netbanking-verify"), which Levenshtein alone misses
  //     whenever the token and brand name differ a lot in length.
  let typosquatScore = 0;
  let closestBrand = null;
  let closestSimilarity = 0;
  const candidateLabel = domain.split(".")[0];
  const candidateTokens = tokenize(candidateLabel);

  if (alreadyKnownLegit) {
    // Either an architecturally-verified *.bank.in domain (see
    // isBankInDomain's doc comment), or already an exact match in the
    // curated list. Either way it's independently confirmed legitimate —
    // skip typosquat matching entirely. This matters even for the
    // already-whitelisted case: without it, a bank's own legacy domain
    // (e.g. "bankofbaroda.in") can accidentally trip the truncated-TLD
    // check below against that SAME bank's separate .bank.in entry
    // ("bankofbaroda.bank.in"), since it happens to look like a truncated
    // version of it.
  } else {

  // Special case, checked first: a domain that matches a known compound-TLD
  // brand's core name exactly but keeps only ONE piece of its real
  // multi-part TLD — e.g. "sbi.co" (drops ".in" from "sbi.co.in") or
  // "canarabank.in" (drops "bank" from "canarabank.bank.in"). Either
  // direction is a deliberate, well-known phishing technique — keeping
  // just one recognizable fragment of the real compound TLD reads as
  // nearly identical at a glance — so it's scored high-confidence on its
  // own rather than through the generic similarity formula below.
  let truncatedTldMatch = false;
  for (const brand of KNOWN_BRAND_DOMAINS) {
    const brandParts = brand.split(".");
    if (brandParts.length < 3) continue; // only applies to compound-TLD brands like sbi.co.in
    const brandCore = brandParts[0];
    const brandSuffixParts = brandParts.slice(1); // e.g. ["co","in"] or ["bank","in"]
    const domainParts = domain.split(".");
    if (domainParts.length === 2 && domainParts[0] === brandCore && domain !== brand) {
      const domainSuffix = domainParts[1];
      if (brandSuffixParts.includes(domainSuffix)) {
        truncatedTldMatch = true;
        typosquatScore = 80;
        score += typosquatScore;
        reasons.push(
          `Domain matches "${brand}"'s name but is missing part of its real top-level domain — a truncated-TLD typosquat.`
        );
        break;
      }
    }
  }

  if (!truncatedTldMatch) {
    for (const brand of KNOWN_BRAND_DOMAINS) {
      if (domain === brand) {
        closestBrand = null; // exact legitimate match, no typosquat
        closestSimilarity = 0;
        break;
      }
      const brandName = brand.split(".")[0];
      for (const token of candidateTokens) {
        let sim = 0;

        if (Math.abs(token.length - brandName.length) <= 3) {
          sim = Math.max(sim, self.PhishGuardLevenshtein.levenshteinSimilarity(token, brandName));
        }

        // Two directions, two different false-positive risks:
        //  - token.startsWith(brandName): a short, curated real brand name
        //    (e.g. "sbi") is embedded at the start of a longer, likely-fake
        //    token (e.g. "sbi0nline"). Low false-positive risk since
        //    brandName is always a real, curated identifier.
        //  - brandName.startsWith(token): the domain's token is a
        //    fragment/truncation of a long brand name (e.g. "icici" of
        //    "icicibank"). HIGH false-positive risk on its own — any short,
        //    common English word that happens to prefix some brand's full
        //    name would match (e.g. "bank" prefixes "bankofamerica", but
        //    "bank" is generic and appears in countless legitimate bank
        //    domains). Require the token to cover a real majority of the
        //    brand name, not just any coincidental prefix.
        const tokenEmbedsBrand = brandName.length >= 3 && token.length >= 4 && token.startsWith(brandName);
        const tokenIsBrandFragment =
          !tokenEmbedsBrand &&
          brandName.length >= 3 &&
          token.length >= 4 &&
          brandName.startsWith(token) &&
          token.length / brandName.length >= 0.5;

        if (tokenEmbedsBrand || tokenIsBrandFragment) {
          sim = Math.max(sim, 0.85); // fixed high-confidence score for a real brand fragment embedded
        }

        if (sim > closestSimilarity) {
          closestSimilarity = sim;
          closestBrand = brand;
        }
      }
    }
    if (closestBrand && closestSimilarity >= 0.72) {
      typosquatScore = Math.round(35 * closestSimilarity);
      score += typosquatScore;
      const label = closestSimilarity >= 0.999 ? "contains the exact brand name" : "closely resembles";
      reasons.push(
        `Domain ${label} "${closestBrand}" (similarity ${(closestSimilarity * 100).toFixed(0)}%) in an unrelated domain — possible impersonation.`
      );
    }
  }
  } // end else (!alreadyKnownLegit)
  breakdown.typosquat = typosquatScore;

  // E. Suspicious subdomain / brand impersonation, e.g. google.com.fake-domain.xyz
  let subdomainScore = 0;
  if (!alreadyKnownLegit) {
    const suffixLen = suffixLabelCount(hostname);
    if (labels.length > suffixLen + 1) {
      const subLabels = labels.slice(0, -(suffixLen + 1)).join(".");
      for (const brand of KNOWN_BRAND_DOMAINS) {
        const brandName = brand.split(".")[0];
        if (subLabels.includes(brandName)) {
          subdomainScore = 30;
          reasons.push(
            `"${brandName}" appears in a subdomain of a different domain (${domain}) — classic brand-impersonation pattern.`
          );
          break;
        }
      }
    }
  }
  score += subdomainScore;
  breakdown.subdomainImpersonation = subdomainScore;

  // F. Excessive subdomain depth
  let depthScore = 0;
  if (labels.length >= 5) {
    depthScore = 10;
    reasons.push("Unusually deep subdomain chain.");
  }
  score += depthScore;
  breakdown.subdomainDepth = depthScore;

  // G. Suspicious keywords in domain or path — skipped entirely for
  // already-verified-legitimate domains (see alreadyKnownLegit above). A
  // bank's own name/pages naturally contain words like "bank" (it's
  // literally in "icicibank"), "login", "netbanking" — real signal only on
  // a domain we haven't already independently confirmed as safe.
  const matchedKeywords = alreadyKnownLegit
    ? []
    : SUSPICIOUS_KEYWORDS.filter((kw) => hostname.includes(kw) || fullPath.includes(kw));
  let keywordScore = 0;
  if (matchedKeywords.length > 0) {
    keywordScore = Math.min(20, matchedKeywords.length * 6);
    score += keywordScore;
    reasons.push(
      `Contains suspicious keyword(s): ${matchedKeywords.slice(0, 4).join(", ")}.`
    );
  }
  breakdown.keywords = keywordScore;

  // G2. Combo bonus: a near-miss brand name PLUS a login/security keyword
  // together (e.g. "paypaI-secure-login.tk") is a much stronger phishing
  // signal than either alone — this is the single most common real-world
  // fake banking/payment page pattern, so it's weighted accordingly.
  let comboScore = 0;
  if (typosquatScore > 0 && keywordScore > 0) {
    comboScore = 20;
    score += comboScore;
    reasons.push("Combines a brand-name look-alike with login/security keywords — a classic fake login page pattern.");
  }
  breakdown.brandKeywordCombo = comboScore;

  // H. Entropy (randomness) of the registrable domain's main label
  const mainLabel = domain.split(".")[0];
  const entropy = shannonEntropy(mainLabel);
  let entropyScore = 0;
  if (mainLabel.length >= 8 && entropy >= 3.6) {
    entropyScore = 12;
    reasons.push("Domain name has high randomness (possible auto-generated phishing domain).");
  }
  score += entropyScore;
  breakdown.entropy = entropyScore;

  // I. URL shortener heuristic
  const SHORTENERS = ["bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly"];
  let shortenerScore = 0;
  if (SHORTENERS.includes(domain)) {
    shortenerScore = 10;
    reasons.push("URL shortener detected — final destination is hidden.");
  }
  score += shortenerScore;
  breakdown.shortener = shortenerScore;

  // J. Legacy bank domain — not dangerous, but visibly distinguished from
  // the bank's actual current .bank.in domain (see LEGACY_TO_BANKIN).
  let legacyDomainScore = 0;
  if (LEGACY_TO_BANKIN[domain]) {
    legacyDomainScore = 30;
    score += legacyDomainScore;
    reasons.push(
      `This is a retired/legacy domain — the bank's current official address is ${LEGACY_TO_BANKIN[domain]}. Still bank-owned, not flagged as dangerous, but prefer the current domain.`
    );
  }
  breakdown.legacyDomain = legacyDomainScore;

  // K. An Indian bank's name on an address that isn't .bank.in and isn't a
  // domain we've independently verified. Skipped when the typosquat check
  // already fired (avoids double-counting the same finding). Moderate, not
  // dangerous: we can't tell from the name alone whether it's a fake or an
  // old bank-owned address, only that it isn't where the bank's official
  // site is supposed to be.
  let indianBankNameScore = 0;
  if (!alreadyKnownLegit && typosquatScore === 0 && INDIAN_BANK_NAMES.includes(domain.split(".")[0])) {
    indianBankNameScore = 30;
    score += indianBankNameScore;
    reasons.push(
      "Uses an Indian bank's name but is not on a .bank.in address — RBI requires banks' official sites to be on .bank.in. Verify directly with the bank before entering any details."
    );
  }
  breakdown.indianBankName = indianBankNameScore;

  score = Math.max(0, Math.min(100, Math.round(score)));

  let level;
  if (score <= 20) level = "safe";
  else if (score <= 50) level = "moderate";
  else if (score <= 75) level = "suspicious";
  else level = "dangerous";

  if (reasons.length === 0) {
    reasons.push("No known phishing indicators detected.");
  }

  return { score, level, reasons, breakdown, domain, hostname };
}

self.PhishGuardDetector = { analyzeUrl, KNOWN_BRAND_DOMAINS, SUSPICIOUS_KEYWORDS, registrableDomain };
