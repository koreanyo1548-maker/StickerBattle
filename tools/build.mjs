// src/와 assets/art/를 합쳐 배포용 단일 파일 index.html을 만든다.
// 실행: node tools/build.mjs          index.html 생성
//       node tools/build.mjs --check  index.html이 소스와 일치하는지 확인 (다르면 종료 코드 1)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p, enc = 'utf8') => readFileSync(join(root, p), enc);

// 스크립트는 이 순서대로 이어 붙인다. 각 파일은 modules["..."]에 자신을 등록한다.
export const scriptFiles = [
  'src/content/art.js',
  'src/content/data.js',
  'src/domain/rules.js',
  'src/application/game.js',
  'src/rendering/compositor.js',
  'src/presentation/main.js',
];

// 소스의 "@art:이름"을 assets/art/이름.webp의 data URI로 바꾼다.
export function inlineArt(text) {
  return text.replace(/@art:(\w+)/g, (_, name) => 'data:image/webp;base64,' + read(`assets/art/${name}.webp`, null).toString('base64'));
}

export function build() {
  const script = read('src/prelude.js') + scriptFiles.map(f => read(f)).join('') + read('src/epilogue.js');
  const page = read('src/page.html');
  return inlineArt(page.replace('/*@styles*/', () => read('src/styles.css')).replace('/*@script*/', () => script));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const html = build(), target = join(root, 'index.html');
  if (process.argv.includes('--check')) {
    const same = readFileSync(target, 'utf8') === html;
    console.log(same ? 'index.html is up to date' : 'index.html is stale: run node tools/build.mjs');
    process.exit(same ? 0 : 1);
  }
  writeFileSync(target, html);
  console.log(`index.html ${(html.length / 1e6).toFixed(2)}MB`);
}
