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

test('붙이기: 별과 속성은 레벨, 다른 속성은 교체 후 Lv1, 같은 무기는 강화·다른 무기는 교체 후 +0', () => {
  let u = unit(0, 'human_warrior');
  u = rules.attachUnit(u, sticker('star'), c).unit; u = rules.attachUnit(u, sticker('star'), c).unit;
  assert.equal(u.starLevel, 2);
  u = rules.attachUnit(u, sticker('fire'), c).unit; u = rules.attachUnit(u, sticker('fire'), c).unit;
  assert.deepEqual([u.elementId, u.elementLevel], ['element_fire', 2]);
  u = rules.attachUnit(u, sticker('water'), c).unit;
  assert.deepEqual([u.elementId, u.elementLevel], ['element_water', 1]);
  u = rules.attachUnit(u, sticker('sword'), c).unit;
  assert.deepEqual([u.weaponId, u.weaponPlus], ['weapon_sword', 0]);
  u = rules.attachUnit(u, sticker('sword'), c).unit; u = rules.attachUnit(u, sticker('sword'), c).unit;
  assert.deepEqual([u.weaponId, u.weaponPlus], ['weapon_sword', 2]);
  assert.equal(rules.weaponPower(u, c), c.balance.weaponPower + 2 * c.balance.weaponPlusPower);
  u = rules.attachUnit(u, sticker('bow'), c).unit;
  assert.deepEqual([u.weaponId, u.weaponPlus], ['weapon_bow', 0]);
});

// 셋 다 다른 종족·직업·무기·속성. 블라인드 번개. 원소 공명만 성립(가운데 궁수가 활로 일치하지만 양옆도 일치라 진형은 불성립).
const mixed = () => team(
  unit(0, 'human_warrior', { weaponId: 'weapon_sword', elementId: 'element_fire', elementLevel: 2, starLevel: 2 }),
  unit(1, 'elf_archer', { weaponId: 'weapon_bow', elementId: 'element_water', elementLevel: 1, starLevel: 1 }),
  unit(2, 'orc_mage', { weaponId: 'weapon_staff', elementId: 'element_lightning', elementLevel: 1 }));

test('점수 공식: 손으로 계산한 예제와 일치', () => {
  const r = rules.scoreTeam(mixed(), blind('element_lightning'), { levels: {} }, c);
  // 덧셈: 기본 15 + 무기 15 + 별 (2+1+0)×3=9 + T1 10×3=30 + 족보(무기·속성 컬렉션) 20 + T2 종족 컬렉션 100 + T3 직업 컬렉션 1000 = 1189
  assert.deepEqual([r.base, r.weapons, r.stars, r.t1, r.combos, r.t2, r.t3, r.chips], [15, 15, 9, 30, 20, 100, 1000, 1189]);
  // 상성: 불 Lv2 유리 1.5, 물 Lv1 불리 → 원소 공명으로 유리 1.25, 번개 무관 1 → 평균 1.25. 족보 Lv1 ×1. T4 원소 공명 ×2.
  near(r.affinity.average, 1.25); assert.deepEqual(r.t4.map(x => x.id), ['t4_resonance']);
  near(r.multiplier, 2.5); assert.equal(r.score, 2972);
});

test('T2·T3: 트리플과 컬렉션만 성립하고 페어는 없으며, 원정대에 한 번만 더한다', () => {
  const pair = team(unit(0, 'human_warrior'), unit(1, 'human_archer'), unit(2, 'elf_warrior'));
  const p = rules.scoreTeam(pair, blind(), { levels: {} }, c);
  assert.deepEqual([p.t2, p.t3, p.tiers.t2, p.tiers.t3], [0, 0, null, null]);
  const tri = team(unit(0, 'human_warrior'), unit(1, 'human_archer'), unit(2, 'human_mage'));
  const t = rules.scoreTeam(tri, blind(), { levels: {} }, c);
  assert.deepEqual([t.tiers.t2.id, t.tiers.t3.id, t.t2, t.t3], ['tier_race_triple', 'tier_job_collection', 200, 1000]);
  const two = rules.scoreTeam(team(unit(0, 'human_warrior'), unit(1, 'human_warrior')), blind(), { levels: {} }, c);
  assert.deepEqual([two.t2, two.t3], [0, 0]);
});

test('족보: 무기·속성 축만, 족보 레벨은 보너스 ×Lv와 배율 1+0.25(Lv−1)', () => {
  const t = team(...['human_warrior', 'elf_warrior', 'orc_warrior'].map((d, i) => unit(i, d, { weaponId: 'weapon_sword' })));
  const r = rules.scoreTeam(t, blind(), { levels: { triple: 3 } }, c);
  assert.deepEqual(r.matches.map(m => [m.axis, m.kind, m.bonus]), [['weapon', 'triple', 45]]);
  near(r.comboMultiplier, 1.5);
});

test('T4: 다섯 규칙의 성립 경계', () => {
  const ids = t => rules.activeT4(t, c).map(r => r.id).sort();
  const u = (i, d, w, e) => unit(i, d, { weaponId: `weapon_${w}`, elementId: `element_${e}`, elementLevel: 1 });
  // 정통: 같은 종족, 직업 컬렉션, 모두 일치
  assert.deepEqual(ids(team(u(0, 'human_warrior', 'sword', 'fire'), u(1, 'human_archer', 'bow', 'fire'), u(2, 'human_mage', 'staff', 'water'))), ['t4_orthodox']);
  // 한 명만 불일치면 정통 불성립
  assert.deepEqual(ids(team(u(0, 'human_warrior', 'bow', 'fire'), u(1, 'human_archer', 'bow', 'fire'), u(2, 'human_mage', 'staff', 'water'))), []);
  // 반역자들: 종족 컬렉션, 같은 직업, 모두 불일치
  assert.deepEqual(ids(team(u(0, 'human_warrior', 'bow', 'fire'), u(1, 'elf_warrior', 'staff', 'fire'), u(2, 'orc_warrior', 'staff', 'water'))), ['t4_rebels']);
  // 운명의 일족: 같은 캐릭터 셋, 같은 레시피
  assert.deepEqual(ids(team(u(0, 'human_warrior', 'sword', 'fire'), u(1, 'human_warrior', 'sword', 'fire'), u(2, 'human_warrior', 'sword', 'fire'))), ['t4_destiny']);
  // 진형: 가운데만 일치. 속성이 겹쳐 원소 공명은 불성립
  const formation = team(u(0, 'human_warrior', 'bow', 'fire'), u(1, 'elf_archer', 'bow', 'fire'), u(2, 'orc_mage', 'sword', 'water'));
  assert.deepEqual(ids(formation), ['t4_formation']);
  // 진형 + 원소 공명 동시 성립: 배율은 곱한다
  const both = team(u(0, 'human_warrior', 'bow', 'fire'), u(1, 'elf_archer', 'bow', 'water'), u(2, 'orc_mage', 'sword', 'lightning'));
  assert.deepEqual(ids(both), ['t4_formation', 't4_resonance']);
  assert.equal(rules.scoreTeam(both, blind(), { levels: {} }, c).t4Multiplier, 4);
  // T1이 없는 캐릭터가 있으면 T4 불성립
  assert.deepEqual(ids(team(u(0, 'human_warrior', 'sword', 'fire'), u(1, 'human_archer', 'bow', 'fire'), unit(2, 'human_mage', { weaponId: 'weapon_staff' }))), []);
});

test('상성: 대칭, 원정대는 산술 평균, 보스 상성 반전', () => {
  const r = rules.evaluateAffinity(mixed(), 'element_lightning', c);
  near(r.average, (1.5 + 1 / 1.25 + 1) / 3);
  // 반전: 불은 불리(1/1.5), 물은 유리(1.25)
  const inv = rules.evaluateAffinity(mixed(), 'element_lightning', c, { invert: true });
  near(inv.average, (1 / 1.5 + 1.25 + 1) / 3);
  // 보스 반전 + 원소 공명: 반전 후 남은 불리가 다시 유리로
  const s = rules.scoreTeam(mixed(), { target: 1, elementId: 'element_lightning', ruleId: 'rule_invert_affinity' }, { levels: {} }, c);
  near(s.affinity.average, (1.5 + 1.25 + 1) / 3);
});

test('보스 봉인: 해당 점수만 0이 되고 T4 판정에는 영향이 없다', () => {
  const sc = rule => rules.scoreTeam(mixed(), { target: 1, elementId: null, ruleId: rule }, { levels: {} }, c);
  assert.equal(sc('rule_seal_weapon').weapons, 0);
  assert.equal(sc('rule_seal_star').stars, 0);
  assert.equal(sc('rule_seal_t1').t1, 0);
  assert.equal(sc('rule_seal_t2').t2, 0);
  assert.equal(sc('rule_seal_t3').t3, 0);
  assert.deepEqual(sc('rule_seal_t3').t4.map(x => x.id), ['t4_resonance']);
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
      if (b.actionsUsed < game.attachLimitFor(s, c)) for (const card of b.hand) for (let slot = 0; slot < 3; slot++) {
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


test('보상: 고른 자리의 카드가 그대로 적용되고 레벨이 등급만큼 오른다, 페어 레벨은 없다', () => {
  let s = playRunUntilReward(11);
  const { offers, order } = s.reward, p = 2, offer = offers[order[p]], before = s.run.levels[offer.key] ?? 1;
  assert.ok(offers.every(o => o.type === 'recipe' || ['collection', 'triple'].includes(o.key)));
  const r = game.applyCommand(s, { type: 'PickReward', commandId: 'pick', position: p }, c);
  assert.equal(r.state.run.levels[offer.key], before + offer.levels);
  assert.equal(game.applyCommand(r.state, { type: 'PickReward', commandId: 'again', position: 0 }, c).error, 'phase');
});

function playRunUntilReward(seed) {
  for (let k = seed; k < seed + 50; k++) {
    let s = game.initialState(), n = 0;
    const run = (type, p = {}) => { s = game.applyCommand(s, { type, commandId: `r${n++}`, ...p }, c).state; };
    run('StartRun', { seed: k });
    s = structuredClone(s);
    s.run.team.characters = ['human_warrior', 'human_archer', 'human_mage'].map((d, i) => unit(i, d, { weaponId: 'weapon_sword', elementId: 'element_fire', elementLevel: 5, starLevel: 5 }));
    for (let t = 0; t < c.balance.turnsPerBlind; t++) run('EndTurn');
    run('FinishResolution');
    if (s.phase === 'reward_reveal') { run('ShuffleRewards'); return s; }
  }
  throw Error('보상 단계에 도달하지 못함');
}

test('진형: 성립하면 그 턴부터 붙이기 3회', () => {
  let s = game.initialState(), n = 0;
  const run = (type, p = {}) => { const r = game.applyCommand(s, { type, commandId: `v${n++}`, ...p }, c); s = r.state; return r; };
  run('StartRun', { seed: 4 });
  s = structuredClone(s);
  const u = (i, d, w, e) => unit(i, d, { weaponId: `weapon_${w}`, elementId: `element_${e}`, elementLevel: 1 });
  s.run.team.characters = [u(0, 'human_warrior', 'bow', 'fire'), u(1, 'elf_archer', 'bow', 'fire'), u(2, 'orc_mage', 'sword', 'water')];
  s.battle.hand = ['a', 'b', 'c', 'd'].map(id => ({ instanceId: id, stickerDefId: 'sticker_star' }));
  assert.equal(game.attachLimitFor(s, c), 3);
  for (const id of ['a', 'b', 'c']) assert.equal(run('AttachSticker', { stickerInstanceId: id, targetInstanceId: 'u0' }).error, null);
  assert.equal(run('AttachSticker', { stickerInstanceId: 'd', targetInstanceId: 'u0' }).error, 'limit');
});

test('운명의 일족: 판정 때만 확률을 굴리고, 같은 시드는 같은 결과', () => {
  const fight = seed => {
    let s = game.initialState(), n = 0;
    const run = (type, p = {}) => { const r = game.applyCommand(s, { type, commandId: `d${n++}`, ...p }, c); s = r.state; return r; };
    run('StartRun', { seed });
    s = structuredClone(s);
    s.run.team.characters = [0, 1, 2].map(i => unit(i, 'human_warrior', { weaponId: 'weapon_sword', elementId: 'element_fire', elementLevel: 1 }));
    const preview = game.projectedScore(s.run, s.battle, c).score;
    const r = run('EndTurn', { fight: true }), rolled = r.events.find(e => e.type === 'T4Rolled');
    return { preview, score: s.battle.lastScore.score, burst: rolled.burst, t4: s.battle.lastScore.t4 };
  };
  const results = [1, 2, 3, 4, 5, 6, 7, 8].map(fight);
  for (const x of results) {
    assert.equal(x.t4[0].burst, x.burst);
    assert.equal(x.score >= x.preview, true);
    if (!x.burst) assert.equal(x.score, x.preview);
  }
  assert.deepEqual(fight(3), results[2]);
});

test('캐릭터 동결: 보스 규칙이 걸리면 확정 턴에도 캐릭터 카드가 없다', () => {
  const next = ruleId => {
    let s = game.initialState();
    s = game.applyCommand(s, { type: 'StartRun', commandId: 'z0', seed: 6 }, c).state;
    s = structuredClone(s); s.battle.ruleId = ruleId;
    s = game.applyCommand(s, { type: 'EndTurn', commandId: 'z1' }, c).state;
    return s.battle.hand.some(x => x.characterDefId);
  };
  assert.equal(next(null), true);
  assert.equal(next('rule_freeze_characters'), false);
});

test('무기 강화: 교체 캐릭터로 옮겨지고 점수에 반영된다', () => {
  let s = game.initialState(), n = 0;
  const run = (type, p = {}) => { const r = game.applyCommand(s, { type, commandId: `w${n++}`, ...p }, c); assert.equal(r.error, null, `${type}: ${r.error}`); s = r.state; return r; };
  run('StartRun', { seed: 5 });
  s = structuredClone(s);
  s.run.team.characters = [unit(0, 'human_warrior', { weaponId: 'weapon_sword', weaponPlus: 1 }), null, null];
  s.battle.hand = [{ instanceId: 'x1', stickerDefId: 'sticker_sword' }, { instanceId: 'x2', characterDefId: 'char_elf_mage' }];
  const before = game.projectedScore(s.run, s.battle, c).score;
  const r = run('AttachSticker', { stickerInstanceId: 'x1', targetInstanceId: 'u0' });
  assert.deepEqual(r.events.map(e => e.type).slice(0, 2), ['StickerAttached', 'WeaponEnhanced']);
  assert.equal(s.run.team.characters[0].weaponPlus, 2);
  assert.equal(game.projectedScore(s.run, s.battle, c).score - before, c.balance.weaponPlusPower);
  run('PlaceCharacter', { cardInstanceId: 'x2', targetSlot: 0 });
  assert.deepEqual([s.run.team.characters[0].characterDefId, s.run.team.characters[0].weaponPlus], ['char_elf_mage', 2]);
});

test('조기 전투: 아무 턴에나 판정하고, 이기면 다이아몬드 = 기본 + 남은 턴', () => {
  let s = game.initialState(), n = 0;
  const run = (type, p = {}) => { const r = game.applyCommand(s, { type, commandId: `f${n++}`, ...p }, c); assert.equal(r.error, null, `${type}: ${r.error}`); s = r.state; return r; };
  run('StartRun', { seed: 9 });
  s = structuredClone(s);
  s.run.team.characters = [unit(0, 'human_warrior', { starLevel: 60 }), null, null];
  const projected = game.projectedScore(s.run, s.battle, c, s.run.team, true).score;
  assert.ok(projected >= s.battle.target);
  run('EndTurn', { fight: true });
  assert.equal(s.phase, 'resolve');
  assert.equal(s.battle.lastScore.score, projected);
  const left = c.balance.turnsPerBlind - 1;
  assert.equal(s.battle.diamonds, c.metaRules.clearDiamonds + left * c.metaRules.diamondsPerTurnLeft);
  assert.deepEqual([s.history[0].turn, s.history[0].diamonds, s.run.diamonds], [1, s.battle.diamonds, s.battle.diamonds]);
});

test('조기 전투에서 지면 다이아몬드 없이 런 종료', () => {
  let s = game.initialState(), n = 0;
  const run = (type, p = {}) => { const r = game.applyCommand(s, { type, commandId: `l${n++}`, ...p }, c); assert.equal(r.error, null); s = r.state; };
  run('StartRun', { seed: 9 }); run('EndTurn', { fight: true });
  assert.deepEqual([s.battle.outcome, s.battle.diamonds, s.run.diamonds], ['lose', 0, 0]);
  run('FinishResolution');
  assert.equal(s.phase, 'run_result');
});
