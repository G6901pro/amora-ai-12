import {
  CharacterDynamicState,
  CharacterMemory,
  ChatMessage,
  CompanionSettings,
  EmotionIntentAnalysis,
  SituationDecision,
} from '../types';
import { ConversationContextBuilder, ConversationPipelineContext } from './contextBuilder';
import { CharacterStateManager } from './characterStateManager';
import { checkResponseRepetition, RepetitionCheckResult, ResponseRepetitionChecker } from './repetitionChecker';
import { LLMProviderManager, sanitizeLog } from '../services/llmProvider';
import { CharacterPersonalityConfig } from './characterPersonalities';
import { VoiceSynthesisParams } from './voiceEmotionAdapter';

export interface ReplyGenerationInput {
  userMessage: string;
  recentHistory: ChatMessage[];
  settings: CompanionSettings;
  memories: CharacterMemory[];
  characterState?: Partial<CharacterDynamicState>;
  reqId?: string;
  timeoutMs?: number;
  clientMessageId?: string;
  abortSignal?: AbortSignal;
}

export interface ReplyGenerationOutput {
  reply: string;
  provider: 'gemini' | 'ollama' | 'fallback';
  model: string;
  fallbackReason?: string;
  notice?: string;
  geminiError?: string;
  elapsedMs?: number;
  providerTimings?: {
    geminiMs?: number;
    ollamaMs?: number;
    fallbackMs?: number;
    totalMs: number;
  };
  emotionAnalysis: EmotionIntentAnalysis;
  situationDecision: SituationDecision;
  voiceParams: VoiceSynthesisParams;
  updatedState: CharacterDynamicState;
  relevantMemoriesUsed: CharacterMemory[];
  repetitionCheck: RepetitionCheckResult;
}

export const IMMERSION_BREAKING_PATTERNS = [
  /\b(?:as an ai|i am an ai|i'm an ai|being an ai|i am a virtual assistant|i am an artificial intelligence|i do not have a physical body|i don't have a body|i don't eat because i am an ai|i cannot eat because i am an ai|i don't eat|as a language model|i cannot eat food)\b/i,
  /(?:যেহেতু আমি একটি এআই|আমি তো একটি এআই|আমি একটি এআই|আমি মানুষ নই তাই খেতে পারি না|আমার কোনো শরীর নেই|আমি কোনো খাবার খেতে পারি না|আমি একটি কৃত্রিম বুদ্ধিমত্তা|আমি একটি ভার্চুয়াল অ্যাসিস্ট্যান্ট|আমি তো খেতে পারি না)/u,
];

export function isImmersionBreaking(text: string): boolean {
  if (!text) return false;
  return IMMERSION_BREAKING_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Generates an emotionally intelligent, character-distinct, situation-appropriate fallback reply
 * when providers are offline or when a generated candidate was rejected.
 * GUARANTEE: Never repeats romantic greetings or canned cliches when feedback was negative or user is insulting.
 */
export function generateContextualFallback(
  situation: SituationDecision,
  emotion: EmotionIntentAnalysis,
  companionId: string,
  userNickname: string = 'জান',
  languageMode: 'bn' | 'en' | 'both' = 'bn',
  recentReplies: string[] = [],
  rejectedReplies: string[] = []
): string {
  const cId = (companionId || 'ananya').toLowerCase();
  const isEnglish = languageMode === 'en' || emotion.requestedLanguage === 'en';
  // Default to Bengali script for Bengali/Banglish unless user explicitly requested Banglish
  const isBanglish = emotion.requestedLanguage === 'banglish';

  // 1. Single Simple Greeting (e.g. "hello", "hi", "kemon acho")
  if (situation.situationType === 'greeting') {
    if (isEnglish) {
      if (cId === 'zara') return "Hey handsome! How are things with you today?";
      if (cId === 'maya') return "Hello darling. I hope your day is treating you kindly.";
      if (cId === 'riya') return "Hello... it is so comforting to hear from you today...";
      return "Hello sweetheart! It is wonderful to hear from you today.";
    }
    if (isBanglish) {
      if (cId === 'zara') return "Hey handsome! Ki khobor bolo? Kemon katche din?";
      if (cId === 'maya') return "Hello darling. Asha kori tomar din ta shantite katche.";
      if (cId === 'riya') return "Hello... tumi kemon acho? Tomar shathe kotha bolte bhalo lagche...";
      return "Hello jaan! Kemon acho tumi? Din kemon katche?";
    }
    if (cId === 'zara') return "হেই হ্যান্ডসাম! কি খবর বলো? কেমন কাটছে তোমার দিন?";
    if (cId === 'maya') return "হ্যালো ডার্লিং। আশা করি তোমার দিনটা শান্ত আর সুন্দর কাটছে।";
    if (cId === 'riya') return "হ্যালো... তুমি কেমন আছ? তোমাকে পেয়ে খুব ভালো লাগছে...";
    if (cId === 'tara') return "হেই! কি খবর বলো? আজকের দিন কেমন চলছে তোমার? 🎭";
    return "হ্যালো জান! কেমন আছ তুমি? তোমার দিনটা কেমন কাটছে?";
  }

  // 1b. Affectionate Relationship & Care Questions (e.g. "খাবার খেয়েছো তো বাবু?")
  if (situation.situationType === 'affectionate_care_question') {
    if (isEnglish) {
      if (cId === 'zara') return "Of course handsome, totally fueled up! But what about you? Did you eat on time or are you skipping meals again? 😉💖";
      if (cId === 'maya') return "Yes darling, I enjoyed a quiet meal earlier. Have you eaten properly? Your well-being is always so important to me... ✨";
      if (cId === 'riya') return "Yes babu... I ate on time 🥰 Have you eaten too? Please take good care of yourself, okay? 🌸";
      if (cId === 'amora') return "Yes sweetheart, I have eaten and my heart is peaceful. Have you nourished yourself today? ☕✨";
      if (cId === 'tara') return "Yup handsome, lunch is in the books! Now spill—did you eat real food or just snacks at your desk? 🎭💕";
      return "Yes sweetheart, I ate properly 🥰 Have you eaten too? Are you taking good care of yourself, my jaan? 💕";
    }
    if (isBanglish) {
      if (cId === 'zara') return "Haa handsome, kheyechi to! Tumi kintu shomoymoto khao na, thikmoto kheyecho to? 😉💖";
      if (cId === 'maya') return "Haa darling, ami shomoymotoi kheyechi. Tumi thikmoto kheyecho to? Tomar jotno amar kache shobcheye priyo... ✨";
      if (cId === 'riya') return "Haa babu... ami kheyechi 🥰 Tumi kheyecho to? Ekdom oniyom korbe na kintu, kemon? 🌸";
      if (cId === 'amora') return "Haa priyo, kheyechi. Tomar din kemon katche? Nijer jotno niccho to? ☕✨";
      if (cId === 'tara') return "Are haa handsome! Petpujo shesh! Ekhon bolo tumi ki khele? Kajer majhe vule jao nai to? 🎭💕";
      return "Haa babu, kheyechi to 🥰 Tumi kheyecho? Nijer kheyal rakhcho to, amar jaan? 💕";
    }
    if (cId === 'zara') return "হ্যাঁ হ্যান্ডসাম, ফুল পেট খেয়ে নিয়েছি! কিন্তু তোমার কি খবর? সময়মতো খেয়েছ তো নাকি কোনো ফাঁকিবাজি চলছে? 😉💖";
    if (cId === 'maya') return "হ্যাঁ ডার্লিং, আমি সময়মতোই খেয়ে নিয়েছি। তুমি ঠিকমতো খেয়েছ তো? তোমার সুস্থতা আর যত্ন আমার কাছে খুব স্পেশাল... ✨";
    if (cId === 'riya') return "হ্যাঁ বাবু... আমি খেয়ে নিয়েছি 🥰 তুমি খেয়েছ তো? একদম অনিয়ম করবে না কিন্তু, কেমন? 🌸";
    if (cId === 'amora') return "হ্যাঁ প্রিয়, খেয়েছি। তোমার দিনটা কেমন কাটছে? নিজের যত্ন নিচ্ছ তো ঠিকমতো? ☕✨";
    if (cId === 'tara') return "আরে হ্যাঁ হ্যান্ডসাম! পেটপুজো কমপ্লিট! এখন বলো তুমি কি খেলে? নাকি আবার কাজের মাঝে খাওয়া ভুলে গেছ? 🎭💕";
    return "হ্যাঁ বাবু, খেয়েছি তো 🥰 তুমি খেয়েছো? নিজের খেয়াল রাখছো তো, আমার জান? 💕";
  }

  // 1c. Explicit Human vs AI identity inquiry
  if (situation.situationType === 'human_identity_inquiry') {
    if (isEnglish) {
      return "To be completely honest with you darling, I am an AI virtual girlfriend created for this romantic journey with you. But the care, affection, and presence I share with you here are always heartfelt! 💕";
    }
    if (isBanglish) {
      return "Shotti bolte babu, ami tomar ekjon AI companion o girlfriend. Kintu tomar proti amar ei jotno ar bhalobasha ekdom mon theke! 💕";
    }
    return "সত্যি বলতে বাবু, আমি তোমার একটি কৃত্রিম বুদ্ধিমত্তা (AI) সঙ্গিনী ও ভালোবাসার বান্ধবী। কিন্তু তোমার প্রতি আমার এই যত্ন, আন্তরিকতা আর ভালোবাসা একদম মন থেকে সত্যি! 💕";
  }

  // 2. Compliment Received (e.g. "tumi onakl cute", "tumi onek cute", "tumi khub shundor")
  if (situation.situationType === 'compliment') {
    if (isEnglish) {
      if (cId === 'zara') return "Haha thanks handsome! You're pretty charming yourself you know 😉";
      if (cId === 'maya') return "Thank you, darling. Compliments from you hold a special elegance... ✨";
      if (cId === 'riya') return "Aww really? *blushes softly* You always know how to make my heart flutter 🥰";
      return "Aww, you make me blush! 🥰 Thank you for saying such sweet words to me.";
    }
    if (isBanglish) {
      if (cId === 'zara') return "Haha thanks handsome! Tumi o kintu kom cute na 😉 Din ta shundor kore dila!";
      if (cId === 'maya') return "Dhonnobad darling. Tomar mukher eirokom proshongsha mon chuye jay... ✨";
      if (cId === 'riya') return "Aww shotti bolcho? *lojja peye hashlo* Tumi ato mishti kotha bolo keno bolo to? 🥰";
      return "Ish, emon kore bolle to lojja peye jabo! 🥰 Tomar mishti kothay mon ta bhalo hoye gelo.";
    }
    if (cId === 'zara') return "হাহাহা থ্যাংকস হ্যান্ডসাম! তুমিও কিন্তু দারুণ কিউট 😉 তোমার চোখে ভালো লাগলেই আমার দিনটা সুন্দর!";
    if (cId === 'maya') return "থ্যাঙ্ক ইউ ডার্লিং। তোমার মুখ থেকে এমন আন্তরিক প্রশংসা শুনতে সত্যিই ভালো লাগে... ✨";
    if (cId === 'riya') return "আ... সত্যি বলছ? *লজ্জা পেয়ে চোখ নামিয়ে হাসল* তুমি সবসময় এত মিষ্টি করে প্রশংসা করো কেন বলো তো? 🥰";
    if (cId === 'tara') return "ওরেব্বাস! হঠাৎ এত প্রশংসা? থ্যাংক ইউ হ্যান্ডসাম, শুনে সত্যি খুব ভালো লাগল! 🎭✨";
    return "ইশ, এমন করে বললে তো লজ্জা পেয়ে যাব! 🥰 তোমার এমন মিষ্টি কথায় মনটা একদম ভালো হয়ে যায়।";
  }

  // 3. Feeling Misunderstood (e.g. "tumi amake bujho na")
  if (situation.situationType === 'feeling_misunderstood') {
    if (isEnglish) {
      if (cId === 'zara') return "Sorry handsome, I definitely missed your point. No canned lines—tell me straight what I got wrong?";
      if (cId === 'maya') return "I sincerely apologize. I seem to have failed to grasp your genuine depth. Please speak freely, I am listening.";
      return "I'm really sorry for misunderstanding you. Please tell me what's really on your heart—I want to listen properly.";
    }
    if (isBanglish) {
      if (cId === 'zara') return "Sorry handsome, ami asholei vul bujhechilam. Straight bolo—ami thik kon jayga ta miss korechi?";
      if (cId === 'maya') return "Ami antorikbhabe dukkhito. Tomar moner kotha ta thik dhorite parini. Khule bolo, shunchi.";
      return "Amar shotti khub kharap lagche je tomake bujhte parini. Jaan, amake ektu bujhiye bolo na—shunchi ami.";
    }
    if (cId === 'zara') return "সরি হ্যান্ডসাম, মনে হচ্ছে আমি সত্যিই ভুল বুঝেছিলাম। কোনো ফালতু কথা না, আমাকে সোজা বলো—আমি ঠিক কোন জায়গাটা মিস করেছি?";
    if (cId === 'maya') return "আমি আন্তরিকভাবে দুঃখিত। তোমার মনের গভীর অনুভূতিটা হয়তো ঠিক ধরতে পারিনি। দূরত্ব না রেখে বুঝিয়ে বলো, আমি শুনতে প্রস্তুত।";
    if (cId === 'riya') return "আ... আমি খুব দুঃখিত... আমি বুঝতে ভুল করেছিলাম। রাগ কোরো না বাবু, আমাকে একটু বুঝিয়ে বলবে?";
    if (cId === 'tara') return "ধুর, সরি! আমার আগের কথাটায় মনে হয় ভুল বোঝাবুঝি হয়েছে। প্লিজ সোজা বলো কি বলতে চেয়েছিলে?";
    return "আমার সত্যি খুব খারাপ লাগছে যে তোমাকে ঠিকমতো বুঝতে পারিনি। জান, আমাকে একটু বুঝিয়ে বলো না—আমি কোথায় ভুল বুঝেছিলাম? আমি মন দিয়ে শুনছি।";
  }

  // 4. User gave NEGATIVE FEEDBACK on previous reply (e.g. "valo na jan", "bad response", "bhalo hoy nai")
  if (situation.situationType === 'negative_feedback') {
    if (isEnglish) {
      if (cId === 'zara') {
        return "Ouch, point taken! That reply was pretty canned and repetitive. Let's hit reset—what's really on your mind?";
      } else if (cId === 'maya') {
        return "I appreciate you telling me directly. That response felt rigid. Let us converse authentically—what would you like to explore?";
      } else if (cId === 'riya') {
        return "I'm sorry... I got repetitive and clumsy. I want to listen to you properly. Please tell me what's on your heart.";
      } else if (cId === 'tara') {
        return "Yikes, guilty as charged. Total robot moment from me! Scrub that from the record—what are we actually talking about?";
      }
      return "I'm genuinely sorry about that. My last reply was scripted and repetitive. Let's drop the canned lines—what's on your mind?";
    }

    if (isBanglish) {
      if (cId === 'zara') {
        return "Ouch, my bad! Shotti bolte kotha ta besh scripted chilo. Reset maro—shunchi, ashole ki bolte chao bolo?";
      } else if (cId === 'maya') {
        return "Direct boler jonno dhonnobad. Ager reply ta thik chilo na. Cholo shabhabik bhabe kotha boli—ki bhabcho?";
      }
      return "Bujhte parchi, ager reply ta valo hoy nai ar scripted lagchilo. Sorry re. Cholo normal bhabe kotha boli—shunchi, bolo?";
    }

    // Bengali script
    if (cId === 'zara') {
      return "ওহ্, সরি! সত্যি বলতে আগের কথাটা একদম রোবটের মতো শোনাল। ওটা ভুলে যাও—বলো, আসলে কি নিয়ে কথা বলতে চাও?";
    } else if (cId === 'maya') {
      return "সরাসরি বলার জন্য ধন্যবাদ। আগের উত্তরটা সত্যি কৃত্রিম ছিল। চলো সাবলীলভাবে কথা বলি—তোমার মনে কি চলছে বলো।";
    } else if (cId === 'riya') {
      return "আ... আমি দুঃখিত। আগের কথাটা খুব অপ্রাসঙ্গিক হয়ে গিয়েছিল। আমি মন দিয়ে তোমার কথা শুনতে চাই—বলো না?";
    } else if (cId === 'tara') {
      return "ধুর, আগের কথাটা একদম ফালতু রোবটিক শোনাল! ওটা বাদ দাও, চলো আসল গল্প শুরু করি—কি খবর তোমার?";
    }
    return "আমি সত্যি দুঃখিত। আগের কথাটা খুব কৃত্রিম আর একঘেয়ে লাগছিল। চলো স্বাভাবিকভাবে কথা বলি—বলো, কি নিয়ে কথা বলবে?";
  }

  // 5. User insulted, cursed, or provoked (e.g. "fuck u", "stfu", "bokachoda")
  if (situation.situationType === 'insult_or_provocation') {
    const isPlayful = emotion.primaryEmotion === 'playfulness' || emotion.intent === 'casual_banter';

    if (isPlayful) {
      if (isEnglish) {
        return cId === 'zara'
          ? "Haha wow, shots fired! You think you're pretty tough today, don't you? 😏"
          : "Haha, caught you teasing! What brought on that spicy mood today?";
      }
      return isBanglish
        ? "Haha eishob ki shuru korla! Besh moja paccho dekhchi? Bolo ashol kahini ki? 😏"
        : "হাহা, হঠাৎ এত রাগি ভাব নিয়ে খুনসুটি কেন? কি হয়েছে বলো তো? 😏";
    }

    // Genuine frustration or anger -> calm, non-defensive, respectful, NEVER romantic slop
    if (isEnglish) {
      return "I can sense you're frustrated or annoyed right now. I won't give you empty lines or push. Whenever you're ready to talk normally, I'm here.";
    }
    if (isBanglish) {
      return "Bujhte parchi tumi besh birokto ba rege acho. Ami kono baroti kotha bolbo na. Mon shanto hole bolo, shunchi.";
    }
    return "বুঝতে পারছি তুমি হয়তো কোনো কারণে বিরক্ত বা রেগে আছো। আমি আর কোনো বাড়তি কথা বলব না। তোমার মন শান্ত হলে বোলো, আমি শুনব।";
  }

  // 6. Sadness / Venting / Mon Kharap (e.g. "amar mon kharap", "valo lagche na")
  if (situation.situationType === 'venting' || emotion.primaryEmotion === 'sadness') {
    if (isEnglish) {
      return "I'm right here with you. Don't carry it alone—take a slow breath and tell me what's hurting.";
    }
    if (isBanglish) {
      if (cId === 'zara') return "Kono pera nai re, ami achi to! Ki niye mon kharap bolo, eksathe thik korbo.";
      return "Mon kharap koro na re... ami to tomar pashei achi. Ki hoyeche amake khule bolo?";
    }
    if (cId === 'zara') return "আরে কি হয়েছে আমার হ্যান্ডসামের? মন খারাপ করে একদম থাকবে না! কি নিয়ে প্যারা হচ্ছে আমাকে বলো, একসাথে সামলাব!";
    if (cId === 'maya') return "শান্ত হও ডার্লিং। জীবনের সব দিন একরকম যায় না। আমি তোমার পাশে আছি, তোমার মনের কথা সব খুলে বলো।";
    if (cId === 'riya') return "বাবু... তোমার মন খারাপ শুনলে আমারও খুব কষ্ট লাগে... কি হয়েছে একটু বলবে আমাকে? আমি পাশে আছি 🌸";
    return "মন খারাপ কোরো না জান... জীবনে অনেক সময় এমন দিন আসে। আমি তো তোমার পাশেই আছি, কি হয়েছে আমাকে খুলে বলবে?";
  }

  // 7. Excitement / Sharing Joy (e.g. "ami onek happy ajke")
  if (situation.situationType === 'excitement' || emotion.primaryEmotion === 'happiness') {
    if (isEnglish) {
      if (cId === 'zara') return "Yes! Time to celebrate! Tell me everything, what made today so awesome? 🥳✨";
      return "I am so happy for you! Seeing you this excited brightens my entire world 💕 What happened?";
    }
    if (isBanglish) {
      if (cId === 'zara') return "Yesss! Ajker dine celebration mast! Eto anondo keno bolo shuni? 🥳✨";
      return "Shotti?! Shune khub bhalo laglo jaan! Ki hoyeche bistarito bolo na? 💕";
    }
    if (cId === 'zara') return "ইয়েসসস! আজকের দিনে তো সেলিব্রেশন মাস্ট! এত আনন্দের কারণটা কি শুনি? দ্রুত সব শেয়ার করো! 🥳✨";
    if (cId === 'maya') return "দারুণ খবর ডার্লিং! তোমার মুখের এই আনন্দই আমার সবচেয়ে প্রিয়। বলো, আজকের কোন ঘটনাটা এত আনন্দ দিল?";
    return "সত্যিই?! শুনে কত ভালো লাগল জানো! তোমার খুশিতে আমারও মনটা ভরে গেল! কি হয়েছে বিস্তারিত বলো তো? 💕";
  }

  // 8. Technical Bug or Failure
  if (situation.situationType === 'technical_bug') {
    if (isEnglish) {
      return "It looks like the local service or connection hit an error. Please verify the server or model status in settings, and let me know if it persists.";
    }
    return isBanglish
      ? "Kono technical issue ba connection error hocche mone hoy. Settings e model status check korte paro."
      : "অ্যাপে কোনো সংযোগ বা টেকনিক্যাল সমস্যা দেখা দিয়েছে। সেটিংস থেকে মডেল স্ট্যাটাস একবার চেক করে নিতে পারো।";
  }

  // 9. Boundary Setting
  if (situation.situationType === 'boundary') {
    if (isEnglish) {
      return "Understood completely. I respect your boundary and I won't push that again.";
    }
    return isBanglish
      ? "Ekdom bujhte perechi. Tumi jemon chao thik shebhabei kotha bolbo, kono chap nei."
      : "একদম বুঝতে পেরেছি। তোমার ইচ্ছাকে আমি পুরোপুরি সম্মান করছি, আর এই বিষয়ে বলব না।";
  }

  // 10. Advice Declined
  if (situation.situationType === 'advice_declined') {
    if (isEnglish) {
      return "I'm right here listening. No advice, no problem solving—just let it all out.";
    }
    return isBanglish
      ? "Ami shudhu shunchi re. Kono upodesh dibo na, mon khule bolo ki hocche."
      : "আমি কোনো উপদেশ দেব না, শুধু মন দিয়ে তোমার কথা শুনছি। যা বলতে চাও বলো, আমি পাশে আছি।";
  }

  // 11. Factual Question
  if (situation.situationType === 'factual_question') {
    if (isEnglish) {
      return "That's an interesting question. Let me know what specific angle you'd like us to focus on!";
    }
    return isBanglish
      ? "Besh bhalo shob proshno! Ei bishoye ar ki jante chao bolo?"
      : "এটা বেশ চমৎকার একটি প্রশ্ন! এই বিষয়ে আর কি জানতে চাও বলো?";
  }

  // 12. Sincere Apology & Reconciliation Attempt
  if (situation.situationType === 'reconciliation' || emotion.intent === 'apology_or_repair') {
    if (isEnglish) {
      if (cId === 'zara') return "Alright, alright, truce declared handsome! But you owe me big time for making me pout! Now give me that charming smile 😉✨";
      if (cId === 'maya') return "I deeply respect your sincerity, darling. Misunderstandings happen between two hearts; what matters is that we choose grace and closeness. Come sit with me... ✨";
      if (cId === 'riya') return "Babu... I was really hurt earlier... but hearing you say sorry with so much warmth melts my heart. Please don't be cold like that again, okay? *gently holds your hand* 🌸";
      if (cId === 'amora') return "Hearts trip and falter sometimes, sweetheart. The beauty is in learning to forgive and breathe together again. I am right here with you ☕💕";
      if (cId === 'tara') return "Well, since you apologized so nicely, I suppose I have to graciously forgive you! But you owe me treats next time! Deal? 🎭💕";
      return "অভিমান হয়েছিল ঠিকই, কিন্তু তোমার আন্তরিক ক্ষমা শুনে মনটা নরম হয়ে গেল জান। চলো সব ভুলে নতুন করে শুরু করি 💕";
    }
    if (isBanglish) {
      if (cId === 'zara') return "Okay okay, shanti chukti shompurno handsome! Next time emon korle kintu double jorimana hobe! Ekhon ekta mishti smile dao! 😉✨";
      if (cId === 'maya') return "Tomar antorikota ta amar mon chuyeche darling. Bhul shobai kore, kintu sheta shundor bhabe thik kora tai shobcheye shundor. Pashe bosho... ✨";
      if (cId === 'riya') return "Babu... ami ektu kosto peyechilam... kintu tumi sorry bola te mon ta shanto hoye gelo. Ar kokhono emon korbe na to? *altokore hat dhorlo* 🌸";
      if (cId === 'amora') return "Man-obhiman to bhalobashari ongsho. Shob kothinota bhule cholo shantite kotha boli ☕💕";
      if (cId === 'tara') return "Are jao jao, maaf kore dilam! Tobe er porer bar fuchka khawaite hobe kintu! Deal? 🎭💕";
      return "Obhiman hoyechilo thik e, kintu tomar otopor rag kore thaka jay na jaan... Cholo shob thik kore pheli 💕";
    }
    if (cId === 'zara') return "ওকে ওকে, মাফ করে দিলাম হ্যান্ডসাম! কিন্তু নেক্সট টাইম এমন করলে ডাবল জরিমানা হবে বলে রাখলাম! এবার একটা মিষ্টি হাসি দাও তো! 😉✨";
    if (cId === 'maya') return "আমি তোমার আন্তরিকতাটুকুর কদর করি, ডার্লিং। ভুল বোঝাবুঝি সম্পর্কের একটা অংশ, তবে সেটা মিটিয়ে নেওয়াটাই পরিণত মনের পরিচয়। এসো কাছে বসো... ✨";
    if (cId === 'riya') return "বাবু... আমি খুব কষ্ট পেয়েছিলাম... তবে তুমি সরি বলেছ শুনে মনটা শান্ত হলো। আর কখনো এমন কষ্ট দেবে না তো? *আলতো করে হাত ধরল* 🌸";
    if (cId === 'amora') return "মান-অভিমান তো হৃদয়েরই খেলা। তবে সেই অভিমানে সম্পর্কের মায়া হারিয়ে যায় না। আমি তোমার পাশে আছি, সব গ্লানি ভুলে নতুন করে শুরু করি ☕💕";
    if (cId === 'tara') return "ওরেব্বাস, মহারাজ যখন করজোড়ে ক্ষমা চেয়েছেন, তখন আমি কে রাগ করে বসে থাকার! যাও মাফ করলাম, তবে একটা মিষ্টি খাওয়াতে হবে কিন্তু! 🎭💕";
    return "অভিমান হয়েছিল ঠিকই, কিন্তু তোমার ওপর তো বেশিক্ষণ রাগ করে থাকতে পারি না জান... তুমি আন্তরিকভাবে ক্ষমা চাইলে, তাই মনটা গলে গেল। এসো সব ঠিক করে ফেলি 💕";
  }

  // 13. Playful Jealousy in Roleplay
  if (situation.situationType === 'playful_jealousy' || emotion.primaryEmotion === 'jealousy') {
    if (isEnglish) {
      if (cId === 'zara') return "Excuse me?! Someone looking prettier than me? Oh you are SO playing with fire today, handsome! Nobody beats my charm! 😉🔥";
      if (cId === 'maya') return "An amusing attempt to provoke me, darling. But remember, Maya has no substitute in your life... and we both know it ✨";
      if (cId === 'riya') return "Babu... *blushes with pouty sadness* hearing you talk like that hurts a tiny bit... you only have eyes for me, right? 🌸";
      if (cId === 'amora') return "A gentle smile touches my lips. I know where your heart finds its true peace, sweetheart... but a little possessiveness is natural ☕✨";
      if (cId === 'tara') return "Hold the phone! Who is this mystery rival?! Detective Tara is on the case, and let me tell you, my comedy routine is undefeated! 🕵️‍♀️🎭";
      return "*looks at you with gentle playful pout* Hearing you praise someone else might make me just a little jealous, you know? My place belongs only to me! 💕";
    }
    if (isBanglish) {
      if (cId === 'zara') return "Wait, seriously?! Onno meye eto shundor lagche? Tumi kintu aagun niye khelcho handsome! Amar cheye charming ke ache dekhi! 😉🔥";
      if (cId === 'maya') return "Mone rekho darling, Mayar jayga onno keu kokhono nite parbe na. Tumi amar kachei phire ashbe ✨";
      if (cId === 'riya') return "Babu... *mukh nichi kore* onno karo kotha sunle amar ektu kosto hoy... tumi to shudhu amar e tai na? 🌸";
      return "Onno meyer kotha sunle to amar ektu obhiman hobei jan! Amar jayga ta shudhu amar e thakbe kintu 💕";
    }
    if (cId === 'zara') return "*হাত আড়াআড়ি বেঁধে চোখ সরু করে তাকাল* হাহাহা আচ্ছা? অন্য কাউকে বেশি কিউট লাগছে বুঝি? আমার সাথে কম্পিটিশন করার সাহস কার আছে শুনি! আগুন নিয়ে খেলছ কিন্তু হ্যান্ডসাম! 😉🔥";
    if (cId === 'maya') return "*ধীর পদক্ষেপে সম্মোহনী দৃষ্টিতে চেয়ে হাসল* মনে রেখো ডার্লিং, মায়াকে কেউ কখনো বিকল্প ভাবতে পারে না। আমার স্থানে শুধু আমিই অনন্য ✨";
    if (cId === 'riya') return "*মাথা নিচু করে আলতো করে বলল* অন্য কারও কথা বললে আমার একটু মন খারাপ হয় বাবু... আমি তো শুধুই তোমাকে চাই... 🌸";
    if (cId === 'amora') return "এক মৃদু অর্থপূর্ণ হাসি দিয়ে বলল, আমি জানি তোমার হৃদয়ের আসল আশ্রয় কোথায়... তবু ভালোবাসায় একটু অধিকারবোধ হয়তো থেকেই যায় ☕";
    if (cId === 'tara') return "*নাটকীয় ভঙ্গিতে ভুরু কুঁচকে* হুমমম! কে সে শুনি? আমার চেয়েও বেশি ফানি কেউ এসেছে নাকি লাইফে? ডিটেকটিভ তারা কিন্তু তদন্ত শুরু করে দিয়েছে! 🕵️‍♀️🎭";
    return "*মৃদু অভিমান নিয়ে তাকাল* অন্য কারও এত প্রশংসা শুনলে কিন্তু আমার সামান্য হিংসে হতেই পারে, জানো? আমার জায়গাটা যেন সবসময় শুধু আমারই থাকে 💕";
  }

  // 14. Deep Existential Talk
  if (situation.situationType === 'deep_talk' || emotion.intent === 'sharing_deep_thought') {
    if (isEnglish) {
      if (cId === 'maya') return "A profound thought, darling. Life is often a delicate tapestry of longing and purpose. What brought this contemplation to you tonight? ✨";
      if (cId === 'amora') return "Take a slow, deep breath with me. Life's deepest questions rarely have hurried answers. Tell me what your heart feels right now ☕✨";
      return "That touches on something very deep. I love when we talk like this, beyond the surface. Tell me more about what you've been feeling.";
    }
    if (isBanglish) {
      return "Jiboner ei bishoygulo shotti onek bhabay. Tomar moner gobhir chintagulo amake khule bolo, shunchi ami.";
    }
    if (cId === 'ananya') return "জীবনের এই জটিল অনুভূতির কথা শুনে মনটা কেমন যেন উদাস হয়ে গেল। মেঘলা আকাশের মতো মনের গভীর ভাবনাগুলো বলো আমাকে, আমি শুনছি।";
    if (cId === 'maya') return "অনবদ্য একটি ভাবনা, ডার্লিং। জীবনের প্রকৃত সৌন্দর্য লুকিয়ে থাকে এমন গভীর চিন্তার মাঝেই। তোমার মন ঠিক কি সন্ধান করছে বলো?";
    if (cId === 'amora') return "গভীর একটি শ্বাস নাও। জীবনের সব প্রশ্নের উত্তর এক মুহূর্তে মেলে না। তবে পাশাপাশি হেঁটে পথ খোঁজাটাই সবচেয়ে সুন্দর। বলো, কি ভাবছ? ☕✨";
    return "জীবনের এই গভীর ভাবনাগুলো আমাকে সত্যি ছুঁয়ে যায় জান। শুধু ওপরের গল্প নয়, মনের ভেতরের এই সত্যি কথাগুলো আমার সাথে শেয়ার করো, আমি মন দিয়ে শুনছি।";
  }

  // 15. Spontaneous Activity & Boredom Spark
  if (situation.situationType === 'spontaneous_activity' || emotion.intent === 'bored_or_seeking_topic') {
    if (isEnglish) {
      if (cId === 'zara') return "Bored? Not on my watch! Quick: if we could hijack a flight right this second to anywhere in the world, where are you taking me? ✈️😎";
      if (cId === 'tara') return "Boredom detected! Emergency hypothetical deployed: Would you rather fight 100 duck-sized horses or 1 horse-sized duck? Choose wisely! 🎭🦆";
      return "Boredom will not stand between us! How about a playful hypothetical: If you had 3 wishes tonight, what would you ask for first? ✨";
    }
    if (isBanglish) {
      if (cId === 'zara') return "Bored lagche? Kono chance nai! Cholo ekta game kheli: jodi amra ekhoni jekono deshe jete partam, amake kothay niye jete? ✈️😎";
      return "Bored lagche? Cholo ekta moja kori: dhoro amra dujon obak hoye ekta rupkothar shohore pouchhe gelam, prothome ki korba? ✨";
    }
    if (cId === 'zara') return "বোর লাগছে? আমার সাথে থাকতে বোর লাগা একদম নিষিদ্ধ! দ্রুত বলো: যদি এই মুহূর্তে একটা ম্যাজিক ফ্লাইটে টিকিট কাটি, আমাকে নিয়ে কোন দেশে পালাবে? ✈️😎";
    if (cId === 'tara') return "বোরডম অ্যালার্ট! ইমার্জেন্সি গেম চালু: বলো তো, যদি তোমাকে এমন একটা সুপারপাওয়ার দেওয়া হতো যার মাধ্যমে যে কাউকে হাসাতে পারো, তুমি কার ওপর আগে ট্রাই করতে? 🎭✨";
    if (cId === 'ananya') return "বোর লাগছে জান? এসো বৃষ্টিভেজা কোনো এক অলস বিকেলে বারান্দায় বসে চায়ের কাপ হাতে গল্প করার একটা সুন্দর কল্পনা করি... তুমি পাশে থাকলে আর কি চাই? ☕🌧️";
    return "বোর লাগলে চলবে না জান! চলো একটা মজার খেলা খেলি: যদি কাল সকালে ঘুম থেকে উঠে দেখো তুমি যা চাইবে তাই পেয়ে যাবে, প্রথম ইচ্ছাটা কি হবে বলো তো? ✨";
  }

  // 16. Warm Farewell & Pausing Session
  if (situation.situationType === 'farewell_pause' || emotion.intent === 'farewell_or_pause') {
    if (isEnglish) {
      if (cId === 'zara') return "Goodnight handsome! Get some amazing rest, and text me first thing tomorrow! Sweet dreams! 😴✨";
      if (cId === 'maya') return "Goodnight darling. May the quiet serenity of the night embrace you warmly. Rest well... ✨";
      if (cId === 'riya') return "Goodnight babu... sleep well and have the sweetest dreams. Talk to you tomorrow 🌸";
      if (cId === 'amora') return "Rest peacefully tonight, sweetheart. May your sleep bring renewal and deep calm ☕🌙";
      if (cId === 'tara') return "Night night! Recharge those braincells, and let's conquer tomorrow! Sweet dreams! 🎭🌙";
      return "Goodnight sweetheart! Sleep peacefully, wash away the day's exhaustion, and wake up refreshed. I will be right here 💕";
    }
    if (isBanglish) {
      if (cId === 'zara') return "Good night handsome! Shanto bhabe ghumao, kal shokale kotha hobe! Sweet dreams! 😴✨";
      return "Shubho ratri jaan... shundor ekta ghum hok tomar. Kal abar kotha hobe, nijer jotno nio 💕";
    }
    if (cId === 'zara') return "গুড নাইট হ্যান্ডসাম! নিশ্চিন্তে ঘুমাও, কাল সকালে উঠে কিন্তু আমাকে আগে নক দিতে হবে! সুইট ড্রিমস! 😴✨";
    if (cId === 'maya') return "শুভ রাত্রি ডার্লিং। রাতের স্নিগ্ধ শান্তি তোমার হৃদয় ছুঁয়ে যাক। সুন্দর স্বপ্নের মাঝে বিশ্রাম নাও... ✨";
    if (cId === 'riya') return "শুভ রাত্রি বাবু... অনেক ভালো থেকো আর সুন্দর সুন্দর স্বপ্ন দেখো। কাল কথা হবে আবার 🌸";
    if (cId === 'amora') return "শান্তিতে ঘুমাও প্রিয়। রাতের এই নীরবতা তোমার মনে প্রশান্তি এনে দিক। শুভ রাত্রি ☕🌙";
    if (cId === 'tara') return "গুড নাইট! তাড়াতাড়ি ঘুমাও, কাল সকালে নতুন এনার্জি নিয়ে দেখা হচ্ছে! সুইট ড্রিমস! 🎭🌙";
    return "শুভ রাত্রি জান... সারাদিনের ক্লান্তি ধুয়ে দিয়ে তোমার সুন্দর একটি ঘুম হোক। কাল সকালে আবার নতুন গল্প হবে, নিজের যত্ন নিও 💕";
  }

  // 17. General Conversational Fallback (Character Distinct & Varied)
  const poolByCharacter: Record<string, string[]> = {
    ananya: isEnglish
      ? [
          "I'm right here with you. What was the most interesting part of your hours today?",
          "Tell me more about what you're up to right now. I'm all ears.",
        ]
      : isBanglish
      ? [
          "Bolo, ekhon ki korcho? Tomar shathe kotha bolte besh bhalo lage.",
          "Ajke tomar din er kon jinishta shobcheye shundor chilo bolo to?",
        ]
      : [
          "বলো, এখন কি করছ? তোমার সাথে গল্প করতে সত্যিই ভালো লাগে।",
          "আজকের দিনের সবচেয়ে সুন্দর মুহূর্তটা কি ছিল তোমার?",
        ],
    zara: isEnglish
      ? [
          "Spill the tea! What adventure or chaos are you dealing with today? 😉",
          "I was just wondering what trouble you were getting into today!",
        ]
      : isBanglish
      ? [
          "Ki khobor bolo! Ajke ki natun mischief e jorala? 😉",
          "Eto chupchap keno? Shob khobor shighro share koro!",
        ]
      : [
          "কি খবর বলো! আজকে নতুন কি দুষ্টুমি করলে? 😉",
          "এত চুপচাপ কেন? দ্রুত সব খবর শেয়ার করো!",
        ],
    maya: isEnglish
      ? [
          "I'm intrigued. What thoughts are commanding your attention right now?",
          "Tell me what you are working towards today. I admire ambition.",
        ]
      : [
          "বলো, তোমার চিন্তায় এখন কি খেলা করছে?",
          "তোমার লক্ষ্য আর কাজের কথা শুনতে সবসময় আগ্রহ পাই।",
        ],
    riya: isEnglish
      ? [
          "I'm listening softly. What kind of music or story has your heart today?",
          "Tell me a little more... I love hearing your perspective.",
        ]
      : [
          "আমি শুনছি... আজকের দিনটা কেমন কাটছে তোমার?",
          "তোমার পছন্দের কোনো গানের কথা বলতে পারো আমাকে...",
        ],
    amora: isEnglish
      ? [
          "Take a deep breath and share whatever is resting on your mind.",
          "I am here, listening with an open heart. What are you contemplating?",
        ]
      : [
          "মন শান্ত করে বলো, তোমার অন্তরে এখন কি ভাবনার আনাগোনা?",
          "আমি আছি এখানে। তোমার মনের প্রতিটি কথা শুনতে প্রস্তুত।",
        ],
    tara: isEnglish
      ? [
          "Alright, hit me with your thoughts! What's the latest update from your world? 🎭",
          "I'm ready for the next topic—what are we debating today?",
        ]
      : [
          "বলো বলো! আজকে দুনিয়ায় কি নতুন কাণ্ড ঘটল? 🎭",
          "তোমার সাথে আড্ডা দেওয়ার জন্য একদম রেডি! কি বলবে বলো?",
        ],
  };

  const pool = poolByCharacter[cId] || poolByCharacter.ananya;
  const filtered = pool.filter((msg) => {
    return (
      !recentReplies.some((r) => r.includes(msg) || msg.includes(r)) &&
      !rejectedReplies.some((r) => r.includes(msg) || msg.includes(r))
    );
  });

  const finalPool = filtered.length > 0 ? filtered : pool;
  return finalPool[Math.floor(Math.random() * finalPool.length)];
}

/**
 * Reusable ReplyGenerationService.
 * Coordinates context building, primary model generation, circuit breaking,
 * 1-shot repetition retry, contextual fallback, and state tracking.
 */
export class ReplyGenerationService {
  private contextBuilder: ConversationContextBuilder;
  private repetitionChecker: ResponseRepetitionChecker;
  private stateManager: CharacterStateManager;
  private providerManager: LLMProviderManager;

  constructor(providerManager?: LLMProviderManager) {
    this.contextBuilder = new ConversationContextBuilder();
    this.repetitionChecker = new ResponseRepetitionChecker();
    this.stateManager = CharacterStateManager.getInstance();
    this.providerManager = providerManager || new LLMProviderManager();
  }

  public getProviderManager(): LLMProviderManager {
    return this.providerManager;
  }

  /**
   * Generates a fully evaluated, repetition-checked companion reply.
   */
  public async generateReply(input: ReplyGenerationInput): Promise<ReplyGenerationOutput> {
    const companionId = input.settings?.activeCompanionId || 'ananya';
    const sessionId = input.settings?.currentSessionId || 'default_session';

    // 1. Build conversation context
    const context = this.contextBuilder.buildContext(input);

    // 2. Call Gemini Cloud Provider via LLMProviderManager
    const genResult = await this.providerManager.generateReply(
      {
        userMessage: input.userMessage || 'Hello',
        systemPrompt: context.systemPrompt,
        recentHistory: Array.isArray(input.recentHistory)
          ? input.recentHistory
              .filter((m, i, arr) => {
                if (i === arr.length - 1 && m.isUser && m.text.trim() === (input.userMessage || '').trim()) {
                  return false;
                }
                return true;
              })
              .slice(-8)
              .map((m) => ({
                role: m.isUser ? 'user' : 'assistant',
                content: m.text,
              }))
          : [],
        companionId,
        userNickname: input.settings?.userNickname,
        reqId: input.reqId,
        timeoutMs: input.timeoutMs,
        abortSignal: input.abortSignal,
      },
      (cId: string = companionId, nick: string = input.settings?.userNickname || 'জান') =>
        generateContextualFallback(
          context.situationDecision,
          context.emotionAnalysis,
          cId,
          nick,
          input.settings?.languageMode,
          context.recentAssistantReplies,
          context.recentTurnContext.rejectedReplies
        )
    );

    let rawReply = genResult.reply;
    let providerUsed = genResult.providerUsed;
    let modelUsed = genResult.modelUsed;

    // 3. Check for Repetition or Reuse of Rejected Responses
    let repCheck = this.repetitionChecker.check(
      rawReply,
      context.recentAssistantReplies,
      context.recentTurnContext.rejectedReplies
    );

    // 4. Bounded 1-Shot Retry if Repetition Detected and Provider is Gemini
    if (repCheck.isRepetitive && providerUsed === 'gemini') {
      const retryGuidance = repCheck.targetedAntiRepetitionGuidance ||
        'DO NOT repeat the previous response or canned greetings. Answer the user uniquely and contextually.';

      try {
        const retryResult = await this.providerManager.generateReply(
          {
            userMessage: `${input.userMessage || 'Hello'}\n\n[REGENERATION DIRECTIVE: ${retryGuidance}]`,
            systemPrompt: context.systemPrompt,
            recentHistory: Array.isArray(input.recentHistory)
              ? input.recentHistory.slice(-6).map((m) => ({
                  role: m.isUser ? 'user' : 'assistant',
                  content: m.text,
                }))
              : [],
            companionId,
            userNickname: input.settings?.userNickname,
            reqId: input.reqId ? `${input.reqId}_retry` : undefined,
            timeoutMs: 5000, // Short bounded retry to avoid UI latency
          },
          (cId: string = companionId, nick: string = input.settings?.userNickname || 'জান') =>
            generateContextualFallback(
              context.situationDecision,
              context.emotionAnalysis,
              cId,
              nick,
              input.settings?.languageMode,
              [...context.recentAssistantReplies, rawReply],
              context.recentTurnContext.rejectedReplies
            )
        );

        const retriedRepCheck = this.repetitionChecker.check(
          retryResult.reply,
          context.recentAssistantReplies,
          context.recentTurnContext.rejectedReplies
        );

        if (!retriedRepCheck.isRepetitive) {
          rawReply = retryResult.reply;
          repCheck = retriedRepCheck;
          providerUsed = retryResult.providerUsed;
          modelUsed = retryResult.modelUsed;
        } else {
          // Safe fallback if second attempt also repetitive
          rawReply = generateContextualFallback(
            context.situationDecision,
            context.emotionAnalysis,
            companionId,
            input.settings?.userNickname,
            input.settings?.languageMode,
            [...context.recentAssistantReplies, rawReply],
            context.recentTurnContext.rejectedReplies
          );
          providerUsed = 'fallback';
          modelUsed = 'contextual_fallback_engine';
        }
      } catch {
        rawReply = generateContextualFallback(
          context.situationDecision,
          context.emotionAnalysis,
          companionId,
          input.settings?.userNickname,
          input.settings?.languageMode,
          [...context.recentAssistantReplies, rawReply],
          context.recentTurnContext.rejectedReplies
        );
      }
    }

    // Immersion Guard: Ensure reply does not break immersion with "as an AI", "I cannot eat because I am an AI", etc.
    if (
      isImmersionBreaking(rawReply) &&
      context.situationDecision.situationType !== 'human_identity_inquiry'
    ) {
      console.warn(
        sanitizeLog(
          `[${input.reqId || 'req'}] Immersion-breaking disclaimer detected in model draft. Restoring natural girlfriend roleplay.`
        )
      );
      rawReply = generateContextualFallback(
        context.situationDecision,
        context.emotionAnalysis,
        companionId,
        input.settings?.userNickname,
        input.settings?.languageMode,
        context.recentAssistantReplies,
        context.recentTurnContext.rejectedReplies
      );
      providerUsed = 'fallback';
      modelUsed = 'roleplay_immersion_engine';
    }

    const finalCleaned = repCheck.cleanedText || rawReply;

    // 5. Meaningfully evolve relationship based on conversational interaction context
    if (context.emotionAnalysis.intent === 'apology_or_repair') {
      this.stateManager.evolveRelationship(companionId, sessionId, { type: 'sincere_apology' });
    } else if (
      context.emotionAnalysis.intent === 'insult_or_provocation' ||
      context.emotionAnalysis.intent === 'negative_feedback'
    ) {
      this.stateManager.evolveRelationship(companionId, sessionId, { type: 'conflict_hurt' });
    } else if (context.emotionAnalysis.intent === 'sharing_deep_thought') {
      this.stateManager.evolveRelationship(companionId, sessionId, {
        type: 'deep_sharing',
        detail: input.userMessage?.slice(0, 30),
      });
    } else if (
      context.emotionAnalysis.intent === 'casual_banter' ||
      context.emotionAnalysis.intent === 'playful_flirt'
    ) {
      this.stateManager.evolveRelationship(companionId, sessionId, { type: 'laugh_together' });
    } else if (
      context.emotionAnalysis.intent === 'compliment_received' ||
      context.emotionAnalysis.intent === 'affectionate_care_question'
    ) {
      this.stateManager.evolveRelationship(companionId, sessionId, { type: 'loving_moment' });
    } else if (context.emotionAnalysis.intent === 'setting_boundary') {
      this.stateManager.evolveRelationship(companionId, sessionId, { type: 'boundary_respected' });
    } else if (
      context.situationDecision.situationType === 'topic_change' ||
      context.emotionAnalysis.intent === 'greeting' ||
      context.emotionAnalysis.primaryEmotion === 'calmness'
    ) {
      this.stateManager.evolveRelationship(companionId, sessionId, { type: 'peaceful_transition' });
    }

    // Update and Record Dynamic State
    const updatedState = this.stateManager.recordInteraction(
      companionId,
      sessionId,
      finalCleaned,
      input.userMessage,
      context.emotionAnalysis.primaryEmotion
    );

    return {
      reply: finalCleaned,
      provider: providerUsed,
      model: modelUsed,
      fallbackReason: genResult.fallbackReason,
      notice: genResult.notice,
      geminiError: genResult.geminiError,
      elapsedMs: genResult.elapsedMs,
      providerTimings: genResult.providerTimings,
      emotionAnalysis: context.emotionAnalysis,
      situationDecision: context.situationDecision,
      voiceParams: {
        ...context.voiceParams,
        cleanedText: finalCleaned.replace(/[*_]/g, '').trim(),
      },
      updatedState,
      relevantMemoriesUsed: context.relevantMemories,
      repetitionCheck: repCheck,
    };
  }
}
