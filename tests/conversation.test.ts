import assert from 'node:assert';
import { ConversationContextBuilder } from '../src/conversation/contextBuilder';
import { analyzeEmotionAndIntent } from '../src/conversation/emotionAnalyzer';
import { checkResponseRepetition } from '../src/conversation/repetitionChecker';
import { evaluateAndFinalizeReply } from '../src/conversation/pipeline';
import {
  VOICE_FEATURE_ENABLED,
  isVoiceFeatureEnabled,
  adaptVoiceToEmotion,
} from '../src/conversation/voiceEmotionAdapter';

console.log('--- Running conversation.test.ts ---');

// 1. Permanent Voice Disablement Verification
assert.strictEqual(VOICE_FEATURE_ENABLED, false, 'Voice feature must be permanently disabled');
assert.strictEqual(isVoiceFeatureEnabled(), false, 'isVoiceFeatureEnabled must return false');

const dummyEmotion = analyzeEmotionAndIntent('Hello darling');
const voiceResult = adaptVoiceToEmotion('Hello darling', dummyEmotion);
assert.strictEqual(voiceResult.mood, 'voice_disabled', 'Voice mood must be voice_disabled');
assert.strictEqual(voiceResult.cleanedText, '', 'Cleaned voice text must remain empty');

// 2. Emotion & Intent Analysis for Text Chat
const emotionBn = analyzeEmotionAndIntent('তুমি আমাকে বোঝো না জান');
assert.strictEqual(emotionBn.primaryEmotion, 'sadness', 'Should detect sadness when misunderstood');

const emotionCare = analyzeEmotionAndIntent('আজকে খাবার খেয়েছো তো বাবু?');
assert.strictEqual(emotionCare.primaryEmotion, 'affection', 'Should detect affection from care question');

// 3. Context Builder for Text Chat
const builder = new ConversationContextBuilder();
const context = builder.buildContext({
  userMessage: 'তুমি কি খেয়েছ জান?',
  recentHistory: [],
  settings: {
    activeCompanionId: 'ananya',
    currentSessionId: 'test_session',
    languageMode: 'bn',
    companionName: 'Ananya',
    userNickname: 'জান',
    persona: 'SWEET',
    voiceTone: 'SWEET',
    affectionPoints: 100,
    autoVoice: false,
    voicePitch: 1.15,
    voiceSpeed: 1.0,
    flirtIntensity: 'SWEET_ROMANCE',
    subscriptionTier: 'FREE',
    handsFreeVoiceMode: false,
    favorites: ['ananya'],
  },
  memories: [],
});

assert.ok(context.systemPrompt.includes('Ananya'), 'System prompt must include character name');
assert.strictEqual(context.voiceParams.mood, 'voice_disabled', 'Context voiceParams must be disabled');

// 4. Repetition Checker
const repCheck = checkResponseRepetition(
  'হ্যাঁ জান, আমি খেয়েছি।',
  ['হ্যাঁ জান, আমি খেয়েছি।'],
  []
);
assert.strictEqual(repCheck.isRepetitive, true, 'Exact match must be flagged as repetitive');

// 5. Evaluate and finalize text reply
const finalized = evaluateAndFinalizeReply(
  'হ্যাঁ আমার সোনা, অনেক সুন্দর একটা দিন কাটল তোমার সাথে! 💕',
  context,
  'ananya',
  'test_session'
);
assert.strictEqual(finalized.needsRegeneration, false, 'Fresh reply should not need regeneration');
assert.strictEqual(finalized.result.voiceParams.mood, 'voice_disabled', 'Result voiceParams must be disabled');

console.log('✓ conversation.test.ts passed successfully!');
