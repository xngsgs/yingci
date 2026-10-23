import { AppError, FIELD_DEFS, FIELD_KEYS, composePrompt, textValue } from './shared.mjs';

export const REFERENCE_MODES = [
  { key: 'inspiration', label: '借鉴感觉', hint: '提取选中的特点，主体和细节自由变化' },
  { key: 'style', label: '提取画风', hint: '关注表现方式、配色和光影，不照搬主体' },
  { key: 'composition', label: '参考构图', hint: '关注主体位置、视角和空间关系' },
  { key: 'close', label: '尽量接近', hint: '尽量保留可见特点，仍以文字需求为准' },
];
export const PURPOSES = [
  { key: 'general', label: '自由创作' }, { key: 'portrait', label: '人物与角色' },
  { key: 'product', label: '产品展示' }, { key: 'wallpaper', label: '壁纸与封面' },
  { key: 'illustration', label: '插画与故事' },
];
export const DEFAULT_BRIEF = { goal: '', purpose: 'general', referenceMode: 'inspiration', target: 'universal', editMode: 'refine' };
export function normalizeBrief(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError('创作方向格式不正确。');
  const result = { ...DEFAULT_BRIEF, goal: textValue(value.goal, 800, '创作想法', true) };
  for (const [key, allowed] of Object.entries({ purpose: PURPOSES.map(v => v.key), referenceMode: REFERENCE_MODES.map(v => v.key), target: ['universal','midjourney'], editMode: ['refine','redesign'] })) {
    const next = value[key] ?? DEFAULT_BRIEF[key];
    if (!allowed.includes(next)) throw new AppError('创作方向中有不受支持的选项。');
    result[key] = next;
  }
  return result;
}
export function formattedPrompt(draft, language = 'zh', target = 'universal') {
  if (target !== 'midjourney') return composePrompt(draft, language);
  if (!draft) return '';
  const lang = language === 'en' ? 'en' : 'zh';
  const clean = text => text.replace(/--(?=[a-z])/gi, '—').replace(/\s+/g,' ').trim();
  const parts = FIELD_KEYS.map(k => clean(draft.fields[k]?.[lang] || '')).filter(Boolean);
  if (!parts.length) return '';
  let result = parts.join(lang === 'zh' ? '，' : ', ');
  if (draft.aspectRatio !== 'auto') result += ` --ar ${draft.aspectRatio}`;
  if (draft.avoid?.[lang]) result += ` --no ${clean(draft.avoid[lang]).replace(/[，、；;]/g, ', ')}`;
  return result;
}
export function draftChanges(before, after) {
  if (!before || !after) return [];
  const rows = FIELD_DEFS.map(f => ({ key:f.key, label:f.label, before:before.fields[f.key], after:after.fields[f.key] }));
  rows.push({key:'avoid',label:'避免内容',before:before.avoid,after:after.avoid});
  if (before.aspectRatio !== after.aspectRatio) rows.push({key:'aspectRatio',label:'画面比例',before:{zh:before.aspectRatio,en:before.aspectRatio},after:{zh:after.aspectRatio,en:after.aspectRatio}});
  return rows.filter(row => JSON.stringify(row.before) !== JSON.stringify(row.after));
}
export function inspectDraft(draft) {
  if (!draft) return [];
  const issues = [];
  for (const field of FIELD_DEFS) {
    const value = draft.fields[field.key];
    if (!value.zh && !value.en) issues.push({key:field.key,text:`${field.label}还没确定，可以让助手给一个建议`});
    else if (!value.zh || !value.en) issues.push({key:field.key,text:`${field.label}缺少${value.zh ? '英文' : '中文'}版本，切换语言时会遗漏`});
  }
  if (draft.fields.subject.zh && /(?:高级感|高质量|大师级|杰作)/.test(draft.fields.subject.zh) && draft.fields.subject.zh.length < 12) issues.push({key:'subject',text:'主体仍偏抽象，补充具体的人或物会更清楚'});
  return issues;
}
export function focusedResult(result, raw, current, brief) {
  if (raw.editedFields != null && (!Array.isArray(raw.editedFields) || raw.editedFields.length > 8 || raw.editedFields.some(k => ![...FIELD_KEYS,'avoid','aspectRatio'].includes(k)))) throw new AppError('模型返回的修改范围不正确。',502,'MODEL_FORMAT');
  if (current && brief.editMode === 'refine' && !Array.isArray(raw.editedFields)) throw new AppError('模型未说明本轮修改范围，这一版尚未应用。请重试，或选择重新构思。',502,'MODEL_FORMAT');
  if (current && brief.editMode === 'refine' && Array.isArray(raw.editedFields)) {
    for (const key of FIELD_KEYS) if (!raw.editedFields.includes(key)) result.draft.fields[key] = structuredClone(current.fields[key]);
    if (!raw.editedFields.includes('avoid')) result.draft.avoid = structuredClone(current.avoid);
    if (!raw.editedFields.includes('aspectRatio')) result.draft.aspectRatio = current.aspectRatio;
  }
  result.understanding = textValue(raw.understanding,800,'需求理解',true);
  result.assumptions = Array.isArray(raw.assumptions) ? raw.assumptions.slice(0,4).map(v=>textValue(v,220,'建议假设')) : [];
  return result;
}

// Color samples come from local image pixels, not a model or a predefined palette.
export function paletteFromPixels(pixels, limit = 5) {
  const buckets = new Map();
  for (let i=0;i+3<pixels.length;i+=4) {
    if (pixels[i+3] < 128) continue;
    const r=pixels[i],g=pixels[i+1],b=pixels[i+2],key=`${r>>5},${g>>5},${b>>5}`;
    const bucket=buckets.get(key)||{count:0,r:0,g:0,b:0};
    bucket.count++;bucket.r+=r;bucket.g+=g;bucket.b+=b;buckets.set(key,bucket);
  }
  const candidates=[...buckets.values()].sort((a,b)=>b.count-a.count).map(c=>[c.r,c.g,c.b].map(n=>Math.round(n/c.count)));
  const selected=[];
  for(const color of candidates) {
    if(selected.every(other=>Math.hypot(...color.map((v,i)=>v-other[i]))>54))selected.push(color);
    if(selected.length>=limit)break;
  }
  return selected.map(color=>'#'+color.map(v=>v.toString(16).padStart(2,'0')).join(''));
}
