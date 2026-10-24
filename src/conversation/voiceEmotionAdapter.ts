import { EmotionIntentAnalysis } from '../types';

/**
 * VOICE FEATURE IS PERMANENTLY DISABLED IN AMORA AI.
 * Voice chat, audio synthesis, text-to-speech, and microphone features
 * are strictly turned off and will not execute or initialize.
 */
export const VOICE_FEATURE_ENABLED = false;

export interface VoiceSynthesisParams {
  cleanedText: string;
  pitch: number;
  speed: number;
  mood: string;
}

export function isVoiceFeatureEnabled(): boolean {
  return false;
}

export function cleanTextForVoiceSynthesis(_rawText: string): string {
  // Voice feature permanently disabled
  return '';
}

export function adaptVoiceToEmotion(
  _text: string,
  _emotion: EmotionIntentAnalysis,
  _basePitch: number = 1.0,
  _baseSpeed: number = 1.0,
  _companionId?: string
): VoiceSynthesisParams {
  // Voice feature permanently disabled
  return {
    cleanedText: '',
    pitch: 1.0,
    speed: 1.0,
    mood: 'voice_disabled',
  };
}

