import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError, textValue } from '../public/shared.mjs';
import { validateBaseUrl } from './provider.mjs';

export class ConfigStore {
  constructor(directory, env = process.env) { this.directory = directory; this.env = env; this.value = null; this.queue = Promise.resolve(); }
  async load() {
    try { this.value = JSON.parse(await readFile(join(this.directory, 'provider.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('模型配置无法读取，请检查 .local/provider.json。'); }
  }
  get() { return this.value ?? { baseUrl: this.env.AI_BASE_URL || '', model: this.env.AI_MODEL || '', apiKey: this.env.AI_API_KEY || '', jsonMode: this.env.AI_JSON_MODE === '1' }; }
  public() {
    const { baseUrl, model, apiKey, jsonMode } = this.get();
    return { configured: !!(baseUrl && model && apiKey), baseUrl, model, jsonMode: !!jsonMode, hasKey: !!apiKey, source: this.value ? 'local' : 'environment' };
  }
  preview(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError('连接配置格式不正确。');
    const baseUrl = validateBaseUrl(textValue(body.baseUrl, 500, '接口地址'));
    const model = textValue(body.model, 160, '模型名称');
    if (!model) throw new AppError('请输入视觉模型名称。');
    const previous = this.get();
    let apiKey = textValue(body.apiKey, 1000, 'API Key', true);
    if (!apiKey && previous.baseUrl === baseUrl) apiKey = previous.apiKey;
    if (!apiKey) throw new AppError('请输入 API Key；更换接口地址时需要重新填写，避免密钥发往其他服务。');
    if (/[\r\n\u0000]/.test(apiKey)) throw new AppError('API Key 中包含无效字符。');
    if (body.jsonMode != null && typeof body.jsonMode !== 'boolean') throw new AppError('输出格式设置不正确。');
    return { baseUrl, model, apiKey, jsonMode: body.jsonMode ?? !!previous.jsonMode };
  }
  async save(body) {
    const task = this.queue.then(async () => {
      const next = this.preview(body);
      await mkdir(this.directory, { recursive: true });
      const temp = join(this.directory, `provider-${randomUUID()}.tmp`);
      await writeFile(temp, JSON.stringify(next), { mode: 0o600 });
      await rename(temp, join(this.directory, 'provider.json'));
      this.value = next;
      return this.public();
    });
    this.queue = task.catch(() => {});
    return task;
  }
}
