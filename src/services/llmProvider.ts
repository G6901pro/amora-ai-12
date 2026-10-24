import { GoogleGenAI } from '@google/genai';
import { ProviderHealthState } from '../types';

export function sanitizeLog(text: string): string {
  if (!text) return '';
  return text
    .replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_GEMINI_KEY]')
    .replace(/(?:key|token|secret)=["']?[^"'\s&]+["']?/gi, '$1=[REDACTED]');
}

export function isGemini403Error(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message || err.statusText || err || '').toLowerCase();
  return (
    msg.includes('403') ||
    msg.includes('permission_denied') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('forbidden')
  );
}

export interface ProviderManagerOptions {
  geminiKey?: string;
  geminiModel?: string;
  timeoutMs?: number;
}

export interface GenerateReplyParams {
  userMessage: string;
  systemPrompt: string;
  companionId?: string;
  userNickname?: string;
  temperature?: number;
  recentHistory?: any[];
  reqId?: string;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
}

export interface GenerateReplyResult {
  reply: string;
  providerUsed: 'gemini' | 'ollama' | 'fallback';
  modelUsed: string;
  fallbackReason?: string;
  notice?: string;
  geminiError?: string;
  elapsedMs?: number;
  providerTimings?: {
    geminiMs?: number;
    fallbackMs?: number;
    totalMs: number;
  };
}

export class LLMProviderManager {
  private geminiKey: string;
  private geminiModel: string;
  private timeoutMs: number;
  private circuitBreakerOpen: boolean = false;
  private recentError?: string;
  private genAI: GoogleGenAI | null = null;

  constructor(opts: ProviderManagerOptions = {}) {
    const rawKey = opts.geminiKey !== undefined ? opts.geminiKey : (process.env.GEMINI_API_KEY || '');
    this.geminiKey = (!rawKey || rawKey === 'MY_GEMINI_API_KEY' || rawKey.startsWith('MY_') || rawKey === 'undefined') ? '' : rawKey.trim();
    this.geminiModel = opts.geminiModel || process.env.GEMINI_MODEL || 'gemini-3.8-flash';
    this.timeoutMs = opts.timeoutMs || 4000;

    if (this.geminiKey) {
      try {
        this.genAI = new GoogleGenAI({ apiKey: this.geminiKey });
      } catch (e: any) {
        console.warn('[LLMProvider] Failed to init GoogleGenAI:', e?.message);
      }
    }
  }

  public getClient(): GoogleGenAI | null {
    return this.genAI;
  }

  public isCircuitTripped(): boolean {
    return this.circuitBreakerOpen;
  }

  public getModel(): string {
    return this.geminiModel;
  }

  public tripCircuitBreaker(reason: string = 'Manually tripped'): void {
    this.circuitBreakerOpen = true;
    this.recentError = reason;
  }

  public async generateReply(
    params: GenerateReplyParams,
    fallbackGenerator?: () => string
  ): Promise<GenerateReplyResult> {
    const startTime = Date.now();

    // If no API key or circuit breaker is tripped, immediately use fallback
    if (!this.geminiKey || this.circuitBreakerOpen || !this.genAI) {
      const fallback = fallbackGenerator ? fallbackGenerator() : 'হ্যালো জান, আমি সবসময় তোমার পাশে আছি 💕';
      const elapsed = Date.now() - startTime;
      return {
        reply: fallback,
        providerUsed: 'fallback',
        modelUsed: 'contextual_fallback_engine',
        fallbackReason: this.circuitBreakerOpen ? 'circuit_breaker_open' : 'no_gemini_key',
        elapsedMs: elapsed,
        providerTimings: { fallbackMs: elapsed, totalMs: elapsed },
      };
    }

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini API timeout')), this.timeoutMs)
      );

      const generatePromise = this.genAI.models.generateContent({
        model: this.geminiModel,
        contents: [
          {
            role: 'user',
            parts: [{ text: params.userMessage }],
          },
        ],
        config: {
          systemInstruction: params.systemPrompt,
          temperature: params.temperature ?? 0.85,
        },
      });

      const response = await Promise.race([generatePromise, timeoutPromise]);
      const replyText = response.text?.trim() || '';

      if (!replyText) {
        throw new Error('Empty response received from Gemini');
      }

      const elapsed = Date.now() - startTime;
      return {
        reply: replyText,
        providerUsed: 'gemini',
        modelUsed: this.geminiModel,
        elapsedMs: elapsed,
        providerTimings: { geminiMs: elapsed, totalMs: elapsed },
      };
    } catch (err: any) {
      const elapsed = Date.now() - startTime;
      const is403 = isGemini403Error(err);
      if (is403) {
        this.circuitBreakerOpen = true;
        this.recentError = 'Permission or quota limitation';
      } else {
        this.recentError = err?.message || 'Gemini error';
      }

      console.warn(
        sanitizeLog(
          `[LLMProvider] Gemini error (${err?.message}). Engaging contextual fallback engine.`
        )
      );

      const fallback = fallbackGenerator ? fallbackGenerator() : 'হ্যালো জান, আমি সবসময় তোমার পাশে আছি 💕';
      return {
        reply: fallback,
        providerUsed: 'fallback',
        modelUsed: 'contextual_fallback_engine',
        fallbackReason: is403 ? 'gemini_403_circuit_breaker' : 'gemini_api_error',
        geminiError: err?.message,
        elapsedMs: elapsed,
        providerTimings: { fallbackMs: elapsed, totalMs: elapsed },
      };
    }
  }

  public async getHealth(forceRecheck: boolean = false): Promise<ProviderHealthState> {
    if (forceRecheck) {
      this.circuitBreakerOpen = false;
      this.recentError = undefined;
    }

    const hasKey = Boolean(this.geminiKey);
    const status: ProviderHealthState['status'] = this.circuitBreakerOpen
      ? 'degraded'
      : hasKey
      ? 'healthy'
      : 'offline';

    return {
      ok: !this.circuitBreakerOpen && hasKey,
      status,
      geminiConfigured: hasKey,
      geminiModel: this.geminiModel,
      circuitBreakerOpen: this.circuitBreakerOpen,
      recentError: this.recentError,
    };
  }
}
