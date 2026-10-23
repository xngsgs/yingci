import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LibraryStore, validateLibraryItem } from '../src/library.mjs';
import { DEMO_DRAFT } from '../public/demo.mjs';

const item = (id = randomUUID()) => ({ id, name: '雨窗光线', tags: ['摄影', '安静'], draft: structuredClone(DEMO_DRAFT), created: 1 });
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'yingci-library-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, store: new LibraryStore(directory) };
}

test('library validation retains only named bilingual prompt fields and metadata', () => {
  const raw = item();
  raw.name = ' 雨窗光线 ';
  raw.tags = [' 摄影 ', '摄影'];
  raw.apiKey = 'do-not-store'; raw.reference = { dataUrl: 'private-image' }; raw.messages = ['private-chat'];
  raw.draft.unrelated = 'discard'; raw.draft.fields.subject.secret = 'discard';
  const clean = validateLibraryItem(raw, raw.id, 10);
  assert.deepEqual(Object.keys(clean), ['id', 'name', 'tags', 'draft', 'created', 'updated']);
  assert.equal(clean.name, '雨窗光线'); assert.deepEqual(clean.tags, ['摄影']);
  assert.deepEqual(clean.draft, DEMO_DRAFT); assert.equal(clean.updated, 10);
  assert.notEqual(clean.draft, raw.draft);
});

test('library validation rejects malformed IDs, missing names, bad dates and incomplete drafts', () => {
  const raw = item();
  for (const id of ['../outside', 'x', '', null]) assert.throws(() => validateLibraryItem(raw, id));
  assert.throws(() => validateLibraryItem(raw, randomUUID()));
  for (const patch of [{ name: ' ' }, { name: 'x'.repeat(61) }, { created: -1 }, { created: '1' }, { draft: {} }]) {
    assert.throws(() => validateLibraryItem({ ...raw, ...patch }, raw.id));
  }
  const invalidRatio = item(); invalidRatio.draft.aspectRatio = '100:1';
  assert.throws(() => validateLibraryItem(invalidRatio, invalidRatio.id));
  assert.throws(() => validateLibraryItem(raw, raw.id, NaN));
});

test('library tags enforce count, type, length and nonempty values', () => {
  const raw = item();
  for (const tags of [null, 'tag', [1], [' '], ['x'.repeat(21)], Array(7).fill('tag')]) {
    assert.throws(() => validateLibraryItem({ ...raw, tags }, raw.id));
  }
  delete raw.tags;
  assert.deepEqual(validateLibraryItem(raw, raw.id).tags, []);
});

test('library saves atomically, survives reopen and strips reference and connection data', async t => {
  const { directory, store } = await fixture(t);
  const raw = { ...item(), apiKey: 'do-not-store', reference: { name: 'private' }, messages: [] };
  assert.deepEqual(await store.list(), []);
  assert.deepEqual(await store.save(raw.id, raw), { ok: true });
  const reopened = new LibraryStore(directory);
  const restored = await reopened.get(raw.id);
  assert.equal(restored.name, raw.name); assert.equal(restored.created, raw.created);
  assert.deepEqual(restored.draft, raw.draft);
  assert.ok(restored.updated > 0);
  assert.deepEqual(await reopened.list(), [restored]);
  assert.deepEqual(await reopened.get(raw.id), restored);
  const persisted = await readFile(join(directory, `${raw.id}.json`), 'utf8');
  assert.ok(!persisted.includes('do-not-store')); assert.ok(!persisted.includes('reference')); assert.ok(!persisted.includes('messages'));
  assert.deepEqual(await readdir(directory), [`${raw.id}.json`]);
  assert.deepEqual(await reopened.get(raw.id.toUpperCase()), restored);
});

test('queued writes and deletes produce a complete final record and reads await pending saves', async t => {
  const { directory, store } = await fixture(t);
  const raw = item();
  const first = store.save(raw.id, raw);
  const second = store.save(raw.id, { ...raw, name: '第二版' });
  const read = store.get(raw.id);
  const results = await Promise.all([first, second, read]);
  assert.equal(results[2].name, '第二版');
  const remove = store.delete(raw.id);
  const replace = store.save(raw.id, { ...raw, name: '重新收藏' });
  await Promise.all([remove, replace]);
  assert.equal((await store.get(raw.id)).name, '重新收藏');
  assert.deepEqual(await readdir(directory), [`${raw.id}.json`]);
  const listedBeforeDelete = store.list();
  const deleted = store.delete(raw.id);
  assert.equal((await listedBeforeDelete).length, 1);
  await deleted; await store.delete(raw.id);
  await assert.rejects(store.get(raw.id), error => error.status === 404);
  assert.deepEqual(await store.list(), []);
});

test('UUID-only storage rejects path traversal before touching disk', async t => {
  const { directory, store } = await fixture(t);
  for (const id of ['../escape', '..\\escape', 'C:\\escape', randomUUID() + '/child']) {
    await assert.rejects(store.get(id), error => error.status === 404);
    await assert.rejects(store.save(id, item()), error => error.status === 404);
    await assert.rejects(store.delete(id), error => error.status === 404);
  }
  assert.deepEqual(await readdir(directory), []);
});

test('capacity is enforced inside the mutation queue while existing items stay editable', async t => {
  const { directory, store } = await fixture(t);
  const existing = Array.from({ length: 499 }, () => item());
  await Promise.all(existing.map(raw => writeFile(join(directory, `${raw.id}.json`), JSON.stringify({ ...raw, updated: 1 }))));
  const a = item(), b = item();
  const attempts = await Promise.allSettled([store.save(a.id, a), store.save(b.id, b)]);
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(attempts.find(result => result.status === 'rejected').reason.code, 'LIBRARY_FULL');
  await store.save(existing[0].id, { ...existing[0], name: '容量已满仍可编辑' });
  assert.equal((await store.get(existing[0].id)).name, '容量已满仍可编辑');
  assert.equal((await store.list()).length, 500);
  await store.delete(existing[1].id);
  await store.save(b.id, b);
  assert.equal((await store.list()).length, 500);
});
