// 티어 구조(T1-T4) 측정용 봇. 실행: node tools/tier-bot.mjs [판수=400]
// 콘텐츠 덮어쓰기: TIER='{"characterRules":{"guaranteedTurns":[[1,2,3],[],[],[]],"randomChance":0.1}}' node tools/tier-bot.mjs
// 정책 고르기: POLICIES=greedy,t4_rebels node tools/tier-bot.mjs
// 정책: random(무작위), greedy(지금 점수가 가장 높은 선택), T4 전용 봇 5종(해당 T4 조건에 다가가는 선택을 우선, 동점이면 점수).
// 목표 점수를 1로 두고 끝까지 진행해 블라인드별 점수를 모은다. 봇의 결정은 목표와 무관하므로,
// 현재 목표 곡선의 누적 클리어율은 "첫 미달 전까지 모두 목표 이상"인 비율과 같다.
import { loadModules } from './load-modules.mjs';

const { data, rules, game } = loadModules();
const N = Number(process.argv[2] ?? 400);
const targets = data.blinds.map(b => b.target);
const open = structuredClone(data.content); open.blinds.forEach(b => { b.target = 1; });
Object.assign(open, JSON.parse(process.env.TIER ?? '{}'));

const charOf = u => data.byId(data.content.characters, u.characterDefId);
const maxSame = vs => vs.length ? Math.max(...Object.values(vs.reduce((m, v) => (m[v] = (m[v] ?? 0) + 1, m), {}))) : 0;
const matchOf = u => data.content.jobWeapon[charOf(u).jobId] === u.weaponId;
// T4 조건까지의 진행도: 항목마다 0-3점.
function progress(rule, chars, c) {
  const us = chars.filter(Boolean);
  const races = us.map(u => charOf(u).raceId), jobs = us.map(u => charOf(u).jobId);
  const pat = (kind, vs) => kind === 'triple' ? maxSame(vs) : new Set(vs).size;
  let p = pat(rule.race, races) + pat(rule.job, jobs) + us.filter(u => rules.recipeFor(u, c)).length;
  if (rule.jobWeapon === 'allMatch') p += us.filter(u => u.weaponId && matchOf(u)).length;
  if (rule.jobWeapon === 'allMismatch') p += us.filter(u => u.weaponId && !matchOf(u)).length;
  if (rule.jobWeapon === 'centerMatch') p += chars.reduce((n, u, i) => n + (u?.weaponId && (i === 1 ? matchOf(u) : !matchOf(u)) ? 1 : 0), 0);
  if (rule.elements === 'allDifferent') p += new Set(us.map(u => u.elementId).filter(Boolean)).size;
  if (rule.sameRecipe) p += maxSame(us.map(u => rules.recipeFor(u, c)?.id).filter(Boolean));
  return p;
}
function candidates(s, c) {
  const b = s.battle, chars = s.run.team.characters, out = [];
  if (b.actionsUsed >= game.attachLimitFor(s, c)) return out;
  for (const card of b.hand) for (let slot = 0; slot < 3; slot++) {
    const cmd = card.characterDefId ? { type: 'PlaceCharacter', cardInstanceId: card.instanceId, targetSlot: slot }
      : chars[slot] && { type: 'AttachSticker', stickerInstanceId: card.instanceId, targetInstanceId: chars[slot].instanceId };
    if (!cmd) continue;
    const r = game.applyCommand(s, { ...cmd, commandId: 'probe' }, c);
    if (!r.error) out.push({ cmd, next: r.state });
  }
  return out;
}
function rng(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; }; }
const policies = {
  random: (s, c, R) => { const cs = candidates(s, c); return cs.length && R() < 0.8 ? cs[Math.floor(R() * cs.length)].cmd : null; },
  greedy: (s, c) => {
    const cur = game.projectedScore(s.run, s.battle, c).score; let best = null, bs = cur;
    for (const x of candidates(s, c)) { const v = game.projectedScore(x.next.run, x.next.battle, c).score; if (v > bs) { bs = v; best = x.cmd; } }
    return best;
  },
};
for (const rule of data.content.t4Rules) policies[rule.id] = (s, c) => {
  const key = st => progress(rule, st.run.team.characters, c) * 1e9 + game.projectedScore(st.run, st.battle, c).score;
  let best = null, bk = key(s);
  for (const x of candidates(s, c)) { const k = key(x.next); if (k > bk) { bk = k; best = x.cmd; } }
  return best;
};

function playRun(policy, seed) {
  const c = open, R = rng(seed * 7919 + 1);
  let s = game.initialState(), n = 0, snap = null;
  const run = (type, p = {}) => { const r = game.applyCommand(s, { type, commandId: `c${n++}`, ...p }, c); if (r.error) throw Error(`${type}: ${r.error}`); s = r.state; return r; };
  run('StartRun', { seed });
  for (let guard = 0; s.phase !== 'run_result'; guard++) {
    if (guard > 3000) throw Error('끝나지 않음');
    if (s.phase === 'attach') { const cmd = policy(s, c, R); cmd ? run(cmd.type, cmd) : run('EndTurn'); }
    else if (s.phase === 'resolve') {
      const t = s.run.team, sc = s.battle.lastScore;
      if (s.battle.blindIndex === 2) snap = { t2: sc.tiers.t2?.id ?? null, t3: sc.tiers.t3?.id ?? null, t4: sc.t4.map(x => x.id), t1: sc.t1Units.length };
      run('FinishResolution');
    }
    else if (s.phase === 'reward_reveal') run('ShuffleRewards');
    else if (s.phase === 'reward_pick') run('PickReward', { position: seed % s.reward.order.length });
    else run('StartNextBlind');
  }
  return { scores: s.history.map(h => h.score), snap };
}

const pct = (a, p) => [...a].sort((x, y) => x - y)[Math.floor(p * a.length)];
const share = (n) => `${(n / N * 100).toFixed(0)}%`;
const summary = {};
console.log(`${N}판씩. 성립률은 블라인드 3 판정 시점. 클리어율은 현재 목표 ${targets.join(' / ')} 기준 누적.`);
const only = process.env.POLICIES?.split(',');
for (const [name, policy] of Object.entries(policies).filter(([k]) => !only || only.includes(k))) {
  const scores = targets.map(() => []), clear = targets.map(() => 0), t4 = {}, t2 = {}, t3 = {};
  let t1Full = 0;
  for (let seed = 1; seed <= N; seed++) {
    const r = playRun(policy, seed);
    r.scores.forEach((v, k) => scores[k].push(v));
    let ok = true; targets.forEach((t, k) => { ok = ok && r.scores[k] >= t; if (ok) clear[k]++; });
    const sn = r.snap ?? { t1: 0, t2: null, t3: null, t4: [] }; if (sn.t1 === 3) t1Full++;
    if (sn.t2) t2[sn.t2] = (t2[sn.t2] ?? 0) + 1; if (sn.t3) t3[sn.t3] = (t3[sn.t3] ?? 0) + 1;
    sn.t4.forEach(id => { t4[id] = (t4[id] ?? 0) + 1; });
  }
  summary[name] = pct(scores[3], 0.5);
  console.log(`\n[${name}]`);
  console.log(`  점수 중앙값: ${scores.map(a => pct(a, 0.5)).join(' / ')} | 블라인드 4 p10/p90: ${pct(scores[3], 0.1)} / ${pct(scores[3], 0.9)}`);
  console.log(`  클리어율: ${clear.map(share).join(' / ')}`);
  console.log(`  T1 3명: ${share(t1Full)} | T2: ${JSON.stringify(Object.fromEntries(Object.entries(t2).map(([k, v]) => [k, share(v)])))} | T3: ${JSON.stringify(Object.fromEntries(Object.entries(t3).map(([k, v]) => [k, share(v)])))}`);
  console.log(`  T4: ${JSON.stringify(Object.fromEntries(Object.entries(t4).map(([k, v]) => [k, share(v)])))}`);
}
const ranked = Object.entries(summary).sort((a, b) => b[1] - a[1]);
console.log(`\n블라인드 4 중앙값 순위: ${ranked.map(([k, v]) => `${k} ${v}`).join(' > ')}`);
console.log(`지배도(1위 ÷ 2위): ${(ranked[0][1] / ranked[1][1]).toFixed(2)}`);
