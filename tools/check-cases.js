#!/usr/bin/env node
/* ============================================================
   tools/check-cases.js — 시공기술사례 데이터 검증
   ------------------------------------------------------------
   빌드 도구가 없는 사이트이므로, 배포 전 이 스크립트로 확인합니다.

     node tools/check-cases.js

   검사 항목
     1. projects.js / resources.js / content.js 가 문법 오류 없이 평가되는가
     2. 모든 사례가 대표 이미지를 갖는가 (정규화 모델 기준)
     3. 참조하는 이미지 파일이 실제로 존재하는가
     4. id 중복 / 별칭(PROJECT_ALIASES) 대상이 실재하는가
     5. 통합 아카이브(CONTENT) 가 모든 항목을 만들어 내는가
     6. 검색·분류 필터가 항목을 잃지 않는가
     7. 옵시디언 Raw 노트(에릭 검수본)와 사이트 데이터가 정확히 일치하는가
        — 사례 수 / 대표사진 / 시공 전·중·후 목록과 그 순서
        (vault 를 찾을 수 없으면 이 항목만 건너뜁니다)
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let failures = 0;
let checks = 0;
function ok(msg) { checks++; console.log('  ✓ ' + msg); }
function fail(msg) { checks++; failures++; console.log('  ✗ ' + msg); }
function assert(cond, msg) { cond ? ok(msg) : fail(msg); }

/* ── 1. 스크립트 평가 ──────────────────────────────────────── */
console.log('\n[1] 스크립트 로드');
/* 브라우저처럼 하나의 전역 스코프에서 순서대로 평가합니다.
   projects.js 등은 const 선언이라 sandbox 객체에 붙지 않으므로,
   같은 컨텍스트 안에서 값을 모아 꺼냅니다. */
const FILES = [
  'assets/js/config.js', 'assets/js/projects.js', 'assets/js/case-images.js',
  'assets/js/resources.js', 'assets/js/content.js'
];
const NAMES = ['PROJECTS', 'PROJECT_ALIASES', 'RETIRED_PROJECT_IDS', 'RESOURCES',
               'CONTENT', 'CaseImages', 'FALLBACK_IMAGE', 'usedUnifiedCategories', 'unifyCategory'];
let globals;
try {
  const sandbox = { window: {}, module: undefined, console };
  sandbox.self = sandbox;
  const ctx = vm.createContext(sandbox);
  const bundle = FILES.map((f) => read(f)).join('\n;\n') +
    '\n;({' + NAMES.map((n) => `${n}: typeof ${n} !== 'undefined' ? ${n} : undefined`).join(', ') + '})';
  globals = vm.runInContext(bundle, ctx, { filename: 'ainsafe-bundle.js' });
  ok('config / projects / case-images / resources / content 평가 성공');
} catch (e) {
  fail('스크립트 평가 실패: ' + e.message);
  console.log('\n검증 중단.');
  process.exit(1);
}

const { PROJECTS, PROJECT_ALIASES, RETIRED_PROJECT_IDS, RESOURCES, CONTENT, CaseImages, FALLBACK_IMAGE } = globals;
assert(Array.isArray(PROJECTS) && PROJECTS.length > 0, `PROJECTS ${PROJECTS.length}건`);
assert(Array.isArray(RESOURCES) && RESOURCES.length > 0, `RESOURCES ${RESOURCES.length}건`);
assert(typeof CaseImages === 'object' && CaseImages, 'CaseImages 전역 노출');

/* ── 2·3. 이미지 역할 정규화 + 파일 존재 ───────────────────── */
console.log('\n[2] 이미지 역할 정규화');
const rows = [];
let missing = 0, noRep = 0, explicit = 0, withBefore = 0, remote = 0;

PROJECTS.forEach((p) => {
  const ci = CaseImages.normalize(p);
  if (!ci.representativeImage) { noRep++; fail(`${p.id} — 대표 이미지 없음`); }
  if (ci.source === 'explicit') explicit++;
  if (ci.hasBefore) withBefore++;

  const all = [...ci.representativeImages, ...ci.beforeImages,
               ...ci.processImages, ...ci.afterImages, ...ci.galleryImages].filter(Boolean);
  all.forEach((s) => {
    if (/^https?:\/\//i.test(s)) { remote++; fail(`${p.id} — 원격 이미지가 남아 있음: ${s}`); return; }
    if (!fs.existsSync(path.join(ROOT, s))) { missing++; fail(`${p.id} — 파일 없음: ${s}`); }
  });

  rows.push({
    case_no: p.case_no, id: p.id, source: ci.source,
    rep: ci.representativeImage, before: ci.beforeImages.length,
    process: ci.processImages.length, after: ci.afterImages.length,
    gallery: ci.galleryImages.length, compare: ci.showComparison
  });
});
assert(noRep === 0, `모든 사례에 대표 이미지 존재 (${PROJECTS.length}건)`);
assert(missing === 0, '참조 이미지 파일 모두 존재');
assert(remote === 0, '모든 이미지가 사이트 내부 경로 (원격 링크 없음)');
assert(explicit === PROJECTS.length, `모든 사례가 Raw 노트의 명시 분류 사용 (${explicit}/${PROJECTS.length})`);
assert(fs.existsSync(path.join(ROOT, FALLBACK_IMAGE)), `대체 이미지 존재: ${FALLBACK_IMAGE}`);

/* ── 4. id / 별칭 ──────────────────────────────────────────── */
console.log('\n[3] 식별자');
const ids = PROJECTS.map((p) => p.id);
assert(new Set(ids).size === ids.length, 'PROJECTS id 중복 없음');
const badAlias = Object.entries(PROJECT_ALIASES || {}).filter(([, to]) => ids.indexOf(to) === -1);
assert(badAlias.length === 0, `PROJECT_ALIASES 대상 실재 (${Object.keys(PROJECT_ALIASES || {}).length}건)`);
const retiredClash = (RETIRED_PROJECT_IDS || []).filter((id) => ids.indexOf(id) > -1);
assert(retiredClash.length === 0, 'RETIRED_PROJECT_IDS 와 현행 id 충돌 없음');

/* ── 5. 통합 아카이브 ──────────────────────────────────────── */
console.log('\n[4] 통합 아카이브(CONTENT)');
assert(CONTENT.length === PROJECTS.length + RESOURCES.length,
  `항목 수 일치: ${CONTENT.length} = 사례 ${PROJECTS.length} + 기술문서 ${RESOURCES.length}`);

const caseItems = CONTENT.filter((i) => i.type === 'case');
const noThumb = caseItems.filter((i) => !i.images.thumbnail);
assert(noThumb.length === 0, '모든 시공사례 카드에 대표 이미지 존재');

const mismatched = caseItems.filter((i) => {
  const p = PROJECTS.find((x) => x.id === i.id);
  return i.images.thumbnail !== CaseImages.normalize(p).representativeImage;
});
assert(mismatched.length === 0, '아카이브 썸네일 = 정규화 대표 이미지');

/* 상세 주소는 실제 파일입니다 (?id= 를 쓰지 않습니다).
   파일 자체가 있는지는 tools/check-site.js 가 확인합니다. */
const badUrl = CONTENT.filter((i) => !/^(case|guide)\/[A-Za-z0-9._-]+\.html$/.test(i.url));
assert(badUrl.length === 0,
  `모든 항목의 상세 링크 형식 정상 (case/…html · guide/…html)${badUrl.length ? ' — ' + badUrl.slice(0, 3).map((i) => i.url).join(', ') : ''}`);

/* ── 6. 필터 / 검색 ───────────────────────────────────────── */
console.log('\n[5] 분류 · 검색');
const cats = globals.usedUnifiedCategories();
const covered = cats.reduce((n, c) => n + CONTENT.filter((i) => i.category === c).length, 0);
const uncategorized = CONTENT.filter((i) => !i.category).length;
assert(covered + uncategorized === CONTENT.length,
  `분류 합계 일치: ${covered} + 미분류 ${uncategorized} = ${CONTENT.length}`);
assert(cats.length > 0, `표시되는 분류 ${cats.length}종: ${cats.join(', ')}`);
assert(CONTENT.every((i) => typeof i.searchText === 'string' && i.searchText.length > 0),
  '모든 항목에 검색 색인 존재');
assert(CONTENT.filter((i) => i.searchText.indexOf('노출콘크리트') > -1).length > 0,
  "검색 '노출콘크리트' 결과 있음");

/* ── 7. 옵시디언 Raw 노트와의 대조 ─────────────────────────
   에릭이 분류한 대표/시공전/시공중/시공후 를 사이트가 그대로 쓰고 있는지
   순서까지 한 장씩 맞춰 봅니다. vault 가 없으면 이 항목만 건너뜁니다. */
console.log('\n[6] 옵시디언 Raw 노트 대조');
let rawChecked = false;
try {
  const { resolveVault, loadDrafts } = require('./lib/case-source');
  const { buildCasePlans } = require('./lib/case-plan');
  const vault = resolveVault();
  const { plans } = buildCasePlans(vault, loadDrafts(vault));
  rawChecked = true;

  const planByCase = {};
  plans.forEach((pl) => { planByCase[pl.case_no] = pl; });
  const publishable = plans.filter((pl) => pl.images.representative);

  assert(PROJECTS.length === publishable.length,
    `사례 수 일치: 사이트 ${PROJECTS.length}건 = 발행 가능한 Raw ${publishable.length}건 (Raw 전체 ${plans.length}건)`);

  const held = plans.filter((pl) => !pl.images.representative).map((pl) => pl.case_no);
  if (held.length) console.log(`    · 대표사진이 없어 보류 중인 Raw 사례: ${held.join(', ')}`);

  const orphan = PROJECTS.filter((p) => !planByCase[p.case_no]);
  assert(orphan.length === 0,
    `모든 사례에 Raw 원본 존재${orphan.length ? ' — ' + orphan.map((p) => p.case_no).join(', ') : ''}`);

  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  let repBad = 0, orderBad = 0, hiddenBad = 0;
  PROJECTS.forEach((p) => {
    const pl = planByCase[p.case_no];
    if (!pl) return;
    const ci = CaseImages.normalize(p);
    const want = (role) => pl.images[role].map((x) => x.path);

    if (ci.representativeImage !== (pl.images.representative || {}).path) {
      repBad++; fail(`${p.case_no} — 대표 이미지가 Raw 의 대표사진과 다름`);
    }
    [['before', '시공 전'], ['process', '시공 중'], ['after', '시공 후']].forEach(([role, ko]) => {
      const got = ci[role + 'Images'];
      if (!same(got, want(role))) { orderBad++; fail(`${p.case_no} — ${ko} 목록/순서가 Raw 와 다름`); }
      /* '사진없음' 인 구간은 빈 배열이어야 하고, 화면에서 만들어지지 않습니다 */
      if (pl.raw.images[role].declaredNone && got.length) {
        hiddenBad++; fail(`${p.case_no} — ${ko} 는 '사진없음' 인데 사진이 들어 있음`);
      }
    });
  });
  assert(repBad === 0, '대표 이미지 = Raw 의 대표사진 (전 사례)');
  assert(orderBad === 0, '시공 전 · 중 · 후 목록과 순서가 Raw 와 동일');
  assert(hiddenBad === 0, "'사진없음' 구간은 비어 있음 (화면에서 숨김)");

  /* 에릭이 뺀 사진이 사이트에 남아 있지 않은지 */
  const wanted = new Set();
  plans.forEach((pl) => pl.images.downloads.forEach((d) => wanted.add(d.path)));
  const caseRoot = path.join(ROOT, 'assets/images/case-studies');
  const strays = [];
  if (fs.existsSync(caseRoot)) {
    fs.readdirSync(caseRoot).forEach((d) => {
      const dir = path.join(caseRoot, d);
      if (!fs.statSync(dir).isDirectory()) return;
      fs.readdirSync(dir).forEach((f) => {
        const rel = `assets/images/case-studies/${d}/${f}`;
        if (!wanted.has(rel)) strays.push(rel);
      });
    });
  }
  assert(strays.length === 0,
    `Raw 에 없는 이미지 파일 없음${strays.length ? ' — ' + strays.slice(0, 5).join(', ') : ''}`);

  /* 사이트 파일이 지금의 원본에서 온 것인지 — 옵시디언에서 사진을 바꿨는데
     같은 파일 이름이라 옛 사진이 남는 일을 막습니다 (data/case-image-sources.json) */
  const { loadManifest, staleReason } = require('./lib/image-sources');
  const manifest = loadManifest();
  const stale = [];
  plans.forEach((pl) => pl.images.downloads.forEach((d) => {
    if (!/^https?:\/\//.test(d.url) && !d.local) return;      // 저장소 원본 경로
    const why = staleReason(d, vault, manifest);
    if (why) stale.push(`${d.path} (${why})`);
  }));
  assert(stale.length === 0,
    `사이트 이미지가 원본과 같음 — 바뀐 원본 없음${stale.length ? ' — ' + stale.slice(0, 5).join(', ') +
      ' → node tools/fetch-case-images.js --write' : ''}`);
} catch (e) {
  if (e.code === 'ENORAW' || e.code === 'ENODRAFT' || e.code === 'ENOVAULT') {
    console.log('  · 옵시디언 원본을 찾을 수 없어 건너뜁니다. (--vault= / AINSAFE_VAULT, --raw-dir= / AINSAFE_RAW_DIR)'); console.log('    ' + e.message.split(String.fromCharCode(10)).join(String.fromCharCode(10) + '    '));
  } else {
    fail('Raw 대조 중 오류: ' + e.message);
  }
}

/* ── 요약표 ───────────────────────────────────────────────── */
console.log('\n[7] 사례별 이미지 역할');
console.log('  no   출처       대표  전  중  후  기타  단계구간  id');
rows.sort((a, b) => String(b.case_no).localeCompare(String(a.case_no))).forEach((r) => {
  console.log(
    '  ' + String(r.case_no).padEnd(5) +
    r.source.padEnd(11) +
    (r.rep ? ' O  ' : ' -  ').padEnd(6) +
    String(r.before).padEnd(4) +
    String(r.process).padEnd(4) +
    String(r.after).padEnd(4) +
    String(r.gallery).padEnd(6) +
    (r.compare ? 'Y' : '-').padEnd(10) +
    r.id
  );
});

const totalShots = rows.reduce((n, r) => n + r.before + r.process + r.after, 0);
console.log(`\n명시 분류 ${explicit}건 / 자동 추론 ${PROJECTS.length - explicit}건 · 시공 전 사진 보유 ${withBefore}건 · 단계별 사진 ${totalShots}장`);
if (!rawChecked) console.log('※ Raw 대조를 건너뛴 결과입니다.');
console.log(`\n검사 ${checks}건 중 실패 ${failures}건`);
process.exit(failures ? 1 : 0);
