import { mkdir, readFile, writeFile, rename, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError, FIELD_KEYS, textValue, validateDraft } from '../public/shared.mjs';
import { validateImage } from './provider.mjs';

export const validId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function keys(value) {
  if (!Array.isArray(value) || value.length > 6 || value.some(k => !FIELD_KEYS.includes(k))) throw new AppError('画面要素列表不正确。');
  return [...new Set(value)];
}
function strings(value, count, length) {
  if (!Array.isArray(value) || value.length > count) throw new AppError('创作记录内容过多。');
  return value.map(v => textValue(v,length,'记录内容'));
}
function timestamp(value) { if (!Number.isFinite(value) || value < 0) throw new AppError('记录时间不正确。'); return value; }
export function validateProject(value, id) {
  if (!value || typeof value !== 'object' || !validId(id) || value.id !== id) throw new AppError('创作记录标识不正确。');
  if (!['live','demo'].includes(value.mode)) throw new AppError('创作模式不正确。');
  if (!Array.isArray(value.messages) || value.messages.length > 500 || !Array.isArray(value.revisions) || value.revisions.length > 250) throw new AppError('当前创作记录较多，请导出并新建一次创作。');
  let reference = null;
  if (value.reference) {
    if (value.reference.assetPath === '/assets/cafe-reference.png') reference = { name: textValue(value.reference.name,160,'图片名称'),assetPath:'/assets/cafe-reference.png' };
    else reference = validateImage(value.reference);
  }
  const messages = value.messages.map(m => {
    if (!['user','assistant','note'].includes(m.role)) throw new AppError('消息角色不正确。');
    const result = { role:m.role,text:textValue(m.text,6000,'消息内容'),demo:m.demo === true };
    if (m.suggestions) result.suggestions = strings(m.suggestions,3,100);
    return result;
  });
  const observations = value.observations ?? [];
  if (!Array.isArray(observations) || observations.length > 6) throw new AppError('画面观察记录不正确。');
  return {
    id,title:textValue(value.title,60,'创作名称'),mode:value.mode,created:timestamp(value.created),updated:Date.now(),reference,
    scope:keys(value.scope),locks:keys(value.locks),messages,
    revisions:value.revisions.map(r => ({id:validId(r.id)?r.id:randomUUID(),created:timestamp(r.created),title:textValue(r.title,60,'版本名称',true) || textValue(value.title,60,'创作名称'),draft:validateDraft(r.draft),changes:strings(r.changes,10,200)})),
    observations:observations.map(o=>({label:textValue(o.label,30,'观察标题'),text:textValue(o.text,300,'观察内容'),certainty:o.certainty==='seen'?'seen':'inferred'})),
  };
}
export class ProjectStore {
  constructor(directory) { this.directory=directory; this.queue=Promise.resolve(); }
  path(id) { if (!validId(id)) throw new AppError('创作记录标识不正确。',404); return join(this.directory,`${id}.json`); }
  async get(id) {
    try { return JSON.parse(await readFile(this.path(id),'utf8')); }
    catch(error) { if(error.code==='ENOENT') throw new AppError('没有找到这份创作记录。',404); throw error; }
  }
  async list() {
    let files; try { files=await readdir(this.directory); } catch(error) { if(error.code==='ENOENT') return []; throw error; }
    const projects=await Promise.all(files.filter(f=>validId(f.replace(/\.json$/,'')) && f.endsWith('.json')).map(async file=>{
      const p=JSON.parse(await readFile(join(this.directory,file),'utf8'));
      return {id:p.id,title:p.title,mode:p.mode,created:p.created,updated:p.updated,revisionCount:p.revisions.length,reference:p.reference?.assetPath?{assetPath:p.reference.assetPath}:null};
    }));
    return projects.sort((a,b)=>b.updated-a.updated);
  }
  async save(id,body) {
    const value=validateProject(body,id);
    const task=this.queue.then(async()=>{
      await mkdir(this.directory,{recursive:true});
      const temp=join(this.directory,`${id}-${randomUUID()}.tmp`);
      await writeFile(temp,JSON.stringify(value),{mode:0o600}); await rename(temp,this.path(id));
      return {ok:true};
    });
    this.queue=task.catch(()=>{}); return task;
  }
  async delete(id) {
    const task=this.queue.then(async()=>{try{await unlink(this.path(id));}catch(error){if(error.code!=='ENOENT')throw error;}return {ok:true};});
    this.queue=task.catch(()=>{}); return task;
  }
}
