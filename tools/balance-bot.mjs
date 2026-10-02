// 실제 엔진으로 봇을 끝까지 돌려 앤티별 클리어율과 점수를 본다. 실행: node tools/balance-bot.mjs [판수=300] [정책=smart]
// 정책: smart(공격 조합 전수 + 휴리스틱 대상·버리기·상점), first(첫 카드 1장만 내는 최저 기준선).
// 콘텐츠 덮어쓰기: BOT='{"anteBase":[300,1000,3000,8000]}' node tools/balance-bot.mjs
import { loadModules } from './load-modules.mjs';

const { data, rules, game } = loadModules();

function combos(list, k, start = 0, acc = [], out = []) {
  if (acc.length === k) { out.push(acc); return out; }
  for (let i = start; i < list.length; i++) combos(list, k, i + 1, [...acc, list[i]], out);
  return out;
}
// 카드마다 붙일 캐릭터: 같은 무기·속성이면 그 캐릭터(강화·Lv), 아니면 빈 칸, 별은 드워프나 별이 가장 높은 캐릭터.
function targetsFor(cards, team, c) {
  const units = team.map(u => u && { ...u }).filter(Boolean), plays = [];
  for (const card of cards) {
    const s = data.byId(c.stickers, card.defId);
    let pick;
    if (s.kind === 'weapon') pick = units.find(u => u.weaponId === s.payloadId) ?? units.find(u => !u.weaponId) ?? units.reduce((a, u) => u.weaponPlus < a.weaponPlus ? u : a);
    else if (s.kind === 'element') pick = units.find(u => u.elementId === s.payloadId) ?? units.find(u => !u.elementId) ?? units.reduce((a, u) => u.elementLevel < a.elementLevel ? u : a);
    else pick = units.find(u => u.characterDefId.startsWith('char_dwarf')) ?? units.reduce((a, u) => u.starLevel > a.starLevel ? u : a);
    Object.assign(pick, rules.attachUnit(pick, s));
    plays.push({ uid: card.uid, targetInstanceId: pick.instanceId });
  }
  return plays;
}
function bestAttack(s, c) {
  const hand = s.battle.hand, need = game.requiredPlay(s, c);
  let best = null;
  for (let k = need ?? 1; k <= (need ?? Math.min(c.balance.maxPlay, hand.length)); k++)
    for (const cards of combos(hand, k)) {
      const plays = targetsFor(cards, s.run.team.characters, c), r = game.previewAttack(s, plays, c);
      if (!best || r.score > best.score) best = { plays, score: r.score, handId: r.handId };
    }
  return best;
}
// 버리기: 남은 HP를 남은 공격으로 나눈 몫보다 최선 점수가 낮으면, 가장 많은 두 종류만 남기고 버린다.
function discardPlan(s, c, best) {
  const b = s.battle;
  if (!b.discardsLeft || b.attacksLeft <= 1) return null;
  const need = (b.target - b.damage) / b.attacksLeft;
  if (best.score >= need) return null;
  const counts = {}; b.hand.forEach(x => { if (x.defId !== 'sticker_star') counts[x.defId] = (counts[x.defId] ?? 0) + 1; });
  const keep = new Set(Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k));
  const out = b.hand.filter(x => x.defId !== 'sticker_star' && !keep.has(x.defId) && !x.mod).slice(0, c.balance.maxPlay).map(x => x.uid);
  return out.length ? out : null;
}
const jobOrder = { chips: 0, mult: 1, xmult: 2 };
function shopTurn(get, c, run) {
  for (let guard = 0; guard < 20; guard++) {
    const s = get(), sh = s.shop, r = s.run;
    const free = r.team.characters.some(u => !u);
    const ci = sh.characters.findIndex(o => !o.sold && o.cost <= r.gold && free);
    if (ci >= 0) { run('BuyCharacter', { index: ci }); continue; }
    const slot = game.slotCost(r, c);
    if (slot != null && r.gold >= slot + 4) { run('BuySlot'); continue; }
    const ii = sh.items.findIndex(o => !o.sold && o.cost <= r.gold && ['handLevel', 'mod'].includes(data.byId(c.items, o.itemId).effect));
    if (ii >= 0) {
      const item = data.byId(c.items, sh.items[ii].itemId); run('BuyItem', { index: ii });
      if (get().phase === 'deck_pick') { const plain = get().run.deck.filter(x => !x.mod).slice(0, item.pick).map(x => x.uid); plain.length ? run('PickDeckCards', { uids: plain }) : run('CancelPick'); }
      continue;
    }
    break;
  }
  // 자리: +칩 → +배율 → ×배율 순서로 정렬.
  const s = get(), rank = u => u ? jobOrder[data.byId(c.characters, u.characterDefId).effect] : 9;
  const want = [...s.run.team.characters].sort((a, b) => rank(a) - rank(b)).map(u => u?.instanceId ?? null);
  want.forEach((id, to) => { const from = get().run.team.characters.findIndex(u => (u?.instanceId ?? null) === id); if (id && from !== to) run('MoveCharacter', { from, to }); });
  run('LeaveShop');
}
export function playRun(seed, c = data.content, policy = 'smart') {
  let s = game.initialState(), n = 0;
  const run = (type, p = {}) => { const r = game.applyCommand(s, { type, commandId: `c${n++}`, ...p }, c); if (r.error) throw Error(`${type}: ${r.error}`); s = r.state; return r; };
  run('StartRun', { seed });
  run('PickStarter', { index: 0 });
  for (let guard = 0; s.phase !== 'run_result'; guard++) {
    if (guard > 5000) throw Error('끝나지 않음');
    if (s.phase === 'blind_select') run('SelectBlind');
    else if (s.phase === 'battle') {
      if (policy === 'first') { const need = game.requiredPlay(s, c) ?? 1; run('Attack', { plays: targetsFor(s.battle.hand.slice(0, need), s.run.team.characters, c) }); continue; }
      const best = bestAttack(s, c), dis = discardPlan(s, c, best);
      dis ? run('Discard', { uids: dis }) : run('Attack', { plays: best.plays });
    }
    else if (s.phase === 'cashout') run('CashOut');
    else if (s.phase === 'shop') shopTurn(() => s, c, run);
    else throw Error(`처리하지 않은 단계 ${s.phase}`);
  }
  return s;
}

if (process.argv[1]?.endsWith('balance-bot.mjs')) {
  const N = Number(process.argv[2] ?? 300), policy = process.argv[3] ?? 'smart';
  const c = { ...structuredClone(data.content), ...JSON.parse(process.env.BOT ?? '{}') };
  const A = c.balance.anteCount, kinds = c.blindKinds.map(k => k.id);
  const reach = Array(A * 3).fill(0), ratios = Array.from({ length: A * 3 }, () => []), hands = {}, chars = {};
  let wins = 0;
  for (let seed = 1; seed <= N; seed++) {
    const s = playRun(seed, c, policy);
    if (s.run.result === 'win') wins++;
    s.history.forEach((h, i) => { if (h.outcome === 'win') reach[i]++; ratios[i].push(h.score / h.target); });
    Object.entries(s.run.handsPlayed).forEach(([k, v]) => hands[k] = (hands[k] ?? 0) + v);
    s.run.team.characters.filter(Boolean).forEach(u => chars[u.characterDefId] = (chars[u.characterDefId] ?? 0) + 1);
  }
  const pct = v => `${(v / N * 100).toFixed(0)}%`, med = a => a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)].toFixed(2) : '-';
  console.log(`${N}판 · 정책 ${policy} · 앤티 목표 ${c.anteBase.join(' / ')}`);
  for (let a = 0; a < A; a++) console.log(`  앤티 ${a + 1}: 클리어 ${kinds.map((k, j) => `${k} ${pct(reach[a * 3 + j])}`).join(' · ')} | 점수/목표 중앙값 ${kinds.map((k, j) => med(ratios[a * 3 + j])).join(' / ')}`);
  console.log(`  원정 성공 ${pct(wins)}`);
  const total = Object.values(hands).reduce((a, b) => a + b, 0);
  console.log(`  족보 비율: ${Object.entries(hands).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${data.byId(c.hands, k).name} ${(v / total * 100).toFixed(0)}%`).join(' · ')}`);
}
