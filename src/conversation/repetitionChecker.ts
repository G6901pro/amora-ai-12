export interface RepetitionCheckResult {
  isRepetitive: boolean;
  score: number;
  reason?: string;
  targetedAntiRepetitionGuidance?: string;
  cleanedText?: string;
}

const STOP_WORDS = new Set([
  'is', 'are', 'am', 'was', 'were', 'the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'it', 'its', 'this', 'that',
]);

export function tokenize(text: string, filterStopwords: boolean = true): string[] {
  if (!text) return [];
  const words = text
    .toLowerCase()
    .replace(/[*_#~`!?,:;()[\]{}|/\\<>"'।]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);

  if (!filterStopwords) return words;
  const filtered = words.filter((w) => !STOP_WORDS.has(w));
  return filtered.length > 0 ? filtered : words;
}

export function calculateTokenSimilarity(str1: string, str2: string): number {
  if (!str1 && !str2) return 1.0;
  if (!str1 || !str2) return 0.0;
  const t1 = str1.trim().toLowerCase();
  const t2 = str2.trim().toLowerCase();
  if (t1 === t2) return 1.0;

  const tokens1 = tokenize(str1, true);
  const tokens2 = tokenize(str2, true);

  if (tokens1.length === 0 && tokens2.length === 0) return 1.0;
  if (tokens1.length === 0 || tokens2.length === 0) return 0.0;

  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);

  let intersection = 0;
  for (const t of set1) {
    if (set2.has(t)) {
      intersection++;
    }
  }

  const union = new Set([...tokens1, ...tokens2]).size;
  return union === 0 ? 0.0 : intersection / union;
}

export function checkResponseRepetition(
  candidate: string,
  recentAssistantReplies: string[] = [],
  rejectedReplies: string[] = []
): RepetitionCheckResult {
  const trimmed = (candidate || '').trim();
  if (!trimmed) {
    return {
      isRepetitive: false,
      score: 0,
      cleanedText: '',
    };
  }

  // 1. Check against rejected replies first
  if (Array.isArray(rejectedReplies) && rejectedReplies.length > 0) {
    for (const rejected of rejectedReplies) {
      if (!rejected) continue;
      const sim = calculateTokenSimilarity(trimmed, rejected);
      if (sim >= 0.65 || trimmed === rejected.trim()) {
        return {
          isRepetitive: true,
          score: Math.max(0.95, sim),
          reason: `Candidate matches a previously rejected assistant reply: "${rejected.slice(0, 40)}..."`,
          targetedAntiRepetitionGuidance:
            'CRITICAL: User previously expressed negative feedback or rejected this exact phrasing. Do not reuse it.',
          cleanedText: trimmed,
        };
      }
    }
  }

  // 2. Check against recent assistant replies
  let maxScore = 0;
  let matchingReply = '';

  for (const past of recentAssistantReplies) {
    if (!past) continue;
    if (trimmed === past.trim()) {
      return {
        isRepetitive: true,
        score: 1.0,
        reason: 'Exact duplicate of recent assistant message',
        targetedAntiRepetitionGuidance:
          'CRITICAL: You just sent this exact reply. Generate a fresh, different thought or question.',
        cleanedText: trimmed,
      };
    }

    const sim = calculateTokenSimilarity(trimmed, past);
    if (sim > maxScore) {
      maxScore = sim;
      matchingReply = past;
    }
  }

  // Check common repetitive openings or cliché questions
  const opening1 = trimmed.slice(0, 35).toLowerCase();
  for (const past of recentAssistantReplies) {
    const pastOpening = past.slice(0, 35).toLowerCase();
    if (opening1 && pastOpening && opening1 === pastOpening && trimmed.length > 20) {
      maxScore = Math.max(maxScore, 0.75);
      matchingReply = past;
    }
  }

  if (maxScore > 0.6) {
    return {
      isRepetitive: true,
      score: maxScore,
      reason: `Repetition similarity (${(maxScore * 100).toFixed(0)}%) with recent reply: "${matchingReply.slice(0, 40)}..."`,
      targetedAntiRepetitionGuidance:
        'CRITICAL REGENERATION INSTRUCTION: Avoid repeating the same greeting, food question, or romantic opening. Vary your vocabulary.',
      cleanedText: trimmed,
    };
  }

  return {
    isRepetitive: false,
    score: maxScore,
    cleanedText: trimmed,
  };
}

export function buildRecentResponseSummary(
  replies: string[] = [],
  rejected: string[] = []
): string {
  const parts: string[] = [];
  if (replies.length > 0) {
    parts.push(
      ...replies.slice(-3).map((r, i) => `[Reply -${replies.length - i}]: ${r.slice(0, 60)}...`)
    );
  }
  if (rejected.length > 0) {
    parts.push(
      ...rejected.slice(-2).map((r) => `[REJECTED/NEGATIVE FEEDBACK]: ${r.slice(0, 60)}...`)
    );
  }
  return parts.length > 0 ? parts.join('\n') : 'None';
}

export class ResponseRepetitionChecker {
  public check(
    candidate: string,
    recentAssistantReplies: string[],
    rejectedReplies?: string[]
  ): RepetitionCheckResult {
    return checkResponseRepetition(candidate, recentAssistantReplies, rejectedReplies);
  }
}
