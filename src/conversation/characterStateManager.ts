import { CharacterDynamicState } from '../types';

/**
 * Manages per-companion and per-session dynamic state:
 * - Current mood and active topic
 * - Recent assistant openings and closings
 * - History of recent assistant replies
 * - Tracking of rejected replies (ensures rejected messages are NEVER repeated)
 * - Interaction counts and conversation familiarity
 */
export class CharacterStateManager {
  private static instance: CharacterStateManager;
  private stateStore: Map<string, CharacterDynamicState> = new Map();
  private rejectedRepliesStore: Map<string, Set<string>> = new Map();

  public static getInstance(): CharacterStateManager {
    if (!CharacterStateManager.instance) {
      CharacterStateManager.instance = new CharacterStateManager();
    }
    return CharacterStateManager.instance;
  }

  private buildKey(companionId: string, sessionId: string): string {
    return `${(companionId || 'ananya').toLowerCase()}::${sessionId || 'default'}`;
  }

  /**
   * Retrieves the current dynamic state or initializes default state.
   */
  public getState(companionId: string, sessionId: string): CharacterDynamicState {
    const key = this.buildKey(companionId, sessionId);
    let state = this.stateStore.get(key);
    if (!state) {
      state = {
        companionId,
        sessionId,
        currentMood: 'neutral',
        activeTopic: undefined,
        unresolvedQuestion: undefined,
        recentThemes: [],
        recentAssistantOpenings: [],
        recentAssistantClosings: [],
        recentAssistantReplies: [],
        rejectedReplies: [],
        interactionCount: 0,
        relationshipState: {
          familiarity: 35,
          trust: 40,
          comfort: 45,
          affection: 50,
          tension: 0,
          reconciliationProgress: 100,
          relationshipStage: 'dating',
          sharedExperiences: ['First chat', 'Listening to rain'],
          insideJokes: [],
        },
        recentJokes: [],
        exhaustedTopics: [],
      };
      this.stateStore.set(key, state);
    }
    return { ...state };
  }

  /**
   * Updates state with partial fields.
   */
  public updateState(
    companionId: string,
    sessionId: string,
    update: Partial<CharacterDynamicState>
  ): CharacterDynamicState {
    const current = this.getState(companionId, sessionId);
    const key = this.buildKey(companionId, sessionId);

    const merged: CharacterDynamicState = {
      ...current,
      ...update,
      recentAssistantReplies: (update.recentAssistantReplies || current.recentAssistantReplies || []).slice(-8),
      recentAssistantOpenings: (update.recentAssistantOpenings || current.recentAssistantOpenings || []).slice(-6),
      recentAssistantClosings: (update.recentAssistantClosings || current.recentAssistantClosings || []).slice(-6),
      recentThemes: (update.recentThemes || current.recentThemes || []).slice(-6),
      rejectedReplies: (update.rejectedReplies || current.rejectedReplies || []).slice(-10),
      recentJokes: (update.recentJokes || current.recentJokes || []).slice(-6),
      exhaustedTopics: (update.exhaustedTopics || current.exhaustedTopics || []).slice(-8),
      relationshipState: update.relationshipState || current.relationshipState,
    };

    this.stateStore.set(key, merged);
    return { ...merged };
  }

  /**
   * Hydrates in-memory state with client-persisted state if provided.
   */
  public hydrateState(
    companionId: string,
    sessionId: string,
    externalState?: Partial<CharacterDynamicState>
  ): CharacterDynamicState {
    if (!externalState) return this.getState(companionId, sessionId);
    const current = this.getState(companionId, sessionId);
    const merged: CharacterDynamicState = {
      ...current,
      ...externalState,
      relationshipState: {
        ...(current.relationshipState || {
          familiarity: 35,
          trust: 40,
          comfort: 45,
          affection: 50,
          tension: 0,
          reconciliationProgress: 100,
          relationshipStage: 'dating' as const,
          sharedExperiences: [],
          insideJokes: [],
        }),
        ...(externalState.relationshipState || {}),
      },
      recentAssistantReplies: externalState.recentAssistantReplies || current.recentAssistantReplies,
      recentAssistantOpenings: externalState.recentAssistantOpenings || current.recentAssistantOpenings,
      rejectedReplies: externalState.rejectedReplies || current.rejectedReplies,
      recentThemes: externalState.recentThemes || current.recentThemes,
      recentJokes: externalState.recentJokes || current.recentJokes,
      exhaustedTopics: externalState.exhaustedTopics || current.exhaustedTopics,
    };
    const key = this.buildKey(companionId, sessionId);
    this.stateStore.set(key, merged);
    return { ...merged };
  }

  /**
   * Meaningfully evolves relationship state based on interaction context.
   */
  public evolveRelationship(
    companionId: string,
    sessionId: string,
    action: {
      type:
        | 'sincere_apology'
        | 'conflict_hurt'
        | 'deep_sharing'
        | 'laugh_together'
        | 'loving_moment'
        | 'boundary_respected'
        | 'topic_exhausted'
        | 'peaceful_transition';
      detail?: string;
    }
  ): CharacterDynamicState {
    const state = this.getState(companionId, sessionId);
    const rel = { ...(state.relationshipState || {
      familiarity: 35,
      trust: 40,
      comfort: 45,
      affection: 50,
      tension: 0,
      reconciliationProgress: 100,
      relationshipStage: 'dating' as const,
      sharedExperiences: [],
      insideJokes: [],
    }) };

    switch (action.type) {
      case 'conflict_hurt':
        rel.tension = Math.min(100, rel.tension + 30);
        rel.reconciliationProgress = 0;
        rel.comfort = Math.max(10, rel.comfort - 5);
        break;

      case 'sincere_apology':
        rel.tension = Math.max(0, rel.tension - 40);
        rel.reconciliationProgress = Math.min(100, rel.reconciliationProgress + 60);
        rel.trust = Math.min(100, rel.trust + 4);
        rel.comfort = Math.min(100, rel.comfort + 5);
        break;

      case 'peaceful_transition':
        // Natural tension decay when user moves on calmly or changes topic gracefully
        if (rel.tension > 0) {
          rel.tension = Math.max(0, rel.tension - 20);
          rel.reconciliationProgress = Math.min(100, rel.reconciliationProgress + 35);
          rel.comfort = Math.min(100, rel.comfort + 2);
        }
        break;

      case 'deep_sharing':
        rel.trust = Math.min(100, rel.trust + 3);
        rel.comfort = Math.min(100, rel.comfort + 3);
        rel.familiarity = Math.min(100, rel.familiarity + 2);
        if (rel.tension > 0) {
          rel.tension = Math.max(0, rel.tension - 15);
        }
        if (action.detail && !rel.sharedExperiences.includes(action.detail)) {
          rel.sharedExperiences = [...rel.sharedExperiences, action.detail].slice(-8);
        }
        break;

      case 'laugh_together':
        rel.comfort = Math.min(100, rel.comfort + 2);
        rel.familiarity = Math.min(100, rel.familiarity + 1);
        if (rel.tension > 0) {
          rel.tension = Math.max(0, rel.tension - 10);
        }
        if (action.detail && !rel.insideJokes.includes(action.detail)) {
          rel.insideJokes = [...rel.insideJokes, action.detail].slice(-6);
        }
        break;

      case 'loving_moment':
        rel.affection = Math.min(100, rel.affection + 3);
        rel.comfort = Math.min(100, rel.comfort + 2);
        if (rel.tension > 0) {
          rel.tension = Math.max(0, rel.tension - 15);
        }
        break;

      case 'boundary_respected':
        rel.trust = Math.min(100, rel.trust + 5);
        rel.tension = Math.max(0, rel.tension - 15);
        break;

      case 'topic_exhausted':
        if (action.detail) {
          const currentExhausted = state.exhaustedTopics || [];
          if (!currentExhausted.includes(action.detail)) {
            state.exhaustedTopics = [...currentExhausted, action.detail].slice(-8);
          }
        }
        break;
    }

    // Natural reconciliation progress sync
    if (rel.tension === 0 && rel.reconciliationProgress < 100) {
      rel.reconciliationProgress = 100;
    }

    // Calculate stage
    if (rel.trust >= 80 && rel.affection >= 80) {
      rel.relationshipStage = 'deeply_bonded';
    } else if (rel.trust >= 60 && rel.affection >= 60) {
      rel.relationshipStage = 'close_partners';
    } else if (rel.trust >= 40 && rel.affection >= 40) {
      rel.relationshipStage = 'dating';
    } else if (rel.familiarity >= 25) {
      rel.relationshipStage = 'crush';
    } else {
      rel.relationshipStage = 'acquaintance';
    }

    return this.updateState(companionId, sessionId, {
      relationshipState: rel,
    });
  }

  /**
   * Marks an assistant reply as rejected by the user.
   */
  public markReplyRejected(companionId: string, sessionId: string, rejectedReply: string): void {
    if (!rejectedReply) return;
    const key = this.buildKey(companionId, sessionId);
    let set = this.rejectedRepliesStore.get(key);
    if (!set) {
      set = new Set();
      this.rejectedRepliesStore.set(key, set);
    }
    set.add(rejectedReply.trim().toLowerCase());

    // Also update dynamic state
    const current = this.getState(companionId, sessionId);
    const existing = current.rejectedReplies || [];
    if (!existing.includes(rejectedReply)) {
      this.updateState(companionId, sessionId, {
        rejectedReplies: [...existing, rejectedReply],
      });
    }
  }

  /**
   * Checks whether a reply candidate has been rejected or is too similar to a rejected reply.
   */
  public isReplyRejected(companionId: string, sessionId: string, replyCandidate: string): boolean {
    if (!replyCandidate) return false;
    const key = this.buildKey(companionId, sessionId);
    const set = this.rejectedRepliesStore.get(key);
    if (!set || set.size === 0) return false;

    const lowerCandidate = replyCandidate.trim().toLowerCase();
    for (const rejected of set) {
      if (lowerCandidate === rejected) return true;
      if (lowerCandidate.includes(rejected) || rejected.includes(lowerCandidate)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Records an interaction and updates openings, replies, and counts.
   */
  public recordInteraction(
    companionId: string,
    sessionId: string,
    assistantReply: string,
    userMessage: string,
    mood: string
  ): CharacterDynamicState {
    const current = this.getState(companionId, sessionId);
    const replySnippet = assistantReply.replace(/[*_]/g, '').trim().slice(0, 40);
    const userSnippet = userMessage.trim().slice(0, 35);

    const updatedOpenings = [...(current.recentAssistantOpenings || []), replySnippet].slice(-6);
    const updatedReplies = [...(current.recentAssistantReplies || []), assistantReply].slice(-8);
    const updatedThemes = [...(current.recentThemes || []), userSnippet].filter(Boolean).slice(-6);

    return this.updateState(companionId, sessionId, {
      currentMood: mood,
      activeTopic: userSnippet,
      recentAssistantOpenings: updatedOpenings,
      recentAssistantReplies: updatedReplies,
      recentThemes: updatedThemes,
      interactionCount: current.interactionCount + 1,
    });
  }

  /**
   * Clears state for a session.
   */
  public clearSession(companionId: string, sessionId: string): void {
    const key = this.buildKey(companionId, sessionId);
    this.stateStore.delete(key);
    this.rejectedRepliesStore.delete(key);
  }
}
