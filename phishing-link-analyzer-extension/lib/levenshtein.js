/**
 * levenshtein.js
 * Computes Levenshtein edit distance between two strings.
 * Used by detector.js for typosquat detection against known brand domains.
 */

function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const prevRow = new Array(b.length + 1);
  const currRow = new Array(b.length + 1);

  for (let j = 0; j <= b.length; j++) prevRow[j] = j;

  for (let i = 1; i <= a.length; i++) {
    currRow[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        currRow[j - 1] + 1,      // insertion
        prevRow[j] + 1,          // deletion
        prevRow[j - 1] + cost    // substitution
      );
    }
    for (let j = 0; j <= b.length; j++) prevRow[j] = currRow[j];
  }
  return prevRow[b.length];
}

/**
 * Similarity score normalized to 0-1 (1 = identical).
 */
function levenshteinSimilarity(a, b) {
  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - distance / maxLen;
}

// Exposed globally for content script (no ES module bundler in unpacked extension)
self.PhishGuardLevenshtein = { levenshteinDistance, levenshteinSimilarity };
