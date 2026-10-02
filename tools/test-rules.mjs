// 콘텐츠·규칙·게임 흐름 테스트. 실행: node --test tools/test-rules.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './load-modules.mjs';
import { playRun } from './balance-bot.mjs';

const { data, rules, game } = loadModules();
const c = data.content;
const sticker = id => data.byId(c.stickers, `sticker_${id}`);
let serial = 0;
// 캐릭터 정의 ID(종족_직업)와 장비로 유닛을 만든다. 예: mk('human_warrior', {level:3, weaponId:'weapon_sword'})
const mk = (def, extra = {}) => { const u = { ...rules.makeUnit(`u${serial++}`, `char_${def}`, c), ...extra }; u.hp = extra.hp ?? rules.maxHpOf(u, c); return u; };
const monster = (hp = 400, atk = 40, elementId = 'element_water') => ({ hp, maxHp: hp, atk, elementId });
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const round1 = (team, m = monster(), round = 1) => rules.resolveRound(team, m, round, c);

test('콘텐츠 검증', () => assert.equal(data.validateContent(), true));

test('레벨: 체력과 공격에 1.3^(Lv-1)을 곱하고, 별을 붙이면 늘어난 체력만큼 회복한다', () => {
  let u = mk('human_warrior');
  assert.deepEqual([u.level, u.hp, rules.maxHpOf(u, c)], [1, 120, 120]);
  u = { ...u, hp: 50 };
  u = rules.attachUnit(u, sticker('star'), c);
  assert.deepEqual([u.level, rules.maxHpOf(u, c), u.hp], [2, 156, 86]);
  near(rules.levelMult(10, c), 1.3 ** 9);
  assert.equal(rules.attachmentReason(mk('human_warrior', { level: 10 }), sticker('star'), c), 'maxLevel');
});

test('붙이기: 같은 무기는 강화, 다른 무기는 교체, 같은 속성은 불가, 다른 속성은 교체', () => {
  let u = mk('human_warrior');
  u = rules.attachUnit(u, sticker('sword'), c); u = rules.attachUnit(u, sticker('sword'), c);
  assert.deepEqual([u.weaponId, u.weaponPlus], ['weapon_sword', 1]);
  u = rules.attachUnit(u, sticker('bow'), c);
  assert.deepEqual([u.weaponId, u.weaponPlus], ['weapon_bow', 0]);
  u = rules.attachUnit(u, sticker('fire'), c);
  assert.equal(rules.attachmentReason(u, sticker('fire'), c), 'same');
  assert.equal(rules.attachmentReason(u, sticker('water'), c), null);
  assert.equal(rules.attachUnit(u, sticker('water'), c).elementId, 'element_water');
});

test('스킬: 무기+속성으로 생기고, 스킬이 바뀌면 쿨타임이 0이 된다', () => {
  let u = mk('human_warrior', { weaponId: 'weapon_sword', elementId: 'element_fire' });
  assert.equal(rules.skillOf(u, c).name, '화염검');
  u = { ...u, skillCd: 2 };
  assert.equal(rules.attachUnit(u, sticker('fire'), c) === u, false);
  const changed = rules.attachUnit(u, sticker('water'), c);
  assert.deepEqual([rules.skillOf(changed, c).name, changed.skillCd], ['역류검', 0]);
  const kept = rules.attachUnit(u, sticker('star'), c);
  assert.equal(kept.skillCd, 2);
  assert.equal(c.skills.length, 9);
  for (const e of c.elements) assert.equal(c.skills.filter(s => s.elementId === e.id && s.kind === 'active').length, 1);
});

test('상성: 이기면 ×1.5, 지면 ÷1.5, 양방향', () => {
  const r = rules.relationMult;
  near(r('element_fire', 'element_lightning', c), 1.5); near(r('element_lightning', 'element_fire', c), 1 / 1.5);
  near(r('element_water', 'element_fire', c), 1.5); near(r('element_fire', null, c), 1); near(r('element_fire', 'element_fire', c), 1);
});

test('적성: 어울리는 무기가 아니면 0.5, 무지개 활은 1, 축적 지팡이가 있으면 원정대 전체 0.75', () => {
  const warriorBow = mk('human_warrior', { weaponId: 'weapon_bow' });
  assert.equal(rules.fitOf(mk('human_warrior', { weaponId: 'weapon_sword' }), [], c), 1);
  assert.equal(rules.fitOf(mk('human_warrior'), [], c), 1);
  assert.equal(rules.fitOf(warriorBow, [warriorBow], c), 0.5);
  const rainbow = mk('human_warrior', { weaponId: 'weapon_bow', elementId: 'element_water' });
  assert.equal(rules.fitOf(rainbow, [rainbow], c), 1);
  const charger = mk('human_mage', { weaponId: 'weapon_staff', elementId: 'element_lightning' });
  assert.equal(rules.fitOf(warriorBow, [warriorBow, charger], c), 0.75);
  assert.equal(rules.fitOf(warriorBow, [warriorBow, { ...charger, hp: 0 }], c), 0.5);
  // 불일치 반감은 공격(스킬 피해 포함)에 모두 걸린다
  const m = monster(1000, 1, null), a = mk('human_warrior', { weaponId: 'weapon_bow' }), b = mk('human_archer', { weaponId: 'weapon_bow' });
  near(rules.attackOf(a, [a], m, 1, c) / rules.attackOf(b, [b], m, 1, c), (10 * 0.5) / 15);
});

test('한 라운드: 예시 전투 (스킬 두 개가 터지고, 맨 뒤 동료가 맞는다)', () => {
  const archer = mk('elf_archer', { level: 3, weaponId: 'weapon_bow', elementId: 'element_lightning' });
  const warrior = mk('human_warrior', { level: 2, weaponId: 'weapon_sword', elementId: 'element_fire' });
  const mage = mk('orc_mage', { weaponId: 'weapon_staff' });
  assert.equal(archer.hp, 135);
  const r = round1([archer, warrior, mage]);
  const attacks = r.events.filter(e => e.type === 'attack');
  assert.deepEqual(attacks.map(e => [e.slot, e.skillId, e.hits]), [[0, 'skill_chain_bow', [55, 55, 55]], [1, 'skill_flame_sword', [31]], [2, null, [14]]]);
  assert.equal(r.monster.hp, 400 - 210);
  const counter = r.events.find(e => e.type === 'counter');
  assert.deepEqual([counter.slot, counter.dmg, counter.hp, counter.killed], [2, 40, 30, false]);
  assert.deepEqual(r.team.map(u => u.skillCd), [3, 3, 0]);
  // 라운드 2: 마법사가 위험하니 2번과 3번을 맞바꾼다. 스킬은 쿨타임이라 기본 공격이고, 이번엔 전사가 맞는다(불이 물에 져서 ×1.5).
  const swapped = [r.team[0], r.team[2], r.team[1]];
  const r2 = round1(swapped, r.monster, 2);
  assert.deepEqual(r2.events.filter(e => e.type === 'attack').map(e => [e.skillId, e.total]), [[null, 46], [null, 14], [null, 10]]);
  assert.deepEqual(r2.team.map(u => u.skillCd), [2, 0, 2]);
  const c2 = r2.events.find(e => e.type === 'counter');
  assert.deepEqual([c2.slot, c2.dmg, c2.hp], [2, 60, 96]);
});

test('쿨타임: 3라운드 쉬고 4번째 라운드에 다시 쓴다', () => {
  let team = [mk('human_warrior', { weaponId: 'weapon_sword', elementId: 'element_fire' })], m = monster(1e6, 1, null);
  const used = [];
  for (let t = 1; t <= 5; t++) { const r = round1(team, m, t); used.push(r.events.find(e => e.type === 'attack').skillId !== null); team = r.team; m = r.monster; }
  assert.deepEqual(used, [true, false, false, false, true]);
});

test('균형 지팡이: 다친 동료가 있을 때만 발동하고, 그때부터 쿨타임이 시작된다', () => {
  const mage = mk('human_mage', { weaponId: 'weapon_staff', elementId: 'element_water' });
  const warrior = mk('human_warrior', { hp: 30 });
  const full = round1([mage, mk('human_warrior')], monster(1000, 1, null));
  assert.equal(full.events.some(e => e.type === 'heal'), false); assert.equal(full.team[0].skillCd, 0);
  const r = round1([mage, warrior], monster(1000, 1, null));
  const heal = r.events.find(e => e.type === 'heal');
  assert.deepEqual([heal.slot, heal.target, heal.amount, heal.hp], [0, 1, 48, 78]);
  assert.equal(r.team[0].skillCd, 3);
  // 적성이 맞지 않으면(마법사가 검을 든 경우가 아니라) 전사가 지팡이를 들면 회복량이 절반
  const warriorMage = mk('human_warrior', { weaponId: 'weapon_staff', elementId: 'element_water' });
  const r2 = round1([warriorMage, mk('human_archer', { hp: 10 })], monster(1000, 1, null));
  assert.equal(r2.events.find(e => e.type === 'heal').amount, 16);
});

test('패시브: 역류검 · 폭발궁 · 연마검 · 화염 지팡이', () => {
  // 역류검: 받는 피해 -25%, 불일치면 절반(-12.5%)
  const tank = mk('human_warrior', { weaponId: 'weapon_sword', elementId: 'element_water' });
  assert.equal(round1([tank], monster(1e6, 100, null)).events.find(e => e.type === 'counter').dmg, 75);
  const archerSword = mk('human_archer', { weaponId: 'weapon_sword', elementId: 'element_water' });
  assert.equal(round1([archerSword], monster(1e6, 100, null)).events.find(e => e.type === 'counter').dmg, 88);
  // 폭발궁: 몬스터 체력이 절반 이하일 때 공격 +40%
  const blast = mk('human_archer', { weaponId: 'weapon_bow', elementId: 'element_fire' });
  near(rules.attackOf(blast, [blast], { hp: 50, maxHp: 100, atk: 1, elementId: null }, 1, c) / rules.attackOf(blast, [blast], { hp: 51, maxHp: 100, atk: 1, elementId: null }, 1, c), 1.4);
  // 연마검: 라운드마다 +5%, 최대 +50%
  const hone = mk('human_warrior', { weaponId: 'weapon_sword', elementId: 'element_lightning' }), m = monster(100, 1, null);
  const at = r => rules.attackOf(hone, [hone], m, r, c), base = at(1);
  near(at(3) / base, 1.1); near(at(50) / base, 1.5);
  // 화염 지팡이: 원정대 전체 공격 +10%
  const staff = mk('human_mage', { weaponId: 'weapon_staff', elementId: 'element_fire' }), ally = mk('human_warrior');
  near(rules.attackOf(ally, [ally, staff], m, 1, c) / rules.attackOf(ally, [ally], m, 1, c), 1.1);
});

test('죽음: 맨 뒤 살아 있는 동료부터 맞고, 쓰러지면 칸이 비고 스티커도 사라진다', () => {
  const front = mk('human_warrior', { hp: 5, weaponId: 'weapon_sword' }), back = mk('human_archer', { hp: 5, weaponId: 'weapon_bow', elementId: 'element_fire', level: 4 });
  let r = round1([front, null, back], monster(1e6, 10, null));
  const c1 = r.events.find(e => e.type === 'counter');
  assert.deepEqual([c1.slot, c1.killed], [2, true]); assert.equal(r.team[2], null);
  assert.equal(r.lost, false);
  r = round1(r.team, r.monster, 2);
  assert.deepEqual([r.events.find(e => e.type === 'counter').slot, r.lost], [0, true]);
  assert.ok(r.events.some(e => e.type === 'partyDown'));
  // 몬스터가 먼저 쓰러지면 반격이 없다
  const strong = mk('human_archer', { level: 10 });
  const win = round1([strong], monster(10, 999, null));
  assert.equal(win.won, true); assert.equal(win.events.some(e => e.type === 'counter'), false);
});

test('예상 표시와 실제 전투는 같은 함수', () => {
  const g = start(3);
  const f = game.forecastRound(g.s, c);
  const before = g.s.battle.monster.hp;
  g.run('Fight');
  assert.equal(g.s.battle.monster.hp, f.monster.hp); assert.ok(f.monster.hp < before);
});

// ── 게임 흐름 ──
function runner(seed = 7) {
  let s = game.initialState(), n = 0;
  const run = (type, p = {}) => { const r = game.applyCommand(s, { type, commandId: `t${n++}`, ...p }, c); if (!r.error) s = r.state; return r; };
  run('StartRun', { seed });
  return { run, get s() { return s; }, set s(v) { s = v; } };
}
function start(seed = 7, position = 0) {
  const g = runner(seed); g.run('ShuffleStarter'); g.run('PickStarter', { position }); g.run('BeginJourney'); g.run('SelectBlind'); return g;
}

test('시작 동료: 무작위 3명을 보여 주고 섞은 뒤 고른다. 섞는 순서는 엔진이 정한다', () => {
  const g = runner();
  assert.equal(g.s.phase, 'starter_reveal');
  assert.equal(g.s.starter.options.length, 3); assert.equal(new Set(g.s.starter.options).size, 3);
  assert.equal(g.run('PickStarter', { position: 0 }).error, 'phase');
  g.run('ShuffleStarter');
  assert.equal(g.s.phase, 'starter_pick');
  assert.equal(g.s.starter.swaps.length, c.starterRules.swaps);
  // swaps를 순서대로 적용한 결과가 order와 같다
  const order = [0, 1, 2]; for (const [i, j] of g.s.starter.swaps) [order[i], order[j]] = [order[j], order[i]];
  assert.deepEqual(order, g.s.starter.order);
  const want = g.s.starter.options[g.s.starter.order[2]];
  g.run('PickStarter', { position: 2 });
  assert.equal(g.s.phase, 'starter_done'); assert.equal(g.s.run.team.characters[0].characterDefId, want);
  g.run('BeginJourney'); assert.equal(g.s.phase, 'blind_select');
  // 같은 시드면 같은 3명과 같은 섞기
  const h = runner(); h.run('ShuffleStarter'); assert.deepEqual(h.s.starter, (() => { const k = runner(); k.run('ShuffleStarter'); return k.s.starter; })());
});

test('전투 턴: 손패 4장, 붙이기 2번, 자리 바꾸기 1번, 전투 뒤 다음 턴에 새 손패', () => {
  const g = start();
  let b = g.s.battle;
  assert.deepEqual([b.hand.length, b.attachesLeft, b.swapsLeft, b.turn], [4, 2, 1, 1]);
  const u = g.s.run.team.characters[0].instanceId;
  // 붙일 수 없는 카드: 같은 속성 두 번
  const [x, y, z] = b.hand;
  assert.equal(g.run('Attach', { uid: 'nope', targetInstanceId: u }).error, 'card');
  assert.equal(g.run('Attach', { uid: x.uid, targetInstanceId: 'nobody' }).error, 'target');
  g.run('Attach', { uid: x.uid, targetInstanceId: u });
  const ok = g.s.battle.hand.find(k => !game.validateAttach(g.s, { uid: k.uid, targetInstanceId: u }, c));
  g.run('Attach', { uid: ok.uid, targetInstanceId: u });
  assert.equal(g.s.battle.attachesLeft, 0);
  assert.equal(g.run('Attach', { uid: g.s.battle.hand[0].uid, targetInstanceId: u }).error, 'limit');
  assert.equal(g.run('SwapSlots', { a: 0, b: 1 }).error, null); assert.equal(g.s.battle.swapsLeft, 0);
  assert.equal(g.run('SwapSlots', { a: 0, b: 1 }).error, 'swapLimit');
  g.run('Fight');
  b = g.s.battle;
  assert.deepEqual([b.turn, b.hand.length, b.attachesLeft, b.swapsLeft, g.s.phase], [2, 4, 2, 1, 'battle']);
  assert.ok(b.lastRound.events.length > 0);
  assert.equal(b.drawPile.length + b.discardPile.length + b.hand.length, g.s.run.deck.length);
});

test('승리: 골드 정산(보상 + 빨리 끝냄 + 이자) → 상점 → 다음 블라인드', () => {
  const g = start();
  const s = structuredClone(g.s); s.battle.monster.hp = 1; s.run.gold = 12; g.s = s;
  g.run('Fight');
  assert.equal(g.s.phase, 'cashout');
  assert.deepEqual(g.s.battle.cashout, { blindGold: 4, speedGold: 2, interest: 2, total: 8 });
  g.run('CashOut');
  assert.equal(g.s.phase, 'shop'); assert.equal(g.s.run.gold, 20); assert.deepEqual([g.s.run.ante, g.s.run.blindIndex], [0, 1]);
  assert.equal(g.s.shop.recruits.length, 2);
  g.run('LeaveShop'); assert.equal(g.s.phase, 'blind_select');
  g.run('SelectBlind'); assert.equal(game.blindInfo(g.s.run, c).kind.id, 'big');
  assert.equal(g.s.battle.monster.hp, c.monsterStats[1][0]);
});

test('상점: 영입은 빈 칸에, 회복·묶음·새로고침·판매·자리 이동', () => {
  const g = start();
  const s = structuredClone(g.s); s.battle.monster.hp = 1; g.s = s; g.run('Fight'); g.run('CashOut');
  const t = structuredClone(g.s); t.run.gold = 60; t.run.team.characters[0].hp = 10; g.s = t;
  // 영입: 빈 칸 1번에 들어간다
  assert.equal(g.run('BuyCharacter', { index: 0 }).error, null);
  assert.equal(g.s.run.team.characters[1].characterDefId, g.s.shop.recruits[0].defId);
  assert.equal(g.run('BuyCharacter', { index: 0 }).error, 'target');
  assert.equal(g.run('BuyCharacter', { index: 1 }).error, null);
  const full = structuredClone(g.s); full.shop.recruits[0] = { defId: 'char_human_mage', cost: 1, sold: false }; g.s = full;
  assert.equal(g.run('BuyCharacter', { index: 0 }).error, 'full');
  // 치료
  const gold = g.s.run.gold;
  assert.equal(g.run('HealUnit', { slot: 0 }).error, null); assert.equal(g.s.run.team.characters[0].hp, rules.maxHpOf(g.s.run.team.characters[0], c)); assert.equal(g.s.run.gold, gold - 3);
  assert.equal(g.run('HealUnit', { slot: 0 }).error, 'target');
  // 묶음
  const size = g.s.run.deck.length;
  g.run('BuyPack', { packId: 'pack_stars' }); assert.equal(g.s.run.deck.length, size + 2); assert.equal(g.s.run.deck.slice(-2).every(k => k.defId === 'sticker_star'), true);
  g.run('BuyPack', { packId: 'pack_stickers' }); assert.equal(g.s.run.deck.length, size + 5);
  // 새로고침 비용 2 → 3
  assert.equal(game.rerollCost(g.s, c), 2); g.run('Reroll'); assert.equal(game.rerollCost(g.s, c), 3);
  // 자리 이동, 판매(마지막 1명은 불가)
  const a = g.s.run.team.characters[0].instanceId; g.run('MoveCharacter', { from: 0, to: 2 }); assert.equal(g.s.run.team.characters[2].instanceId, a);
  const before = g.s.run.gold; assert.equal(g.run('SellCharacter', { slot: 2 }).error, null); assert.ok(g.s.run.gold > before);
  g.run('SellCharacter', { slot: 0 }); assert.equal(g.run('SellCharacter', { slot: 1 }).error, 'lastCharacter');
});

test('패배: 동료가 모두 쓰러지면 원정이 끝난다', () => {
  const g = start();
  const s = structuredClone(g.s); s.run.team.characters[0].hp = 1; s.battle.monster.atk = 999; g.s = s;
  g.run('Fight');
  assert.equal(g.s.phase, 'run_result'); assert.equal(g.s.run.result, 'lose'); assert.equal(g.s.run.team.characters.filter(Boolean).length, 0);
});

test('결정성과 균형: 같은 시드는 같은 결과, 봇이 런을 끝까지 진행, 첫 슬라임은 어느 시작 동료 혼자서도 잡는다', () => {
  for (const seed of [1, 2, 3]) { const a = playRun(seed), b = playRun(seed); assert.equal(a.phase, 'run_result'); assert.deepEqual(a.history, b.history); assert.deepEqual(a.run, b.run); }
  for (const d of c.characters) {
    let win = 0;
    for (let seed = 1; seed <= 12; seed++) if (playRun(seed, c, 'smart', { forceStarter: d.id, stopAfterFirst: true }).history[0]?.outcome === 'win') win++;
    assert.ok(win >= 11, `${data.nameOf(d.id)} 첫 슬라임 ${win}/12`);
  }
});
