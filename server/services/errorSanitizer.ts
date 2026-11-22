/**
 * @file errorSanitizer.ts
 * Sanitizes upstream provider, gateway, and internal errors before exposing messages to customers.
 * Preserves customer-own wallet balance checks and clear field validation errors while blocking
 * provider names, upstream balance issues, API keys, endpoints, and internal stack/SQL details.
 */

export const GENERIC_SERVICE_UNAVAILABLE_MSG =
  'This service is temporarily unavailable. Please try again later or contact support.';

const SAFE_CUSTOMER_WALLET_RE = /^insufficient\s+(?:wallet\s+)?balance\s*(?:\.\s*available:|\(available|\(required)/i;

const SENSITIVE_OR_UPSTREAM_PATTERNS: RegExp[] = [
  /https?:\/\/\S+/i,
  /\b(?:ulamadata|vtpass|2sureverify|twosureverify|veripine|randa|flutterwave|rave|paystack|monnify)\b/i,
  /\b(?:api[_\s-]?key|secret[_\s-]?key|public[_\s-]?key|client[_\s-]?secret|client[_\s-]?id|bearer|authorization|webhook[_\s-]?hash|encryption[_\s-]?key|smtp|phpmailer)\b/i,
  /\b(?:curl|guzzle|pdoexception|sqlstate|syntax error|stack trace|uncaught|econnrefused|etimedout|enotfound|fetch failed|network error|socket hang up|ssl|tls)\b/i,
  /\b(?:upstream|merchant\s+wallet|provider\s+(?:error|timeout|balance|wallet|rejected|failed|unavailable)|gateway\s+(?:credentials|error|timeout))\b/i,
  /\b(?:fund\s+(?:your\s+)?(?:merchant|api|provider|vendor)?\s*wallet|low\s+balance|credit\s+limit|exceeded\s+quota|not\s+configured|credentials?\s+missing)\b/i,
  /\bhttp\s*(?:4\d\d|5\d\d|status\s*\d+)\b/i,
  /(?:\.php|\.ts|\.js):\d+/i,
  /^\s*[\{\[]/,
];

/**
 * Checks whether an error message is safe to display verbatim to a customer
 * (e.g., customer's own insufficient wallet balance or specific NIN/BVN "No record found" hints).
 */
export function sanitizeCustomerError(
  rawMessage: unknown,
  fallback: string = GENERIC_SERVICE_UNAVAILABLE_MSG
): string {
  const msg = String(rawMessage ?? '').trim();
  if (!msg) return fallback;

  // Preserve the customer's own wallet shortfall message (never an upstream merchant wallet message)
  if (SAFE_CUSTOMER_WALLET_RE.test(msg) && !/provider|ulamadata|2sureverify|veripine|vtpass|merchant|upstream/i.test(msg)) {
    return msg;
  }

  // Upstream "insufficient balance / wallet / credit" must ALWAYS be masked from customers
  if (/(?:insufficient|low|empty|exhausted).*(?:balance|wallet|fund|credit|unit)/i.test(msg)) {
    return fallback;
  }

  for (const rx of SENSITIVE_OR_UPSTREAM_PATTERNS) {
    if (rx.test(msg)) {
      return fallback;
    }
  }

  // Clean benign user-facing messages (e.g. "No record found for the supplied NIN.", "Invalid meter number")
  if (msg.length > 220) {
    return fallback;
  }

  return msg;
}
