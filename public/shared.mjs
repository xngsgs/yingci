export const FIELD_DEFS = [
  { key: 'subject', label: '主体', hint: '画面里最重要的人或物' },
  { key: 'scene', label: '场景', hint: '在哪里，周围有什么' },
  { key: 'composition', label: '构图', hint: '画面如何安排' },
  { key: 'lighting', label: '光线', hint: '光从哪里来，有多柔和' },
  { key: 'palette', label: '配色', hint: '画面的主要颜色' },
  { key: 'style', label: '画风', hint: '照片、插画，或其他表现方式' },
];
export const FIELD_KEYS = FIELD_DEFS.map(f => f.key);
export const RATIOS = ['auto', '1:1', '4:5', '3:4', '2:3', '16:9', '9:16'];
export class AppError extends Error {
  constructor(message, status = 400, code = 'INVALID_INPUT') { super(message); this.status = status; this.code = code; }
}
export function textValue(value, max, label, optional = false) {
  if (optional && value == null) return '';
  if (typeof value !== 'string' || value.length > max) throw new AppError(`${label}格式不正确或过长。`);
  return value.trim();
}
export function bilingual(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError(`${label}需要中英文内容。`);
  return { zh: textValue(value.zh, 700, label), en: textValue(value.en, 1000, label) };
}
export function validateDraft(value) {
  if (!value || typeof value !== 'object' || !value.fields) throw new AppError('画面要素不完整。');
  const fields = Object.fromEntries(FIELD_KEYS.map(key => [key, bilingual(value.fields[key], key)]));
  if (!RATIOS.includes(value.aspectRatio)) throw new AppError('画面比例不受支持。');
  return { fields, avoid: bilingual(value.avoid, '避免内容'), aspectRatio: value.aspectRatio };
}
export function composePrompt(draft, language = 'zh') {
  if (!draft) return '';
  const lang = language === 'en' ? 'en' : 'zh';
  const parts = FIELD_KEYS.map(key => draft.fields[key]?.[lang]).filter(Boolean);
  if (!parts.length) return '';
  if (draft.aspectRatio !== 'auto') parts.push(lang === 'zh' ? `画面比例 ${draft.aspectRatio}` : `${draft.aspectRatio} aspect ratio`);
  if (draft.avoid?.[lang]) parts.push(`${lang === 'zh' ? '避免：' : 'Avoid: '}${draft.avoid[lang]}`);
  return parts.join(lang === 'zh' ? '；\n' : '.\n');
}
export function normalizeResult(raw, current = null, locks = []) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new AppError('模型没有返回可用的画面方案。', 502, 'MODEL_FORMAT');
  const reply = textValue(raw.reply, 5000, '助手回复');
  if (!reply) throw new AppError('模型返回了空回复。', 502, 'MODEL_FORMAT');
  const draft = validateDraft(raw.draft);
  // Locks are enforced after inference; composed output never uses an unvalidated free-text prompt.
  for (const key of locks) if (FIELD_KEYS.includes(key) && current) draft.fields[key] = structuredClone(current.fields[key]);
  const suggestions = Array.isArray(raw.suggestions) ? raw.suggestions.slice(0, 3).map(s => textValue(s, 100, '建议')) : [];
  const observations = Array.isArray(raw.observations) ? raw.observations.slice(0, 6).map(o => ({
    label: textValue(o.label, 30, '观察标题'), text: textValue(o.text, 300, '观察内容'),
    certainty: o.certainty === 'seen' ? 'seen' : 'inferred',
  })) : [];
  return { reply, title: textValue(raw.title, 60, '创作名称', true) || '新的画面', draft, suggestions, observations };
}
export function describeChanges(before, after) {
  if (!before) return ['建立第一版画面'];
  const changed = FIELD_DEFS.filter(f => JSON.stringify(before.fields[f.key]) !== JSON.stringify(after.fields[f.key])).map(f => f.label);
  if (before.aspectRatio !== after.aspectRatio) changed.push('比例');
  if (JSON.stringify(before.avoid) !== JSON.stringify(after.avoid)) changed.push('避免内容');
  return changed.length ? [`调整${changed.join('、')}`] : ['画面要素保持不变'];
}
