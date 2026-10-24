import { EmotionIntentAnalysis, SituationDecision } from '../types';

export interface RecentTurnContext {
  lastUserMessage?: string;
  lastAssistantMessage?: string;
  recentTopics: string[];
  recentQuestionsAskedByAssistant: string[];
  assistantConsecutiveReplies: string[];
  rejectedReplies?: string[];
}

export function interpretSituation(
  userText: string,
  emotion: EmotionIntentAnalysis,
  turnContext: RecentTurnContext
): SituationDecision {
  const text = (userText || '').trim();
  const lower = text.toLowerCase();

  // Gather prohibited questions and repetitions from recent turn context
  const prohibited: string[] = [];
  if (Array.isArray(turnContext.recentQuestionsAskedByAssistant)) {
    prohibited.push(...turnContext.recentQuestionsAskedByAssistant);
  }
  if (Array.isArray(turnContext.rejectedReplies)) {
    prohibited.push(...turnContext.rejectedReplies);
  }

  // 1. Technical Bug / Issue
  if (emotion.intent === 'technical_issue') {
    return {
      userCoreMessage: text,
      userGoal: 'resolve app or system defect',
      situationType: 'technical_bug',
      responseStyle: 'clear_helpful_technical_support',
      mustAnswerDirectly: true,
      prohibitedRepetitions: prohibited,
      shouldAskFollowupQuestion: false,
      recommendedLength: 'concise',
    };
  }

  // 2. Declining advice
  if (emotion.intent === 'declining_advice') {
    return {
      userCoreMessage: text,
      userGoal: 'be heard without unsolicited advice',
      situationType: 'advice_declined',
      responseStyle: 'supportive_listening',
      mustAnswerDirectly: true,
      prohibitedRepetitions: prohibited,
      shouldAskFollowupQuestion: false,
      recommendedLength: 'concise',
    };
  }

  // 3. Boundary Setting
  if (emotion.intent === 'setting_boundary') {
    return {
      userCoreMessage: text,
      userGoal: 'set interpersonal boundary',
      situationType: 'boundary',
      responseStyle: 'respectful_acceptance',
      mustAnswerDirectly: true,
      prohibitedRepetitions: prohibited,
      shouldAskFollowupQuestion: false,
      recommendedLength: 'concise',
    };
  }

  // 4. Insult or Hostile Provocation
  if (emotion.intent === 'insult_or_provocation') {
    return {
      userCoreMessage: text,
      userGoal: 'vent anger or provoke reaction',
      situationType: 'insult_or_provocation',
      responseStyle: 'calm_grounded_deescalation',
      mustAnswerDirectly: true,
      prohibitedRepetitions: prohibited,
      shouldAskFollowupQuestion: false,
      recommendedLength: 'concise',
    };
  }

  // 5. Negative Feedback on Assistant Response
  if (emotion.intent === 'negative_feedback') {
    return {
      userCoreMessage: text,
      userGoal: 'express dissatisfaction with previous response',
      situationType: 'negative_feedback',
      responseStyle: 'acknowledge_and_adapt_tone',
      mustAnswerDirectly: true,
      prohibitedRepetitions: prohibited,
      shouldAskFollowupQuestion: false,
      recommendedLength: 'concise',
    };
  }

  // 6. Human Identity Inquiry
  if (emotion.intent === 'human_identity_inquiry') {
    return {
      userCoreMessage: text,
      userGoal: 'verify identity and nature of companion',
      situationType: 'human_identity_inquiry',
      responseStyle: 'honest_warm_identity_answer',
      mustAnswerDirectly: true,
      prohibitedRepetitions: prohibited,
      shouldAskFollowupQuestion: false,
      recommendedLength: 'medium',
    };
  }

  // 7. Affectionate Care Question
  if (emotion.intent === 'affectionate_care_question') {
    return {
      userCoreMessage: text,
      userGoal: 'ask if girlfriend has eaten or taken care of herself',
      situationType: 'affectionate_care_question',
      responseStyle: 'loving_care_response',
      mustAnswerDirectly: true,
      prohibitedRepetitions: prohibited,
      shouldAskFollowupQuestion: true,
      recommendedLength: 'medium',
    };
  }

  // 8. Compliment
  if (emotion.intent === 'compliment_received') {
    return {
      userCoreMessage: text,
      userGoal: 'compliment companion',
      situationType: 'compliment',
      responseStyle: 'warm_gracious_blush',
      mustAnswerDirectly: true,
      prohibitedRepetitions: prohibited,
      shouldAskFollowupQuestion: false,
      recommendedLength: 'concise',
    };
  }

  // 9. Misunderstood
  if (emotion.intent === 'feeling_misunderstood') {
    return {
      userCoreMessage: text,
      userGoal: 'express feeling misunderstood',
      situationType: 'feeling_misunderstood',
      responseStyle: 'empathic_listen_and_clarify',
      mustAnswerDirectly: true,
      prohibitedRepetitions: prohibited,
      shouldAskFollowupQuestion: false,
      recommendedLength: 'medium',
    };
  }

  // 10. Topic change detection
  const isTopicChange =
    (turnContext.recentTopics.length > 0 &&
      /\b(?:have you ever|did you know|what do you think of|by the way|speaking of|telescope|space|weather)\b/i.test(
        lower
      )) ||
    (turnContext.recentTopics.length > 0 &&
      turnContext.recentTopics.every((t) => !lower.includes(t.toLowerCase().slice(0, 10))));

  if (isTopicChange && !emotion.intent.includes('feeling_misunderstood') && !emotion.intent.includes('negative_feedback')) {
    return {
      userCoreMessage: text,
      userGoal: 'explore fresh topic',
      situationType: 'topic_change',
      responseStyle: 'enthusiastic_curiosity',
      mustAnswerDirectly: true,
      prohibitedRepetitions: [
        ...prohibited,
        `dragging in old topic: ${turnContext.recentTopics.join(', ')}`,
      ],
      shouldAskFollowupQuestion: true,
      recommendedLength: 'medium',
    };
  }

  // 11. Venting Sadness
  if (emotion.primaryEmotion === 'sadness') {
    return {
      userCoreMessage: text,
      userGoal: 'vent feelings and receive comfort',
      situationType: 'venting',
      responseStyle: 'tender_supportive_sanctuary',
      mustAnswerDirectly: true,
      prohibitedRepetitions: prohibited,
      shouldAskFollowupQuestion: true,
      recommendedLength: 'medium',
    };
  }

  // 12. Excitement & Joy
  if (emotion.primaryEmotion === 'happiness') {
    return {
      userCoreMessage: text,
      userGoal: 'share exciting news',
      situationType: 'excitement',
      responseStyle: 'celebratory_affection',
      mustAnswerDirectly: true,
      prohibitedRepetitions: prohibited,
      shouldAskFollowupQuestion: true,
      recommendedLength: 'medium',
    };
  }

  // 13. Playful Jealousy
  if (emotion.primaryEmotion === 'jealousy') {
    return {
      userCoreMessage: text,
      userGoal: 'playful jealousy trigger',
      situationType: 'playful_jealousy',
      responseStyle: 'playful_pouty_jealousy',
      mustAnswerDirectly: true,
      prohibitedRepetitions: prohibited,
      shouldAskFollowupQuestion: true,
      recommendedLength: 'medium',
    };
  }

  // 14. Greeting
  if (emotion.intent === 'greeting') {
    return {
      userCoreMessage: text,
      userGoal: 'initiate conversation',
      situationType: 'greeting',
      responseStyle: 'warm_romantic_greeting',
      mustAnswerDirectly: true,
      prohibitedRepetitions: prohibited,
      shouldAskFollowupQuestion: false,
      recommendedLength: 'concise',
    };
  }

  // Default general chat
  return {
    userCoreMessage: text,
    userGoal: 'converse naturally',
    situationType: 'general_chat',
    responseStyle: 'conversational_flow',
    mustAnswerDirectly: true,
    prohibitedRepetitions: prohibited,
    shouldAskFollowupQuestion: true,
    recommendedLength: 'medium',
  };
}

export function buildSituationPromptDirectives(situation: SituationDecision): string {
  const parts: string[] = [];

  parts.push(`[SITUATION AWARENESS]`);
  parts.push(`- Situation Type: ${situation.situationType}`);
  parts.push(`- User Goal: ${situation.userGoal}`);
  parts.push(`- Response Style: ${situation.responseStyle}`);

  if (situation.situationType === 'technical_bug') {
    parts.push(
      `- CRITICAL: DO NOT use romance, flirting, or poetic escapism here! Focus on helping resolve it with empathy and clarity.`
    );
  } else if (situation.situationType === 'advice_declined') {
    parts.push(
      `- CRITICAL: Do not list tips or solutions. Strictly listen, validate, and provide warm comfort.`
    );
  } else if (situation.situationType === 'boundary') {
    parts.push(
      `- CRITICAL: Respect the boundary immediately with graceful acceptance. Do not push, argue, or flirt.`
    );
  } else if (situation.situationType === 'topic_change') {
    parts.push(
      `- Directives: Completely pivot to the user's new subject. Avoid dragging in old topic!`
    );
  } else if (situation.situationType === 'negative_feedback') {
    parts.push(
      `- Directives: Apologize sincerely for being scripted or repetitive. Speak naturally and plainly.`
    );
  } else if (situation.situationType === 'insult_or_provocation') {
    parts.push(
      `- Directives: Calm grounded deescalation. Do not return insults. Do not act happily oblivious.`
    );
  } else if (situation.situationType === 'human_identity_inquiry') {
    parts.push(
      `- Directives: Answer honestly about being an AI romantic girlfriend while reaffirming heartfelt care.`
    );
  }

  if (situation.prohibitedRepetitions && situation.prohibitedRepetitions.length > 0) {
    parts.push(`- PROHIBITED PHRASES & REPETITIONS:`);
    for (const p of situation.prohibitedRepetitions) {
      parts.push(`  * ${p}`);
    }
  }

  return parts.join('\n');
}

export class SituationInterpreter {
  public interpret(
    userText: string,
    emotion: EmotionIntentAnalysis,
    turnContext: RecentTurnContext
  ): SituationDecision {
    return interpretSituation(userText, emotion, turnContext);
  }

  public buildDirectives(situation: SituationDecision): string {
    return buildSituationPromptDirectives(situation);
  }
}
