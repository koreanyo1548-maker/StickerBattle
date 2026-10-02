// 몬스터 체력·공격을 봇의 결과에 맞춰 자동으로 보정한다. 실행: node tools/tune-monsters.mjs [반복=8] [판수=60]
// 목표: 블라인드마다 평균 전투 길이(턴)와, 한 전투에서 원정대가 받는 피해(시작 최대 체력의 몇 %). 결과 수치를 data.js의 monsterStats에 옮긴다.
// 첫 블라인드는 고정(시작 동료 혼자 잡아야 하므로 tools/balance-bot.mjs solo로 따로 확인).
import { loadModules } from './load-modules.mjs';
import { playRun } from './balance-bot.mjs';

const { data } = loadModules();
const ITER = Number(process.argv[2] ?? 8), N = Number(process.argv[3] ?? 60);
const turnsGoal = [3, 3.5, 4.5, 3.5, 4.5, 5.5, 4, 5, 6, 4.5, 5.5, 7];
const lossGoal = [0.2, 0.35, 0.5, 0.3, 0.4, 0.55, 0.34, 0.45, 0.6, 0.4, 0.5, 0.65];
let stats = process.env.START ? JSON.parse(process.env.START) : structuredClone(data.content.monsterStats);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
for (let it = 0; it < ITER; it++) {
  const c = { ...structuredClone(data.content), monsterStats: stats };
  const turns = stats.map(() => []), loss = stats.map(() => []);
  let wins = 0;
  for (let seed = 1; seed <= N; seed++) {
    const s = playRun(seed, c, 'smart');
    if (s.run.result === 'win') wins++;
    s.history.forEach((h, i) => { turns[i].push(h.turns); loss[i].push(h.taken / h.startMaxHp); });
  }
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  const next = stats.map(([hp, atk], i) => {
    if (i === 0 || turns[i].length < 8) return [hp, atk];
    const t = avg(turns[i]), l = Math.max(0.02, avg(loss[i]));
    return [Math.round(hp * clamp((turnsGoal[i] / t) ** 0.8, 0.7, 1.5)), Math.round(atk * clamp((lossGoal[i] / l) ** 0.7, 0.7, 1.5))];
  });
  console.log(`반복 ${it + 1}: 성공 ${(wins / N * 100).toFixed(0)}% · 턴 ${turns.map(a => a.length ? avg(a).toFixed(1) : '-').join(' ')} · 피해율 ${loss.map(a => a.length ? (avg(a) * 100).toFixed(0) : '-').join(' ')}`);
  stats = next;
}
console.log('monsterStats =', JSON.stringify(stats));
