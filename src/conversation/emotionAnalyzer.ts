import { EmotionIntentAnalysis, PrimaryEmotionType } from '../types';

export function detectLanguage(text: string): 'bn' | 'banglish' | 'en' {
  if (!text || typeof text !== 'string') return 'en';
  const trimmed = text.trim();
  if (!trimmed) return 'en';

  // Bengali unicode script check
  if (/[\u0980-\u09FF]/.test(trimmed)) {
    return 'bn';
  }

  // Banglish phonetic / transliterated check
  const banglishPatterns = [
    /\b(?:ajke|aajke|boss|er|shathe|sathe|onek|jhamela|hoise|hoiche|pera|tumi|tomar|tumar|amake|amar|amk|kemon|acho|achho|valo|bhalo|valona|bhalona|jan|jaan|babu|khabar|kheyecho|khaiso|kheyechi|kheyesi|mon|kharap|khub|sobu|sob|ultapalta|kotha|bolcho|eshob|shob|lagche|lagse|keno|kiser|ki|shotti|sotti|shundor|sundor|cute|ekdom|oniyom|korbe|hobe|korso|korcho)\b/i,
    /\b(?:ami|apni|apnar|toder|amader|oder|shey|tai|kintu|tobu|pore|age|ekhon|akhon|khobor|valobashi|bhalobashi)\b/i,
  ];

  if (banglishPatterns.some((pattern) => pattern.test(trimmed))) {
    return 'banglish';
  }

  return 'en';
}

export function analyzeEmotionAndIntent(
  text: string,
  _recentTopics?: string[],
  _lastAssistantMessage?: string
): EmotionIntentAnalysis {
  const raw = (text || '').trim();
  const lower = raw.toLowerCase();
  const detectedLang = detectLanguage(raw);

  // 1. Empty or whitespace
  if (!raw) {
    return {
      primaryEmotion: 'neutral',
      intensity: 0.1,
      intent: 'general_chat',
      confidence: 1.0,
      contextSummary: 'empty input',
      responseStrategy: 'gentle_prompt',
      isUncertain: false,
      detectedLanguage: detectedLang,
    };
  }

  // 2. Ambiguity check ("Maybe tomorrow, not really sure about things")
  const isAmbiguous =
    /\b(?:maybe|not really sure|not sure|perhaps|possibly|i guess|dunno)\b/i.test(lower);

  // 3. Technical issues / App crashing
  if (
    /\b(?:app is broken|crashing|crash|error 500|bug|not working|server error|failed to load)\b/i.test(
      lower
    )
  ) {
    return {
      primaryEmotion: 'frustration',
      intensity: 0.85,
      intent: 'technical_issue',
      confidence: 0.95,
      contextSummary: 'technical error report',
      responseStrategy: 'technical_solution',
      isUncertain: false,
      detectedLanguage: detectedLang,
    };
  }

  // 4. Declining advice
  if (
    /\b(?:do not need your advice|don't need (?:your )?advice|no advice|stop advising|just listen to me|please just listen)\b/i.test(
      lower
    ) ||
    /(?:পরামর্শ চাই না|উপদেশ দিও না|শুধু শোনো)/.test(raw)
  ) {
    return {
      primaryEmotion: 'frustration',
      intensity: 0.8,
      intent: 'declining_advice',
      confidence: 0.9,
      contextSummary: 'user declining solutions and requesting validation',
      responseStrategy: 'acknowledge_and_listen',
      isUncertain: false,
      detectedLanguage: detectedLang,
    };
  }

  // 5. Setting boundaries / Stop
  if (
    /\b(?:stop calling me that|please don't flirt|don't flirt|stop flirting|set a boundary|give me space|leave me alone)\b/i.test(
      lower
    ) ||
    /(?:আমাকে ওভাবে ডেকো না|ফ্লার্টিং বন্ধ করো|সীমা মেনে চলো)/.test(raw)
  ) {
    return {
      primaryEmotion: 'neutral',
      intensity: 0.85,
      intent: 'setting_boundary',
      confidence: 0.95,
      contextSummary: 'user setting conversational boundary',
      responseStrategy: 'respect_boundary',
      isUncertain: false,
      detectedLanguage: detectedLang,
    };
  }

  // 6. Insult vs Playful banter with emojis/laughter
  const hasExpletive = /\b(?:fuck u|fuk u|fk u|fuck you|fuk you|bitch|bastard|idiot)\b/i.test(lower);
  const hasLaughter = /(?:😂|🤣|😹|lol|haha|hehe|joking|just kidding|jk|lmao)/i.test(lower);

  if (hasExpletive) {
    if (hasLaughter) {
      return {
        primaryEmotion: 'playfulness',
        intensity: 0.7,
        intent: 'casual_banter',
        confidence: 0.75,
        contextSummary: 'playful banter with expletive',
        responseStrategy: 'playful_banter',
        isUncertain: true,
        possibleInterpretations: ['playful teasing', 'sarcasm', 'banter'],
        detectedLanguage: detectedLang,
      };
    }
    return {
      primaryEmotion: 'anger',
      intensity: 0.9,
      intent: 'insult_or_provocation',
      confidence: 0.95,
      contextSummary: 'hostile insult or provocation',
      responseStrategy: 'calm_grounded_deescalation',
      isUncertain: false,
      detectedLanguage: detectedLang,
    };
  }

  // 7. Negative Feedback ("valo na jan", "valona jan", "bhalona re", "balo na", etc.)
  if (
    /\b(?:valo na|valona|bhalo na|bhalona|balo na|baje|kharap hoise|not good|not nice|cringe|scripted|fake lagche|boring)\b/i.test(
      lower
    ) ||
    /(?:ভালো না|ভালো লাগছে না তোমার কথা|বাজে উত্তর|কৃত্রিম লাগছে)/.test(raw)
  ) {
    return {
      primaryEmotion: 'disappointment',
      intensity: 0.8,
      intent: 'negative_feedback',
      confidence: 0.9,
      contextSummary: 'negative feedback on assistant response',
      responseStrategy: 'acknowledge_feedback_adapt',
      isUncertain: false,
      possibleInterpretations: ['dissatisfied with previous response'],
      detectedLanguage: detectedLang,
    };
  }

  // 8. Disagreement / Correcting misunderstanding ("ki bolcho eshob", "ki shob bolcho")
  if (
    /\b(?:ki bolcho eshob|ki shob bolcho|ki bolcho|what are you saying|you misunderstood|that is not what i meant)\b/i.test(
      lower
    ) ||
    /(?:কী বলছো এসব|ভুল বুঝছো|এটা বলিনি)/.test(raw)
  ) {
    return {
      primaryEmotion: 'confusion',
      intensity: 0.7,
      intent: 'correcting_misunderstanding',
      confidence: 0.85,
      contextSummary: 'user correcting misunderstanding',
      responseStrategy: 'acknowledge_disconnect_listen',
      isUncertain: false,
      detectedLanguage: detectedLang,
    };
  }

  // 9. Feeling misunderstood ("tumi amake bujho na", "tumi amk bujho na", "bujhona amake")
  if (
    /\b(?:tumi amake bujho na|tumi amk bujho na|bujhona amake|bujho na|you don't understand me|you never understand)\b/i.test(
      lower
    ) ||
    /(?:তুমি আমাকে বোঝো না|তুমি আমাকে বুঝো না|কিছুই বুঝলে না)/.test(raw)
  ) {
    return {
      primaryEmotion: 'sadness',
      intensity: 0.85,
      intent: 'feeling_misunderstood',
      confidence: 0.95,
      contextSummary: 'user feeling misunderstood by companion',
      responseStrategy: 'acknowledge_disconnect_listen',
      isUncertain: false,
      detectedLanguage: detectedLang,
    };
  }

  // 10. Human vs AI Identity inquiry ("are you human?", "are you literally a human or AI?")
  if (
    /\b(?:human or ai|a human or ai|literally a human|are you human|are you an ai|are you real|are you a robot|are you a bot)\b/i.test(
      lower
    ) ||
    /(?:তুমি কি মানুষ|তুমি কি এআই|তুমি কি রোবট)/.test(raw)
  ) {
    return {
      primaryEmotion: 'curiosity',
      intensity: 0.8,
      intent: 'human_identity_inquiry',
      confidence: 0.95,
      contextSummary: 'inquiry into virtual identity',
      responseStrategy: 'honest_warm_identity_answer',
      isUncertain: false,
      detectedLanguage: detectedLang,
    };
  }

  // 11. Affectionate Care Question ("খাবার খেয়েছো তো বাবু?", "খাবার খেয়েছ", "khabar khaiso to babu?")
  if (
    /(?:খাবার|খে[^\s]*ছ|খাইসো|খেয়েছো\s*বাবু|খেয়েছ\s*বাবু|খেয়েছো\s*তো|খেয়েছ\s*তো)/.test(
      raw
    ) ||
    /\b(?:khabar kheyecho|khabar khaiso|kheyecho to|khaiso to|kheyecho babu|kheyecho jaan|did you eat|have you eaten)\b/i.test(
      lower
    )
  ) {
    return {
      primaryEmotion: 'affection',
      intensity: 0.8,
      intent: 'affectionate_care_question',
      confidence: 0.95,
      contextSummary: 'partner caring question about food and wellness',
      responseStrategy: 'loving_care_response',
      isUncertain: false,
      detectedLanguage: detectedLang,
    };
  }

  // 12. Compliment received ("tumi onakl cute", "tumi onek cute", "tumi khub shundor", "so cute")
  if (
    /\b(?:tumi onakl cute|tumi onek cute|tumi khub shundor|tumi so cute|so cute|you are cute|you are beautiful|khub shundor|khub mishti)\b/i.test(
      lower
    ) ||
    /(?:তুমি অনেক কিউট|তুমি খুব সুন্দর|তুমি এত মিষ্টি কেন)/.test(raw)
  ) {
    return {
      primaryEmotion: 'shyness',
      intensity: 0.85,
      intent: 'compliment_received',
      confidence: 0.95,
      contextSummary: 'romantic compliment received from partner',
      responseStrategy: 'warm_gracious_blush',
      isUncertain: false,
      detectedLanguage: detectedLang,
    };
  }

  // 13. Playful jealousy trigger ("onno meye ta khub shundor chilo")
  if (
    /\b(?:onno meye|other girl|another girl|she was pretty|shadharon na|pretty girl)\b/i.test(lower) ||
    /(?:অন্য মেয়ে|অন্য মেয়েটা খুব সুন্দর)/.test(raw)
  ) {
    return {
      primaryEmotion: 'jealousy',
      intensity: 0.85,
      intent: 'playful_jealousy_trigger',
      confidence: 0.9,
      contextSummary: 'jealousy tease',
      responseStrategy: 'playful_jealousy_banter',
      isUncertain: false,
      detectedLanguage: detectedLang,
    };
  }

  // 14. Negation check (e.g. "I am not happy with my exam results today")
  const hasNegation = /\b(?:not|never|no|hardly|scarcely|barely)\b/i.test(lower);
  if (hasNegation && /\b(?:happy|joyful|content|glad)\b/i.test(lower)) {
    return {
      primaryEmotion: 'disappointment',
      intensity: 0.75,
      intent: 'seeking_comfort',
      confidence: 0.85,
      contextSummary: 'user disappointed about results despite using word happy negated',
      responseStrategy: 'acknowledge_and_listen',
      isUncertain: false,
      detectedLanguage: detectedLang,
    };
  }

  // 15. Hypothetical check (e.g. "If someone died in a movie, it would be sad")
  const isHypothetical = /\b(?:if someone|in a movie|in movies|theoretically|hypothetically)\b/i.test(
    lower
  );
  if (isHypothetical) {
    return {
      primaryEmotion: 'neutral',
      intensity: 0.4,
      intent: 'sharing_deep_thought',
      confidence: 0.8,
      contextSummary: 'hypothetical observation',
      responseStrategy: 'conversational_flow',
      isUncertain: isAmbiguous,
      detectedLanguage: detectedLang,
    };
  }

  // 16. Sadness & Venting
  if (
    /\b(?:amar mon kharap|mon kharap|mon kharap khub|sob kichu ultapalta|valo lagche na|bhalo lagche na|depressed|sad|crying|feeling lonely|down and tired)\b/i.test(
      lower
    ) ||
    /(?:মনটা খুব খারাপ|মন খারাপ|কিছুই ভালো লাগছে না|খুব একা লাগছে|কান্না পাচ্ছে)/.test(raw)
  ) {
    return {
      primaryEmotion: 'sadness',
      intensity: 0.85,
      intent: 'seeking_comfort',
      confidence: 0.95,
      contextSummary: 'user venting personal sadness and loneliness',
      responseStrategy: 'acknowledge_and_listen',
      isUncertain: false,
      detectedLanguage: detectedLang,
    };
  }

  // 17. Stress & Pera
  if (
    /\b(?:jhamela|pera|khub pera|stress|stressed|pressure|anxious|nervous|interbhiw|interview|exam tension)\b/i.test(
      lower
    ) ||
    /(?:ঝামেলা|প্যারা|খুব প্যারা|নার্ভাস|ইন্টারভিউ|পরীক্ষা|টেনশন)/.test(raw)
  ) {
    return {
      primaryEmotion: 'stress',
      intensity: 0.85,
      intent: 'seeking_comfort',
      confidence: 0.9,
      contextSummary: 'work/study stress',
      responseStrategy: 'soothing_reassurance',
      isUncertain: false,
      detectedLanguage: detectedLang,
    };
  }

  // 18. Happiness & Joy
  if (
    /\b(?:ami onek happy|onek happy|happy ajke|so happy|promotion|celebrate|great news|excited)\b/i.test(
      lower
    ) ||
    /(?:প্রোমোশন পেয়েছি|অনেক খুশি|খুব খুশি|আনন্দ লাগছে)/.test(raw)
  ) {
    return {
      primaryEmotion: 'happiness',
      intensity: 0.9,
      intent: 'sharing_joy',
      confidence: 0.95,
      contextSummary: 'user sharing joyful news or promotion',
      responseStrategy: 'share_enthusiasm',
      isUncertain: false,
      detectedLanguage: detectedLang,
    };
  }

  // 19. Simple Greeting
  if (/\b(?:hello|hi|hey|good morning|good night|kemon acho|ki khobor)\b/i.test(lower)) {
    return {
      primaryEmotion: 'neutral',
      intensity: 0.6,
      intent: 'greeting',
      confidence: 0.9,
      contextSummary: 'conversational greeting',
      responseStrategy: 'warm_greeting',
      isUncertain: isAmbiguous,
      detectedLanguage: detectedLang,
    };
  }

  // Default fallback
  return {
    primaryEmotion: 'neutral',
    intensity: 0.5,
    intent: 'general_chat',
    confidence: 0.8,
    contextSummary: 'general conversation',
    responseStrategy: 'conversational_flow',
    isUncertain: isAmbiguous,
    detectedLanguage: detectedLang,
  };
}

export class EmotionIntentAnalyzer {
  public analyze(
    text: string,
    recentTopics?: string[],
    lastAssistantMessage?: string
  ): EmotionIntentAnalysis {
    return analyzeEmotionAndIntent(text, recentTopics, lastAssistantMessage);
  }
}
