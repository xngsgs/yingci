import test from 'node:test';
import assert from 'node:assert/strict';
import {discardPendingTurn} from '../public/requests.mjs';

test('review cancellation keeps prior user history intact', () => {
  const prior = {role: 'user', text: '上一轮的真实需求'};
  const session = {id: 'current', messages: [prior]};
  assert.equal(discardPendingTurn({kind: 'review', session}, 'current'), null);
  assert.deepEqual(session.messages, [prior]);
  assert.equal(session.messages[0], prior);
});

test('chat cancellation removes only the exact pending message and restores its text', () => {
  const prior = {role: 'user', text: '更自然一点'};
  const pending = {role: 'user', text: '更自然一点'};
  const later = {role: 'assistant', text: '已有内容'};
  const session = {id: 'current', messages: [prior, pending, later]};
  assert.equal(discardPendingTurn({kind: 'chat', session, userMessage: pending}, 'current'), pending.text);
  assert.deepEqual(session.messages, [prior, later]);
  assert.equal(session.messages[0], prior);
});

test('switching projects removes the old pending turn without restoring its input into the new project', () => {
  const prior = {role: 'assistant', text: '上一轮建议'};
  const pending = {role: 'user', text: '等待中的需求'};
  const session = {id: 'old', messages: [prior, pending]};
  const active = {id: 'new', messages: [{role: 'user', text: '另一份创作'}]};
  const activeMessages = structuredClone(active.messages);
  assert.equal(discardPendingTurn({kind: 'chat', session, userMessage: pending}, active.id), null);
  assert.deepEqual(session.messages, [prior]);
  assert.deepEqual(active.messages, activeMessages);
});

test('repeated cancellation, absent pending turns and lookalike messages are safe', () => {
  const userMessage = {role: 'user', text: '待发送内容'};
  const history = {role: 'user', text: '待发送内容'};
  const session = {id: 'current', messages: [history, userMessage]};
  const pending = {kind: 'chat', session, userMessage};
  assert.equal(discardPendingTurn(pending, 'current'), userMessage.text);
  assert.equal(discardPendingTurn(pending, 'current'), null);
  assert.equal(discardPendingTurn(null, 'current'), null);
  assert.equal(discardPendingTurn({kind: 'chat', session}, 'current'), null);
  assert.deepEqual(session.messages, [history]);
  assert.equal(session.messages[0], history);
});
