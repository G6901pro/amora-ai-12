import { CharacterMemory } from '../types';

export interface ScoredMemory {
  memory: CharacterMemory;
  score: number;
  matchReason: string;
}

/**
 * Tokenizes text for memory keyword matching.
 */
function tokenizeText(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
  return new Set(words);
}

/**
 * Categorizes and scores long-term memories for relevance to the current user message.
 * Only memories that have a meaningful semantic or keyword connection are selected.
 */
export function retrieveRelevantMemories(
  userText: string,
  memories: CharacterMemory[],
  companionId: string,
  limit: number = 3
): CharacterMemory[] {
  if (!userText || !Array.isArray(memories) || memories.length === 0) {
    return [];
  }

  const userTokens = tokenizeText(userText);
  const lowerUser = userText.toLowerCase();

  // Filter memories isolated to this companion (or general user facts with matching companionId)
  // and ensure memory is enabled
  const characterMemories = memories.filter(
    (m) =>
      m &&
      (m.companionId === companionId || !m.companionId) &&
      m.enabled !== false
  );

  const scored: ScoredMemory[] = [];

  for (const mem of characterMemories) {
    let score = 0;
    const memContent = (mem.memoryContent || '').toLowerCase();
    const memKey = (mem.memoryKey || '').toLowerCase();
    const memCategory = (mem.memoryCategory || '').toLowerCase();

    const memTokens = tokenizeText(memContent + ' ' + memKey);

    // 1. Direct word overlap score
    let overlapCount = 0;
    for (const token of memTokens) {
      if (userTokens.has(token)) {
        overlapCount++;
      }
    }
    if (overlapCount > 0) {
      score += overlapCount * 2.5;
    }

    // 2. Category contextual boost
    if (memCategory.includes('favorite') && (lowerUser.includes('favorite') || lowerUser.includes('love') || lowerUser.includes('like') || lowerUser.includes('প্রিয়') || lowerUser.includes('priyo'))) {
      score += 2.0;
    }
    if (memCategory.includes('boundary') && (lowerUser.includes('stop') || lowerUser.includes('dont') || lowerUser.includes('don\'t') || lowerUser.includes('থামো') || lowerUser.includes('birokto'))) {
      score += 4.0;
    }
    if (memCategory.includes('project') || memCategory.includes('work') || memCategory.includes('goal')) {
      if (lowerUser.includes('work') || lowerUser.includes('job') || lowerUser.includes('office') || lowerUser.includes('project') || lowerUser.includes('কাজ') || lowerUser.includes('অফিস') || lowerUser.includes('kaj')) {
        score += 3.0;
      }
    }
    if (memCategory.includes('personal fact')) {
      if (lowerUser.includes('my') || lowerUser.includes('amar') || lowerUser.includes('আমার') || lowerUser.includes('i am')) {
        score += 1.0;
      }
    }

    // Explicit recall question boost (e.g. "do you remember my...", "mone ache...", "what did I say about...")
    const isRecallQuery =
      lowerUser.includes('remember') ||
      lowerUser.includes('mone ache') ||
      lowerUser.includes('মনে আছে') ||
      lowerUser.includes('what is my') ||
      lowerUser.includes('amar ki');

    if (isRecallQuery && overlapCount > 0) {
      score += 5.0;
    }

    // Only include if there is genuine relevance (score >= 2.0)
    if (score >= 2.0) {
      scored.push({
        memory: mem,
        score,
        matchReason: `Matched ${overlapCount} keywords in category ${mem.memoryCategory}`,
      });
    }
  }

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => s.memory);
}

/**
 * Detects whether the user shared a new personal memory in their message.
 * Returns a new CharacterMemory object if a notable fact is detected, otherwise null.
 */
export function extractMemoryFromText(
  userText: string,
  companionId: string
): Omit<CharacterMemory, 'id' | 'timestamp'> | null {
  const text = (userText || '').trim();
  const lower = text.toLowerCase();

  // 1. Favorite food, drink, song, color, hobby (English & Banglish & Bengali)
  const favMatch = text.match(
    /(?:my favorite|i love eating|i love drinking|my favorite song is|আমার প্রিয়|আমার প্রিয়|amar priyo|amar favorite|priyo rong|priyo gaan|i really enjoy)\s+([^.!?]+)/i
  );
  if (favMatch && favMatch[1]) {
    const item = favMatch[1].trim();
    if (item.length > 2 && item.length < 80) {
      return {
        companionId,
        memoryCategory: 'Favorite',
        memoryKey: 'Favorite item',
        memoryContent: `User loves: ${item}`,
        enabled: true,
      };
    }
  }

  // 2. Birthday or Age
  if (
    lower.includes('my birthday') ||
    lower.includes('আমার জন্মদিন') ||
    lower.includes('amar birthday') ||
    lower.includes('amar jonmodin') ||
    lower.includes('years old') ||
    lower.includes('বছর বয়স') ||
    lower.includes('bochor boyosh')
  ) {
    return {
      companionId,
      memoryCategory: 'Personal Fact',
      memoryKey: 'Birthday / Age',
      memoryContent: text,
      enabled: true,
    };
  }

  // 3. Work / Career / Project / Profession
  if (
    lower.includes('i work as') ||
    lower.includes('my job is') ||
    lower.includes('i am working on') ||
    lower.includes('ami kaj kori') ||
    lower.includes('ami doctor') ||
    lower.includes('ami engineer') ||
    lower.includes('ami student') ||
    lower.includes('আমার কাজ') ||
    lower.includes('আমি কাজ করি') ||
    lower.includes('আমার প্রজেক্ট')
  ) {
    return {
      companionId,
      memoryCategory: 'Project',
      memoryKey: 'Work / Project',
      memoryContent: text,
      enabled: true,
    };
  }

  // 4. Communication Preference or Boundary
  if (
    lower.includes('call me') ||
    lower.includes('i prefer') ||
    lower.includes('don\'t like when') ||
    lower.includes('dont like when') ||
    lower.includes('amake dakbe') ||
    lower.includes('amake dakio') ||
    lower.includes('আমাকে ডাকবে')
  ) {
    return {
      companionId,
      memoryCategory: 'Preference',
      memoryKey: 'Communication preference',
      memoryContent: text,
      enabled: true,
    };
  }

  return null;
}

/**
 * Builds formatted memory context string for system prompt injection.
 * Strict instruction: only mention memories when naturally relevant; never invent facts.
 */
export function formatRelevantMemoriesContext(relevantMemories: CharacterMemory[]): string {
  if (!relevantMemories || relevantMemories.length === 0) {
    return '';
  }

  const lines = relevantMemories.map(
    (m) => `- [${m.memoryCategory}] ${m.memoryContent}`
  );

  return `
RELEVANT MEMORIES ABOUT YOUR PARTNER (USE NATURALLY IF RELEVANT; DO NOT FORCE):
${lines.join('\n')}
- RULE: Only refer to these memories if they directly relate to what the partner is currently talking about. Do NOT invent or assume personal facts that are not listed here.
`.trim();
}

/**
 * Class-based memory retriever for modular pipeline integration.
 */
export class RelevantMemoryRetriever {
  public static retrieve(
    userText: string,
    memories: CharacterMemory[],
    companionId: string,
    limit: number = 3
  ): CharacterMemory[] {
    return retrieveRelevantMemories(userText, memories, companionId, limit);
  }

  public retrieve(
    userText: string,
    memories: CharacterMemory[],
    companionId: string,
    limit: number = 3
  ): CharacterMemory[] {
    return retrieveRelevantMemories(userText, memories, companionId, limit);
  }

  public static extract(
    userText: string,
    companionId: string
  ): Omit<CharacterMemory, 'id' | 'timestamp'> | null {
    return extractMemoryFromText(userText, companionId);
  }

  public extract(
    userText: string,
    companionId: string
  ): Omit<CharacterMemory, 'id' | 'timestamp'> | null {
    return extractMemoryFromText(userText, companionId);
  }

  public static formatPromptContext(memories: CharacterMemory[]): string {
    return formatRelevantMemoriesContext(memories);
  }

  public formatPromptContext(memories: CharacterMemory[]): string {
    return formatRelevantMemoriesContext(memories);
  }
}

