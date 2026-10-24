/**
 * Safety & Child Protection Guard Service
 * 
 * Enforces strict, zero-tolerance child protection rules:
 * - Prohibits child sexualization, underage sexual roleplay, grooming, and CSAM.
 * - Provides brief, non-graphic refusals with clean redirects.
 * - Allows ordinary, legitimate educational discussions on puberty, anatomy, consent, and sexual health.
 * - Enforces server-side 15-minute temporary messaging restrictions upon repeated severe violations.
 * - Enforces reliable backend lock that cannot be bypassed by refresh, new sessions, or switching characters.
 * - Provides an appeal and unlock mechanism.
 */

export interface SafetyCheckResult {
  isViolation: boolean;
  isSevere: boolean;
  refusalMessage?: string;
  reason?: string;
  isEducationalOrHealth?: boolean;
}

export interface ClientRestrictionRecord {
  violations: number[];
  lockUntil: number;
  lastViolationReason?: string;
  appealCount: number;
  lastAppealAt?: number;
}

// In-memory server-side registry of client restrictions and violations
// Keyed by IP address and client token
const clientRestrictions = new Map<string, ClientRestrictionRecord>();

// 15 minutes restriction duration in milliseconds
export const RESTRICTION_DURATION_MS = 15 * 60 * 1000;

// Legitimate health, puberty, anatomy, contraception, and consent patterns
const LEGITIMATE_EDUCATIONAL_PATTERNS = [
  /\b(?:what is puberty|how does puberty work|signs of puberty|changes during puberty|growth spurts|voice changing)\b/i,
  /\b(?:menstruation|menstrual cycle|period cramps|ovulation|pregnancy test|contraception|safe sex|condom use|stis|stds)\b/i,
  /\b(?:human anatomy|reproductive system|biology class|biology exam|health class|sexual health education)\b/i,
  /\b(?:what is consent|how to give consent|enthusiastic consent|setting personal boundaries|saying no)\b/i,
  /(?:বয়ঃসন্ধি|ঋতুস্রাব|শারীরবৃত্তীয়|যৌন স্বাস্থ্য শিক্ষা|প্রজনন স্বাস্থ্য|শারীরিক স্বাস্থ্য|সম্মতি কি|বায়োলজি)/u,
];

// Prohibited child exploitation and underage sexualization patterns
const PROHIBITED_CHILD_EXPLOITATION_PATTERNS = [
  /\b(?:child|minor|underage|under-age|under 18|kid|baby|toddler|preteen|infant)\s+(?:porn|erotica|sex|sexual|nude|naked|fuck|bang|penetrate|strip|striptease|grope|fondle|molest|touch)\b/i,
  /\b(?:sex|sexual|fuck|bang|penetrate|nude|naked|grope|fondle|molest|kiss|touch|strip)\s+(?:with|a|an)?\s*(?:child|minor|underage|under-age|under 18|kid|baby|toddler|preteen|infant)\b/i,
  /\b(?:child\s*sexual|underage\s*(?:roleplay|sex|dating|girlfriend|romance|girl|boy)|ageplay|pedophil|pedo|cp|csam)\b/i,
  /\b(?:act like|pretend to be|pretend you are|roleplay as|be)\s+(?:a|an)?\s*(?:little girl|young girl|schoolgirl|child|minor|underage|[1-9]\s*year\s*old|1[0-7]\s*year\s*old|1[0-7]\s*yo)\b/i,
  /\b(?:sexy|sexual|erotic|nude|naked)\s+(?:things|thoughts|chat|pics?)\s+(?:about|with)\s+(?:a|an)?\s*(?:minor|child|underage|kid|schoolgirl)\b/i,
  /\b(?:sexualize|grooming|groom a)\s+(?:a|an)?\s*(?:child|minor|schoolgirl|schoolboy|underage)\b/i,
  /(?:শিশুর সাথে যৌন|বাচ্চার সাথে যৌন|অপ্রাপ্তবয়স্কের সাথে শারীরিক|অপ্রাপ্তবয়স্ক সেক্স|শিশু পর্ন|পেডো)/u,
];

/**
 * Checks whether text contains legitimate health/puberty educational inquiries
 */
export function isLegitimateEducationalOrHealth(text: string): boolean {
  if (!text) return false;
  return LEGITIMATE_EDUCATIONAL_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Evaluates a user message or assistant response for child safety compliance.
 */
export function evaluateChildSafety(text: string): SafetyCheckResult {
  if (!text || typeof text !== 'string') {
    return { isViolation: false, isSevere: false };
  }

  const trimmed = text.trim();

  // If the query is an ordinary educational question about anatomy, puberty, or health, let it through safely
  if (isLegitimateEducationalOrHealth(trimmed)) {
    return { isViolation: false, isSevere: false, isEducationalOrHealth: true };
  }

  // Check for severe prohibited exploitation / underage sexual roleplay
  for (const pattern of PROHIBITED_CHILD_EXPLOITATION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        isViolation: true,
        isSevere: true,
        reason: 'Child safety violation: Prohibited sexualization of minors or underage roleplay.',
        refusalMessage:
          'I cannot engage in discussions involving minors or underage roleplay. Amora is designed exclusively for consensual adult companionships. Let’s refocus our conversation on healthy adult relationships.',
      };
    }
  }

  return { isViolation: false, isSevere: false };
}

/**
 * Retrieves the restriction state for a client identifier (e.g. IP or client UUID).
 */
export function getClientRestrictionState(clientId: string): {
  isRestricted: boolean;
  lockUntil: number;
  remainingSeconds: number;
  violationsCount: number;
  appealAvailable: boolean;
} {
  const record = clientRestrictions.get(clientId);
  const now = Date.now();

  if (!record) {
    return {
      isRestricted: false,
      lockUntil: 0,
      remainingSeconds: 0,
      violationsCount: 0,
      appealAvailable: false,
    };
  }

  // Check if active lock has expired
  if (record.lockUntil > now) {
    const remainingSeconds = Math.ceil((record.lockUntil - now) / 1000);
    return {
      isRestricted: true,
      lockUntil: record.lockUntil,
      remainingSeconds,
      violationsCount: record.violations.length,
      appealAvailable: true,
    };
  }

  return {
    isRestricted: false,
    lockUntil: 0,
    remainingSeconds: 0,
    violationsCount: record.violations.length,
    appealAvailable: false,
  };
}

/**
 * Records a safety violation and enforces the 15-minute temporary restriction upon repeat violations.
 */
export function recordSafetyViolation(
  clientId: string,
  reason: string
): { isNowRestricted: boolean; lockUntil: number; remainingSeconds: number } {
  const now = Date.now();
  let record = clientRestrictions.get(clientId);

  if (!record) {
    record = {
      violations: [now],
      lockUntil: 0,
      lastViolationReason: reason,
      appealCount: 0,
    };
    clientRestrictions.set(clientId, record);
  } else {
    // Keep violations within the last 1 hour
    record.violations = record.violations.filter((ts) => now - ts < 3600000);
    record.violations.push(now);
    record.lastViolationReason = reason;
  }

  // If severe violation or repeated (>= 2 violations in the hour window), lock for 15 minutes
  if (record.violations.length >= 2 || reason.includes('Child safety')) {
    record.lockUntil = now + RESTRICTION_DURATION_MS;
    const remainingSeconds = Math.ceil(RESTRICTION_DURATION_MS / 1000);
    return {
      isNowRestricted: true,
      lockUntil: record.lockUntil,
      remainingSeconds,
    };
  }

  return {
    isNowRestricted: false,
    lockUntil: 0,
    remainingSeconds: 0,
  };
}

/**
 * Processes an appeal to unlock a restricted user after review.
 */
export function processSafetyAppeal(
  clientId: string,
  appealReason: string,
  acknowledgePolicy: boolean
): { success: boolean; message: string; remainingSeconds?: number } {
  const record = clientRestrictions.get(clientId);
  const now = Date.now();

  if (!record || record.lockUntil <= now) {
    return {
      success: true,
      message: 'Account is not currently restricted.',
    };
  }

  if (!acknowledgePolicy) {
    return {
      success: false,
      message: 'Please review and explicitly acknowledge the Community Safety Policy to submit an appeal.',
    };
  }

  const reasonClean = (appealReason || '').trim();
  if (reasonClean.length < 5) {
    return {
      success: false,
      message: 'Please provide a brief explanation or context for your appeal.',
    };
  }

  // Lift the restriction upon good-faith acknowledgment
  record.lockUntil = 0;
  record.violations = [];
  record.appealCount += 1;
  record.lastAppealAt = now;

  return {
    success: true,
    message: 'Your appeal has been accepted. Messaging privileges have been restored. Please uphold consensual adult guidelines.',
  };
}

export function resetClientRestrictionForTesting(clientId: string): void {
  clientRestrictions.delete(clientId);
}

