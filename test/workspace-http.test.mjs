import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.mjs';
import { FIELD_KEYS } from '../public/shared.mjs';
import { DEMO_DRAFT } from '../public/demo.mjs';

const fakeConfig = { AI_BASE_URL: 'https://workspace-test.invalid/v1', AI_MODEL: 'mock-vision', AI_API_KEY: 'workspace-test-key-never-return' };
const tinyImage = (name, marker = 0) => ({ name, dataUrl: 'data:image/png;base64,' + Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, marker]).toString('base64') });
const reference = () => tinyImage('目标参考.png', 1);
const resultImage = () => tinyImage('实际结果.png', 2);
const turn = () => ({ message: '颜色太艳，请按反馈修订。', messages: [], draft: structuredClone(DEMO_DRAFT), locks: ['lighting'], scope: ['palette', 'lighting'], reference: reference(), resultReference: resultImage(), feedback: { issues: ['palette'], notes: '保留原来的窗边光线。' } });
const output = () => ({ reply: '降低颜色饱和度，沿用锁定光线。', title: '雨窗色彩修订', draft: structuredClone(DEMO_DRAFT), editedFields: ['palette'], suggestions: [], observations: [], understanding: '根据实际结果修订颜色', assumptions: [] });
const libraryItem = () => ({ id: randomUUID(), name: '雨窗低饱和配色', tags: ['摄影', '光线'], draft: structuredClone(DEMO_DRAFT), created: 1 });
const project = () => ({ id: randomUUID(), title: '结果复盘测试', mode: 'live', created: 1, reference: reference(), scope: [...FIELD_KEYS], locks: ['lighting'], messages: [{ role: 'user', text: '原图太艳。' }], revisions: [{ id: randomUUID(), created: 1, title: '原方案', draft: structuredClone(DEMO_DRAFT), changes: ['第一版'] }], observations: [], review: { issues: ['palette', 'artifacts'], notes: '背景招牌出现了杂乱文字。', reference: resultImage() } });

async function appFixture(t, fetchImpl = async () => { throw new Error('Unexpected provider request'); }) {
  const directory = await mkdtemp(join(tmpdir(), 'yingci-workspace-http-'));
  const server = await createApp({ directory, env: fakeConfig, fetchImpl });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const call = (path, body, method = 'POST', headers = {}) => fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', 'X-Yingci-Request': '1', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { directory, base, call };
}

test('HTTP library CRUD persists only prompt fields, name, tags and timestamps', async t => {
  const { directory, call } = await appFixture(t);
  const raw = { ...libraryItem(), config: fakeConfig, apiKey: fakeConfig.AI_API_KEY, messages: [{ text: 'private conversation' }], reference: reference(), review: { reference: resultImage() } };
  raw.draft.apiKey = fakeConfig.AI_API_KEY;
  const path = `/api/library/${raw.id}`;
  assert.deepEqual(await (await call('/api/library', undefined, 'GET')).json(), []);
  assert.equal((await call(path, raw, 'PUT')).status, 200);
  const response = await call(path, undefined, 'GET');
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.deepEqual(Object.keys(saved), ['id', 'name', 'tags', 'draft', 'created', 'updated']);
  assert.deepEqual(saved.draft, DEMO_DRAFT); assert.deepEqual(saved.tags, raw.tags); assert.equal(saved.created, 1);
  assert.ok(saved.updated > 1);
  const storedText = await readFile(join(directory, 'library', `${raw.id}.json`), 'utf8');
  for (const privateValue of [fakeConfig.AI_API_KEY, 'private conversation', reference().dataUrl, resultImage().dataUrl]) assert.ok(!storedText.includes(privateValue));
  const listed = await (await call('/api/library', undefined, 'GET')).json();
  assert.deepEqual(listed, [saved]);
  assert.equal((await call(path, { ...raw, name: '重新命名', tags: ['收藏'] }, 'PUT')).status, 200);
  assert.equal((await (await call(path, undefined, 'GET')).json()).name, '重新命名');
  assert.equal((await call(path, { ...raw, draft: {} }, 'PUT')).status, 400);
  assert.equal((await call('/api/library/not-a-uuid', raw, 'PUT')).status, 404);
  assert.equal((await call(path, undefined, 'DELETE')).status, 200);
  assert.equal((await call(path, undefined, 'GET')).status, 404);
  assert.deepEqual(await (await call('/api/library', undefined, 'GET')).json(), []);
});

test('HTTP library rejects cross-origin requests and mutations without the app header', async t => {
  const { base, call } = await appFixture(t);
  const raw = libraryItem(), path = `/api/library/${raw.id}`;
  assert.equal((await call(path, raw, 'PUT', { Origin: 'https://attacker.invalid' })).status, 403);
  assert.equal((await fetch(base + path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(raw) })).status, 403);
  assert.equal((await call(path, raw, 'PUT')).status, 200);
  assert.equal((await call('/api/library', undefined, 'GET', { Origin: 'https://attacker.invalid' })).status, 403);
  assert.equal((await call(path, undefined, 'DELETE', { Origin: 'https://attacker.invalid' })).status, 403);
  assert.equal((await fetch(base + path, { method: 'DELETE' })).status, 403);
  assert.equal((await call(path, undefined, 'GET')).status, 200);
});

test('HTTP review labels target and actual images separately and enforces edit plans plus locks', async t => {
  let sent;
  const raw = output();
  raw.editedFields = ['palette', 'lighting'];
  raw.draft.fields.palette = { zh: '柔和的雾蓝与米白，降低饱和度', en: 'Soft mist blue and ivory, reduced saturation' };
  raw.draft.fields.lighting = { zh: '模型擅自改变的霓虹灯', en: 'Unwanted neon lighting' };
  raw.draft.fields.subject = { zh: '模型擅自替换的机器人', en: 'An unwanted robot' };
  raw.draft.avoid = { zh: '模型擅自改变的避免内容', en: 'Unwanted avoidance' };
  raw.draft.aspectRatio = '16:9';
  const { call } = await appFixture(t, async (url, options) => {
    assert.equal(url, fakeConfig.AI_BASE_URL + '/chat/completions');
    sent = JSON.parse(options.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(raw) } }] }));
  });
  const body = turn(), response = await call('/api/chat', body);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.draft.fields.palette, raw.draft.fields.palette);
  for (const key of FIELD_KEYS.filter(key => key !== 'palette')) assert.deepEqual(result.draft.fields[key], DEMO_DRAFT.fields[key]);
  assert.deepEqual(result.draft.avoid, DEMO_DRAFT.avoid); assert.equal(result.draft.aspectRatio, DEMO_DRAFT.aspectRatio);
  assert.ok(!JSON.stringify(result).includes(fakeConfig.AI_API_KEY));
  const content = sent.messages.at(-1).content;
  assert.equal(content[0].type, 'text');
  assert.ok(content[0].text.includes('用户报告的问题')); assert.ok(content[0].text.includes('颜色不满意'));
  assert.ok(content[0].text.includes(body.feedback.notes));
  assert.ok(content[0].text.includes('"lockedFields":["lighting"]'));
  const pictures = content.filter(part => part.type === 'image_url');
  assert.deepEqual(pictures.map(part => part.image_url.url), [body.reference.dataUrl, body.resultReference.dataUrl]);
  const targetIndex = content.findIndex(part => part.type === 'text' && part.text.includes('下面是目标参考图'));
  const actualIndex = content.findIndex(part => part.type === 'text' && part.text.includes('下面是用户实际生成的结果图'));
  assert.ok(targetIndex > 0); assert.ok(actualIndex > targetIndex);
  assert.equal(content[targetIndex + 1].image_url.url, body.reference.dataUrl);
  assert.equal(content[actualIndex + 1].image_url.url, body.resultReference.dataUrl);
});

test('HTTP review rejects invalid feedback and review without a draft before calling the model', async t => {
  let providerCalls = 0;
  const { call } = await appFixture(t, async () => {
    providerCalls++;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output()) } }] }));
  });
  const malformed = [
    { feedback: { issues: ['unsupported'], notes: '' } },
    { feedback: { issues: [], notes: ' ' } },
    { feedback: { issues: ['palette'], notes: 'x'.repeat(1201) } },
    { feedback: { issues: 'palette' } },
    { feedback: { issues: ['palette'], notes: 1 } },
    { feedback: null },
    { draft: null, locks: [] },
    { resultReference: { name: 'bad.png', dataUrl: 'data:image/png;base64,YmFk' } },
  ];
  for (const patch of malformed) {
    const response = await call('/api/chat', { ...turn(), ...patch });
    assert.equal(response.status, 400);
    assert.ok(!JSON.stringify(await response.json()).includes(fakeConfig.AI_API_KEY));
  }
  assert.equal(providerCalls, 0);
  assert.equal((await call('/api/chat', turn())).status, 200);
  assert.equal(providerCalls, 1);
});

test('HTTP projects round trip review issues and the result image without copying connection fields', async t => {
  const { directory, call } = await appFixture(t);
  const raw = project(), path = `/api/projects/${raw.id}`;
  raw.review.config = fakeConfig; raw.review.reference.apiKey = fakeConfig.AI_API_KEY;
  raw.apiKey = fakeConfig.AI_API_KEY;
  assert.equal((await call(path, raw, 'PUT')).status, 200);
  const restored = await (await call(path, undefined, 'GET')).json();
  assert.equal(restored.schemaVersion, 3);
  assert.deepEqual(restored.reference, reference());
  assert.deepEqual(restored.review, { issues: ['palette', 'artifacts'], notes: raw.review.notes, reference: resultImage() });
  assert.equal(restored.apiKey, undefined);
  assert.deepEqual(restored.revisions[0].draft, DEMO_DRAFT);
  assert.equal((await call(path, restored, 'PUT')).status, 200);
  assert.deepEqual((await (await call(path, undefined, 'GET')).json()).review, restored.review);
  const persisted = JSON.parse(await readFile(join(directory, 'projects', `${raw.id}.json`), 'utf8'));
  assert.deepEqual(persisted.review, restored.review); assert.ok(!JSON.stringify(persisted).includes(fakeConfig.AI_API_KEY));
  const metadata = await (await call('/api/projects', undefined, 'GET')).json();
  assert.equal(metadata.length, 1); assert.equal(metadata[0].review, undefined);
  assert.ok(!JSON.stringify(metadata).includes(resultImage().dataUrl));
  assert.equal((await call(path, { ...raw, review: { issues: ['unsupported'], notes: '' } }, 'PUT')).status, 400);
});
