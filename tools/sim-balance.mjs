// 설계 스케치(docs/design-sketch.md) 규칙의 밸런스 시뮬레이터. index.html과 독립적으로 동작한다.
// 실행: node tools/sim-balance.mjs [판수=2000]  (수치 덮어쓰기: SIM='{"starValue":4}')
// 효과 조건·보스 규칙은 단순화했다. 수치는 P만 바꿔 다시 돌린다.

const P = {
  blinds: 4, turns: 6, hand: 5, attaches: 3, squadMax: 3,
  charChance: 0.2,                      // 확정 턴 외 캐릭터 카드 등장 확률
  guaranteedCharTurns: [[1, 2, 3], [1], [1], [1]],
  charBase: 5, weaponPower: 5, starValue: 3,
  combo: { pair: 5, collection: 10, triple: 15 },   // 종족·직업·무기·속성
  starCombo: { pair: 3, straight: 6, triple: 9 },   // × 별 레벨. 스트레이트는 컬렉션 레벨을 따른다
  comboPerLv: 1,                        // 족보 레벨업: 보너스 ×(1 + perLv·(Lv-1))
  comboMultPerLv: 0.25,                 // 족보 레벨업 배율: 성립한 족보마다 ×(1 + m·(Lv-1))
  rewardPick: 'blind',                  // 'blind': 뒤집힌 3장 중 하나를 뽑음(무작위), 'informed': 보고 고름(비교용)
  reward: 'mixed',                      // 'recipe': 조합 무기 Lv+1만, 'mixed': 조합 무기·족보 레벨업 중 3개 제시
  affinityPerLv: 0.25,                  // 유리 ×(1+k·Lv), 불리 ÷(1+k·Lv)
  recipeBase: 1.5, recipePerLv: 0.5,    // 조합 무기 ×(base + perLv·(Lv-1)), 조건은 생략
  targets: [300, 900, 2200, 5000],   // 블라인드 목표 점수 후보. 못 넘기면 즉시 실패
  deck: { sword: 2, bow: 2, staff: 2, fire: 2, water: 2, lightning: 2, star: 6 },
};
Object.assign(P, JSON.parse(process.env.SIM ?? '{}'));   // 예: SIM='{"affinityPerLv":0}'

const RACES = ['human', 'elf', 'orc', 'dwarf'], JOBS = ['warrior', 'archer', 'mage'];
const WEAPONS = ['sword', 'bow', 'staff'], ELEMENTS = ['fire', 'water', 'lightning'];
const BEATS = { fire: 'lightning', lightning: 'water', water: 'fire' };

function rng(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; }; }
const pick = (r, a) => a[Math.floor(r() * a.length)];
function shuffle(r, a) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

const KINDS = ['pair', 'collection', 'triple'];
let matched = [];   // score() 한 번 동안 성립한 족보 종류
const levelMult = (lv, kind) => 1 + P.comboPerLv * ((lv[kind] ?? 1) - 1);
function axisCombos(values, lv) {
  const v = values.filter(Boolean); if (v.length < 2) return 0;
  const counts = Object.values(v.reduce((m, x) => (m[x] = (m[x] ?? 0) + 1, m), {}));
  const top = Math.max(...counts);
  const kind = top === 3 ? 'triple' : v.length === 3 && counts.length === 3 ? 'collection' : top === 2 ? 'pair' : null;
  if (kind) matched.push(kind);
  return kind ? P.combo[kind] * levelMult(lv, kind) : 0;
}
function starCombos(levels, lv) {
  const v = levels.filter(x => x > 0).sort((a, b) => a - b); if (v.length < 2) return 0;
  if (v.length === 3 && v[0] === v[2]) return matched.push('triple'), P.starCombo.triple * v[0] * levelMult(lv, 'triple');
  if (v.length === 3 && v[1] === v[0] + 1 && v[2] === v[1] + 1) return matched.push('collection'), P.starCombo.straight * v[1] * levelMult(lv, 'collection');
  for (let i = 1; i < v.length; i++) if (v[i] === v[i - 1]) return matched.push('pair'), P.starCombo.pair * v[i] * levelMult(lv, 'pair');
  return 0;
}
// lv: 런 레벨표. 조합 무기는 'sword_fire' 같은 레시피 키, 족보는 'pair'·'collection'·'triple'.
function score(squad, blind, lv) {
  const us = squad.filter(Boolean); if (!us.length) return 0;
  matched = [];
  let chips = us.reduce((n, u) => n + P.charBase + u.star * P.starValue + (u.weapon ? P.weaponPower : 0), 0);
  for (const k of ['race', 'job', 'weapon', 'element']) chips += axisCombos(us.map(u => u[k]), lv);
  chips += starCombos(us.map(u => u.star), lv);
  let mult = 1;
  for (const k of matched) mult *= 1 + P.comboMultPerLv * ((lv[k] ?? 1) - 1);
  for (const u of us) {
    if (u.weapon && u.element) mult *= P.recipeBase + P.recipePerLv * ((lv[u.weapon + '_' + u.element] ?? 1) - 1);
    if (u.element) {
      const f = 1 + P.affinityPerLv * u.elementLv;
      if (BEATS[u.element] === blind.element) mult *= f; else if (BEATS[blind.element] === u.element) mult /= f;
    }
  }
  return chips * mult;
}
function apply(squad, card, slot) {
  const s = squad.map(u => u && { ...u }), u = s[slot];
  if (card.char) { s[slot] = u ? { ...u, race: card.char.race, job: card.char.job } : { ...card.char, weapon: null, element: null, elementLv: 0, star: 0 }; return s; }
  if (!u) return null;
  if (card.kind === 'star') u.star++;
  else if (card.kind === 'weapon') { if (u.weapon === card.id) return null; u.weapon = card.id; }
  else if (u.element === card.id) u.elementLv++; else { u.element = card.id; u.elementLv = 1; }
  return s;
}

function runOnce(seed, policy) {
  const r = rng(seed), lv = {}, deckIds = Object.entries(P.deck).flatMap(([k, n]) => Array(n).fill(k));
  const elements = Array.from({ length: P.blinds }, () => pick(r, ELEMENTS));
  let squad = Array(P.squadMax).fill(null); const scores = [];
  for (let b = 0; b < P.blinds; b++) {
    const blind = { index: b, element: elements[b] };
    let pile = [];
    for (let t = 1; t <= P.turns; t++) {
      if (pile.length < P.hand) pile = pile.concat(shuffle(r, deckIds));
      const hand = pile.splice(0, P.hand).map(id => ({ id, kind: id === 'star' ? 'star' : WEAPONS.includes(id) ? 'weapon' : 'element' }));
      if (P.guaranteedCharTurns[b].includes(t) || r() < P.charChance) hand[0] = { char: { race: pick(r, RACES), job: pick(r, JOBS) } };
      for (let a = 0; a < P.attaches && hand.length; a++) {
        const opts = [];
        hand.forEach((c, ci) => { for (let s = 0; s < P.squadMax; s++) { const next = apply(squad, c, s); if (next) opts.push({ ci, next }); } });
        if (!opts.length) break;
        const o = policy === 'greedy' ? opts.reduce((best, x) => (x.v = score(x.next, blind, lv)) > best.v ? x : best, { v: -1 }) : pick(r, opts);
        squad = o.next; hand.splice(o.ci, 1);
      }
    }
    scores.push(score(squad, blind, lv));
    // 보상: 뒤집힌 카드 3장 중 1장. informed일 때만 greedy가 다음 블라인드 기준으로 가장 이득인 것을 고른다.
    const owned = [...new Set(squad.filter(u => u?.weapon && u.element).map(u => u.weapon + '_' + u.element))];
    const pool = P.reward === 'recipe' ? owned.slice(0, 1) : [...owned, ...KINDS];
    const offers = shuffle(r, pool).slice(0, 3);
    if (offers.length) {
      const next = { index: b + 1, element: elements[b + 1] ?? blind.element };
      const gain = k => score(squad, next, { ...lv, [k]: (lv[k] ?? 1) + 1 });
      const k = policy === 'greedy' && P.rewardPick === 'informed' ? offers.reduce((a, x) => gain(x) > gain(a) ? x : a) : pick(r, offers);
      if (gain(k) <= score(squad, next, lv)) picks.dead++;   // 지금 원정대에 효과 없는 보상
      lv[k] = (lv[k] ?? 1) + 1; picks[k.includes('_') ? 'recipe' : k]++;
    }
  }
  return scores;
}

const picks = { recipe: 0, pair: 0, collection: 0, triple: 0, dead: 0 };
const N = Number(process.argv[2] ?? 2000), pct = (a, q) => a[Math.min(a.length - 1, Math.floor(q * a.length))];
for (const policy of ['greedy', 'random']) {
  for (const k in picks) picks[k] = 0;
  const all = Array.from({ length: N }, (_, i) => runOnce(i + 1, policy));
  console.log(`\n[${policy}] ${N}판, 블라인드별 최종 점수 분위수`);
  console.log('블라인드   p10     p25     p50     p75     p90');
  for (let b = 0; b < P.blinds; b++) {
    const s = all.map(x => x[b]).sort((x, y) => x - y);
    console.log(`   ${b + 1}    ${[.1, .25, .5, .75, .9].map(q => pct(s, q).toFixed(0).padStart(6)).join('  ')}`);
  }
  // 즉시 실패 규칙: 앞 블라인드를 모두 넘겨야 다음 블라인드에 도달한다.
  const reach = P.targets.map((_, b) => all.filter(x => x.slice(0, b + 1).every((v, i) => v >= P.targets[i])).length / N);
  console.log(`보상 선택 횟수: ${Object.entries(picks).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`목표 ${P.targets.join('/')} 누적 클리어율: ${reach.map((v, i) => `${i + 1}단계 ${(v * 100).toFixed(0)}%`).join(', ')}`);
}
