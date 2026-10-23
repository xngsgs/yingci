import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELD_KEYS, validateDraft } from '../public/shared.mjs';
import { STYLE_PRESETS, applyStylePreset, filterPresets } from '../public/presets.mjs';

test('the eight authored presets contain complete bilingual drafts and usable metadata', () => {
  assert.equal(STYLE_PRESETS.length, 8);
  assert.equal(new Set(STYLE_PRESETS.map(preset => preset.id)).size, 8);
  for (const preset of STYLE_PRESETS) {
    assert.deepEqual(validateDraft(preset.draft), preset.draft);
    assert.ok(preset.name && preset.description && preset.exampleGoal);
    assert.ok(['photo', 'illustration', '3d'].includes(preset.category));
    assert.equal(preset.swatches.length, 3);
    assert.ok(preset.swatches.every(color => /^#[\da-f]{6}$/iu.test(color)));
    assert.ok(preset.tags.length >= 3);
    for (const key of FIELD_KEYS) {
      assert.ok(preset.draft.fields[key].zh);
      assert.ok(preset.draft.fields[key].en);
    }
    assert.ok(preset.draft.avoid.zh && preset.draft.avoid.en);
  }
});

test('starting from a preset returns an independent validated draft', () => {
  const preset = STYLE_PRESETS[0];
  const output = applyStylePreset(null, preset);
  assert.deepEqual(output, preset.draft);
  output.fields.subject.zh = '独立修改';
  output.avoid.en = 'Changed';
  assert.notEqual(output.fields.subject.zh, preset.draft.fields.subject.zh);
  assert.notEqual(output.avoid.en, preset.draft.avoid.en);
  assert.throws(() => applyStylePreset(null, { draft: {} }));
});

test('applying a style preserves subject, scene, composition, ratio and avoid content', () => {
  const current = structuredClone(STYLE_PRESETS[0].draft);
  const before = structuredClone(current);
  const preset = STYLE_PRESETS[3];
  const output = applyStylePreset(current, preset);
  for (const key of ['subject', 'scene', 'composition']) {
    assert.deepEqual(output.fields[key], before.fields[key]);
  }
  for (const key of ['lighting', 'palette', 'style']) {
    assert.deepEqual(output.fields[key], preset.draft.fields[key]);
  }
  assert.equal(output.aspectRatio, before.aspectRatio);
  assert.deepEqual(output.avoid, before.avoid);
  assert.deepEqual(current, before);
  output.fields.lighting.zh = '仅修改结果';
  assert.notEqual(preset.draft.fields.lighting.zh, output.fields.lighting.zh);
});

test('locked appearance fields survive preset application in both languages', () => {
  const current = STYLE_PRESETS[0].draft;
  const preset = STYLE_PRESETS[3];
  const output = applyStylePreset(current, preset, ['lighting', 'style', 'subject']);
  assert.deepEqual(output.fields.lighting, current.fields.lighting);
  assert.deepEqual(output.fields.style, current.fields.style);
  assert.deepEqual(output.fields.palette, preset.draft.fields.palette);
  assert.deepEqual(applyStylePreset(current, preset, FIELD_KEYS), current);
});

test('borrowing any preset does not introduce its example objects through appearance text', () => {
  const current = structuredClone(STYLE_PRESETS[1].draft);
  current.fields.subject = { zh: '一只玻璃小鸟', en: 'A small glass bird' };
  // Regression cases: these object parts previously leaked from the full
  // examples into unrelated subjects when only appearance was borrowed.
  const exampleObjects = /肩部|面部|发梢|衣边|门檐|木框|叶脉|瓶身|叶片|家具|书脊|松针|松枝|山石|shoulders|facial|hair tips|clothing edges|awning|timber frames|leaf veins|bottle edges|furniture|book spines|pine needles|pine branches|foreground rocks/iu;
  for (const preset of STYLE_PRESETS) {
    const output = applyStylePreset(current, preset);
    const appearance = ['lighting', 'palette', 'style'].map(key =>
      `${output.fields[key].zh} ${output.fields[key].en}`).join(' ');
    assert.doesNotMatch(appearance, exampleObjects, preset.id);
    assert.deepEqual(output.fields.subject, current.fields.subject);
  }
});

test('preset search supports Chinese, case-insensitive English, multiple terms and categories', () => {
  assert.equal(filterPresets().length, 8);
  assert.deepEqual(filterPresets('水彩').map(preset => preset.id), ['watercolor-illustration']);
  assert.deepEqual(filterPresets('  FILM  everyday ').map(preset => preset.id), ['everyday-film']);
  assert.deepEqual(filterPresets('', '3d').map(preset => preset.id), ['isometric-3d']);
  assert.equal(filterPresets('水彩', 'photo').length, 0);
  assert.equal(filterPresets('不存在的风格').length, 0);
  assert.equal(filterPresets('', 'unknown').length, 0);
});
