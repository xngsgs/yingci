import { normalizeResult } from './shared.mjs';
const pair = (zh, en) => ({ zh, en });
export const DEMO_DRAFT = {
  fields: {
    subject: pair('一杯冒着热气的米白色陶瓷咖啡，放在深色木桌上', 'A steaming coffee in an ivory ceramic cup on a dark wooden table'),
    scene: pair('安静的街角咖啡馆，窗上有细密雨滴，窗外街景柔和虚化，窗边有绿植', 'A quiet corner cafe, fine raindrops on the window, softly blurred street outside, green foliage beside the window'),
    composition: pair('近景，咖啡杯位于画面下方，窗框引导视线，背景留有呼吸感', 'Close view, coffee cup in the lower part of the frame, window frame guiding the eye, breathing room in the background'),
    lighting: pair('柔和的窗边侧光，室内暖光与窗外冷光交融，细腻的反光', 'Soft window sidelight, warm interior light blending with cool daylight outside, delicate reflections'),
    palette: pair('低饱和的琥珀棕、米白与雾蓝，少量橄榄绿', 'Muted amber brown, ivory and misty blue, with a touch of olive green'),
    style: pair('有电影氛围的生活摄影，自然材质，克制细腻的颗粒感', 'Cinematic lifestyle photography, natural textures, subtle restrained grain'),
  }, avoid: pair('拥挤的人群、招牌文字、过度锐化', 'Crowds, signage text, oversharpening'), aspectRatio: '4:5',
};
export const DEMO_OBSERVATIONS = [
  { label: '光线', text: '窗外偏冷的自然光，与室内琥珀色暖光交融。', certainty: 'seen' },
  { label: '配色', text: '木桌的棕、陶瓷的米白、雨窗的雾蓝，颜色很克制。', certainty: 'seen' },
  { label: '氛围', text: '雨滴与浅景深让画面显得安静、私密。这是对氛围的解读。', certainty: 'inferred' },
];
export const DEMO_CHOICES = ['换成窗边的小猫', '保留光线，改成插画', '你帮我决定'];
export const DEMO_REPLY = '这张图吸引人的，是雨窗的冷色和室内的暖光，还有安静的留白。\n\n我先保留这些特点，把画面整理成右侧的第一版。你可以直接复制，也可以继续告诉我想改哪里。\n\n如果已经喜欢现在的光线，点一下右侧的小锁，接下来我就会保留它。';
export function demoResult(message, current, locks) {
  const draft = structuredClone(current || DEMO_DRAFT);
  let reply;
  if (message === DEMO_CHOICES[0]) {
    draft.fields.subject = pair('一只蜷在窗边软垫上熟睡的橘猫，毛发松软自然', 'A ginger cat sleeping curled up on a cushion beside the window, soft natural fur');
    draft.fields.composition = pair('近景，橘猫占据画面下方，雨窗留出空间，视线自然落在猫的脸上', 'Close view, ginger cat in the lower frame, breathing room around the rainy window, focus resting naturally on the cat’s face');
    reply = '好，把咖啡换成一只在窗边睡觉的小猫，保留雨窗、配色和原来的光线。\n\n我也把构图围绕小猫重新整理了。已锁定的要素会保持原样。';
  } else if (message === DEMO_CHOICES[1]) {
    draft.fields.style = pair('细腻的手绘插画，柔和笔触，纸张质感与电影般的光影', 'Delicate hand-painted illustration, soft brushwork, paper texture and cinematic light');
    reply = '我把表现方式改成柔和的手绘插画。光线和配色保留，主体与场景也延续当前版本。\n\n右侧可以切换中英文，查看每个画面要素。';
  } else if (message === DEMO_CHOICES[2]) {
    draft.fields.composition = pair('稍拉远的近景，主体偏下，拱形窗框形成自然取景，保留窗外雨景的留白', 'A slightly wider close view, subject placed low, arched window framing the scene naturally, negative space for the rain outside');
    reply = '我建议先把构图稍微拉远，让窗框和雨景多一些呼吸空间。主体、光线和配色都沿用当前版本。\n\n这是一个构图建议，你可以在版本记录里恢复之前的方案。';
  } else return null;
  return normalizeResult({ title: draft.fields.subject.zh.includes('猫') ? '雨窗边的小憩' : '雨窗边的慢时光', reply, draft, suggestions: DEMO_CHOICES, observations: DEMO_OBSERVATIONS }, current, locks);
}
