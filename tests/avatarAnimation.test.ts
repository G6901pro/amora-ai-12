import assert from 'node:assert';
import { normalizeEmotion, EMOTION_CONFIGS } from '../src/components/AnimatedCompanionAvatar';
import { getCharacterAnimation } from '../src/hooks/useCharacterAnimation';

console.log('--- Running avatarAnimation.test.ts ---');

// 1. Verify emotion normalization
assert.strictEqual(normalizeEmotion('happy'), 'excitement');
assert.strictEqual(normalizeEmotion('sadness'), 'sadness');
assert.strictEqual(normalizeEmotion('angry'), 'anger');
assert.strictEqual(normalizeEmotion('sweet'), 'affection');
assert.strictEqual(normalizeEmotion(undefined, 0), 'neutral');
assert.strictEqual(normalizeEmotion('calm', 35), 'frustration', 'High tension should trigger frustration');

// 2. Verify emotion configs exist
assert.ok(EMOTION_CONFIGS.excitement, 'excitement config must exist');
assert.ok(EMOTION_CONFIGS.affection, 'affection config must exist');
assert.ok(EMOTION_CONFIGS.neutral, 'neutral config must exist');

// 3. Verify getCharacterAnimation produces valid Framer Motion targets
const targets = getCharacterAnimation('affection', false, 5);
assert.ok(targets.animate, 'Should have animate target');
assert.ok(targets.transition, 'Should have transition target');
assert.ok(targets.whileHover, 'Should have whileHover target');

console.log('✓ avatarAnimation.test.ts passed successfully!');
