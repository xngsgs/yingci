import { FIELD_DEFS } from './shared.mjs';
import { STYLE_PRESETS, applyStylePreset, filterPresets } from './presets.mjs';
import { FEEDBACK_ISSUES, normalizeFeedback } from './feedback.mjs';
import { formattedPrompt } from './studio.mjs';
import { icon } from './icons.mjs';

const $ = id => document.getElementById(id);
const node = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text != null) element.textContent = text;
  return element;
};

export function mountWorkspace(app) {
  let active = 'studio', tab = 'presets', category = 'all';
  let favorites = [], loading = false, libraryError = '', selectedRecipe;
  let favoriteDraft, favoriteEditing = null, libraryBusy = false;
  let renderedProjectId;
  let uploadEpoch = 0, uploading = false;

  function show(view) {
    if (!['studio', 'library', 'review'].includes(view)) view = 'studio';
    active = view;
    for (const key of ['studio', 'library', 'review']) $(`${key}-view`).hidden = key !== view;
    $('studio-tabs').hidden = view !== 'studio';
    document.querySelectorAll('[data-workspace]').forEach(button => {
      if (button.dataset.workspace === view) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    history.replaceState(null, '', view === 'studio' ? location.pathname : `#${view}`);
    if (view === 'library') loadFavorites();
    render();
  }

  async function loadFavorites() {
    if (loading) return;
    loading = true; libraryError = ''; renderLibrary();
    try { favorites = await app.api('/api/library', undefined, 'GET'); }
    catch (error) { libraryError = error.message; }
    finally { loading = false; renderLibrary(); }
  }

  function swatches(colors) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 300 64'); svg.setAttribute('aria-hidden', 'true');
    colors.forEach((color, i) => {
      const rect = document.createElementNS(svg.namespaceURI, 'rect');
      rect.setAttribute('x', String(i * 100)); rect.setAttribute('width', '100');
      rect.setAttribute('height', '64'); rect.setAttribute('fill', color); svg.append(rect);
    });
    return svg;
  }

  function renderLibrary() {
    $('preset-count').textContent = String(STYLE_PRESETS.length);
    $('favorite-count').textContent = String(favorites.length);
    document.querySelectorAll('[data-library-tab]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.libraryTab === tab)));
    document.querySelectorAll('[data-category]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.category === category)));
    $('preset-filters').hidden = tab !== 'presets';
    $('library-note').textContent = tab === 'presets'
      ? '人工编写的双语预设。应用画风只替换光线、配色和画风，保留你的主体与锁定项。'
      : '收藏保存在本机。可以直接复制、应用画风，或完整复用到一次新创作。';
    const query = $('library-search').value.trim().toLocaleLowerCase();
    const items = tab === 'presets' ? filterPresets(query, category) : favorites.filter(item => {
      const haystack = [item.name, ...item.tags, formattedPrompt(item.draft, 'zh'), formattedPrompt(item.draft, 'en')].join(' ').toLocaleLowerCase();
      return query.split(/\s+/).every(word => haystack.includes(word));
    });
    const status = $('library-status');
    status.classList.toggle('form-error', !!libraryError && tab === 'favorites');
    status.textContent = tab === 'favorites' && libraryError ? `${libraryError} 可重新进入灵感库重试。`
      : tab === 'favorites' && loading ? '正在读取本机收藏……'
      : !items.length ? tab === 'favorites' && !query ? '还没有收藏。在创作页整理好提示词后，点击“收藏提示词”。' : '没有找到匹配内容，试试其他名称或标签。' : '';
    $('library-grid').replaceChildren(...items.map(item => {
      const preset = tab === 'presets', card = node('article', `recipe-card ${preset ? 'preset-card' : 'favorite-card'}`);
      const cover = node('div', 'recipe-cover');
      if (preset) { cover.append(swatches(item.swatches), node('span', '', '配色方向')); }
      else { cover.append(icon('bookmark'), node('span', '', `收藏于 ${new Date(item.created).toLocaleDateString('zh-CN')}`)); }
      const content = node('div', 'recipe-card-content');
      const heading = node('button', 'recipe-title', item.name);
      heading.addEventListener('click', () => openRecipe(item, preset));
      content.append(heading, node('p', 'recipe-summary', preset ? item.description : item.draft.fields.subject.zh || '尚未确定主体'));
      const tags = node('div', 'recipe-tags'); item.tags.slice(0, 4).forEach(tag => tags.append(node('span', '', tag)));
      content.append(tags);
      const actions = node('div', 'recipe-card-actions'), open = node('button', 'text-button', '查看与使用');
      open.append(icon('arrow-right')); open.addEventListener('click', () => openRecipe(item, preset)); actions.append(open);
      if (!preset) {
        const edit = node('button', 'icon-button'); edit.append(icon('edit')); edit.setAttribute('aria-label', `编辑收藏 ${item.name}`);
        edit.addEventListener('click', () => openFavorite(item));
        const remove = node('button', 'icon-button'); remove.append(icon('trash')); remove.setAttribute('aria-label', `删除收藏 ${item.name}`);
        remove.addEventListener('click', async () => {
          if (libraryBusy || !confirm(`删除收藏“${item.name}”？原创作与版本记录仍会保留。`)) return;
          libraryBusy = true; remove.disabled = true;
          try { await app.api(`/api/library/${item.id}`, undefined, 'DELETE'); await loadFavorites(); app.toast('收藏已删除，原创作仍保留。'); }
          catch (error) { app.toast(error.message); }
          finally { libraryBusy = false; remove.disabled = false; }
        });
        actions.append(edit, remove);
      }
      content.append(actions); card.append(cover, content); return card;
    }));
  }

  function openRecipe(item, preset) {
    selectedRecipe = { item, preset };
    $('recipe-kind').textContent = preset ? '人工编写的双语预设' : '本机收藏';
    $('recipe-title').textContent = item.name;
    $('recipe-description').textContent = preset ? item.description : item.tags.join('、') || '可以完整复用，也可以只借鉴画风。';
    $('recipe-fields').replaceChildren(...FIELD_DEFS.map(field => {
      const row = node('section'); row.append(node('h3', '', field.label), node('p', '', item.draft.fields[field.key].zh)); return row;
    }));
    $('recipe-lock-note').textContent = app.currentDraft()
      ? '应用画风仅更新未锁定的光线、配色、画风；主体、场景、构图、比例和避免内容保留。'
      : '当前还没有提示词，应用后将建立完整第一版。';
    $('recipe-dialog').showModal(); renderBusy(app.isBusy());
  }

  function openFavorite(item = null) {
    if (libraryBusy) return;
    const draft = item?.draft || app.currentDraft();
    if (!draft) { app.toast('先整理一版提示词，再收藏。'); return; }
    favoriteDraft = structuredClone(draft); favoriteEditing = item;
    $('favorite-title').textContent = item ? '编辑收藏' : '收藏这份提示词';
    $('favorite-name').value = item?.name || app.getProject().title;
    $('favorite-tags').value = item?.tags.join('、') || '';
    $('favorite-error').hidden = true; $('favorite-dialog').showModal();
  }

  function reviewState() {
    const project = app.getProject();
    return project.review ||= { issues: [], notes: '', reference: null };
  }
  function saveReviewInputs() {
    const review = reviewState();
    review.issues = [...$('review-issues').querySelectorAll('input:checked')].map(input => input.value);
    review.notes = $('review-notes').value;
    app.persist();
  }
  function renderReview() {
    const project = app.getProject(), review = reviewState(), draft = app.currentDraft();
    if (renderedProjectId !== project.id) { $('review-error').hidden = true; renderedProjectId = project.id; uploadEpoch++; uploading = false; }
    $('review-issues').replaceChildren(...FEEDBACK_ISSUES.map(issue => {
      const label = node('label', 'review-issue'), input = node('input'); input.type = 'checkbox'; input.value = issue.key; input.checked = review.issues.includes(issue.key);
      const copy = node('span'); copy.append(node('strong', '', issue.label), node('small', '', issue.hint)); label.append(input, copy);
      input.addEventListener('change', saveReviewInputs); return label;
    }));
    $('review-notes').value = review.notes;
    $('review-image').hidden = !review.reference; $('review-upload-empty').hidden = !!review.reference;
    if (review.reference) $('review-image').src = review.reference.dataUrl; else $('review-image').removeAttribute('src');
    $('review-remove-image').hidden = !review.reference;
    $('review-image-name').textContent = review.reference ? `${review.reference.name} · 点击图片可以更换` : '也可以只描述问题；有图片时，模型能看到实际结果。';
    $('review-version').textContent = draft ? `第 ${project.revisions.length} 版` : '尚无提示词';
    $('review-prompt').textContent = draft ? formattedPrompt(draft, 'zh') : '';
    $('review-empty-hint').hidden = !!draft;
    $('review-locks').textContent = project.locks.length ? `继续保留锁定项：${project.locks.map(key => FIELD_DEFS.find(field => field.key === key).label).join('、')}` : '已满意的要素，可以先在创作页锁定。';
    const images = [project.reference && '目标参考图', review.reference && '实际生成结果图'].filter(Boolean);
    $('review-transmission').textContent = app.getConfig().configured
      ? `点击分析后，${images.length ? images.join('、') + '、' : ''}当前提示词、创作方向、问题描述与最近最多 24 条对话会发送到你连接的模型。`
      : '需要连接视觉模型才能分析与改进。你的问题和结果图可以先保存在本机。';
  }

  function renderBusy(busy) {
    for (const id of ['review-upload', 'review-remove-image', 'review-notes', 'recipe-new', 'recipe-apply']) $(id).disabled = busy;
    $('review-issues').querySelectorAll('input').forEach(input => input.disabled = busy);
    $('review-submit').disabled = busy || uploading || !app.currentDraft();
    $('review-submit').textContent = busy ? '正在分析与整理……' : uploading ? '正在准备图片……' : '分析并改进提示词';
    $('review-cancel').hidden = !busy;
    $('library-save-current').disabled = busy || !app.currentDraft();
    $('save-favorite').disabled = busy || !app.currentDraft();
  }
  function render() { renderReview(); renderLibrary(); renderBusy(app.isBusy()); }

  document.querySelectorAll('[data-workspace]').forEach(button => button.addEventListener('click', () => show(button.dataset.workspace)));
  document.querySelectorAll('[data-library-tab]').forEach(button => button.addEventListener('click', () => { tab = button.dataset.libraryTab; renderLibrary(); }));
  document.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => { category = button.dataset.category; renderLibrary(); }));
  $('library-search').addEventListener('input', renderLibrary);
  for (const id of ['save-favorite', 'library-save-current']) $(id).addEventListener('click', () => openFavorite());
  $('favorite-form').addEventListener('submit', async event => {
    event.preventDefault(); if (libraryBusy) return;
    const item = { id: favoriteEditing?.id || crypto.randomUUID(), name: $('favorite-name').value.trim(), tags: $('favorite-tags').value.split(/[,，、]/).map(value => value.trim()).filter(Boolean), draft: favoriteDraft, created: favoriteEditing?.created || Date.now() };
    libraryBusy = true; $('favorite-submit').disabled = true; $('favorite-error').hidden = true;
    try { await app.api(`/api/library/${item.id}`, item, 'PUT'); $('favorite-dialog').close(); await loadFavorites(); app.toast('已保存在本机收藏，可到灵感库复用。'); }
    catch (error) { $('favorite-error').textContent = error.message; $('favorite-error').hidden = false; }
    finally { libraryBusy = false; $('favorite-submit').disabled = false; }
  });
  $('recipe-copy').addEventListener('click', async () => {
    if (!selectedRecipe) return;
    try { await navigator.clipboard.writeText(formattedPrompt(selectedRecipe.item.draft, 'zh')); app.toast('已复制这份中文提示词。'); }
    catch { app.toast('复制未完成，请到创作页导出提示词。'); }
  });
  $('recipe-new').addEventListener('click', () => {
    if (!selectedRecipe || app.isBusy()) return;
    const { item, preset } = selectedRecipe;
    app.startDraft(item.name, structuredClone(item.draft), preset ? item.exampleGoal : '从收藏的提示词继续完善');
    $('recipe-dialog').close(); show('studio'); app.toast('已建立新创作，原创作仍然保留。');
  });
  $('recipe-apply').addEventListener('click', () => {
    if (!selectedRecipe || app.isBusy()) return;
    const before = app.currentDraft(), after = applyStylePreset(before, selectedRecipe.item, app.getProject().locks);
    if (JSON.stringify(before) === JSON.stringify(after)) { app.toast('这些画风要素已相同或已锁定，没有修改。'); return; }
    app.applyDraft(after, `应用“${selectedRecipe.item.name}”的画风要素`);
    $('recipe-dialog').close(); show('studio'); app.toast('画风已应用，原有版本仍保留。');
  });
  $('review-notes').addEventListener('change', saveReviewInputs);
  $('review-notes').addEventListener('input', () => { reviewState().notes = $('review-notes').value; });
  $('review-upload').addEventListener('click', () => $('review-file').click());
  $('review-file').addEventListener('change', async event => {
    const file = event.target.files[0]; event.target.value = ''; if (!file || app.isBusy()) return;
    const epoch = ++uploadEpoch; uploading = false;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 15 * 1024 * 1024) { app.toast('请选择不超过 15 MB 的 PNG、JPG 或 WebP 图片。'); renderBusy(app.isBusy()); return; }
    const id = app.getProject().id; uploading = true; renderBusy(app.isBusy());
    try {
      const dataUrl = await app.resizeImage(file); if (app.getProject().id !== id || epoch !== uploadEpoch) return;
      reviewState().reference = { name: file.name.slice(0, 160), dataUrl }; app.persist(); render();
    } catch (error) { if(epoch===uploadEpoch)app.toast(error.message || '图片无法读取，请换一张图片。'); }
    finally { if(epoch===uploadEpoch){uploading=false;renderBusy(app.isBusy());} }
  });
  $('review-remove-image').addEventListener('click', () => { uploadEpoch++; uploading=false; reviewState().reference = null; app.persist(); render(); });
  $('review-form').addEventListener('submit', async event => {
    event.preventDefault(); if (app.isBusy() || uploading) return; saveReviewInputs();
    $('review-error').hidden = true;
    try {
      const review = reviewState(), feedback = normalizeFeedback({ issues: review.issues, notes: review.notes });
      if (!app.getConfig().configured) { app.openSettings(); return; }
      const applied = await app.reviewDraft(feedback, review.reference);
      if (applied) { show('studio'); app.switchPanel('prompt'); app.toast('已建立复盘修改版，可查看本轮改动。'); }
    } catch (error) { $('review-error').textContent = error.message; $('review-error').hidden = false; }
  });
  $('review-cancel').addEventListener('click', () => { app.cancelRequest(); app.renderAll(); app.toast('已取消复盘，原提示词与问题已保留。'); });
  return { show, render, renderBusy, get active() { return active; } };
}
