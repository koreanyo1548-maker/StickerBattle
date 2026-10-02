// 콘텐츠·규칙·게임 흐름 테스트. 실행: node --test tools/test-rules.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './load-modules.mjs';
import { playRun } from './balance-bot.mjs';

const { data, rules, game } = loadModules();
const c = data.content;
const sticker = id => data.byId(c.stickers, `sticker_${id}`);
// 캐릭터 정의 ID와 장비로 유닛을 만든다. 예: unit(0, 'human_warrior', {weaponId:'weapon_sword'})
const unit = (slot, def, extra = {}) => ({ ...rules.makeUnit(`u${slot}`, `char_${def}`), ...extra });
const card = (id, mod = null) => ({ uid: `k_${id}_${Math.random()}`, defId: `sticker_${id}`, mod });
// plays: [[스티커, 대상 자리, 각인?], ...]
function attack(team, plays, { elementId = null, effect = null, silencedSlot = null, levels = {}, discardsLeft = 0, lastAttack = false } = {}) {
  return rules.scoreAttack({ team, plays: plays.map(([id, slot, mod]) => ({ card: card(id, mod), targetInstanceId: team[slot].instanceId })), levels, blind: { elementId, effect, silencedSlot }, discardsLeft, lastAttack }, c);
}
const hand = (ids, opts) => rules.evaluateHand(ids.map(id => `sticker_${id}`), {}, c, opts).handId;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('콘텐츠 검증', () => assert.equal(data.validateContent(), true));

test('붙이기: 별과 속성은 레벨, 다른 속성은 교체 후 Lv1, 같은 무기는 강화·다른 무기는 교체 후 +0', () => {
  let u = unit(0, 'human_warrior');
  u = rules.attachUnit(u, sticker('star')); u = rules.attachUnit(u, sticker('star'));
  u = rules.attachUnit(u, sticker('fire')); u = rules.attachUnit(u, sticker('fire'));
  assert.deepEqual([u.starLevel, u.elementId, u.elementLevel], [2, 'element_fire', 2]);
  u = rules.attachUnit(u, sticker('water'));
  assert.deepEqual([u.elementId, u.elementLevel], ['element_water', 1]);
  u = rules.attachUnit(u, sticker('sword')); u = rules.attachUnit(u, sticker('sword'));
  assert.deepEqual([u.weaponId, u.weaponPlus], ['weapon_sword', 1]);
  u = rules.attachUnit(u, sticker('bow'));
  assert.deepEqual([u.weaponId, u.weaponPlus], ['weapon_bow', 0]);
});

test('족보: 우선순위는 확률의 역순, 레벨은 칩·배율을 올린다', () => {
  assert.equal(hand(['sword']), 'single');
  assert.equal(hand(['sword', 'sword', 'fire']), 'pair');
  assert.equal(hand(['sword', 'sword', 'fire', 'fire']), 'twoPair');
  assert.equal(hand(['fire', 'water', 'lightning', 'sword', 'sword']), 'triElement');
  assert.equal(hand(['sword', 'bow', 'staff', 'star']), 'triWeapon');
  // 트리플이 삼원소보다 위
  assert.equal(hand(['fire', 'fire', 'fire', 'water', 'lightning']), 'triple');
  assert.equal(hand(['star', 'star', 'star', 'bow', 'bow']), 'fullHouse');
  assert.equal(hand(['bow', 'bow', 'bow', 'bow', 'fire']), 'four');
  assert.equal(hand(['bow', 'bow', 'bow', 'bow', 'bow']), 'five');
  // 무지개 활: 속성을 모두 같은 스티커로(삼원소 대신 풀하우스)
  assert.equal(hand(['fire', 'water', 'lightning', 'sword', 'sword'], { elementsSame: true }), 'fullHouse');
  const lv = rules.evaluateHand(['sticker_sword', 'sticker_sword'], { pair: 3 }, c);
  assert.deepEqual([lv.level, lv.chips, lv.mult], [3, 40, 4]);
  const flat = rules.evaluateHand(['sticker_sword', 'sticker_sword'], { pair: 3 }, c, { flat: true });
  assert.deepEqual([flat.level, flat.chips, flat.mult], [1, 10, 2]);
});

test('공격 점수: 손으로 계산한 예제와 일치', () => {
  // 0번 인간 궁수(페어 이상 +4 배율), 1번 엘프 마법사(속성 1장당 ×1.15). 블라인드 물: 번개 유리, 불 불리.
  const t = [unit(0, 'human_archer'), unit(1, 'elf_mage')];
  const r = attack(t, [['sword', 0], ['sword', 0], ['lightning', 1], ['fire', 1]], { elementId: 'element_water' });
  // 페어 10×2 → 검 +10 → 검(강화 +1) +15 → 번개 Lv1 유리 +5 칩 +2 배율 → 불 Lv1(번개 교체) 불리 +5 칩 → 칩 45, 배율 4
  // 인간 궁수 +4 → 8, 엘프 마법사 속성 2장 ×1.15² → 10.58. floor(45 × 10.58) = 476
  assert.equal(r.handId, 'pair');
  assert.equal(r.chips, 45); near(r.mult, 8 * 1.15 ** 2); assert.equal(r.score, 476);
  assert.deepEqual([r.team[0].weaponPlus, r.team[1].elementId, r.team[1].elementLevel], [1, 'element_fire', 1]);
  assert.deepEqual(r.steps.map(s => s.src), ['hand', 'card', 'card', 'card', 'card', 'unit', 'unit']);
});

test('점수 순서: 같은 점수 재료라도 자리 순서(+배율 → ×배율)가 결과를 바꾼다', () => {
  const plays = [['fire', 0], ['fire', 1]];
  const ab = attack([unit(0, 'elf_archer'), unit(1, 'elf_mage')], plays), ba = attack([unit(0, 'elf_mage'), unit(1, 'elf_archer')], plays);
  // 페어 10×2, 불 두 장(두 번째도 Lv1: 다른 캐릭터) 칩 20 배율 4. 궁수 +2×2, 마법사 ×1.15².
  near(ab.mult, (4 + 4) * 1.15 ** 2); near(ba.mult, 4 * 1.15 ** 2 + 4);
  assert.ok(ab.score > ba.score);
});

test('드워프: 성장치 G = 강화 + 별 Lv + 속성 Lv', () => {
  const t = [unit(0, 'dwarf_mage', { weaponId: 'weapon_staff', weaponPlus: 1, starLevel: 3 })];
  const r = attack(t, [['staff', 0]]);
  // 지팡이 강화 +2가 되어 G = 2 + 3 + 0 = 5 → ×1.5. 낱장 5×1, 지팡이 칩 10+10.
  assert.equal(r.chips, 25); near(r.mult, 1.5); assert.equal(r.score, 37);
});

test('조합 무기 능력', () => {
  // 화염검: 자기 기본 능력 한 번 더
  const flame = attack([unit(0, 'orc_warrior', { weaponId: 'weapon_sword', elementId: 'element_fire', elementLevel: 1 })], [['sword', 0]]);
  assert.equal(flame.chips, 5 + 15 + 15 + 15);
  // 연쇄궁: 왼쪽 캐릭터 기본 능력 한 번 더
  const chain = attack([unit(0, 'human_warrior'), unit(1, 'elf_archer', { weaponId: 'weapon_bow', elementId: 'element_lightning', elementLevel: 1 })], [['star', 0], ['star', 0]]);
  assert.equal(chain.chips, 10 + 5 + 10 + 30 + 30); assert.equal(chain.score, 170);
  // 폭발궁: 오른쪽 캐릭터 기본 능력 한 번 더(오른쪽이 발동하기 전에)
  const blast = attack([unit(0, 'human_mage', { weaponId: 'weapon_bow', elementId: 'element_fire', elementLevel: 1 }), unit(1, 'orc_warrior')], [['sword', 1]]);
  assert.equal(blast.chips, 5 + 10 + 15 + 15);
  // 역류검: 남은 버리기 1회당 +20 칩
  const reflux = attack([unit(0, 'human_mage', { weaponId: 'weapon_sword', elementId: 'element_water', elementLevel: 1 })], [['star', 0]], { discardsLeft: 3 });
  assert.equal(reflux.chips, 5 + 5 + 60);
  // 연마검: 공격할 때마다 강화 +1(다음 공격부터 효과)
  const hone = attack([unit(0, 'human_mage', { weaponId: 'weapon_sword', elementId: 'element_lightning', elementLevel: 1 })], [['star', 0]]);
  assert.equal(hone.team[0].weaponPlus, 1);
  // 축적 지팡이: 누적 +1씩, 누적만큼 +배율
  let t = [unit(0, 'human_mage', { weaponId: 'weapon_staff', elementId: 'element_lightning', elementLevel: 1 })];
  const c1 = attack(t, [['star', 0]]); assert.deepEqual([c1.mult, c1.team[0].charge], [2, 1]);
  const c2 = attack(c1.team, [['star', 0]]); assert.deepEqual([c2.mult, c2.team[0].charge], [3, 2]);
  // 화염 지팡이: 마지막 공격이면 ×3
  const fs = [unit(0, 'human_mage', { weaponId: 'weapon_staff', elementId: 'element_fire', elementLevel: 1 })];
  assert.equal(attack(fs, [['star', 0]], { lastAttack: true }).mult, 3);
  assert.equal(attack(fs, [['star', 0]]).mult, 1);
  // 균형 지팡이: 모두 다른 종류면 ×2
  const bs = [unit(0, 'elf_mage', { weaponId: 'weapon_staff', elementId: 'element_water', elementLevel: 1 }), unit(1, 'human_warrior')];
  assert.equal(attack(bs, [['sword', 1], ['bow', 1]]).mult, 2);
  assert.equal(attack(bs, [['sword', 1], ['bow', 1], ['bow', 1]]).mult, 2);
  // 무지개 활: 속성을 모두 같은 스티커로
  const rb = [unit(0, 'human_mage', { weaponId: 'weapon_bow', elementId: 'element_water', elementLevel: 1 }), unit(1, 'human_warrior')];
  assert.equal(attack(rb, [['fire', 1], ['water', 1], ['lightning', 1], ['sword', 1], ['sword', 1]]).handId, 'fullHouse');
});

test('각인: 반짝이 +30 칩, 홀로 +5 배율, 금박 ×1.5, 유리 ×2', () => {
  const t = [unit(0, 'human_mage')];
  const r = attack(t, [['star', 0, 'shiny'], ['bow', 0, 'holo'], ['sword', 0, 'gold'], ['staff', 0, 'glass']]);
  // 삼무기 30×3, 별 +5, 반짝이 +30, 활 +10, 홀로 +5, 검 +10, 금박 ×1.5, 지팡이 +10, 유리 ×2
  assert.equal(r.handId, 'triWeapon'); assert.equal(r.chips, 30 + 5 + 30 + 10 + 10 + 10); near(r.mult, (3 + 5) * 1.5 * 2);
});

test('보스 규칙', () => {
  const t = [unit(0, 'human_archer'), unit(1, 'orc_warrior')];
  assert.equal(attack(t, [['sword', 1]], { effect: 'weaponSeal' }).steps.find(s => s.src === 'card').chips, 0);
  assert.equal(attack(t, [['fire', 1]], { effect: 'elementSeal', elementId: 'element_lightning' }).mult, 1);
  assert.equal(attack(t, [['star', 1]], { effect: 'starSeal' }).chips, 5);
  assert.equal(attack(t, [['sword', 0], ['sword', 0]], { effect: 'flatHands', levels: { pair: 4 } }).level, 1);
  // 침묵: 1번 캐릭터 능력 정지
  assert.equal(attack(t, [['sword', 1]], { effect: 'silence', silencedSlot: 1 }).chips, 5 + 10);
  // 상성 반전: 블라인드 물에서 번개는 원래 유리, 반전되면 불리(배율 0)
  assert.equal(attack(t, [['lightning', 1]], { elementId: 'element_water', effect: 'invertAffinity' }).mult, 1);
  assert.equal(attack(t, [['lightning', 1]], { elementId: 'element_water' }).mult, 3);
});

// ── 게임 흐름 ──
function runner(seed = 7) {
  let s = game.initialState(), n = 0;
  const run = (type, p = {}) => { const r = game.applyCommand(s, { type, commandId: `t${n++}`, ...p }, c); if (!r.error) s = r.state; return r; };
  run('StartRun', { seed });
  return { run, get s() { return s; }, set s(v) { s = v; } };
}

test('흐름: 시작 캐릭터 → 블라인드 → 공격·버리기 검증', () => {
  const g = runner();
  assert.equal(g.s.phase, 'starter'); assert.equal(g.s.starter.length, 3);
  g.run('PickStarter', { index: 1 });
  assert.equal(g.s.phase, 'blind_select'); assert.equal(g.s.run.team.characters.filter(Boolean).length, 1);
  assert.equal(g.run('SelectBlind').error, null);
  const b = g.s.battle, u = g.s.run.team.characters[0].instanceId;
  assert.deepEqual([b.hand.length, b.attacksLeft, b.discardsLeft, b.target], [c.balance.handSize, c.balance.attacks, c.balance.discards, c.anteBase[0]]);
  assert.equal(g.run('Attack', { plays: [] }).error, 'empty');
  assert.equal(g.run('Attack', { plays: b.hand.slice(0, 6).map(x => ({ uid: x.uid, targetInstanceId: u })) }).error, 'tooMany');
  assert.equal(g.run('Attack', { plays: [{ uid: b.hand[0].uid, targetInstanceId: 'nobody' }] }).error, 'target');
  const drawBefore = b.drawPile.length;
  assert.equal(g.run('Discard', { uids: [b.hand[0].uid, b.hand[1].uid] }).error, null);
  assert.deepEqual([g.s.battle.discardsLeft, g.s.battle.hand.length, g.s.battle.drawPile.length], [c.balance.discards - 1, c.balance.handSize, drawBefore - 2]);
  const plays = g.s.battle.hand.slice(0, 3).map(x => ({ uid: x.uid, targetInstanceId: u }));
  const expected = game.previewAttack(g.s, plays, c).score;
  assert.equal(g.run('Attack', { plays }).error, null);
  assert.deepEqual([g.s.battle.damage, g.s.battle.attacksLeft, g.s.battle.hand.length], [expected, c.balance.attacks - 1, c.balance.handSize]);
});

test('흐름: 승리 정산(남은 공격·이자) → 상점 → 다음 블라인드', () => {
  const g = runner(); g.run('PickStarter', { index: 0 }); g.run('SelectBlind');
  const s = structuredClone(g.s); s.battle.target = 1; s.run.gold = 12; g.s = s;
  const u = g.s.run.team.characters[0].instanceId;
  g.run('Attack', { plays: [{ uid: g.s.battle.hand[0].uid, targetInstanceId: u }] });
  assert.equal(g.s.phase, 'cashout');
  // 스몰 3 + 남은 공격 3 × 1 + 이자 floor(12/5)=2
  assert.deepEqual(g.s.battle.cashout, { blindGold: 3, attackGold: 3, interest: 2, total: 8 });
  g.run('CashOut');
  assert.equal(g.s.phase, 'shop'); assert.equal(g.s.run.gold, 20); assert.equal(g.s.run.blindIndex, 1);
  // 리롤 비용 5 → 6
  assert.equal(game.rerollCost(g.s, c), 5); g.run('Reroll'); assert.equal(game.rerollCost(g.s, c), 6); assert.equal(g.s.run.gold, 15);
  // 칸 확장
  assert.equal(g.run('BuySlot').error, null); assert.equal(g.s.run.team.characters.length, 4); assert.equal(g.s.run.gold, 5);
  // 캐릭터 구매: 골드가 모자라면 실패, 충분하면 빈 칸에
  const s2 = structuredClone(g.s); s2.run.gold = 50; g.s = s2;
  assert.equal(g.run('BuyCharacter', { index: 0 }).error, null); assert.equal(g.s.run.team.characters.filter(Boolean).length, 2);
  // 자리 바꾸기와 판매(마지막 1명은 팔 수 없음)
  const first = g.s.run.team.characters[0].instanceId;
  g.run('MoveCharacter', { from: 0, to: 3 }); assert.equal(g.s.run.team.characters[3].instanceId, first);
  const gold = g.s.run.gold; assert.equal(g.run('SellCharacter', { slot: 3 }).error, null); assert.ok(g.s.run.gold > gold);
  assert.equal(g.run('SellCharacter', { slot: 1 }).error, 'lastCharacter');
  g.run('LeaveShop'); assert.equal(g.s.phase, 'blind_select');
  assert.equal(game.blindInfo(g.s.run, c).kind.id, 'big');
});

test('흐름: 덱 편집 물건은 카드를 고른 뒤에 골드를 낸다', () => {
  const g = runner(); g.run('PickStarter', { index: 0 }); g.run('SelectBlind');
  const s = structuredClone(g.s); s.battle.target = 1; g.s = s;
  g.run('Attack', { plays: [{ uid: g.s.battle.hand[0].uid, targetInstanceId: g.s.run.team.characters[0].instanceId }] }); g.run('CashOut');
  const s2 = structuredClone(g.s); s2.run.gold = 30; s2.shop.items = [{ itemId: 'item_holo', cost: 4, sold: false }, { itemId: 'item_remove', cost: 3, sold: false }]; g.s = s2;
  g.run('BuyItem', { index: 0 }); assert.equal(g.s.phase, 'deck_pick'); assert.equal(g.s.run.gold, 30);
  g.run('CancelPick'); assert.equal(g.s.phase, 'shop'); assert.equal(g.s.run.gold, 30);
  g.run('BuyItem', { index: 0 });
  const uids = g.s.run.deck.slice(0, 2).map(x => x.uid);
  assert.equal(g.run('PickDeckCards', { uids: [...uids, g.s.run.deck[2].uid] }).error, 'card');
  g.run('PickDeckCards', { uids });
  assert.equal(g.s.run.gold, 26); assert.deepEqual(g.s.run.deck.filter(x => x.mod === 'holo').map(x => x.uid), uids);
  const size = g.s.run.deck.length; g.run('BuyItem', { index: 1 }); g.run('PickDeckCards', { uids: [uids[0]] });
  assert.equal(g.s.run.deck.length, size - 1);
});

test('흐름: 건너뛰기는 태그를 주고, 보스는 건너뛸 수 없다', () => {
  const g = runner(); g.run('PickStarter', { index: 0 });
  const tag = data.byId(c.tags, game.blindInfo(g.s.run, c).tagId), gold = g.s.run.gold;
  g.run('SkipBlind');
  assert.equal(g.s.run.blindIndex, 1); assert.equal(g.s.history[0].outcome, 'skip');
  if (tag.effect === 'gold') assert.equal(g.s.run.gold, gold + tag.value);
  g.run('SkipBlind'); assert.equal(g.run('SkipBlind').error, 'boss');
});

test('흐름: 다섯 장 보스와 버리기 금지', () => {
  const g = runner(); g.run('PickStarter', { index: 0 }); g.run('SelectBlind');
  const s = structuredClone(g.s); s.battle.effect = 'exactFive'; g.s = s;
  const u = g.s.run.team.characters[0].instanceId, h = g.s.battle.hand;
  assert.equal(g.run('Attack', { plays: h.slice(0, 4).map(x => ({ uid: x.uid, targetInstanceId: u })) }).error, 'exactFive');
  const s2 = structuredClone(g.s); s2.battle.discardsLeft = 0; g.s = s2;
  assert.equal(g.run('Discard', { uids: [h[0].uid] }).error, 'noDiscards');
});

test('유리 각인은 깨지면 덱에서 사라진다', () => {
  for (let seed = 1; seed < 60; seed++) {
    const g = runner(seed); g.run('PickStarter', { index: 0 }); g.run('SelectBlind');
    const s = structuredClone(g.s), uid = s.battle.hand[0].uid;
    s.battle.hand[0].mod = 'glass'; s.run.deck.find(x => x.uid === uid).mod = 'glass'; g.s = s;
    const r = g.run('Attack', { plays: [{ uid, targetInstanceId: g.s.run.team.characters[0].instanceId }] });
    if (r.events.find(e => e.type === 'Attacked').broken.length) { assert.ok(!g.s.run.deck.some(x => x.uid === uid)); return; }
  }
  assert.fail('60번 안에 한 번도 깨지지 않음');
});

test('결정성: 같은 시드와 명령은 같은 결과, 봇이 런을 끝까지 진행한다', () => {
  for (const seed of [1, 2, 3]) {
    const a = playRun(seed), b = playRun(seed);
    assert.equal(a.phase, 'run_result'); assert.deepEqual(a.history, b.history); assert.deepEqual(a.run, b.run);
  }
});
