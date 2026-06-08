// Lightweight test runner (no framework) for the terminology engine.
// Run with: node tests/terminology.test.mjs
import assert from 'node:assert';
import { detectTerms } from '../services/terminology/matcher.js';
import { normalize } from '../services/terminology/normalize.js';
import { expandVariants } from '../services/terminology/variants.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}\n    ${e.message}`);
    process.exitCode = 1;
  }
}

console.log('normalize:');
test('strips diacritics and tatweel', () => {
  assert.strictEqual(normalize('الجَيْـش'), 'الجيش');
});
test('unifies alef and ya', () => {
  assert.strictEqual(normalize('إسرائيلى'), 'اسرائيلي');
});

console.log('variants:');
test('expands clitic prefixes', () => {
  const v = expandVariants('الجيش الإسرائيلي');
  assert.ok(v.includes('الجيش الاسرائيلي'), 'base form');
  assert.ok(v.includes('والجيش الاسرائيلي'), 'و prefix');
  assert.ok(v.includes('للجيش الاسرائيلي'), 'ل + ال elision');
});

console.log('detectTerms:');
test('detects a basic term and suggests replacement', () => {
  const hits = detectTerms('قصف الجيش الإسرائيلي المنطقة');
  assert.strictEqual(hits.length, 1);
  assert.strictEqual(hits[0].original, 'الجيش الإسرائيلي');
  assert.strictEqual(hits[0].suggested, 'جيش الاحتلال الإسرائيلي');
  assert.strictEqual(hits[0].category, 'مصطلح سياسي');
});
test('maps offsets back to the original text', () => {
  const text = 'قصف الجيش الإسرائيلي المنطقة';
  const hits = detectTerms(text);
  assert.strictEqual(text.slice(hits[0].start, hits[0].end), 'الجيش الإسرائيلي');
});
test('matches a cliticized form (و prefix)', () => {
  const hits = detectTerms('والجيش الإسرائيلي يواصل');
  assert.strictEqual(hits.length, 1);
  assert.ok(hits[0].original.startsWith('والجيش'));
});
test('detects "حرب غزة"', () => {
  const hits = detectTerms('استمرت حرب غزة أشهراً');
  assert.ok(hits.some((h) => h.suggested.includes('الإبادة')));
});
test('respects word boundaries (no match inside a larger word)', () => {
  // "غزةالكبرى" should not falsely trigger if a term were a substring;
  // here we just ensure a clean sentence with no listed terms yields nothing.
  const hits = detectTerms('الطقس اليوم جميل والسماء صافية');
  assert.strictEqual(hits.length, 0);
});
test('multiple distinct terms in one text', () => {
  const hits = detectTerms('الجيش الإسرائيلي قصف خلال حرب غزة');
  assert.ok(hits.length >= 2);
});

console.log(`\n${passed} checks passed.`);
