# 장비·성급 아트 적용

- 생성 방식: 내장 이미지 생성 도구. 기존 원화를 스타일·손잡이 위치 참조로 사용.
- 저장 위치: index.html의 applyArt 함수 evolved 테이블에 투명 PNG 14종 내장.
- 조합 무기 9종: weaponRecipes.assetId에서 연결. 기존 손잡이 좌표·회전·축척 유지.
- 성급: 1성 배지, 2성 직업 장식 추가, 3성 후면 문장 추가. visuals.rankPose에서 위치·크기 수정.
- 속성 중첩: 2중첩부터 무기 광채, 3중첩에 CSS 입자. 무기 없는 속성은 몸 주변. 전투 규칙 변경 없음.
- 96개 렌더링 결과 캐시 제한, 비동기 렌더 교체 보호, 합성 완료 후 부착 애니메이션.
- 검증: JavaScript 문법, 콘텐츠 참조, 12명×9조합×4성급 432개 합성 선택 및 레이어 순서 검사 통과.
- 사용자가 화면 검증을 담당. 실제 합성 위치와 모바일 애니메이션 타이밍은 미검증.
- 작업 환경 연결 중단으로 WebP 압축을 수행하지 못해 파일이 약 2.46MB에서 10.64MB로 증가. 압축 최적화 필요.

## 제작 프롬프트

### flame_sword
Create ONE transparent game sprite: flame sword evolution of reference sword. Match thick dark brown outline and simple flat cel shading, cute fantasy sticker art. Upright centered sword pointing up, same silhouette scale and straight brown grip position at 50% canvas width 81% height as reference. Replace blade with bright orange red flame-shaped metal, yellow hot core, red-gold crossguard. Whole object inside canvas, generous clear margin, no detached particles, no text, no hand or character. True alpha background. Square image. Reference is style and grip alignment guide.

### reflux_sword
Use case: stylized-concept. Create ONE production game sprite, evolved sword. Water reflux sword: turquoise curved wave-shaped metal blade, flowing backward hook near tip, pale cyan core and blue-gold guard. Match supplied reference thick dark brown outline, simple flat cel shading, cute fantasy sticker look. True transparent background. Square canvas, upright entire weapon, generous clear margin. Preserve reference grip center position: 50% width, 81% height so character hand can hold it. Keep reference weapon proportions and upright orientation. No text, no character, no hand, no floor, no detached particles. Reference is style and alignment guide.

### hone_sword
Use case: stylized-concept. Create ONE production game sprite, evolved sword. Honed lightning sword: very sharp angular silver blade, gold lightning bolt inset through center and electric violet small facets, gold guard. Distinct serrated lightning edge, still visibly a sword. Match supplied reference thick dark brown outline, simple flat cel shading, cute fantasy sticker look. True transparent background. Square canvas, upright entire weapon, generous clear margin. Preserve reference grip center position: 50% width, 81% height so character hand can hold it. Keep reference weapon proportions and upright orientation. No text, no character, no hand, no floor, no detached particles. Reference is style and alignment guide.

### blast_bow
Use case: stylized-concept. Create ONE production game sprite, evolved bow. Explosive fire bow: chunky red-gold bow limbs with angular flame tips, glowing orange string and single integral orange explosive arrow pointing right horizontally through grip. Match supplied reference thick dark brown outline, simple flat cel shading, cute fantasy sticker look. True transparent background. Square canvas, upright entire weapon, generous clear margin. Preserve reference grip center position: 56% width, 51% height so character hand can hold it. Keep reference weapon proportions and upright orientation. No text, no character, no hand, no floor, no detached particles. Reference is style and alignment guide.

### rainbow_bow
Use case: stylized-concept. Create ONE production game sprite, evolved bow. Rainbow water bow: translucent turquoise water-shaped limbs and thin rainbow-colored bowstring on left, graceful wave details. Match supplied reference thick dark brown outline, simple flat cel shading, cute fantasy sticker look. True transparent background. Square canvas, upright entire weapon, generous clear margin. Preserve reference grip center position: 56% width, 51% height so character hand can hold it. Keep reference weapon proportions and upright orientation. No text, no character, no hand, no floor, no detached particles. Reference is style and alignment guide.

### chain_bow
Use case: stylized-concept. Create ONE production game sprite, evolved bow. Chain lightning bow: forked angular golden lightning-shaped limbs, violet charged joints, glowing electric string on left. Match supplied reference thick dark brown outline, simple flat cel shading, cute fantasy sticker look. True transparent background. Square canvas, upright entire weapon, generous clear margin. Preserve reference grip center position: 56% width, 51% height so character hand can hold it. Keep reference weapon proportions and upright orientation. No text, no character, no hand, no floor, no detached particles. Reference is style and alignment guide.

### flame_staff
Use case: stylized-concept. Create ONE production game sprite, evolved staff. Flame staff: brown straight shaft with red-gold brazier crown containing a large stylized orange flame. Match supplied reference thick dark brown outline, simple flat cel shading, cute fantasy sticker look. True transparent background. Square canvas, upright entire weapon, generous clear margin. Preserve reference grip center position: 50% width, 81% height so character hand can hold it. Keep reference weapon proportions and upright orientation. No text, no character, no hand, no floor, no detached particles. Reference is style and alignment guide.

### balance_staff
Use case: stylized-concept. Create ONE production game sprite, evolved staff. Balance water staff: brown straight shaft with symmetrical two curled blue and gold arms around a large central cyan teardrop gem. Match supplied reference thick dark brown outline, simple flat cel shading, cute fantasy sticker look. True transparent background. Square canvas, upright entire weapon, generous clear margin. Preserve reference grip center position: 50% width, 81% height so character hand can hold it. Keep reference weapon proportions and upright orientation. No text, no character, no hand, no floor, no detached particles. Reference is style and alignment guide.

### charge_staff
Use case: stylized-concept. Create ONE production game sprite, evolved staff. Charge lightning staff: straight brown shaft with gold coil crown wrapped around a large violet electric crystal, small contained lightning arcs. Match supplied reference thick dark brown outline, simple flat cel shading, cute fantasy sticker look. True transparent background. Square canvas, upright entire weapon, generous clear margin. Preserve reference grip center position: 50% width, 81% height so character hand can hold it. Keep reference weapon proportions and upright orientation. No text, no character, no hand, no floor, no detached particles. Reference is style and alignment guide.

### rank_badge
Use case: stylized-concept. ONE isolated game equipment sprite. A single small golden five-point star medal badge with dark gold rim, short tiny cream ribbon tails. Front-facing. Compact, bold, no writing. Match reference character's thick dark-brown outline and flat simple cel-shaded fantasy sticker art. Reference only guides art style, DO NOT include the character. Entire object centered with 10% padding in square canvas. TRUE transparent background. No white square, no text, no detached particles or shadow on ground.

### rank_warrior
Use case: stylized-concept. ONE isolated game equipment sprite. A single LEFT shoulder armor pauldron overlay, gold-trimmed silver stacked plates, small gold rivets. Front facing with slight perspective, wide domed top and two stepped plates beneath. NO body, no head, no arm. Fits over a chibi warrior shoulder. Match reference character's thick dark-brown outline and flat simple cel-shaded fantasy sticker art. Reference only guides art style, DO NOT include the character. Entire object centered with 10% padding in square canvas. TRUE transparent background. No white square, no text, no detached particles or shadow on ground.

### rank_archer
Create ONE isolated transparent-background fantasy game equipment sprite: A single short LEFT shoulder half-cape overlay, forest green fabric with gold edging and small gold clasp at top right, flowing down and outward left. NO body, head or arm. Fits over one chibi archer shoulder. Bold dark brown outlines, simple flat cel shading, warm gold trim, cute chibi fantasy sticker art matching the recent gold badge and shoulder armor. Entire object centered with generous clear margins. No text, no character, no white background, no detached particles. Square canvas.

### rank_mage
Create ONE isolated transparent-background fantasy game equipment sprite: A single LEFT shoulder mantle overlay, purple cloth with thick gold border and three simple golden geometric runic ornaments (not letters), draping down to left. NO body, head or arm. Fits over one chibi mage shoulder. Bold dark brown outlines, simple flat cel shading, warm gold trim, cute chibi fantasy sticker art matching the recent gold badge and shoulder armor. Entire object centered with generous clear margins. No text, no character, no white background, no detached particles. Square canvas.

### rank_crest
Create ONE isolated transparent-background fantasy game equipment sprite: A single large golden heraldic halo crest for behind a chibi hero: OPEN circular gold ring, symmetrical laurel leaves along sides and small three-point crown at top, large completely transparent hollow center. Wide ring, no shield, no text, no character. Warm muted gold, simple bold forms. Bold dark brown outlines, simple flat cel shading, warm gold trim, cute chibi fantasy sticker art matching the recent gold badge and shoulder armor. Entire object centered with generous clear margins. No text, no character, no white background, no detached particles. Square canvas.
