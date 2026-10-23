import { validateDraft } from './shared.mjs';

// Authored starting points, not model output. The three appearance fields can be
// borrowed independently from each preset's complete example scene.
const pair = (zh, en) => ({ zh, en });
const draft = (subject, scene, composition, lighting, palette, style, avoid, aspectRatio) =>
  validateDraft({
    fields: { subject, scene, composition, lighting, palette, style },
    avoid,
    aspectRatio,
  });

export const STYLE_PRESETS = [
  {
    id: 'cinematic-photo',
    name: '电影感摄影',
    category: 'photo',
    description: '侧逆光勾出轮廓，暗部保留纹理，用冷暖距离建立安静的叙事感。',
    tags: ['摄影', '电影', '叙事', '冷暖', 'cinematic', 'photography'],
    swatches: ['#243940', '#b88056', '#e5d2b1'],
    exampleGoal: '做一张雨后街角的人物剧照，安静，有故事感。',
    draft: draft(
      pair('一位穿深色棉质外套的年轻人，手提合拢的雨伞，停步望向街口', 'A young adult in a dark cotton coat, holding a closed umbrella and pausing to look toward the street corner'),
      pair('雨后的小街，湿石路面反射远处店铺的暖光，背景只有少量行人', 'A narrow street after rain, wet stone pavement reflecting warm shop lights in the distance, with only a few people in the background'),
      pair('横向中景，人物位于右侧三分之一处，左侧街道向远处延伸，平视拍摄', 'A horizontal medium shot at eye level, the person on the right third and the street extending into the distance on the left'),
      pair('低角度暖色侧逆光勾出主体轮廓，冷色环境光填充暗部，保留阴影内部层次', 'Low warm side-backlight outlining the subject, cool ambient light filling darker areas, and visible tonal layers within the shadows'),
      pair('以灰青色和炭灰色为底，局部琥珀色高光，固有色保持自然，阴影低饱和', 'A base of muted blue-green and charcoal, localized amber highlights, natural local colors, and low-saturation shadows'),
      pair('实景叙事摄影，保留物体本身的材质纹理，轻微胶片颗粒，柔和高光过渡，背景适度虚化', 'Location-based narrative photography preserving the subject\'s existing material textures, with subtle film grain, gentle highlight roll-off, and moderate background blur'),
      pair('大面积霓虹光，过度磨皮，纯黑无细节暗部，字幕，水印', 'Large neon washes, excessive skin smoothing, featureless crushed blacks, subtitles, watermarks'),
      '16:9',
    ),
  },
  {
    id: 'everyday-film',
    name: '日常胶片',
    category: 'photo',
    description: '午后窗光、褪色布料与细颗粒，适合有生活温度的日常片段。',
    tags: ['摄影', '胶片', '日常', '自然光', 'film', 'everyday', 'photography'],
    swatches: ['#e0cfab', '#8b9b83', '#c28a72'],
    exampleGoal: '把窗边喝茶的小场景拍得自然，像一张留存的生活照片。',
    draft: draft(
      pair('一只浅色陶杯，杯口有少量热气，旁边放着翻开的书和一副细框眼镜', 'A pale ceramic cup with a little steam rising from its rim, beside an open book and a pair of thin-framed glasses'),
      pair('午后的家中窗边，旧木桌与米色亚麻窗帘，窗外是模糊的树叶', 'Beside a window at home in the afternoon, an aged wooden table and beige linen curtains, with blurred leaves outside'),
      pair('略微俯视的近景，杯子偏左，书页从右下进入画面，保留随手拍摄的轻微不对称', 'A close view from slightly above, the cup left of center and book pages entering from the lower right, retaining the slight asymmetry of a casual snapshot'),
      pair('大面积自然侧光，浅影的边缘模糊，高光不过曝，保留环境反射带来的细微明暗', 'Broad natural side light, faint soft-edged shadows, highlights held below clipping, and subtle value shifts from reflected ambient light'),
      pair('奶油米色、褪色鼠尾草绿和温和的陶土棕，白色略偏暖，整体饱和度克制', 'Cream beige, faded sage green, and gentle terracotta brown, with slightly warm whites and restrained overall saturation'),
      pair('日常胶片照片，细小颗粒与轻微色彩偏移，保留主体原有的表面纹理与使用痕迹，光学虚化自然', 'Everyday film photography with fine grain and a slight color shift, preserving the subject\'s existing surface texture and signs of use, with natural optical blur'),
      pair('重度复古滤镜，明显漏光边框，塑料材质，摆拍式整齐排列，文字，水印', 'Heavy vintage filters, prominent light-leak borders, plastic textures, rigid staged arrangements, text, watermarks'),
      '4:5',
    ),
  },
  {
    id: 'anime-illustration',
    name: '日系动画插画',
    category: 'illustration',
    description: '清晰线稿和分层色块，用天空反光与暖色边光塑造人物。',
    tags: ['插画', '动画', '日系', '角色', 'anime', 'cel shading', 'illustration'],
    swatches: ['#789fc6', '#f1cf9c', '#797b9f'],
    exampleGoal: '画一个放学后停在天桥上的原创角色，风吹起衣角。',
    draft: draft(
      pair('一位背帆布包的原创青年角色，穿轻薄夹克，手扶栏杆，衣角被风轻轻吹起', 'An original young adult character with a canvas bag and a light jacket, resting a hand on a railing as the wind gently lifts the jacket hem'),
      pair('傍晚的城市天桥，远处屋顶和电线杆层层退远，天空有薄云', 'An urban pedestrian bridge at dusk, with rooftops and utility poles receding in layers beneath a sky of thin clouds'),
      pair('腰部以上的三分之二侧面视角，角色置于左侧，右侧留出天空和城市远景，栏杆形成引导线', 'A waist-up three-quarter side view, the character on the left with open sky and distant city on the right, the railing forming a leading line'),
      pair('暖色低角度光描出受光轮廓，蓝色环境反光填充阴影，主体以清楚的两级明暗区分', 'Warm low-angle light tracing illuminated contours, blue ambient reflections filling shadows, with two clearly separated shading values on the subject'),
      pair('清透的蓝色、浅杏色高光和灰紫色阴影，以少量低饱和深色稳定画面重心', 'Clear blues, pale apricot highlights, and muted violet shadows, with small areas of low-saturation dark color anchoring the visual weight'),
      pair('日系动画场景插画，干净且有粗细变化的线条，分层赛璐璐阴影，按结构组织色块，背景使用简化笔触', 'Japanese-animation-inspired scene illustration with clean variable-width lines, layered cel shading, color shapes organized by structure, and simplified background brushwork'),
      pair('临摹已有角色，照片皮肤，厚重油画笔触，多余手指，杂乱发丝，字幕，水印', 'Existing copyrighted character lookalikes, photographic skin, heavy oil-paint strokes, extra fingers, tangled hair strands, subtitles, watermarks'),
      '4:5',
    ),
  },
  {
    id: 'watercolor-illustration',
    name: '纸上水彩',
    category: 'illustration',
    description: '透明叠色、纸张留白与湿边晕染，保留画笔和纸纤维的痕迹。',
    tags: ['插画', '水彩', '纸张', '手绘', 'watercolor', 'paper', 'illustration'],
    swatches: ['#efe6cf', '#87a38c', '#d4a06e'],
    exampleGoal: '用纸上水彩画一间被绿植围住的小咖啡店。',
    draft: draft(
      pair('一间有木框玻璃门的小咖啡店，门前摆着两盆叶片舒展的绿植', 'A small cafe with a timber-framed glass door and two pots of spreading green plants at the entrance'),
      pair('安静的人行道一角，米色墙面、低矮台阶，窗内能看到空着的圆桌', 'A quiet corner of a sidewalk with beige walls and low steps, an empty round table visible through the window'),
      pair('正面略偏侧的平视构图，建筑轮廓集中在中央，四周保留不规则的纸面留白', 'An eye-level view slightly off the front, the building silhouette centered with irregular areas of blank paper around it'),
      pair('漫射光，以一层淡冷色表现阴影，最亮处通过纸面留白表达，不画硬质光斑', 'Diffuse light, a thin cool wash describing shadows, and reserved white paper indicating the brightest areas without hard specular spots'),
      pair('暖米色纸底、灰绿色与稀释的赭石为主，少量浅蓝色用于冷色过渡', 'A warm beige paper base, mainly grey-green and diluted ochre, with a little pale blue for cool transitions'),
      pair('冷压水彩纸上的透明水彩，湿画法柔化部分边缘，干笔刻画主体原有的纹理，颜料有轻微沉积与扩散', 'Transparent watercolor on cold-pressed paper, wet-on-wet passages softening selected edges, dry brush defining the subject\'s existing textures, with slight pigment granulation and diffusion'),
      pair('统一硬边描线，塑料般光泽，数字喷枪渐变，密集细节填满留白，招牌文字，水印', 'Uniform hard outlines, plastic gloss, digital airbrush gradients, dense detail filling the reserved paper, sign lettering, watermarks'),
      '1:1',
    ),
  },
  {
    id: 'product-still-life',
    name: '产品静物',
    category: 'photo',
    description: '柔光箱控制轮廓与反射，让磨砂、玻璃和金属各自有明确质地。',
    tags: ['摄影', '产品', '静物', '商业', 'product', 'still life', 'studio'],
    swatches: ['#e7dfd1', '#687469', '#b39971'],
    exampleGoal: '给一支磨砂玻璃香氛瓶做干净的产品展示，留出标题空间。',
    draft: draft(
      pair('一支无品牌的磨砂玻璃香氛瓶，配拉丝金属瓶盖，瓶内可见浅色液体', 'An unbranded frosted-glass fragrance bottle with a brushed-metal cap and pale liquid visible inside'),
      pair('暖灰色无缝背景与浅色石材台面，旁边只有一片弯曲的绿叶', 'A warm-grey seamless backdrop and a pale stone surface, accompanied by a single curved green leaf'),
      pair('产品偏右的正面近景，镜头高度与瓶身中段齐平，左侧留出完整空白区域，竖直边线保持平行', 'A front close-up with the product on the right, camera level with the middle of the bottle, a clear empty area on the left, and vertical edges kept parallel'),
      pair('左前方大型柔光箱形成宽而连续的反射，右侧白卡补光，背后窄条灯分离主体边缘，接触阴影柔和', 'A large softbox at front left creating broad continuous reflections, a white fill card on the right, a narrow strip light behind separating the subject edge, and soft contact shadows'),
      pair('暖灰与石白为底，低饱和灰绿色与香槟色点缀，不加入额外彩色灯光', 'Warm grey and stone white as the base, low-saturation grey-green and champagne accents, and no additional colored lighting'),
      pair('棚拍产品摄影，依据物体原有材质准确呈现透光、反射与微纹理，不更换材质，主体边缘清晰，背景平整', 'Studio product photography accurately showing translucency, reflections, and microtexture appropriate to the existing materials, without replacing them, with crisp subject edges and a smooth background'),
      pair('虚构品牌文字，扭曲瓶口，漂浮底座，爆白反光，过多道具，水印', 'Invented brand lettering, distorted bottle openings, floating bases, blown-out reflections, excessive props, watermarks'),
      '4:5',
    ),
  },
  {
    id: 'isometric-3d',
    name: '等距 3D 场景',
    category: '3d',
    description: '正交镜头配合有厚度的圆角结构，适合小屋、工作区与说明场景。',
    tags: ['三维', '3D', '等距', '微缩', 'isometric', 'orthographic', 'render'],
    swatches: ['#ece4d5', '#85aaa1', '#d49976'],
    exampleGoal: '做一个等距视角的阅读角，能看清家具的结构和摆放。',
    draft: draft(
      pair('一个微缩阅读角，包含弧背扶手椅、带书的矮架和一盏细杆落地灯', 'A miniature reading nook containing a curved-back armchair, a low shelf with books, and a slender floor lamp'),
      pair('两面相交的浅色墙和一块有厚度的木地板底座，墙上开一扇宽窗', 'Two intersecting pale walls and a thick wooden floor base, with a wide window cut into one wall'),
      pair('正交等距视角，从前上方观察，两个墙面均可见，家具彼此留有间隙，底座完整入画', 'An orthographic isometric view from above and in front, showing both walls, with gaps between the furniture and the complete base in frame'),
      pair('大面积侧上方柔光，投影朝同一方向延伸，物体接触处有柔和的遮蔽，顶面不出现刺眼亮斑', 'Broad soft light from above and to the side, cast shadows extending in one direction, gentle occlusion at object contacts, and no harsh highlights on top surfaces'),
      pair('奶油色、灰绿色与浅木色为主，少量陶土色点缀，色块关系明确', 'Mainly cream, grey-green, and pale wood tones, with a few terracotta accents and clearly separated color masses'),
      pair('风格化三维模型渲染，实体结构有合理厚度，边缘小幅倒角，主体呈低反射的哑光表面，细节简化但不堆叠零散方块', 'A stylized 3D render with plausible structural thickness, small edge bevels, low-reflectivity matte surfaces, and simplified detail without piles of disconnected blocks'),
      pair('透视消失点，薄纸片家具，零件相互穿插，镜面塑料，悬空接触，文字，水印', 'Perspective vanishing points, paper-thin furniture, intersecting components, mirror-like plastic, floating contacts, text, watermarks'),
      '1:1',
    ),
  },
  {
    id: 'ink-wash',
    name: '留白水墨',
    category: 'illustration',
    description: '以墨色浓淡区分远近，干笔和飞白建立山石与树枝的质感。',
    tags: ['插画', '水墨', '东方', '留白', 'ink wash', 'sumi', 'landscape'],
    swatches: ['#efece2', '#89928a', '#323d3b'],
    exampleGoal: '画一条雾中山路，让小亭和松树在留白里显出来。',
    draft: draft(
      pair('一座小亭依在山路转弯处，亭旁一株松树枝干向画面内伸展', 'A small pavilion beside a bend in a mountain path, with a pine extending its branches inward across the picture'),
      pair('雾气弥漫的山谷，近处有碎石和草坡，远山被空白与淡墨分隔', 'A misty mountain valley, with stones and grassy slopes nearby and distant peaks separated by blank paper and pale ink'),
      pair('竖幅构图，松树与山石从左下进入，小亭位于下方三分之一，右上大面积留白，山路曲折引向远处', 'A vertical composition, pine and rocks entering from the lower left, the pavilion in the lower third, a large blank area at upper right, and a winding path leading into the distance'),
      pair('漫射雾光，不画明确光束，以淡墨与纸白表现空气，近景墨色较重，远处逐层变浅', 'Diffuse mist light without explicit beams, pale ink and paper white describing the air, darker ink in the foreground and progressively lighter values in the distance'),
      pair('暖白纸色与层次分明的灰黑墨色，仅加入少量灰绿色作为点缀', 'Warm-white paper and distinct layers of grey-black ink, with only a small amount of grey-green as an accent'),
      pair('纸上水墨，湿墨晕染柔化边缘，干笔与飞白刻画近处纹理，线条有书写性转折，保留纸面呼吸', 'Ink wash on paper, wet ink diffusing to soften edges, dry brush and broken ink defining nearby textures, calligraphic turns in the lines, and breathing space on the paper'),
      pair('发光轮廓，金属质感山石，满幅细节，浓艳渐变，题字，印章，水印', 'Glowing outlines, metallic rocks, detail covering the whole page, saturated gradients, calligraphy, seals, watermarks'),
      '3:4',
    ),
  },
  {
    id: 'editorial-flat',
    name: '平面编辑插画',
    category: 'illustration',
    description: '用简明轮廓、大色块和纸质颗粒，把概念讲清楚，适合文章配图。',
    tags: ['插画', '平面', '编辑', '封面', 'flat', 'editorial', 'graphic'],
    swatches: ['#e8d3a5', '#4c7473', '#c5634c'],
    exampleGoal: '给一篇关于专注阅读的文章画封面，图形简洁，预留标题位置。',
    draft: draft(
      pair('一位坐着阅读的人物，膝上摊开一本书，身旁有一株宽叶植物', 'A seated person reading an open book on their lap, beside a broad-leaved plant'),
      pair('简化的室内一角，用一扇窗和一块地毯提示空间，不添加细碎装饰', 'A simplified interior corner, with a window and a rug suggesting the space and no small decorative clutter'),
      pair('方形画面，人物和植物组成右下的稳定色块，左上保留大片空白，轮廓之间有清楚间隔', 'A square image, the person and plant forming a stable color mass at the lower right, a large blank area at upper left, and clear spacing between silhouettes'),
      pair('用平面明暗色块提示侧光，投影为单一柔和几何形，不使用连续立体渐变', 'Flat value shapes suggesting side light, a single soft geometric shape for the cast shadow, and no continuous volumetric gradients'),
      pair('暖米黄色背景、深灰青色主体、陶土红色小面积点缀，控制在三组主色内', 'A warm ochre-beige background, dark muted teal for the subject, and small terracotta-red accents, limited to three main color groups'),
      pair('平面编辑插画，简洁但有不规则感的轮廓，哑光大色块，少量叠印错位与纸面颗粒，省略细碎的内部刻画', 'Flat editorial illustration with simple slightly irregular silhouettes, large matte color shapes, subtle overprint misregistration and paper grain, and omitted small internal details'),
      pair('照片纹理，玻璃高光，三维体积渐变，细密线稿，自动生成的标题文字，水印', 'Photographic textures, glass highlights, volumetric 3D gradients, dense linework, automatically generated title lettering, watermarks'),
      '1:1',
    ),
  },
];

const STYLE_FIELDS = ['lighting', 'palette', 'style'];

/** Borrow a preset's appearance while preserving the current scene and locks. */
export function applyStylePreset(currentDraft, preset, locks = []) {
  const presetDraft = validateDraft(preset?.draft);
  if (!currentDraft) return presetDraft;
  const merged = validateDraft(currentDraft);
  const locked = new Set(locks);
  for (const key of STYLE_FIELDS) {
    if (!locked.has(key)) merged.fields[key] = structuredClone(presetDraft.fields[key]);
  }
  return validateDraft(merged);
}

/** Search authored metadata only; an empty query returns the chosen category. */
export function filterPresets(query = '', category = 'all') {
  const terms = String(query).trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  return STYLE_PRESETS.filter(preset => {
    if (category !== 'all' && preset.category !== category) return false;
    const text = [preset.name, preset.description, preset.exampleGoal, ...preset.tags]
      .join(' ').toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  });
}
