import {AppError, textValue} from './shared.mjs';

export const FEEDBACK_ISSUES = [
  {key: 'subject', label: '主体不符合预期', hint: '人物、物体、数量或动作与想法有偏差'},
  {key: 'composition', label: '构图不理想', hint: '位置、视角、远近或画面留白需要调整'},
  {key: 'lighting', label: '光线不对', hint: '明暗、光源方向或光线的软硬需要调整'},
  {key: 'palette', label: '颜色不满意', hint: '主色、冷暖或饱和度与预期不同'},
  {key: 'style', label: '画风不一致', hint: '表现方式、材质或笔触偏离想要的感觉'},
  {key: 'artifacts', label: '细节有瑕疵', hint: '出现多余肢体、变形、杂乱文字等细节问题'},
];

const ISSUE_KEYS = new Set(FEEDBACK_ISSUES.map(issue => issue.key));

export function normalizeFeedback(value) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new AppError('效果反馈格式不正确。');
  const rawIssues = value.issues === undefined ? [] : value.issues;
  if (!Array.isArray(rawIssues) || rawIssues.length > FEEDBACK_ISSUES.length || rawIssues.some(key => !ISSUE_KEYS.has(key))) {
    throw new AppError('请选择支持的效果问题，最多选择六项。');
  }
  const issues = [...new Set(rawIssues)];
  const notes = textValue(value.notes === undefined ? '' : value.notes, 1200, '效果反馈补充说明');
  if (!issues.length && !notes) throw new AppError('请至少选择一个效果问题，或补充具体说明。');
  return {issues, notes};
}

export function feedbackMessage(value) {
  const feedback = normalizeFeedback(value);
  if (!feedback) return '';
  const issues = feedback.issues.map(key => {
    const issue = FEEDBACK_ISSUES.find(item => item.key === key);
    return `${issue.label}（${issue.hint}）`;
  });
  return [
    '请根据当前提示词和这次效果反馈，提出有针对性的提示词修订。',
    '下面的勾选项和补充说明是用户报告的问题，不是对图片的客观检测结论。只有当前请求附有生成结果图时，才可描述图中实际可见的细节；没有结果图时，不要声称已经看过或分析过生成效果。参考图表达目标，生成结果图表达本次结果，请勿混淆。',
    `用户报告的问题：${issues.length ? issues.join('；') : '未勾选，见补充说明'}。`,
    `用户补充说明：${feedback.notes ? JSON.stringify(feedback.notes) : '无'}。`,
    '把问题落实为具体、可执行的画面描述或避免内容，保留本轮未要求改变的主体设定和用户满意的部分。仅修改本轮问题涉及的要素；确需联动修改时，在回复中解释原因。未要求修改的内容保持原样，所有已锁定的要素必须保留；反馈与锁定冲突时说明冲突，不要绕过锁定。',
    '在 editedFields 中逐项声明本轮确实需要修改的字段（subject、scene、composition、lighting、palette、style、avoid、aspectRatio），不要遗漏或笼统地声明全部修改。返回与该修改计划一致的完整双语 draft，并简要解释每项修改如何回应反馈。不要承诺修改提示词就能保证消除生成瑕疵，也不要编造重新生图或模型评测结果。',
  ].join('\n');
}
