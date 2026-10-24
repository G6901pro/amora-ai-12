import {
  ConversationContextBuilder,
  ConversationPipelineContext,
  ConversationPipelineInput,
} from './contextBuilder';
import { checkResponseRepetition, RepetitionCheckResult } from './repetitionChecker';
import { CharacterStateManager } from './characterStateManager';
import { adaptVoiceToEmotion, VoiceSynthesisParams } from './voiceEmotionAdapter';
export { ReplyGenerationService } from './replyGenerationService';

const contextBuilderInstance = new ConversationContextBuilder();
const stateManagerInstance = CharacterStateManager.getInstance();

export function prepareConversationContext(
  input: ConversationPipelineInput
): ConversationPipelineContext {
  return contextBuilderInstance.buildContext(input);
}

export interface EvaluateReplyResult {
  needsRegeneration: boolean;
  retryInstruction?: string;
  result: {
    reply: string;
    updatedState: any;
    voiceParams: VoiceSynthesisParams;
    repetitionCheck: RepetitionCheckResult;
  };
}

export function evaluateAndFinalizeReply(
  rawReply: string,
  context: ConversationPipelineContext,
  companionId: string,
  sessionId: string
): EvaluateReplyResult {
  const repetition = checkResponseRepetition(
    rawReply,
    context.recentAssistantReplies,
    context.recentTurnContext.rejectedReplies
  );

  const voiceParams = adaptVoiceToEmotion(
    rawReply,
    context.emotionAnalysis,
    context.personality?.sensitivityLevel || 1.15,
    1.0,
    companionId
  );

  if (repetition.isRepetitive) {
    return {
      needsRegeneration: true,
      retryInstruction:
        repetition.targetedAntiRepetitionGuidance ||
        'CRITICAL REGENERATION INSTRUCTION: Avoid repeating greetings, questions, or canned expressions.',
      result: {
        reply: rawReply,
        updatedState: stateManagerInstance.getState(companionId, sessionId),
        voiceParams,
        repetitionCheck: repetition,
      },
    };
  }

  // Update dynamic state upon accepted reply
  const updatedState = stateManagerInstance.recordInteraction(
    companionId,
    sessionId,
    rawReply,
    context.recentTurnContext.lastUserMessage || '',
    context.emotionAnalysis.primaryEmotion
  );

  return {
    needsRegeneration: false,
    result: {
      reply: rawReply,
      updatedState,
      voiceParams,
      repetitionCheck: repetition,
    },
  };
}
