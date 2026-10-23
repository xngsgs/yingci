import { mkdir, readFile, writeFile, rename, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError, textValue, validateDraft } from '../public/shared.mjs';

const MAX_ITEMS = 500;
const validId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const isItemFile = name => name.endsWith('.json') && validId(name.slice(0, -5));

function timestamp(value) {
  if (!Number.isFinite(value) || value < 0) throw new AppError('收藏时间不正确。');
  return value;
}

export function validateLibraryItem(value, id, updated = Date.now()) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !validId(id) || !validId(value.id) || value.id.toLowerCase() !== id.toLowerCase()) {
    throw new AppError('收藏标识不正确。');
  }
  const name = textValue(value.name, 60, '收藏名称');
  if (!name) throw new AppError('请填写收藏名称。');
  const rawTags = value.tags === undefined ? [] : value.tags;
  if (!Array.isArray(rawTags) || rawTags.length > 6) throw new AppError('最多添加 6 个标签。');
  const tags = rawTags.map(tag => {
    const clean = textValue(tag, 20, '标签');
    if (!clean) throw new AppError('标签不能为空。');
    return clean;
  });
  return {
    id: id.toLowerCase(), name, tags: [...new Set(tags)], draft: validateDraft(value.draft),
    created: timestamp(value.created), updated: timestamp(updated),
  };
}

export class LibraryStore {
  constructor(directory) {
    this.directory = directory;
    this.queue = Promise.resolve();
  }

  path(id) {
    if (!validId(id)) throw new AppError('收藏标识不正确。', 404);
    return join(this.directory, `${id.toLowerCase()}.json`);
  }

  enqueue(operation) {
    const task = this.queue.then(operation);
    this.queue = task.catch(() => {});
    return task;
  }

  async read(id) {
    try {
      const raw = JSON.parse(await readFile(this.path(id), 'utf8'));
      return validateLibraryItem(raw, id, timestamp(raw.updated));
    } catch (error) {
      if (error.code === 'ENOENT') throw new AppError('没有找到这份收藏。', 404);
      throw error;
    }
  }

  async get(id) {
    this.path(id);
    return this.enqueue(() => this.read(id));
  }

  async list() {
    return this.enqueue(async () => {
      let files;
      try { files = await readdir(this.directory); }
      catch (error) { if (error.code === 'ENOENT') return []; throw error; }
      const items = await Promise.all(files.filter(isItemFile).map(file => this.read(file.slice(0, -5))));
      return items.sort((a, b) => b.updated - a.updated || a.id.localeCompare(b.id));
    });
  }

  async save(id, body) {
    const path = this.path(id);
    const value = validateLibraryItem(body, id);
    return this.enqueue(async () => {
      await mkdir(this.directory, { recursive: true });
      const files = (await readdir(this.directory)).filter(isItemFile);
      if (!files.some(file => file.toLowerCase() === `${id.toLowerCase()}.json`) && files.length >= MAX_ITEMS) {
        throw new AppError('收藏夹已达到 500 条，请先整理已有收藏。', 409, 'LIBRARY_FULL');
      }
      const temp = join(this.directory, `${id}-${randomUUID()}.tmp`);
      value.updated = Date.now();
      try {
        await writeFile(temp, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
        await rename(temp, path);
      } finally {
        await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; });
      }
      return { ok: true };
    });
  }

  async delete(id) {
    const path = this.path(id);
    return this.enqueue(async () => {
      try { await unlink(path); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      return { ok: true };
    });
  }
}
