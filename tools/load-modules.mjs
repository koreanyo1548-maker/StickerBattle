// 화면과 무관한 모듈(콘텐츠·규칙·게임 흐름)을 node에서 불러온다. 테스트와 시뮬레이션용.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = ['src/content/art.js', 'src/content/data.js', 'src/domain/rules.js', 'src/application/game.js'];

export function loadModules() {
  const code = "'use strict';const modules={};\n" + files.map(f => readFileSync(join(root, f), 'utf8')).join('') + '\nreturn modules;';
  const modules = new Function(code)();
  const pick = key => modules[`src/${key}.mjs`];
  return { data: pick('content/data'), rules: pick('domain/rules'), game: pick('application/game') };
}
