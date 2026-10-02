#!/usr/bin/env node
/* ============================================================
   tools/rebuild-cases.js — 시공기술사례 데이터 재작성
   ------------------------------------------------------------
   에릭이 검수한 Raw 노트를 정본으로 삼아 사이트 데이터를 다시 만듭니다.

     Raw/노출콘 시공기술사례/*.md      ← 이미지 분류의 정본 (대표/전/중/후)
     Wiki/홈페이지/발행대기/*.md       ← 제목·요약·기술 본문
     data/case-sources/NNN.md          ← 저장소 안에 두는 사례 원본 (본문 + 이미지분류)
              ↓
     assets/js/projects.js            ← 사이트 데이터

   사용법
     node tools/rebuild-cases.js                     # 미리보기
     node tools/rebuild-cases.js --write             # projects.js 재작성
     node tools/rebuild-cases.js --vault="D:\\경로\\에릭_vault"

   ▶ 원칙
     · 옵시디언 vault 는 읽기 전용입니다. 이 도구는 vault 안의 파일을 고치지 않습니다.
       (예전의 --sync-drafts 는 발행대기 노트를 되썼기 때문에 더 쓰지 않습니다)
     · Raw 에 없는 사례 번호는 되살리지 않습니다. 없어진 사례는 은퇴 목록으로 옮깁니다.
     · 대표사진을 Raw 에서 읽을 수 없으면 다른 사진으로 대신하지 않고 보류합니다.
     · 이미지 순서는 노트에 적힌 그대로 둡니다.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  REPO_ROOT, PROJECTS_FILE, resolveVault, loadDrafts, loadProjects, writeProjects
} = require('./lib/case-source');
const { buildCasePlans } = require('./lib/case-plan');

const WRITE = process.argv.includes('--write');
const DIFF = process.argv.includes('--diff');
const ALLOW_REMOVE = process.argv.includes('--allow-remove');

/** 키 순서와 상관없이 같은 값인지 */
function sameValue(a, b) {
  const canon = (v) => Array.isArray(v) ? v.map(canon)
    : (v && typeof v === 'object')
      ? Object.keys(v).sort().reduce((o, k) => (o[k] = canon(v[k]), o), {})
      : v;
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}

/** --diff 출력용 — 긴 값은 앞부분만 */
function short(v) {
  const s = v === undefined ? '(없음)' : JSON.stringify(v);
  return s.length > 140 ? s.slice(0, 140) + '…' : s;
}
/* 예전 옵션 — vault 안의 발행대기 노트를 되쓰던 기능입니다.
   vault 는 읽기 전용이므로 조용히 무시하지 않고 그 자리에서 멈춥니다. */
if (process.argv.includes('--sync-drafts')) {
  console.error([
    '--sync-drafts 는 더 쓰지 않습니다.',
    '이 옵션은 옵시디언 vault 안의 발행대기 노트를 다시 썼습니다.',
    'vault 는 읽기 전용이라 사이트 도구가 vault 를 고치지 않습니다.',
    '사이트 쪽에서 관리할 사례는 data/case-sources/NNN.md 로 두세요.'
  ].join(String.fromCharCode(10)));
  process.exit(2);
}
const VAULT = resolveVault();

/* ── 발행대기 본문 → 사이트 한 줄 텍스트 ───────────────────
   목록 기호는 '• ', 들여쓴 하위 항목은 '- ' 로 폅니다.
   강조(**)는 지우고, 위키링크는 노트 경로로 풉니다. */
function flatten(section) {
  if (!section) return '';
  return String(section).split('\n')
    .filter((l) => l.trim())
    .map((line) => {
      const nested = /^\s+/.test(line);
      let t = line.trim().replace(/\*\*/g, '').replace(/\[\[([^\]]+)\]\]/g, 'Raw/$1.md');
      if (/^[-*]\s+/.test(t)) t = t.replace(/^[-*]\s+/, nested ? '- ' : '• ');
      return t;
    })
    .join(' ').replace(/\s+/g, ' ').trim();
}

/* ── layout: sections — 원고의 '## …' 절을 적힌 순서대로 본문으로 ──
   기존 사례는 하자·공법·결과 세 칸에 맞춰 적지만, 이 서식은 원고의 소제목을
   그대로 상세페이지의 소제목(h2)으로 씁니다. 화면 마크업은 세 칸과 같습니다.
   '기술 메모'(내부용)와 이미지분류 절은 본문에 넣지 않습니다. */
const NON_BODY_SECTIONS = new Set(['기술 메모', '대표사진', '시공전', '시공중', '시공후']);

function toParagraphs(section) {
  return String(section || '').split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^#\s/.test(l) && !/^<!--|-->$/.test(l))
    .map((l) => l.replace(/\*\*/g, '').replace(/^[-*]\s+/, '• '));
}

function bodySections(draft) {
  if (String(draft.frontmatter.layout || '') !== 'sections') return null;
  return Object.entries(draft.sections)
    .filter(([heading]) => !NON_BODY_SECTIONS.has(heading))
    .map(([heading, text]) => ({ heading, paragraphs: toParagraphs(text) }))
    .filter((s) => s.paragraphs.length);
}

/* ── 사례 계획 → projects.js 항목 ──────────────────────────
   location / building / date / period / featured 는 사이트에서만 관리하는
   값이라 기존에 적어 둔 것이 있으면 그대로 물려받습니다. */
function toProject(plan, previous) {
  const s = plan.draft.sections;
  const fm = plan.draft.frontmatter;
  const prev = previous || {};
  const paths = (list) => list.map((x) => x.path);
  const rep = plan.images.representative ? plan.images.representative.path : '';
  const before = paths(plan.images.before);
  const process = paths(plan.images.process);
  const after = paths(plan.images.after);

  const sections = bodySections(plan.draft);

  const project = {
    id: plan.id,
    source: 'obsidian',
    case_no: plan.case_no,
    source_note: plan.raw.source_note,
    draft_file: plan.draft.file,
    review_required: String(fm.review_required) === 'true',

    title: fm.title || '',
    location: prev.location || '',
    building: prev.building || '',
    category: fm.category || '',
    date: prev.date || fm.date || '',
    period: prev.period || '',

    summary: fm.description || '',
    problem: [flatten(s['시공 전 상태']), flatten(s['문제 / 기술적 판단'])].filter(Boolean).join(' '),
    method: flatten(s['시공 방법 / 공정']),
    result: flatten(s['시공 결과']),

    /* 에릭의 분류 그대로 — 순서를 바꾸지 않습니다 */
    representative_image: rep,
    representative_images: plan.images.representative
      ? [rep].concat(paths(plan.images.extraRepresentative || []))
      : [],
    before_images: before,
    process_images: process,
    after_images: after,

    /* 예전 데이터 호환용 거울값 (case-images.js 가 없을 때만 쓰입니다) */
    thumbnail: rep,
    after: after[0] || '',
    before: before[0] || '',
    images: [],
    featured: !!prev.featured
  };
  /* 절 서식 원고만 sections 를 갖습니다 — 기존 사례 항목은 모양이 그대로입니다 */
  if (sections) project.sections = sections;
  /* 대표사진 대체 텍스트 — 원고에 적었을 때만 (예: 시공 전·후 비교 이미지).
     없으면 화면은 기존 문구("… 시공 완료 사진" 등)를 씁니다. */
  if (fm.representative_alt) project.representative_alt = fm.representative_alt;
  /* representative_fit: contain — 상세페이지 대표사진을 자르지 않고 전체를 보여 줍니다
     (예: 라벨이 있는 시공 전·후 비교 이미지). 고화질본이 있으면 함께 적습니다. */
  if (String(fm.representative_fit || '') === 'contain') {
    project.representative_fit = 'contain';
    if (plan.images.representativeHd) project.representative_hd = plan.images.representativeHd.path;
  }
  return project;
}

/* ── vault 로 되쓰지 않습니다 ───────────────────────────────
   예전에는 이 파일이 발행대기 노트의 이미지 항목을 Raw 기준으로 다시 썼습니다
   (--sync-drafts). 옵시디언 vault 는 읽기 전용이므로 그 코드는 걷어냈습니다.
   사이트 쪽에서 관리할 사례는 data/case-sources/NNN.md 에 둡니다. */

/* ── sitemap 은 여기서 쓰지 않습니다 ───────────────────────
   예전에는 이 파일이 sitemap.xml 에 project.html?id=… 주소를 적었습니다.
   지금은 상세 페이지가 실제 파일(case/…html)이라 주소를 만드는 곳이
   tools/build-site.js 한 곳으로 모였습니다.
   이 도구는 projects.js 까지만 책임지고, 이어서 build-site 를 돌립니다. */

/* ── 실행 ──────────────────────────────────────────────────── */
function main() {
  const drafts = loadDrafts(VAULT);
  const { plans, problems } = buildCasePlans(VAULT, drafts);
  const bundle = loadProjects();
  const before = bundle.PROJECTS;
  const prevByCase = {};
  before.forEach((p) => { prevByCase[p.case_no] = p; });

  /* 대표사진을 읽을 수 없는 사례는 다른 사진으로 채우지 않고 보류합니다. */
  const publishable = plans.filter((p) => p.images.representative);
  const held = plans.filter((p) => !p.images.representative);

  const projects = publishable
    .map((plan) => toProject(plan, prevByCase[plan.case_no]))
    .sort((a, b) => b.case_no.localeCompare(a.case_no));

  /* 사라진 사례 — 주소가 죽지 않도록 은퇴 목록으로 옮깁니다. */
  const liveIds = projects.map((p) => p.id);
  const retired = (bundle.RETIRED_PROJECT_IDS || []).slice();
  const dropped = before.filter((p) => liveIds.indexOf(p.id) === -1);
  dropped.forEach((p) => { if (retired.indexOf(p.id) === -1) retired.push(p.id); });

  /* 은퇴한 항목을 가리키던 별칭은 별칭 목록에서 빼되, 그 주소 자체를
     은퇴 목록에 넣어 "게시가 종료되었습니다" 안내가 나오게 합니다. */
  const aliases = {};
  Object.entries(bundle.PROJECT_ALIASES || {}).forEach(([from, to]) => {
    if (liveIds.indexOf(to) > -1) aliases[from] = to;
    else if (retired.indexOf(from) === -1) retired.push(from);
  });

  const added = projects.filter((p) => !prevByCase[p.case_no]);
  const kept = projects.filter((p) => prevByCase[p.case_no]);
  /* 키 순서는 무시하고 값만 비교합니다 (projects.js 는 정해진 키 순서로 다시 쓰입니다) */
  const changed = kept.filter((p) => sameValue(p, prevByCase[p.case_no]) === false);

  console.log('vault            : ' + VAULT);
  console.log('Raw 사례          : ' + plans.length + '건');
  console.log('발행 대상         : ' + projects.length + '건');
  console.log('  · 새로 추가     : ' + added.length + '건  ' + added.map((p) => p.case_no).join(', '));
  console.log('  · 내용 변경     : ' + changed.length + '건  ' + changed.map((p) => p.case_no).join(', '));
  console.log('  · 그대로        : ' + (kept.length - changed.length) + '건');
  console.log('사이트에서 삭제   : ' + dropped.length + '건  ' + dropped.map((p) => p.case_no + '(' + p.id + ')').join(', '));
  if (held.length) {
    console.log('보류(대표사진 없음): ' + held.length + '건  ' + held.map((p) => p.case_no).join(', '));
  }

  /* --diff : 바뀌는 사례를 필드 단위로 보여 줍니다 (쓰기 전에 꼭 확인) */
  if (DIFF && changed.length) {
    console.log('\n■ 필드별 변경');
    changed.forEach((p) => {
      const prev = prevByCase[p.case_no];
      const keys = new Set(Object.keys(p).concat(Object.keys(prev)));
      const lines = [...keys].filter((k) => JSON.stringify(p[k]) !== JSON.stringify(prev[k]))
        .map((k) => `    ${k}: ${short(prev[k])}  →  ${short(p[k])}`);
      console.log(`  ${p.case_no}`);
      lines.forEach((l) => console.log(l));
    });
  }

  const missingImages = [];
  projects.forEach((p) => {
    [p.representative_image, ...p.before_images, ...p.process_images, ...p.after_images]
      .filter(Boolean)
      .forEach((s) => { if (!fs.existsSync(path.join(REPO_ROOT, s))) missingImages.push(`${p.case_no} ${s}`); });
  });
  if (missingImages.length) {
    console.log(`\n■ 이미지 파일 없음 (${missingImages.length}개) — 먼저 node tools/fetch-case-images.js --write`);
    missingImages.slice(0, 20).forEach((s) => console.log('  ✗ ' + s));
    if (missingImages.length > 20) console.log(`  … 외 ${missingImages.length - 20}개`);
  }

  if (problems.length) {
    console.log(`\n■ 노트 확인 필요 (${problems.length}건)`);
    problems.forEach((p) => console.log(`  ${p.level === 'error' ? '✗' : '!'} ${p.case_no} — ${p.text}`));
  }

  if (!WRITE) {
    console.log('\n미리보기입니다. 실제로 반영하려면 --write 를 붙이세요.');
    return;
  }

  /* 안전장치 — 지금 사이트에 있는 사례가 빠지게 되면 쓰지 않고 멈춥니다.
     (원본 폴더·발행대기 노트가 옮겨지거나 빠졌을 때 사례가 조용히 은퇴하지 않도록)
     정말로 내리려는 경우에만 --allow-remove 를 붙입니다. */
  if (dropped.length && !ALLOW_REMOVE) {
    console.error('\n✗ 쓰지 않았습니다: 지금 사이트에 있는 사례 ' + dropped.length + '건이 빠지게 됩니다 — ' +
      dropped.map((p) => p.case_no).join(', '));
    console.error('  원본 노트와 발행대기 노트가 제자리에 있는지 먼저 확인하세요.');
    console.error('  정말로 공개를 내리려는 것이면 --allow-remove 를 붙여 다시 실행하세요.');
    process.exit(2);
  }

  writeProjects({ source: bundle.source, PROJECTS: projects, PROJECT_ALIASES: aliases, RETIRED_PROJECT_IDS: retired });
  console.log('\n' + path.relative(REPO_ROOT, PROJECTS_FILE).replace(/\\/g, '/') + ' 를 다시 썼습니다.');

  console.log('\n이어서 아래 두 개를 차례로 실행하세요.');
  console.log('  node tools/build-site.js --write   # 상세 페이지 · 목록 · sitemap 다시 만들기');
  console.log('  node tools/check-site.js           # 검증');
}

/* 경로를 못 찾는 등 예상한 오류는 안내문만 보여 주고 멈춥니다 (스택 대신) */
try {
  main();
} catch (e) {
  if (!e.code || !/^E(NO|VAULT)/.test(e.code)) throw e;
  console.error('✗ ' + e.message);
  process.exit(1);
}
