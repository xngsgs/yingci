import test from 'node:test';
import assert from 'node:assert/strict';
import {AppError} from '../public/shared.mjs';
import {FEEDBACK_ISSUES, normalizeFeedback, feedbackMessage} from '../public/feedback.mjs';

test('feedback catalog has six distinct user-readable issue types', () => {
  assert.deepEqual(FEEDBACK_ISSUES.map(issue => issue.key), ['subject', 'composition', 'lighting', 'palette', 'style', 'artifacts']);
  for (const issue of FEEDBACK_ISSUES) {
    assert.equal(typeof issue.label, 'string');
    assert.ok(issue.label.length > 0);
    assert.equal(typeof issue.hint, 'string');
    assert.ok(issue.hint.length > 0);
  }
});

test('optional feedback normalizes selected issues, notes and unrelated extra fields', () => {
  assert.equal(normalizeFeedback(null), null);
  assert.equal(normalizeFeedback(undefined), null);
  assert.deepEqual(normalizeFeedback({issues: ['palette', 'palette', 'composition'], notes: '  颜色太艳，主体靠左一点。  ', apiKey: 'must-not-survive'}), {
    issues: ['palette', 'composition'], notes: '颜色太艳，主体靠左一点。',
  });
  assert.deepEqual(normalizeFeedback({notes: '眼睛画歪了'}), {issues: [], notes: '眼睛画歪了'});
  assert.deepEqual(normalizeFeedback({issues: ['style']}), {issues: ['style'], notes: ''});
});

test('feedback rejects malformed input, unsupported issue types, empty reports and oversized notes', () => {
  for (const value of [false, 'style', [], {}, {issues: []}, {notes: '   '}, {issues: 'subject'}, {issues: null}, {issues: ['unknown']}, {issues: [null]}, {issues: ['__proto__']}, {issues: Array(7).fill('subject')}, {notes: null}, {notes: 42}, {notes: 'x'.repeat(1201)}]) {
    assert.throws(() => normalizeFeedback(value), AppError);
  }
  assert.equal(normalizeFeedback({notes: 'x'.repeat(1200)}).notes.length, 1200);
});

test('feedback instructions include exactly the reported checklist issues and literal user notes', () => {
  const notes = '不要改人物，只把背景里的文字去掉。';
  const message = feedbackMessage({issues: ['composition', 'artifacts'], notes});
  assert.ok(message.includes(FEEDBACK_ISSUES.find(issue => issue.key === 'composition').label));
  assert.ok(message.includes(FEEDBACK_ISSUES.find(issue => issue.key === 'artifacts').label));
  for (const issue of FEEDBACK_ISSUES.filter(issue => !['composition', 'artifacts'].includes(issue.key))) assert.ok(!message.includes(issue.label));
  assert.ok(message.includes(JSON.stringify(notes)));
  assert.ok(message.includes('editedFields'));
  assert.ok(message.includes('所有已锁定的要素必须保留'));
  assert.ok(message.includes('未要求修改的内容保持原样'));
});

test('feedback instructions distinguish reports and optional visible evidence without simulating inference', () => {
  assert.equal(feedbackMessage(null), '');
  const message = feedbackMessage({notes: '效果有点怪'});
  assert.ok(message.includes('用户报告的问题，不是对图片的客观检测结论'));
  assert.ok(message.includes('只有当前请求附有生成结果图时'));
  assert.ok(message.includes('不要声称已经看过或分析过生成效果'));
  assert.ok(message.includes('不要编造重新生图或模型评测结果'));
  assert.throws(() => feedbackMessage({issues: ['not-an-issue']}), AppError);
});
