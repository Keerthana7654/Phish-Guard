/**
 * Turns the raw { checkName: points } breakdown object into something a
 * non-technical person can read: a plain-English name for each check, a
 * one-line explanation of what it looks for, and how many risk points it
 * added. Checks that added points are shown first and highlighted; checks
 * that found nothing are tucked into a collapsed "passed" list.
 */
const CHECKS = {
  protocol: ["Secure connection (HTTPS)", "Sites without HTTPS send everything unencrypted."],
  ipLiteral: ["Raw IP address", "Real websites use names, not numbers like 192.168.1.1."],
  punycode: ["Disguised characters", "Foreign look-alike letters can make a fake address look real."],
  typosquat: ["Look-alike of a known brand", "The name is very close to a real bank or company."],
  subdomainImpersonation: ["Brand name hidden in the address", "A real brand name is used as a decoy before the actual site name."],
  subdomainDepth: ["Unusually long address", "Many nested parts in the address is a common trick."],
  keywords: ["Pressure / login words", "Words like login, verify, or update often appear on fake pages."],
  brandKeywordCombo: ["Brand look-alike + login words", "A fake brand name together with login words is the classic fake-login pattern."],
  entropy: ["Random-looking name", "Machine-generated gibberish names are common on throwaway scam sites."],
  shortener: ["Shortened link", "Short links hide where they really lead."],
  legacyDomain: ["Old bank address", "This bank has moved to a newer official address."],
  indianBankName: ["Bank name, wrong address", "An Indian bank's name on a site that is not on its official .bank.in address."],
  googleSafeBrowsing: ["Google Safe Browsing", "Google's list of known dangerous sites."],
  virustotal: ["VirusTotal", "Dozens of security vendors' verdicts on this link."],
  abuseipdb: ["Server reputation", "Whether the hosting server has been reported for abuse."],
  whois: ["Website age", "Brand-new websites are riskier than established ones."],
};

function prettify(key) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

function Row({ name, desc, points }) {
  const hit = points > 0;
  const color = points >= 30 ? "var(--dangerous)" : points >= 15 ? "var(--suspicious)" : hit ? "var(--moderate)" : "var(--safe)";
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--card-border)" }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{name}</div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>{desc}</div>
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color, whiteSpace: "nowrap" }}>
        {hit ? `+${points} risk` : "✓ OK"}
      </span>
    </div>
  );
}

export default function ScoreBreakdown({ breakdown }) {
  if (!breakdown) return null;

  const rows = Object.entries(breakdown).map(([key, points]) => {
    const [name, desc] = CHECKS[key] || [prettify(key), ""];
    return { key, name, desc, points };
  });
  const triggered = rows.filter((r) => r.points > 0).sort((a, b) => b.points - a.points);
  const passed = rows.filter((r) => r.points === 0);

  return (
    <div style={{ marginTop: 14 }}>
      <h4 style={{ margin: "0 0 4px" }}>How this score was worked out</h4>
      {triggered.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--muted)" }}>No warning signs were found.</p>
      ) : (
        triggered.map((r) => <Row key={r.key} {...r} />)
      )}
      {passed.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--muted)" }}>
            {passed.length} check{passed.length === 1 ? "" : "s"} passed with no issues
          </summary>
          {passed.map((r) => <Row key={r.key} {...r} />)}
        </details>
      )}
    </div>
  );
}
