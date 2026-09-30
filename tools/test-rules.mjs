// 콘텐츠·규칙·게임 흐름 테스트. 실행: node --test tools/test-rules.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './load-modules.mjs';

const { data, rules, game } = loadModules();
const c = data.content;
const sticker = id => data.byId(c.stickers, `sticker_${id}`);
// 캐릭터 정의 ID와 장비로 유닛을 만든다. 예: unit(0, 'human_warrior', {weaponId:'weapon_sword'})
const unit = (slot, def, extra = {}) => ({ ...rules.makeUnit(`u${slot}`, `char_${def}`), ...extra });
const team = (...us) => ({ characters: [...us, null, null, null].slice(0, 3) });
const blind = (elementId = null, target = 1000) => ({ target, elementId });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('콘텐츠 검증', () => assert.equal(data.validateContent(), true));

test('붙이기: 별과 속성은 레벨, 다른 속성은 교체 후 Lv1, 같은 무기는 거절', () => {
  let u = unit(0, 'human_warrior');
  u = rules.attachUnit(u, sticker('star'), c).unit; u = rules.attachUnit(u, sticker('star'), c).unit;
  assert.equal(u.starLevel, 2);
  u = rules.attachUnit(u, sticker('fire'), c).unit; u = rules.attachUnit(u, sticker('fire'), c).unit;
  assert.deepEqual([u.elementId, u.elementLevel], ['element_fire', 2]);
  u = rules.attachUnit(u, sticker('water'), c).unit;
  assert.deepEqual([u.elementId, u.elementLevel], ['element_water', 1]);
  u = rules.attachUnit(u, sticker('sword'), c).unit;
  assert.equal(rules.attachUnit(u, sticker('sword'), c).reason, 'same');
  assert.equal(rules.attachUnit(u, sticker('bow'), c).unit.weaponId, 'weapon_bow');
});

test('별 족보: 같은 레벨 트리플·페어, 연속 레벨 스트레이트, 보너스는 별 레벨 비례', () => {
  const star = (...ls) => rules.evaluateCombos(team(...ls.map((l, i) => unit(i, ['human_warrior', 'elf_archer', 'orc_mage'][i], { starLevel: l }))), c, {}).find(m => m.axis === 'star');
  assert.deepEqual([star(2, 2, 2).kind, star(2, 2, 2).bonus], ['triple', 18]);
  assert.deepEqual([star(1, 2, 3).kind, star(1, 2, 3).bonus], ['straight', 12]);
  assert.deepEqual([star(3, 3, 0).kind, star(3, 3, 0).bonus], ['pair', 9]);
  assert.equal(star(1, 3, 5), undefined);
  assert.equal(star(0, 0, 0), undefined);
});

test('족보 레벨: 보너스 ×Lv, 성립한 족보마다 배율 1+0.25(Lv−1)', () => {
  const t = team(unit(0, 'human_warrior'), unit(1, 'human_archer'));
  const m = rules.evaluateCombos(t, c, { pair: 3 }).find(x => x.axis === 'race');
  assert.deepEqual([m.kind, m.bonus], ['pair', 15]);
  near(m.multiplier, 1.5);
});

test('상성: 유리·불리가 곱셈 대칭', () => {
  const adv = rules.evaluateAffinity(team(unit(0, 'human_warrior', { elementId: 'element_fire', elementLevel: 2 })), 'element_lightning', c);
  const dis = rules.evaluateAffinity(team(unit(0, 'human_warrior', { elementId: 'element_lightning', elementLevel: 2 })), 'element_fire', c);
  const neu = rules.evaluateAffinity(team(unit(0, 'human_warrior', { elementId: 'element_fire', elementLevel: 2 })), 'element_fire', c);
  near(adv.total, 1.5); near(dis.total, 1 / 1.5); near(neu.total, 1);
  assert.deepEqual([adv.units[0].relation, dis.units[0].relation, neu.units[0].relation], ['advantage', 'disadvantage', 'neutral']);
});

test('조합 무기: 화염검은 무기 트리플에서 ×2, 레시피 Lv2면 ×2.5', () => {
  const t = team(...['human_warrior', 'elf_archer', 'orc_mage'].map((d, i) => unit(i, d, { weaponId: 'weapon_sword', elementId: i ? null : 'element_fire', elementLevel: i ? 0 : 1 })));
  const at = lv => rules.evaluateWeaponEffects(t, rules.evaluateCombos(t, c, {}), c, lv ? { recipe_flame_sword: lv } : {}).multiplier;
  near(at(), 2); near(at(2), 2.5);
  const noTriple = team(t.characters[0], t.characters[1]);
  near(rules.evaluateWeaponEffects(noTriple, rules.evaluateCombos(noTriple, c, {}), c, {}).multiplier, 1);
});

test('조합 무기: 역류검은 목표의 10%, 균형 지팡이는 별 Lv 합 ×3, 축적 지팡이는 최고 별 Lv 누적', () => {
  const reflux = team(unit(0, 'human_warrior', { weaponId: 'weapon_sword', elementId: 'element_water', elementLevel: 1 }));
  assert.equal(rules.scoreTeam(reflux, blind(null, 3000), {}, c).targetBonus, 300);
  const levels = [1, 2, 2];
  const balance = team(...['human_warrior', 'elf_archer', 'orc_mage'].map((d, i) => unit(i, d, { starLevel: levels[i], ...(i ? {} : { weaponId: 'weapon_staff', elementId: 'element_water', elementLevel: 1 }) })));
  assert.equal(rules.evaluateWeaponEffects(balance, rules.evaluateCombos(balance, c, {}), c, {}).flat, 15);
  const charge = team(unit(0, 'human_warrior', { weaponId: 'weapon_staff', elementId: 'element_lightning', elementLevel: 1, starLevel: 4 }));
  assert.equal(rules.turnEndGain(charge, {}, c), 4);
  assert.equal(rules.turnEndGain(charge, { levels: { recipe_charge_staff: 3 } }, c), 12);
});

test('점수 공식: 손으로 계산한 예제와 일치', () => {
  // 인간 전사(검·불 Lv2·별 2) + 인간 궁수(검·별 2). 블라인드 번개, 목표 1000, 누적 7.
  const t = team(
    unit(0, 'human_warrior', { weaponId: 'weapon_sword', elementId: 'element_fire', elementLevel: 2, starLevel: 2 }),
    unit(1, 'human_archer', { weaponId: 'weapon_sword', starLevel: 2 }));
  const r = rules.scoreTeam(t, blind('element_lightning'), { levels: {}, accumulated: 7 }, c);
  // 기초: 캐릭터 5+5, 무기 5+5, 별 6+6 = 32. 족보: 종족 페어 5, 무기 페어 5, 별 페어 3×2=6 → 16. 누적 7. 합 55.
  // 배율: 족보 Lv1이라 ×1, 화염검은 무기 트리플이 아니라 ×1, 상성 불 Lv2 vs 번개 ×1.5.
  assert.equal(r.chips, 55); near(r.multiplier, 1.5); assert.equal(r.score, 82);
});

// 가능한 행동 중 점수가 가장 오르는 것을 고르는 간단한 봇으로 런을 끝까지 진행한다.
function playRun(seed) {
  let s = game.initialState(), n = 0;
  const run = (type, p = {}) => { const r = game.applyCommand(s, { type, commandId: `t${n++}`, ...p }, c); assert.equal(r.error, null, `${type}: ${r.error}`); s = r.state; return r; };
  run('StartRun', { seed });
  for (let guard = 0; guard < 500 && s.phase !== 'run_result'; guard++) {
    if (s.phase === 'attach') {
      const b = s.battle, chars = s.run.team.characters;
      let best = null, bestScore = -1;
      if (b.actionsUsed < c.balance.attachLimit) for (const card of b.hand) for (let slot = 0; slot < 3; slot++) {
        const cmd = card.characterDefId ? { type: 'PlaceCharacter', cardInstanceId: card.instanceId, targetSlot: slot }
          : chars[slot] && { type: 'AttachSticker', stickerInstanceId: card.instanceId, targetInstanceId: chars[slot].instanceId };
        if (!cmd) continue;
        const r = game.applyCommand(s, { ...cmd, commandId: 'probe' }, c);
        if (r.error) continue;
        const v = game.projectedScore(r.state.run, r.state.battle, c).score;
        if (v > bestScore) { bestScore = v; best = cmd; }
      }
      if (best) run(best.type, best); else run('EndTurn');
    } else if (s.phase === 'resolve') run('FinishResolution');
    else if (s.phase === 'reward_reveal') run('ShuffleRewards');
    else if (s.phase === 'reward_pick') {
      const before = s.reward, r = run('PickReward', { position: 1 });
      assert.deepEqual(r.events[0].offer, before.offers[before.order[1]]);
    } else if (s.phase === 'reward_done') run('StartNextBlind');
  }
  return s;
}

test('게임 흐름: 봇이 런을 끝까지 진행하고, 같은 시드는 같은 결과', () => {
  const results = [1, 2, 3, 4, 5].map(seed => playRun(seed));
  for (const s of results) {
    assert.equal(s.phase, 'run_result');
    assert.ok(['win', 'lose'].includes(s.run.result));
    assert.ok(s.history.length >= 1 && s.history.every(h => (h.score >= h.target) === (h.outcome === 'win')));
  }
  assert.deepEqual(playRun(3).history, results[2].history);
});

test('보상: 고른 자리의 카드가 그대로 적용되고 레벨이 등급만큼 오른다', () => {
  let s = playRunUntilReward(11);
  const { offers, order } = s.reward, p = 2, offer = offers[order[p]], before = s.run.levels[offer.key] ?? 1;
  const r = game.applyCommand(s, { type: 'PickReward', commandId: 'pick', position: p }, c);
  assert.equal(r.state.run.levels[offer.key], before + offer.levels);
  assert.equal(game.applyCommand(r.state, { type: 'PickReward', commandId: 'again', position: 0 }, c).error, 'phase');
});

function playRunUntilReward(seed) {
  for (let k = seed; k < seed + 50; k++) {
    let s = game.initialState(), n = 0;
    const run = (type, p = {}) => { s = game.applyCommand(s, { type, commandId: `r${n++}`, ...p }, c).state; };
    run('StartRun', { seed: k });
    // 목표를 넘기도록 원정대를 직접 강하게 세팅한 뒤 턴을 넘긴다.
    s = structuredClone(s);
    s.run.team.characters = ['human_warrior', 'human_archer', 'human_mage'].map((d, i) => unit(i, d, { weaponId: 'weapon_sword', elementId: 'element_fire', elementLevel: 5, starLevel: 5 }));
    for (let t = 0; t < c.balance.turnsPerBlind; t++) run('EndTurn');
    run('FinishResolution');
    if (s.phase === 'reward_reveal') { run('ShuffleRewards'); return s; }
  }
  throw Error('보상 단계에 도달하지 못함');
}

test('마지막 턴 예상 점수에는 판정 직전에 더해지는 번개 누적이 포함된다', () => {
  let s = game.initialState(), n = 0;
  const run = (type, p = {}) => { const r = game.applyCommand(s, { type, commandId: `m${n++}`, ...p }, c); assert.equal(r.error, null); s = r.state; };
  run('StartRun', { seed: 21 });
  // 축적 지팡이(턴 종료 시 최고 별 Lv만큼 누적)를 든 원정대로 마지막 턴까지 간다.
  s = structuredClone(s);
  s.run.team.characters = [unit(0, 'human_mage', { weaponId: 'weapon_staff', elementId: 'element_lightning', elementLevel: 1, starLevel: 4 }), null, null];
  for (let t = 1; t < c.balance.turnsPerBlind; t++) run('EndTurn');
  const projected = game.projectedScore(s.run, s.battle, c).score;
  const before = rules.scoreTeam(s.run.team, { target: s.battle.target, elementId: s.battle.elementId }, s.run, c).score;
  assert.ok(projected > before, '마지막 턴 누적이 예상 점수에 들어가야 함');
  run('EndTurn');
  assert.equal(s.phase, 'resolve');
  assert.equal(s.battle.lastScore.score, projected);
});
