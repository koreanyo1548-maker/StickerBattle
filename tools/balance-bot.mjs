// 실제 엔진으로 봇을 끝까지 돌려 블라인드별 클리어율·전투 길이·사망 수를 본다. 실행: node tools/balance-bot.mjs [판수=300] [정책=smart]
// 첫 슬라임 혼자 잡기 검사: node tools/balance-bot.mjs solo [판수=100]  (시작 동료 12종 각각, 상점·추가 동료 없이 앤티 1 스몰만)
// 콘텐츠 덮어쓰기: BOT='{"monsterStats":[[110,10],…]}' node tools/balance-bot.mjs
// 정책: smart(이번 턴 붙일 카드·대상·자리 바꾸기를 전부 시뮬레이션해서 고름 + 상점에서 영입·치료·별), first(첫 카드를 첫 동료에게만, 최저 기준선).
import { loadModules } from './load-modules.mjs';

const { data, rules, game } = loadModules();
const jobRank = c => unit => unit ? rules.maxHpOf(unit, c) : -1;

// 이번 턴에 할 수 있는 행동 후보: [자리 바꾸기(없음 포함)] × [붙이기 0~attachesLeft장, 대상 전부]
function plans(s, c) {
  const b = s.battle, team = s.run.team.characters, out = [];
  const swaps = [null]; if (b.swapsLeft > 0) for (let a = 0; a < 3; a++) for (let z = a + 1; z < 3; z++) if (team[a] || team[z]) swaps.push([a, z]);
  const alive = team.map((u, i) => u ? i : -1).filter(i => i >= 0);
  const picks = [[]];
  const hand = b.hand;
  if (b.attachesLeft >= 1) for (const card of hand) for (const i of alive) picks.push([[card, i]]);
  if (b.attachesLeft >= 2) for (let x = 0; x < hand.length; x++) for (let y = x + 1; y < hand.length; y++) for (const i of alive) for (const j of alive) picks.push([[hand[x], i], [hand[y], j]]);
  for (const sw of swaps) for (const pk of picks) out.push({ sw, pk });
  return out;
}
function applyPlan(team, plan, c) {
  const t = team.map(u => u && { ...u });
  if (plan.sw) [t[plan.sw[0]], t[plan.sw[1]]] = [t[plan.sw[1]], t[plan.sw[0]]];
  // 붙이기 대상은 자리 바꾸기 전의 자리 번호가 아니라 캐릭터 기준이어야 하므로 instanceId로 찾는다.
  const ids = plan.pk.map(([card, slot]) => [card, team[slot].instanceId]);
  for (const [card, id] of ids) {
    const i = t.findIndex(u => u?.instanceId === id), st = data.byId(c.stickers, card.defId);
    if (rules.attachmentReason(t[i], st, c)) return null;
    t[i] = rules.attachUnit(t[i], st, c);
  }
  return t;
}
function power(team, monster, c) { return team.reduce((n, u) => n + (u ? rules.attackOf(u, team, monster, 1, c) * 3 + rules.maxHpOf(u, c) * 0.15 : 0), 0); }
function bestPlan(s, c) {
  const b = s.battle, before = s.run.team.characters, p0 = power(before, b.monster, c);
  let best = null;
  for (const plan of plans(s, c)) {
    const t = applyPlan(before, plan, c); if (!t) continue;
    const res = rules.resolveRound(t, b.monster, b.turn, c);
    const dealt = b.monster.hp - res.monster.hp;
    const lost = res.events.filter(e => e.type === 'counter').reduce((n, e) => n + e.dmg, 0);
    const deaths = res.events.filter(e => e.type === 'counter' && e.killed).length;
    const healed = res.events.filter(e => e.type === 'heal').reduce((n, e) => n + e.amount, 0);
    const val = res.won ? 1e9 : dealt - lost * 0.8 + healed * 0.8 - deaths * 400 + (power(res.team, res.monster, c) - p0) * 0.6;
    if (!best || val > best.val) best = { plan, val };
  }
  return best.plan;
}
function runPlan(plan, s, run) {
  if (plan.sw) run('SwapSlots', { a: plan.sw[0], b: plan.sw[1] });
  for (const [card, slot] of plan.pk) {
    // 자리 바꾸기 뒤의 자리를 구하려면 원래 자리의 캐릭터 id로 찾는다. plan.pk의 slot은 바꾸기 전 자리다.
    const id = plan.__ids?.[card.uid];
    run('Attach', { uid: card.uid, targetInstanceId: id });
  }
}
function battleTurn(getState, c, run, policy) {
  const s = getState();
  if (policy === 'first') {
    const card = s.battle.hand[0], u = s.run.team.characters.find(Boolean);
    if (card && !game.validateAttach(s, { uid: card.uid, targetInstanceId: u.instanceId }, c)) run('Attach', { uid: card.uid, targetInstanceId: u.instanceId });
    run('Fight'); return;
  }
  const plan = bestPlan(s, c), idOf = {};
  for (const [card, slot] of plan.pk) idOf[card.uid] = s.run.team.characters[slot].instanceId;
  plan.__ids = idOf;
  runPlan(plan, s, run); run('Fight');
}
function shopTurn(getState, c, run) {
  for (let guard = 0; guard < 30; guard++) {
    const s = getState(), r = s.run, team = r.team.characters, sh = s.shop;
    const free = team.some(u => !u), idx = sh.recruits.findIndex(o => !o.sold && o.cost <= r.gold);
    // 빈 칸이 있으면 영입이 최우선. 가장 비싼(강한 직업) 후보부터.
    if (free && idx >= 0) { const best = sh.recruits.map((o, i) => ({ o, i })).filter(x => !x.o.sold && x.o.cost <= r.gold).sort((a, b) => b.o.cost - a.o.cost)[0]; run('BuyCharacter', { index: best.i }); continue; }
    const hurtIdx = team.findIndex(u => game.hurt(u, c) && u.hp < rules.maxHpOf(u, c) * 0.6);
    if (hurtIdx >= 0 && r.gold >= c.shopRules.healOneCost) { run('HealUnit', { slot: hurtIdx }); continue; }
    if (r.gold >= c.packs[1].cost && r.gold - c.packs[1].cost >= (team.some(u => game.hurt(u, c)) ? 2 : 0)) { run('BuyPack', { packId: c.packs[1].id }); continue; }
    if (r.gold >= c.packs[0].cost + 4) { run('BuyPack', { packId: c.packs[0].id }); continue; }
    break;
  }
  // 자리: 가장 단단한 동료를 맨 뒤(몬스터가 먼저 때리는 자리)로. 빈 칸은 앞으로.
  for (let k = 0; k < 4; k++) {
    const team = getState().run.team.characters, alive = team.map((u, i) => u ? i : -1).filter(i => i >= 0);
    const last = alive[alive.length - 1], tank = alive.reduce((a, i) => rules.maxHpOf(team[i], c) > rules.maxHpOf(team[a], c) ? i : a, alive[0]);
    if (tank !== last) run('MoveCharacter', { from: tank, to: last }); else break;
  }
  run('LeaveShop');
}
export function playRun(seed, c = data.content, policy = 'smart', opts = {}) {
  let s = game.initialState(), n = 0;
  const run = (type, p = {}) => { const r = game.applyCommand(s, { type, commandId: `c${n++}`, ...p }, c); if (r.error) throw Error(`${type}: ${r.error}`); s = r.state; return r; };
  run('StartRun', { seed });
  run('ShuffleStarter'); run('PickStarter', { position: opts.position ?? 0 }); run('BeginJourney');
  if (opts.forceStarter) { const t = structuredClone(s); t.run.team.characters[0] = rules.makeUnit('unit_0', opts.forceStarter, c); s = t; }
  for (let guard = 0; s.phase !== 'run_result'; guard++) {
    if (guard > 3000) throw Error('끝나지 않음');
    if (s.phase === 'blind_select') { if (opts.stopAfterFirst && s.history.length) break; opts.onBlind?.(s); run('SelectBlind'); }
    else if (s.phase === 'battle') battleTurn(() => s, c, run, policy);
    else if (s.phase === 'cashout') { if (opts.stopAfterFirst) break; run('CashOut'); }
    else if (s.phase === 'shop') shopTurn(() => s, c, run);
    else throw Error(`처리하지 않은 단계 ${s.phase}`);
  }
  return s;
}

if (process.argv[1]?.endsWith('balance-bot.mjs')) {
  const mode = process.argv[2], c = { ...structuredClone(data.content), ...JSON.parse(process.env.BOT ?? '{}') };
  if (mode === 'solo') {
    const N = Number(process.argv[3] ?? 100);
    console.log(`첫 슬라임(${data.byId(c.blindKinds, 'small').name}, 체력 ${c.monsterStats[0][0]}, 공격 ${c.monsterStats[0][1]})을 시작 동료 혼자 잡는 비율, ${N}판씩`);
    let worst = 1;
    for (const d of c.characters) {
      let win = 0, rounds = 0;
      for (let seed = 1; seed <= N; seed++) { const s = playRun(seed, c, 'smart', { forceStarter: d.id, stopAfterFirst: true }); if (s.history[0]?.outcome === 'win') { win++; rounds += s.history[0].turns; } }
      worst = Math.min(worst, win / N);
      console.log(`  ${data.nameOf(d.id).padEnd(8)} ${(win / N * 100).toFixed(0)}%  평균 ${win ? (rounds / win).toFixed(1) : '-'}턴`);
    }
    console.log(`  가장 낮은 비율 ${(worst * 100).toFixed(0)}%`);
  } else {
    const N = Number(mode ?? 300), policy = process.argv[3] ?? 'smart', A = c.balance.anteCount, K = c.blindKinds.length;
    const reach = Array(A * K).fill(0), turns = Array.from({ length: A * K }, () => []), hpEnd = Array.from({ length: A * K }, () => []);
    let wins = 0, deaths = 0;
    for (let seed = 1; seed <= N; seed++) {
      const s = playRun(seed, c, policy);
      if (s.run.result === 'win') wins++;
      s.history.forEach((h, i) => { if (h.outcome === 'win') { reach[i]++; turns[i].push(h.turns); } });
      deaths += 3 - s.run.team.characters.filter(Boolean).length;
    }
    const pct = v => `${(v / N * 100).toFixed(0)}%`, avg = a => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '-';
    console.log(`${N}판 · 정책 ${policy} · 몬스터 체력 ${c.monsterStats.map(m=>m[0]).join('/')} 공격 ${c.monsterStats.map(m=>m[1]).join('/')}`);
    for (let a = 0; a < A; a++) console.log(`  앤티 ${a + 1}: ${c.blindKinds.map((k, j) => `${k.id} ${pct(reach[a * K + j])}(${avg(turns[a * K + j])}턴)`).join(' · ')}`);
    console.log(`  원정 성공 ${pct(wins)} · 판당 빈 칸(사망·미영입) 평균 ${(deaths / N).toFixed(2)}`);
  }
}
