// 실제 규칙 엔진으로 봇이 런을 진행해 목표 점수 곡선을 점검한다.
// 실행: node tools/balance-bot.mjs [판수=400] ['[[목표1,목표2,목표3,목표4],...]']
// 봇: 매 행동마다 현재 블라인드 점수가 가장 높아지는 선택. 누적·다음 블라인드는 고려하지 않고, 보상은 무작위 자리를 고른다.
import { loadModules } from './load-modules.mjs';

const { data, rules, game } = loadModules();

function bestAction(s, c) {
  const b = s.battle, chars = s.run.team.characters;
  if (b.actionsUsed >= game.attachLimitFor(s, c)) return null;
  let best = null, bestScore = -1;
  for (const card of b.hand) for (let slot = 0; slot < c.balance.teamSize; slot++) {
    const cmd = card.characterDefId ? { type: 'PlaceCharacter', cardInstanceId: card.instanceId, targetSlot: slot }
      : chars[slot] && { type: 'AttachSticker', stickerInstanceId: card.instanceId, targetInstanceId: chars[slot].instanceId };
    if (!cmd) continue;
    const r = game.applyCommand(s, { ...cmd, commandId: 'probe' }, c);
    if (r.error) continue;
    const v = game.projectedScore(r.state.run, r.state.battle, c).score;
    if (v > bestScore) { bestScore = v; best = cmd; }
  }
  return best;
}

export function playRun(c, seed) {
  let s = game.initialState(), n = 0;
  // 명령이 거절되면 상태가 그대로라 무한 반복하므로 바로 멈춘다.
  const run = (type, p = {}) => { const r = game.applyCommand(s, { type, commandId: `c${n++}`, ...p }, c); if (r.error) throw Error(`${type} 거절: ${r.error} (seed ${seed}, phase ${s.phase})`); s = r.state; };
  run('StartRun', { seed });
  for (let guard = 0; s.phase !== 'run_result'; guard++) {
    if (guard > 1000) throw Error(`런이 끝나지 않음 (seed ${seed}, phase ${s.phase})`);
    if (s.phase === 'attach') { const a = bestAction(s, c); a ? run(a.type, a) : run('EndTurn'); }
    else if (s.phase === 'resolve') run('FinishResolution');
    else if (s.phase === 'reward_reveal') run('ShuffleRewards');
    else if (s.phase === 'reward_pick') run('PickReward', { position: seed % s.reward.order.length });
    else run('StartNextBlind');
  }
  return s.history;
}

const withTargets = t => { const c = structuredClone(data.content); c.blinds.forEach((b, i) => { b.target = t[i]; }); return c; };
const pct = (a, p) => [...a].sort((x, y) => x - y)[Math.floor(p * a.length)];

if (process.argv[1]?.endsWith('balance-bot.mjs')) {
  const N = Number(process.argv[2] ?? 400);
  const curves = [data.blinds.map(b => b.target), ...JSON.parse(process.argv[3] ?? '[]')];
  // 목표를 1로 두면 모든 블라인드에 도달하므로 점수 분포 전체를 볼 수 있다.
  const scores = data.blinds.map(() => []), open = withTargets(data.blinds.map(() => 1));
  for (let i = 1; i <= N; i++) playRun(open, i).forEach((h, k) => scores[k].push(h.score));
  console.log(`${N}판, 블라인드별 점수 p10 / p25 / p50 / p75 / p90`);
  scores.forEach((a, k) => console.log(`  ${k + 1}: ${[.1, .25, .5, .75, .9].map(p => pct(a, p)).join(' / ')}`));
  console.log('목표 곡선별 누적 클리어율');
  for (const t of curves) {
    const c = withTargets(t), reach = t.map(() => 0);
    for (let i = 1; i <= N; i++) playRun(c, i).forEach((h, k) => { if (h.outcome === 'win') reach[k]++; });
    console.log(`  ${t.join(' / ')}: ${reach.map(v => `${(v / N * 100).toFixed(0)}%`).join(' / ')}`);
  }
}
