#!/usr/bin/env node
/* ============================================================
   tools/build-site.js — 정적 페이지 생성
   ------------------------------------------------------------
   자바스크립트가 없어도 내용이 보이도록, 데이터에서 실제 HTML 을 만듭니다.

     assets/js/projects.js   →  case/<slug>.html          (시공사례 상세)
     assets/js/resources.js  →  guide/<id>.html           (기술자료 상세)
     assets/js/content.js    →  projects.html / resources.html 의 카드 목록
     data/site-content.js    →  index.html                (홈 화면 전체)
                             →  sitemap.xml
                             →  assets/js/legacy-routes.js (옛 주소 → 새 주소)

   사용법
     node tools/build-site.js            # 미리보기 (파일을 쓰지 않음)
     node tools/build-site.js --write    # 실제로 생성
     node tools/build-site.js --write --base=https://example.com/
                                         # 도메인을 옮길 때만 사용

   ▶ 원칙
     · 사례 내용과 이미지 선택을 바꾸지 않습니다.
       이미지는 항상 CaseImages.normalize 결과만 씁니다.
     · 마크업은 main.js 가 만들던 것과 같게 유지합니다 (tools/lib/render.js).
     · 회사 정보는 assets/js/config.js 한 곳에서만 옵니다.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const D = require('./lib/site-data');
const R = require('./lib/render');

const {
  REPO_ROOT, esc, jsonld, fmtDate, byRecencyDesc,
  caseSlug, casePath, guidePath, SUB_PREFIX,
  siteUrlOf, absUrl, imgOr, sizeAttrs, writeFileIfChanged, fileExists
} = D;

const WRITE = process.argv.includes('--write');
const BASE_ARG = (process.argv.find((a) => a.indexOf('--base=') === 0) || '').split('=')[1];

const data = D.loadData();
const {
  COMPANY, EXTERNAL_LINKS, FALLBACK_IMAGE,
  PROJECTS, PROJECT_ALIASES, RETIRED_PROJECT_IDS,
  RESOURCES, CONTENT, CaseImages, SITE
} = data;

const SITE_URL = BASE_ARG ? BASE_ARG.replace(/\/+$/, '') + '/' : siteUrlOf(COMPANY);

/* 분야 → 서비스 페이지 (Article 의 about, 관련 링크에 씁니다) */
const SERVICE_BY_CATEGORY = {
  '노출콘크리트': { name: '제주 노출콘크리트 보수', page: 'concrete.html' },
  '면보수':       { name: '제주 노출콘크리트 보수', page: 'concrete.html' },
  '색상재현':     { name: '제주 노출콘크리트 보수', page: 'concrete.html' },
  '시공기준':     { name: '제주 노출콘크리트 보수', page: 'concrete.html' },
  '표면보호':     { name: '제주 콘크리트 표면강화 · 발수코팅', page: 'concrete-surface-protection.html' },
  '발수':         { name: '제주 콘크리트 표면강화 · 발수코팅', page: 'concrete-surface-protection.html' },
  '보수보강':     { name: '제주 콘크리트 보수보강', page: 'reinforcement.html' },
  '균열보수':     { name: '제주 콘크리트 보수보강', page: 'reinforcement.html' },
  '균열·보수':    { name: '제주 콘크리트 보수보강', page: 'reinforcement.html' },
  '단면복구':     { name: '제주 콘크리트 보수보강', page: 'reinforcement.html' },
  '철근노출':     { name: '제주 콘크리트 보수보강', page: 'reinforcement.html' },
  /* 아래 세 분류는 공정별 상세 페이지가 따로 있습니다.
     사례 데이터에 이 분류를 적으면 상세 페이지의 about · 관련 링크가
     reinforcement.html 이 아니라 해당 공정 페이지를 가리킵니다. */
  '에폭시주입':   { name: '제주 에폭시 균열보수 · 저압주입', page: 'epoxy-crack-repair.html' },
  '에폭시저압주입': { name: '제주 에폭시 균열보수 · 저압주입', page: 'epoxy-crack-repair.html' },
  '에폭시인젝션': { name: '제주 에폭시 균열보수 · 저압주입', page: 'epoxy-crack-repair.html' },
  '탄소섬유':     { name: '제주 탄소섬유 보강 · CFRP 구조보강', page: 'carbon-fiber-reinforcement.html' },
  '표면강화':     { name: '제주 콘크리트 표면강화 · 발수코팅', page: 'concrete-surface-protection.html' },
  '인젝션':       { name: '인젝션 특수방수', page: 'waterproof.html' },
  '누수보수':     { name: '인젝션 특수방수', page: 'waterproof.html' },
  '특수방수':     { name: '인젝션 특수방수', page: 'waterproof.html' }
};
const DEFAULT_SERVICE = { name: '제주 노출콘크리트 보수', page: 'concrete.html' };
function serviceOf(category) { return SERVICE_BY_CATEGORY[category] || DEFAULT_SERVICE; }

const ORG_ID = SITE_URL + '#organization';
const SITE_ID = SITE_URL + '#website';

/* 푸터 사업자 정보 한 줄 — 규칙은 tools/lib/render.js 에 한 곳만 둡니다. */
const legalLine = () => R.legalLine(COMPANY);

/* 검색결과에 쓰이는 설명문 — 너무 길면 잘립니다. */
function clamp(text, max) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1).replace(/[\s·,]+$/, '') + '…';
}

/* ── 생성 페이지의 <head> ──────────────────────────────────── */
function headBlock(o) {
  const canonical = absUrl(SITE_URL, o.rel);
  /* 대표 이미지가 없는 문서는 og:image 를 아예 내보내지 않습니다.
     빈 값을 absUrl 에 넘기면 사이트 루트가 og:image 로 들어가고,
     관계없는 대체 이미지를 넣으면 공유 카드가 내용과 어긋납니다. */
  const ogImage = o.image ? absUrl(SITE_URL, o.image) : '';
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}" />
<link rel="canonical" href="${esc(canonical)}" />
<meta name="robots" content="index, follow" />
<meta name="theme-color" content="#111111" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="${esc(COMPANY.brand)}" />
<meta property="og:title" content="${esc(o.title)}" />
<meta property="og:description" content="${esc(o.description)}" />
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}" />
` : ''}<meta property="og:url" content="${esc(canonical)}" />
<meta property="og:locale" content="ko_KR" />
<meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}" />
<link rel="icon" href="${SUB_PREFIX}assets/images/brand/logo.png" />
${R.FONT_LINKS}
<link rel="stylesheet" href="${SUB_PREFIX}assets/css/style.css" />
<link rel="stylesheet" href="${SUB_PREFIX}assets/css/homepage-subpages.css" />
<script type="application/ld+json">
${o.schema}
</script>
</head>`;
}

/* 눈에 보이는 breadcrumb 과 BreadcrumbList 를 같은 자료에서 만듭니다.
   (둘이 어긋나지 않도록 반드시 한 곳에서) */
function crumbs(trail, prefix) {
  const visible = '<nav class="wrap" aria-label="현재 위치" style="padding-top:var(--header-h)">\n  <ol class="crumb">\n' +
    trail.map((c) => c.href
      ? `    <li><a href="${prefix}${c.href}">${esc(c.name)}</a></li>`
      : `    <li>${esc(c.name)}</li>`).join('\n') +
    '\n  </ol>\n</nav>';
  const schema = {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((c, i) => {
      const item = { '@type': 'ListItem', position: i + 1, name: c.name };
      if (c.href) item.item = absUrl(SITE_URL, c.href);
      return item;
    })
  };
  return { visible, schema };
}

/* ── 시공사례 상세 ─────────────────────────────────────────── */
function buildCasePage(p, sorted, idx) {
  const ci = CaseImages.normalize(p);
  const rel = casePath(p.id);
  const svc = serviceOf(p.category);
  const rep = imgOr(ci.representativeImage, FALLBACK_IMAGE);

  const title = `${p.title} | ${COMPANY.brand}`;
  const description = clamp([p.category, p.summary].filter(Boolean).join(' — '), 155);

  const bc = crumbs([
    { name: 'HOME', href: 'index.html' },
    { name: '시공사례', href: 'projects.html' },
    { name: p.title }
  ], SUB_PREFIX);

  /* 사진은 Article.image 로 넘깁니다 — 대표 · 시공전 · 시공중 · 시공후 순서 그대로 */
  const allShots = [].concat(
    ci.representativeImages, ci.beforeImages, ci.processImages, ci.afterImages
  ).filter(Boolean);
  const seen = new Set();
  const images = allShots.filter((s) => (seen.has(s) ? false : (seen.add(s), true)))
    .map((s) => absUrl(SITE_URL, s));

  const article = {
    '@type': 'Article',
    '@id': absUrl(SITE_URL, rel) + '#article',
    headline: p.title,
    description: clamp(p.summary, 300),
    image: images,
    author: { '@id': ORG_ID },
    publisher: { '@id': ORG_ID },
    inLanguage: 'ko-KR',
    isPartOf: { '@id': SITE_ID },
    mainEntityOfPage: absUrl(SITE_URL, rel),
    about: { '@type': 'Service', name: svc.name, url: absUrl(SITE_URL, svc.page) }
  };
  /* 날짜는 자료에 있을 때만 넣습니다 — 없는 날짜를 만들지 않습니다. */
  if (p.date) article.datePublished = p.date;
  if (p.location) article.contentLocation = { '@type': 'Place', name: p.location };

  const schema = jsonld({
    '@context': 'https://schema.org',
    '@graph': [
      article,
      Object.assign({ '@id': absUrl(SITE_URL, rel) + '#breadcrumb' }, bc.schema)
    ]
  });

  /* 관련 시공사례 — main.js 와 같은 규칙 (같은 분야 우선, 없으면 최신) */
  let related = sorted.filter((o) => o.id !== p.id && o.category === p.category).slice(0, 3);
  if (!related.length) related = sorted.filter((o) => o.id !== p.id).slice(0, 3);
  const relatedHtml = related
    .map((o) => R.projectCard(o, CaseImages.normalize(o), SUB_PREFIX, FALLBACK_IMAGE)).join('');

  const prev = sorted[idx - 1];
  const next = sorted[idx + 1];
  const pager =
    (prev ? '<a href="' + SUB_PREFIX + casePath(prev.id) + '">← ' + esc(prev.title) + '</a>' : '<span></span>') +
    (next ? '<a href="' + SUB_PREFIX + casePath(next.id) + '">' + esc(next.title) + ' →</a>' : '<span></span>');

  /* 이 사례와 같은 공정을 설명한 기술자료 (있을 때만) */
  const guide = RESOURCES.filter((r) => serviceOf(r.category).page === svc.page)
    .slice().sort(byRecencyDesc)[0];

  const html = `${headBlock({ rel, title, description, image: rep, schema })}
<body data-page="project">
<a class="skip-link" href="#main">본문 바로가기</a>

${R.header(SUB_PREFIX, 'projects.html', COMPANY)}

<main id="main">
${bc.visible}

<article id="projectDetail">
${R.caseBody(p, ci, SUB_PREFIX, FALLBACK_IMAGE)}
</article>

<div class="wrap">
  <nav class="pager" id="projectPager" aria-label="이전 다음 시공사례">${pager}</nav>
</div>

<section class="section">
  <div class="wrap">
    <header class="section__head section__head--row reveal">
      <div><p class="eyebrow">RELATED CONTENT</p><h2 class="h2">관련 시공사례</h2></div>
      <p class="section__desc">이 현장과 같은 분야의 기록입니다. 결함 상태와 적용 공법을 사례마다 적어 두었습니다.</p>
    </header>
    <div class="grid grid--3" id="relatedWorks">${relatedHtml}</div>
    <div class="section__more">
      <a class="btn btn--dark" href="${SUB_PREFIX}projects.html">전체 시공사례 보기</a>
      <a class="btn btn--line" href="${SUB_PREFIX}${svc.page}">${esc(svc.name)} 공정 보기</a>${guide ? `
      <a class="btn btn--line" href="${SUB_PREFIX}${guidePath(guide.id)}">관련 기술자료 보기</a>` : ''}
    </div>
  </div>
</section>

<section class="section section--dark">
  <div class="wrap">
    <header class="section__head reveal">
      <p class="eyebrow">CONTACT</p>
      <h2 class="h2">같은 유형의 현장이라면</h2>
      <p class="lead" style="margin-top:18px">사진과 위치만 알려주셔도 1차 검토가 가능합니다.</p>
    </header>
    <div class="hero__actions">
      <a class="btn btn--light" href="${esc(COMPANY.telHref)}">전화상담 ${esc(COMPANY.tel)}</a>
      <a class="btn btn--ghost" data-photo-consult href="mailto:${esc(COMPANY.email)}">사진상담</a>
      <a class="btn btn--ghost" href="${SUB_PREFIX}contact.html">견적문의</a>
    </div>
  </div>
</section>

</main>

${R.footer(SUB_PREFIX, COMPANY, EXTERNAL_LINKS)}

<script src="${SUB_PREFIX}assets/js/config.js"></script>
<script src="${SUB_PREFIX}assets/js/main.js"></script>
</body>
</html>
`;
  return { rel, html, title, canonical: absUrl(SITE_URL, rel), date: p.date || '' };
}

/* ── 기술자료 상세 ─────────────────────────────────────────── */
function buildGuidePage(r) {
  const rel = guidePath(r.id);
  const svc = serviceOf(r.category);
  const cover = r.thumbnail || '';

  const title = `${r.title} | ${COMPANY.brand}`;
  const description = clamp(r.summary, 155);

  const bc = crumbs([
    { name: 'HOME', href: 'index.html' },
    { name: '기술자료', href: 'resources.html' },
    { name: r.title }
  ], SUB_PREFIX);

  const article = {
    '@type': 'Article',
    '@id': absUrl(SITE_URL, rel) + '#article',
    headline: r.title,
    description: clamp(r.summary, 300),
    author: { '@id': ORG_ID },
    publisher: { '@id': ORG_ID },
    inLanguage: 'ko-KR',
    isPartOf: { '@id': SITE_ID },
    mainEntityOfPage: absUrl(SITE_URL, rel),
    about: { '@type': 'Service', name: svc.name, url: absUrl(SITE_URL, svc.page) }
  };
  if (r.date) article.datePublished = r.date;
  if (r.thumbnail) {
    article.image = {
      '@type': 'ImageObject',
      url: absUrl(SITE_URL, r.thumbnail),
      caption: r.title + ' 관련 시공 사진'
    };
  }
  if ((r.tags || []).length) article.keywords = r.tags.join(', ');

  const schema = jsonld({
    '@context': 'https://schema.org',
    '@graph': [
      article,
      Object.assign({ '@id': absUrl(SITE_URL, rel) + '#breadcrumb' }, bc.schema)
    ]
  });

  let related = RESOURCES.filter((o) => o.id !== r.id && o.category === r.category).slice(0, 3);
  if (!related.length) related = RESOURCES.filter((o) => o.id !== r.id).slice(0, 3);
  const relatedHtml = related.map((o) => R.resourceRow(o, SUB_PREFIX)).join('');

  /* 이 기준이 실제로 적용된 사례 3건 — 같은 분야에서 시공 전 사진이 있는 것 우선 */
  const cases = PROJECTS
    .filter((p) => serviceOf(p.category).page === svc.page)
    .map((p) => ({ p, ci: CaseImages.normalize(p) }))
    .sort((a, b) => (b.ci.hasBefore ? 1 : 0) - (a.ci.hasBefore ? 1 : 0))
    .slice(0, 3);
  const casesHtml = cases
    .map(({ p, ci }) => R.projectCard(p, ci, SUB_PREFIX, FALLBACK_IMAGE)).join('');

  /* 이 분야에 공개된 시공사례가 아직 없으면(예: 콘크리트 보수보강) 빈 카드 그리드를
     보여주는 대신 이 구간 전체를 건너뜁니다 — 없는 것을 있는 것처럼 두지 않습니다. */
  const realWorksSection = cases.length ? `
<section class="section section--mist">
  <div class="wrap">
    <header class="section__head section__head--row reveal">
      <div><p class="eyebrow">REAL WORKS</p><h2 class="h2">이 기준이 적용된 현장</h2></div>
      <p class="section__desc">여기 정리한 기준이 실제 현장에서 어떤 결과로 나왔는지 시공 전후 사진으로 확인하실 수 있습니다.</p>
    </header>
    <div class="grid grid--3">${casesHtml}</div>
    <div class="section__more">
      <a class="btn btn--dark" href="${SUB_PREFIX}projects.html">전체 시공사례 보기</a>
      <a class="btn btn--line" href="${SUB_PREFIX}${svc.page}">${esc(svc.name)} 공정 보기</a>
      <a class="btn btn--line" href="${SUB_PREFIX}materials.html">이 공정에 쓰는 자재 보기</a>
    </div>
  </div>
</section>` : '';

  const html = `${headBlock({ rel, title, description, image: cover, schema })}
<body data-page="resource">
<a class="skip-link" href="#main">본문 바로가기</a>

${R.header(SUB_PREFIX, 'resources.html', COMPANY)}

<main id="main">
${bc.visible}

<article id="resourceDetail">
${R.guideBody(r, SUB_PREFIX)}
</article>
${realWorksSection}

<section class="section">
  <div class="wrap">
    <header class="section__head reveal">
      <p class="eyebrow">RELATED CONTENT</p>
      <h2 class="h2">관련 기술자료</h2>
    </header>
    <div class="resource-list" id="relatedResources">${relatedHtml}</div>
    <div class="section__more"><a class="btn btn--dark" href="${SUB_PREFIX}resources.html">전체 기술자료 보기</a></div>
  </div>
</section>

<section class="section section--dark">
  <div class="wrap">
    <header class="section__head reveal">
      <p class="eyebrow">CONTACT</p>
      <h2 class="h2">현장에 적용하기 전</h2>
      <p class="lead" style="margin-top:18px">같은 공법이라도 바탕면 상태에 따라 배합과 순서가 달라집니다. 현장사진을 보내주시면 검토해 회신드립니다.</p>
    </header>
    <div class="hero__actions">
      <a class="btn btn--light" href="${esc(COMPANY.telHref)}">전화상담 ${esc(COMPANY.tel)}</a>
      <a class="btn btn--ghost" data-photo-consult href="mailto:${esc(COMPANY.email)}">사진상담</a>
      <a class="btn btn--ghost" href="${SUB_PREFIX}contact.html">견적문의</a>
    </div>
  </div>
</section>

</main>

${R.footer(SUB_PREFIX, COMPANY, EXTERNAL_LINKS)}

<script src="${SUB_PREFIX}assets/js/config.js"></script>
<script src="${SUB_PREFIX}assets/js/main.js"></script>
</body>
</html>
`;
  return { rel, html, title, canonical: absUrl(SITE_URL, rel), date: r.date || '' };
}

/* ── 목록 페이지의 카드를 정적으로 채웁니다 ─────────────────
   projects.html / resources.html 의 표시 순서는 main.js initContentPage 와
   같아야 합니다. JS 는 그 위에서 검색·분류·더보기만 담당합니다. */
const GRID_MARK = {
  open: '<!-- BUILD:grid -->',
  close: '<!-- /BUILD:grid -->'
};

function poolFor(baseType) {
  /* 순서는 CONTENT 가 이미 정해 두었습니다 (날짜 → 사례번호 → 제목).
     여기서 다시 정렬하지 않습니다.
     main.js 의 initContentPage 와 같은 규칙이어야 합니다. */
  return CONTENT.filter((item) => baseType === 'all' || item.type === baseType);
}

/* 첫 화면 12건만 서버에서 그리고 나머지는 '더 보기' 가 이어받습니다
   — main.js 의 STEP 과 같은 값입니다. */
const STEP = 12;

function injectGrid(file, baseType, text) {
  const start = text.indexOf(GRID_MARK.open);
  const end = text.indexOf(GRID_MARK.close);
  if (start === -1 || end === -1) {
    throw new Error(`${file} 에 ${GRID_MARK.open} … ${GRID_MARK.close} 표시가 없습니다.`);
  }
  const pool = poolFor(baseType);
  const cards = pool.slice(0, STEP).map((item) => R.contentCard(item, '', FALLBACK_IMAGE)).join('\n');
  const next = text.slice(0, start + GRID_MARK.open.length) +
    '\n' + cards + '\n' +
    text.slice(end);
  return { file, next, total: pool.length, rendered: Math.min(STEP, pool.length) };
}

/* ── 페이지 안의 관련 콘텐츠 위젯을 정적으로 채웁니다 ────────
   기존 마크업을 그대로 씁니다.

     <div class="grid grid--3" data-works="노출콘크리트" data-limit="3">
     <div class="resource-list" data-resources="인젝션,특수방수" data-limit="4">

   main.js 의 initWorkLists / initResourceLists 와 같은 규칙으로 고르고,
   채운 뒤에는 data-built 를 달아 둡니다. main.js 는 data-built 가 있는
   상자를 건드리지 않으므로, 화면에 보이는 것은 그대로이면서 링크가
   HTML 안에 남습니다. */
const WIDGET_OPEN = /<div\b([^>]*\bdata-(?:works|resources)="[^"]*"[^>]*)>/g;

/* 여는 <div> 에 대응하는 </div> 를 찾습니다.
   ※ 정규식으로 가장 가까운 </div> 를 잡으면 안 됩니다.
      카드 안에도 <div> 가 있어서(resource-row__file) 엉뚱한 곳에서 끊기고,
      다시 만들 때마다 내용이 겹쳐 쌓입니다. 깊이를 세어 정확히 찾습니다. */
function matchingCloseDiv(text, afterOpen) {
  const tag = /<(\/?)div\b[^>]*>/g;
  tag.lastIndex = afterOpen;
  let depth = 1;
  let m;
  while ((m = tag.exec(text))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return { start: m.index, end: tag.lastIndex };
  }
  return null;
}

function pickWorks(mode, limit) {
  let list;
  if (mode === 'featured') {
    list = PROJECTS.filter((p) => p.featured).sort(byRecencyDesc);
    if (list.length < 3) list = PROJECTS.slice().sort(byRecencyDesc);
  } else if (mode === 'all' || !mode) {
    list = PROJECTS.slice().sort(byRecencyDesc);
  } else {
    list = PROJECTS.filter((p) => p.category === mode).sort(byRecencyDesc);
  }
  return list.slice(0, limit);
}

/* ids 를 적으면 적은 순서 그대로 그 자료만 씁니다.
   공정별 상세 페이지의 '관련 기술자료' 처럼, 최신순이 아니라 주제로
   골라 두어야 하는 자리에 씁니다. 분류 필터(mode)는 ids 가 없을 때만 씁니다.
   ※ assets/js/main.js 의 initResourceLists 와 같은 규칙입니다. */
function pickResources(mode, limit, ids) {
  if (ids) {
    const byId = new Map(RESOURCES.map((r) => [r.id, r]));
    return ids.split(',').map((s) => s.trim()).filter(Boolean)
      .map((id) => byId.get(id)).filter(Boolean).slice(0, limit);
  }
  let list = RESOURCES.slice().sort(byRecencyDesc);
  if (mode && mode !== 'all') {
    const wanted = mode.split(',').map((s) => s.trim()).filter(Boolean);
    list = list.filter((r) => wanted.indexOf(r.category) > -1);
  }
  return list.slice(0, limit);
}

function attrValue(attrs, name) {
  const m = new RegExp('\\b' + name + '="([^"]*)"').exec(attrs);
  return m ? m[1] : null;
}

function fillWidgets(file, text) {
  let filled = 0;
  let items = 0;

  /* 앞에서부터 하나씩 찾아 바꿉니다. 바꾼 뒤 커서를 새 내용 끝으로 옮겨
     방금 넣은 카드 안을 다시 훑지 않게 합니다. */
  let out = '';
  let cursor = 0;
  WIDGET_OPEN.lastIndex = 0;
  let open;
  while ((open = WIDGET_OPEN.exec(text))) {
    const attrs = open[1];
    const openEnd = open.index + open[0].length;
    const close = matchingCloseDiv(text, openEnd);
    if (!close) break;   // 짝이 안 맞으면 손대지 않습니다

    const limit = parseInt(attrValue(attrs, 'data-limit'), 10) || 3;
    const works = attrValue(attrs, 'data-works');
    const resources = attrValue(attrs, 'data-resources');

    let cards;
    if (works !== null) {
      const list = pickWorks(works, limit);
      cards = list.map((p) => R.projectCard(p, CaseImages.normalize(p), '', FALLBACK_IMAGE)).join('\n      ');
      items += list.length;
    } else {
      const list = pickResources(resources, limit, attrValue(attrs, 'data-resource-ids'));
      cards = list.map((r) => R.resourceRow(r, '')).join('\n      ');
      items += list.length;
    }

    out += text.slice(cursor, open.index);
    if (!cards) {
      /* 해당하는 항목이 없으면 원래 마크업(noscript 안내)을 그대로 둡니다 */
      out += text.slice(open.index, close.end);
    } else {
      filled++;
      /* noscript 안내는 더 이상 필요 없습니다 — 이제 링크가 HTML 안에 있습니다. */
      const cleanAttrs = attrs.replace(/\s*\bdata-built(="[^"]*")?/g, '');
      out += `<div${cleanAttrs} data-built>\n      ${cards}\n    </div>`;
    }
    cursor = close.end;
    WIDGET_OPEN.lastIndex = close.end;
  }
  out += text.slice(cursor);

  return { file, next: out, filled, items };
}

/* ── 자바스크립트 · 스타일 주소에 내용 해시를 붙입니다 ───────
   목록 카드는 정적 HTML 로 깔리지만, main.js 가 화면에서 다시 그립니다
   (initContentPage → render → grid.innerHTML). 그래서 사진을 바꿔도
   브라우저가 assets/js/resources.js 를 캐시에서 꺼내 쓰면 옛 주소로 다시
   그려집니다. GitHub Pages 는 Cache-Control: max-age=600 을 고정으로 주고
   우리가 바꿀 수 없으므로, 파일 내용이 바뀌면 주소도 바뀌게 만듭니다.

     assets/js/resources.js  →  assets/js/resources.js?v=1a2b3c4d

   내용이 같으면 해시도 같아서 주소가 그대로입니다. 즉 바뀐 파일만
   다시 내려받습니다. 이미지처럼 파일명을 바꾸지 않는 이유는, JS·CSS 는
   손으로 쓴 페이지 여러 곳에서 부르고 있어 이름을 바꾸면 그 참조를
   전부 따라다녀야 하기 때문입니다. */
const crypto = require('crypto');
const _hashCache = new Map();

function assetHash(rel) {
  if (_hashCache.has(rel)) return _hashCache.get(rel);
  let h = '';
  try {
    h = crypto.createHash('sha1')
      .update(fs.readFileSync(path.join(REPO_ROOT, rel)))
      .digest('hex').slice(0, 8);
  } catch (e) { h = ''; }          /* 파일이 없으면 주소를 건드리지 않습니다 */
  _hashCache.set(rel, h);
  return h;
}

function stampAssets(html) {
  /* 손으로 쓴 페이지에는 작은따옴표로 적힌 <link> 도 섞여 있습니다.
     따옴표 종류는 그대로 두고 주소만 바꿉니다. */
  return html.replace(
    /\b(src|href)=(["'])((?:\.\.\/)*)(assets\/(?:js|css)\/[A-Za-z0-9._-]+\.(?:js|css))(?:\?v=[0-9a-f]+)?\2/g,
    (whole, attr, q, up, rel) => {
      const h = assetHash(rel);
      return h ? `${attr}=${q}${up}${rel}?v=${h}${q}` : whole;
    }
  );
}

/* ── 손으로 쓴 페이지의 머리말 · 꼬리말을 맞춥니다 ───────────
   지금까지 concrete.html · about.html 같은 페이지는 헤더와 푸터를 각자
   품고 있었습니다. 브랜드 이름을 바꾸면 11곳을 따로 고쳐야 했고, 한 곳을
   빠뜨리면 그 페이지만 옛 이름으로 남았습니다.

   그래서 생성 페이지와 **같은 tools/lib/render.js** 로 머리말·꼬리말을 다시
   찍어 넣습니다. 이제 브랜드는 assets/js/config.js 한 곳에서만 바뀝니다.

     <header class="header" id="header"> … </header>          → R.header()
     <footer class="footer"> … <div class="toast" …></div>    → R.footer()

   ※ 그 사이의 본문은 건드리지 않습니다. 껍데기만 갈아 끼웁니다. */
const SHELL_PAGES = [
  'concrete.html', 'reinforcement.html', 'waterproof.html',
  'carbon-fiber-reinforcement.html', 'epoxy-crack-repair.html', 'concrete-surface-protection.html',
  'projects.html', 'resources.html',
  'materials.html', 'about.html', 'contact.html', 'privacy.html', '404.html'
];

/* 헤더에서 현재 위치로 표시할 메뉴. 목록에 없는 페이지(개인정보·404)는
   어느 메뉴도 현재 위치가 아니므로 빈 값을 넘깁니다. */
const NAV_KEYS = new Set([
  'index.html', 'concrete.html', 'reinforcement.html', 'waterproof.html', 'projects.html',
  'resources.html', 'materials.html', 'about.html', 'contact.html'
]);

const FOOTER_END = '<div class="toast" id="toast" role="status" aria-live="polite"></div>';

function syncShell(file, text) {
  let out = text;
  const changed = [];

  /* 머리말 */
  const hStart = out.indexOf('<header class="header" id="header">');
  const hEnd = out.indexOf('</header>', hStart);
  if (hStart !== -1 && hEnd !== -1) {
    const current = NAV_KEYS.has(file) ? file : '';
    const next = R.header('', current, COMPANY);
    const old = out.slice(hStart, hEnd + '</header>'.length);
    if (old !== next) changed.push('header');
    out = out.slice(0, hStart) + next + out.slice(hEnd + '</header>'.length);
  }

  /* 꼬리말 + 하단 고정 상담바 */
  const fStart = out.indexOf('<footer class="footer">');
  const fEnd = out.indexOf(FOOTER_END, fStart);
  if (fStart !== -1 && fEnd !== -1) {
    const next = R.footer('', COMPANY, EXTERNAL_LINKS);
    const old = out.slice(fStart, fEnd + FOOTER_END.length);
    if (old !== next) changed.push('footer');
    out = out.slice(0, fStart) + next + out.slice(fEnd + FOOTER_END.length);
  }

  return { file, next: out, changed };
}

/* ── 홈 화면 ───────────────────────────────────────────────── */
function buildHome() {
  const S = SITE || {};
  const c = COMPANY;
  const hero = S.hero || {};
  /* 첫 화면의 핵심 두 축 — 같은 마크업 · 같은 크기로 나란히 둡니다.
     분야 이름은 제목 태그가 아니라 링크 안의 span 입니다: 히어로 안에 제목 계층을
     만들지 않고, 페이지의 h2 는 아래 구간 제목들이 맡습니다. */
  const heroPillars = (hero.pillars || []).length ? `    <ul class="hero__pillars" aria-label="핵심 전문 분야">
${hero.pillars.map((p) => `      <li><a class="pillar" href="${esc(p.link)}"><span class="pillar__ttl">${esc(p.title)}</span><span class="pillar__items">${p.items.map(esc).join(' · ')}</span></a></li>`).join('\n')}
    </ul>
` : '';
  const about = S.about || {};
  const ss = S.serviceSection || {};
  const sc = S.scopeSection || {};
  const fs_ = S.featureSection || {};
  const ws = S.worksSection || {};
  const rs = S.resourcesSection || {};
  const ms = S.materialsSection || {};
  const ct = S.contact || {};
  const foot = S.footer || {};

  /* 히어로 — 모든 장을 정적으로 깔고, 첫 장만 즉시 내려받습니다. */
  const heroImages = (hero.images || []);
  /* 히어로 슬라이드
     ------------------------------------------------------------
     첫 장만 바로 내려받고, 둘째 장부터는 주소만 적어 둡니다(data-src).

     왜: 슬라이드는 모두 position:absolute; inset:0 이라 화면 안에 있습니다.
     opacity:0 이어도 브라우저는 "보이는 영역"으로 판단하므로 loading="lazy"
     가 통하지 않고, 실제로 둘째·셋째 장이 High 우선순위로 함께 내려왔습니다.
     느린 모바일 회선에서는 이 둘이 첫 장과 대역폭을 다투어 LCP 를 늦춥니다.
     (측정: 둘째 장이 6.8초까지 회선을 점유)

     둘째 장은 load 이후에, 나머지는 넘어가기 직전에 채웁니다.
     화면에 보이는 결과는 이전과 같습니다. */
  const slides = heroImages.map((im, i) => {
    const webp = D.webpFor(im.src);
    const size = sizeAttrs(im.src);
    if (i === 0) {
      const source = webp
        ? `<source srcset="${esc(webp)}" type="image/webp" />`
        : '';
      return `      <div class="hero__slide active"><picture>${source}` +
        `<img src="${esc(im.src)}" alt="${esc(im.alt)}" fetchpriority="high" decoding="async"${size} />` +
        `</picture></div>`;
    }
    const source = webp
      ? `<source data-srcset="${esc(webp)}" type="image/webp" />`
      : '';
    return `      <div class="hero__slide"><picture>${source}` +
      `<img data-src="${esc(im.src)}" alt="${esc(im.alt)}" decoding="async"${size} />` +
      `</picture></div>`;
  }).join('\n');
  const dots = heroImages.map((im, i) =>
    `    <button type="button"${i === 0 ? ' class="active"' : ''} data-i="${i}" aria-label="${i + 1}번 사진 보기"></button>`
  ).join('\n');

  const aboutBody = (about.paragraphs || [])
    .map((p) => `      <p class="body">${esc(p)}</p>`).join('\n');

  const services = (S.services || []).map((s) => {
    const items = (s.items && s.items.length)
      ? '<ul class="svc__items">' + s.items.map((it) => `<li>${esc(it)}</li>`).join('') + '</ul>'
      : '';
    return `      <a class="svc reveal" href="${esc(s.link)}">` +
      `<p class="svc__no">${esc(s.no)}</p>` +
      `<h3 class="svc__ttl">${esc(s.title)}</h3>` +
      items +
      `<p class="svc__text">${esc(s.text)}</p>` +
      '<span class="svc__go">View More</span></a>';
  }).join('\n');

  /* 보수보강 시공 범위 — 다섯 갈래를 헤어라인 목록으로 깔아 둡니다.
     서비스 카드(3장)는 '어느 분야인가', 이 목록은 '무엇을 시공하는가' 입니다.
     설명은 여기에 두지 않고 각 상세 페이지로 넘깁니다. */
  const scopes = (S.scopes || []).map((x) => {
    const items = (x.items || []).map((it) => `<li>${esc(it)}</li>`).join('');
    return `      <li class="scope reveal">` +
      `<p class="scope__no">${esc(x.no)}</p>` +
      `<div class="scope__body"><h3 class="scope__ttl">${esc(x.title)}</h3>` +
      (items ? `<ul class="scope__items">${items}</ul>` : '') + '</div>' +
      `<a class="scope__go" href="${esc(x.link)}">${esc(x.linkText)}</a></li>`;
  }).join('\n');

  const features = (S.features || []).map((f) =>
    `      <div class="feat"><span class="feat__no">${esc(f.no)}</span>` +
    `<div><h3 class="feat__ttl">${esc(f.title)}</h3>` +
    `<p class="feat__text">${esc(f.text)}</p></div></div>`
  ).join('\n');

  /* 시공사례 카드 — 시공 전 사진이 있는 사례를 앞에 둡니다 (기존 홈 규칙 그대로) */
  const worksLimit = ws.homeLimit || 3;
  const works = PROJECTS
    .map((p) => ({ p, ci: CaseImages.normalize(p) }))
    .filter((x) => x.ci.representativeImage)
    .sort((a, b) => (b.ci.hasBefore ? 1 : 0) - (a.ci.hasBefore ? 1 : 0))
    .slice(0, worksLimit)
    .map(({ p, ci }) => {
      const flag = ci.hasBefore ? '<span>BEFORE / AFTER</span>' : '<span>AFTER</span>';
      const rep = ci.representativeImage;
      return `      <a class="work reveal" href="${casePath(p.id)}">` +
        `<div class="work__media"><img src="${esc(rep)}" alt="${esc(p.representative_alt || p.title + ' 시공 사진')}" loading="lazy"${sizeAttrs(rep)} /></div>` +
        `<div class="work__meta">${flag}</div>` +
        `<h3 class="work__ttl">${esc(p.title)}</h3></a>`;
    }).join('\n');

  const docsLimit = rs.homeLimit || 3;
  const docs = RESOURCES.slice().sort(byRecencyDesc).slice(0, docsLimit).map((r) =>
    `      <li><a class="doc reveal" href="${guidePath(r.id)}">` +
    `<span class="doc__cat">${esc(r.category)}</span>` +
    `<span><span class="doc__ttl">${esc(r.title)}</span>` +
    `<span class="doc__sum">${esc(r.summary)}</span></span>` +
    `<span class="doc__date">${esc(fmtDate(r.date))}</span></a></li>`
  ).join('\n');

  const linkList = (arr) => (arr || []).map((l) => {
    const ext = l.external ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `        <li><a href="${esc(l.href)}"${ext}>${esc(l.label)}</a></li>`;
  }).join('\n');

  const channels = [{ label: '보수재 · 방수재 · 발수제 구매', href: 'materials.html' }];
  ['blog', 'youtube', 'instagram'].forEach((k) => {
    const item = EXTERNAL_LINKS[k];
    if (item && item.url) channels.push({ label: item.label, href: item.url, external: true });
  });

  /* 화면 아래쪽 사진 — .webp 를 만들어 둔 것만 <picture> 로 감쌉니다.
     만들어 두지 않은 사진은 지금까지처럼 <img> 하나만 나갑니다. */
  const lazyPicture = (src, alt) => {
    const webp = D.webpFor(src);
    const img = `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async"${sizeAttrs(src)} />`;
    return webp
      ? `<picture><source srcset="${esc(webp)}" type="image/webp" />${img}</picture>`
      : img;
  };

  const orgSchema = buildOrganisationGraph();
  const inlineCss = D.readRepo('assets/css/home-inline.css');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<!-- 첫 화면 사진을 <head> 맨 앞에서 알려 줍니다(LCP).
     프리로드 스캐너가 제목·설명·og 태그를 지나기 전에 발견하도록 위로 올렸습니다.
     .webp 가 있으면 type 을 함께 적어, 지원하지 않는 브라우저가 헛되이
     내려받지 않게 합니다(그 경우 아래 <picture> 의 JPEG 을 씁니다). -->
${(() => {
  const first = heroImages[0];
  if (!first) return '';
  const webp = D.webpFor(first.src);
  return webp
    ? `<link rel="preload" as="image" href="${esc(webp)}" type="image/webp" fetchpriority="high" />`
    : `<link rel="preload" as="image" href="${esc(first.src)}" fetchpriority="high" />`;
})()}
<title>${esc(S.meta.title)}</title>
<meta name="description" content="${esc(S.meta.description)}" />
<link rel="icon" href="assets/images/brand/logo.png" />
<link rel="canonical" href="${esc(SITE_URL)}" />
<meta name="robots" content="index, follow" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${esc(c.brand)}" />
<meta property="og:title" content="${esc(S.meta.title)}" />
<meta property="og:description" content="${esc(S.meta.ogDescription || S.meta.description)}" />
<meta property="og:image" content="${esc(absUrl(SITE_URL, S.meta.image))}" />
<meta property="og:url" content="${esc(SITE_URL)}" />
<meta property="og:locale" content="ko_KR" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(S.meta.title)}" />
<meta name="twitter:description" content="${esc(S.meta.twitterDescription || S.meta.description)}" />
<meta name="twitter:image" content="${esc(absUrl(SITE_URL, S.meta.image))}" />
${R.FONT_LINKS}
<script type="application/ld+json">
${orgSchema}
</script>
<style>
${inlineCss.trim()}
</style>
</head>
<body data-page="home">
<a class="skip-link" href="#main">본문 바로가기</a>

<!-- ═══════════ 헤더 ═══════════ -->
<header class="site-header" id="header">
  <div class="wrap">
    <a class="brand" href="index.html">
      <b>${esc(c.headerBrand || c.brand)}</b>
      <span>${esc(c.headerSubline || c.brandSubline)}</span>
    </a>
    <nav class="nav" id="nav" aria-label="주요 메뉴" inert>
      <a href="index.html">HOME</a>
      <a href="concrete.html">제주노출콘크리트</a>
      <a href="reinforcement.html">제주콘크리트보수보강</a>
      <a href="waterproof.html">인젝션·특수방수</a>
      <a href="projects.html">시공사례</a>
      <a href="resources.html">기술자료</a>
      <a href="materials.html">자재구매</a>
      <a href="about.html">회사소개</a>
      <a class="nav__cta" href="contact.html">상담문의</a>
    </nav>
    <button class="burger" id="burger" type="button" aria-label="메뉴 열기" aria-expanded="false" aria-controls="nav">
      <i></i><i></i><i></i>
    </button>
  </div>
</header>
<main id="main">

<!-- ═══════════ 히어로 ═══════════ -->
<section class="hero" id="hero">
  <div class="hero__slides" id="slides">
${slides}
  </div>
  <div class="hero__scrim" aria-hidden="true"></div>

  <div class="hero__inner">
    <h1 class="hero__title">${hero.title}</h1>
    <p class="hero__en">${esc(hero.en)}</p>
${hero.sub ? `    <p class="hero__sub">${esc(hero.sub)}</p>
` : ''}${heroPillars}
  </div>

  <div class="hero__dots" id="dots">
${dots}
  </div>
</section>

<!-- ═══════════ ABOUT ═══════════ -->
<section class="about" id="about">
  <div class="wrap about__grid">
    <div class="about__head reveal">
      <p class="eyebrow">${esc(about.eyebrow)}</p>
      <h2 class="h2">${about.heading}</h2>
      <div>
${aboutBody}
      </div>
      <p class="about__more"><a class="link-arrow" href="${esc(about.moreLink)}">${esc(about.moreText)}</a></p>
    </div>
    <figure class="about__media reveal">
      ${lazyPicture(about.image, about.imageAlt)}
      <figcaption>${esc(about.caption)}</figcaption>
    </figure>
  </div>
</section>

<!-- ═══════════ SERVICE ═══════════ -->
<section class="service" id="service">
  <div class="wrap">
    <div class="sec-head sec-head--row reveal">
      <div>
        <p class="eyebrow">${esc(ss.eyebrow)}</p>
        <h2 class="h2">${esc(ss.heading)}</h2>
      </div>
      <p class="sec-head__desc">${esc(ss.desc)}</p>
    </div>

    <div class="service__grid" id="serviceGrid">
${services}
    </div>
  </div>
</section>

<!-- ═══════════ 보수보강 시공 범위 ═══════════ -->
<section class="scopes" id="scope">
  <div class="wrap">
    <div class="sec-head sec-head--row reveal">
      <div>
        <p class="eyebrow">${esc(sc.eyebrow)}</p>
        <h2 class="h2">${esc(sc.heading)}</h2>
      </div>
      <p class="sec-head__desc">${esc(sc.desc)}</p>
    </div>
    <ol class="scope-list">
${scopes}
    </ol>
  </div>
</section>

<!-- ═══════════ FEATURE (강점) ═══════════ -->
<section class="feature" id="feature">
  <div class="wrap feature__grid">
    <figure class="feature__media reveal">
      ${lazyPicture(fs_.image, fs_.imageAlt)}
    </figure>
    <div class="reveal">
      <p class="eyebrow">${esc(fs_.eyebrow)}</p>
      <h2 class="h2" style="margin-top:1.2em">${fs_.heading}</h2>
      <p class="feature__intro">${esc(fs_.intro)}</p>
      <div class="feat-list">
${features}
      </div>
    </div>
  </div>
</section>

<!-- ═══════════ WORKS ═══════════ -->
<section class="works" id="works">
  <div class="wrap">
    <div class="sec-head sec-head--row reveal">
      <div>
        <p class="eyebrow">${esc(ws.eyebrow)}</p>
        <h2 class="h2">${esc(ws.heading)}</h2>
      </div>
      <p class="sec-head__desc">${esc(ws.desc)}</p>
    </div>

    <div class="works__grid" id="worksGrid">
${works}
    </div>
    <div class="works__more">
      <a class="link-arrow" href="${esc(ws.moreLink)}">${esc(ws.moreText)}</a>
    </div>
  </div>
</section>

<!-- ═══════════ 기술자료 ═══════════ -->
<section class="docs" id="docs">
  <div class="wrap">
    <div class="sec-head sec-head--row reveal">
      <div>
        <p class="eyebrow">${esc(rs.eyebrow)}</p>
        <h2 class="h2">${esc(rs.heading)}</h2>
      </div>
      <p class="sec-head__desc">${esc(rs.desc)}</p>
    </div>
    <ul class="doc-list" id="docsList">
${docs}
    </ul>
    <div class="works__more">
      <a class="link-arrow" href="${esc(rs.moreLink)}">${esc(rs.moreText)}</a>
    </div>
  </div>
</section>

<!-- ═══════════ 관련 자재 구매 ═══════════ -->
<section class="materials" id="materials">
  <div class="wrap materials__inner reveal">
    <p class="eyebrow">${esc(ms.eyebrow)}</p>
    <h2 class="h2">${ms.heading}</h2>
    <p class="materials__desc">${esc(ms.desc)}</p>
    <p class="materials__more"><a class="link-arrow" href="${esc(ms.link)}">${esc(ms.linkText)}</a></p>
  </div>
</section>

<!-- ═══════════ CONTACT ═══════════ -->
<section class="contact" id="contact">
  <div class="wrap">
    <p class="eyebrow reveal">${esc(ct.eyebrow)}</p>
    <h2 class="contact__ttl reveal">${ct.heading}</h2>
    <p class="contact__desc reveal">${ct.desc}</p>
    <a class="contact__tel reveal" href="${esc(c.telHref)}">${esc(c.tel)}</a>
    <p class="contact__hours reveal">${esc(c.hours)}</p>
    <div class="contact__actions reveal">
      <a href="${esc(c.telHref)}">전화 상담</a>
      <a href="mailto:${esc(c.email)}">사진 상담</a>
      <a href="contact.html">견적 문의</a>
    </div>
  </div>
</section>

</main>

<!-- ═══════════ 푸터 ═══════════ -->
<footer class="footer">
  <div class="wrap footer__grid">
    <div class="footer__brand">
      <b>${esc(c.footerBrand || c.brand)}</b>
      <span>${esc(c.footerSummary)}</span>
      <p class="trust">${esc(c.trustLine)}</p>
      <p class="tel">${esc(c.tel)}</p>
      <p>${esc(c.address)}</p>
      <p>${esc(c.email)}</p>${legalLine() ? `
      <p>${esc(legalLine())}</p>` : ''}
    </div>
    <nav class="footer__col" aria-label="전문 분야">
      <h3>Service</h3>
      <ul>
${linkList(foot.serviceLinks)}
      </ul>
    </nav>
    <nav class="footer__col" aria-label="사이트">
      <h3>Site</h3>
      <ul>
${linkList(foot.siteLinks)}
      </ul>
    </nav>
    <nav class="footer__col" aria-label="채널">
      <h3>Channel</h3>
      <ul>
${linkList(channels)}
      </ul>
    </nav>
  </div>
  <div class="footer__bottom">
    <small>© <span id="year">2026</span> ${esc(c.footerBrand || c.brand)}. All rights reserved.</small>
    <small>${esc(c.slogan)}</small>
  </div>
</footer>

<script>
/* 홈 화면 동작만 남겼습니다 — 글과 사진은 이미 HTML 에 들어 있습니다.
   (모바일 메뉴 · 스크롤 등장 · 히어로 자동 넘김 · 연도 표시) */
(function(){
  "use strict";

  /* 모바일 메뉴 -------------------------------------------- */
  var burger=document.getElementById("burger");
  var nav=document.getElementById("nav");
  var mobileMenu=window.matchMedia("(max-width: 960px)");
  function closeMenu(returnFocus){
    nav.classList.remove("open");
    burger.setAttribute("aria-expanded","false");
    burger.setAttribute("aria-label","메뉴 열기");
    document.body.classList.remove("menu-open");
    nav.inert=mobileMenu.matches;
    if(returnFocus&&mobileMenu.matches)burger.focus();
  }
  function syncMenu(){
    closeMenu(false);
    nav.inert=mobileMenu.matches;
  }
  burger.addEventListener("click",function(){
    var open=!nav.classList.contains("open");
    if(!open){closeMenu(true);return;}
    nav.inert=false;
    nav.classList.add("open");
    burger.setAttribute("aria-expanded","true");
    burger.setAttribute("aria-label","메뉴 닫기");
    document.body.classList.add("menu-open");
  });
  nav.querySelectorAll("a").forEach(function(a){
    a.addEventListener("click",function(){
      if(mobileMenu.matches)closeMenu(true);
    });
  });
  document.addEventListener("keydown",function(e){
    if(e.key==="Escape"&&nav.classList.contains("open"))closeMenu(true);
  });
  if(mobileMenu.addEventListener)mobileMenu.addEventListener("change",syncMenu);
  else mobileMenu.addListener(syncMenu);
  syncMenu();

  /* 스크롤 등장 (IntersectionObserver) --------------------- */
  var reveals=document.querySelectorAll(".reveal");
  if("IntersectionObserver" in window){
    var io=new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target);}
      });
    },{threshold:0.12,rootMargin:"0px 0px -8% 0px"});
    reveals.forEach(function(el,i){
      el.style.transitionDelay=(i%4)*80+"ms";
      io.observe(el);
    });
  }else{
    reveals.forEach(function(el){el.classList.add("in");});
  }

  /* 히어로 슬라이더 ---------------------------------------- */
  var slides=Array.prototype.slice.call(document.querySelectorAll(".hero__slide"));
  var dots=Array.prototype.slice.call(document.querySelectorAll(".hero__dots button"));
  var cur=0,timer;

  /* 둘째 장부터는 주소만 적혀 있습니다(data-src). 필요할 때 채웁니다.
     source 의 srcset 을 먼저 넣어야 브라우저가 WebP 를 고를 수 있습니다. */
  function fill(n){
    var el=slides[n];
    if(!el)return;
    var s=el.querySelector("source[data-srcset]");
    if(s){s.srcset=s.getAttribute("data-srcset");s.removeAttribute("data-srcset");}
    var im=el.querySelector("img[data-src]");
    if(im){im.src=im.getAttribute("data-src");im.removeAttribute("data-src");}
  }
  /* 첫 화면을 다 그린 뒤 다음 장을 미리 준비합니다.
     (넘어가는 순간에 빈 화면이 보이지 않도록) */
  if(slides.length>1){
    if(document.readyState==="complete")fill(1);
    else window.addEventListener("load",function(){fill(1);});
  }

  function go(n){
    slides[cur].classList.remove("active");
    if(dots[cur])dots[cur].classList.remove("active");
    cur=(n+slides.length)%slides.length;
    fill(cur);
    fill((cur+1)%slides.length);   /* 그다음 장도 미리 */
    slides[cur].classList.add("active");
    if(dots[cur])dots[cur].classList.add("active");
  }
  function start(){timer=setInterval(function(){go(cur+1);},6000);}
  function reset(){clearInterval(timer);start();}
  dots.forEach(function(d){
    d.addEventListener("click",function(){go(+d.dataset.i);reset();});
  });
  if(slides.length>1)start();

  /* 연도 -------------------------------------------------- */
  document.getElementById("year").textContent=new Date().getFullYear();
})();
</script>
</body>
</html>
`;
}

/* ── 회사 entity 그래프 (홈에만 둡니다) ─────────────────────
   ProfessionalService 는 이미 LocalBusiness 의 하위 유형입니다.
   두 번째 LocalBusiness 를 만들지 않습니다. */
function buildOrganisationGraph() {
  const org = {
    /* ProfessionalService 는 Organization 의 하위 유형입니다. 두 이름을 함께 밝히는 것은
       같은 사실을 다시 말하는 것일 뿐, 노드를 하나 더 만들지 않습니다. 하위 유형을 따라
       올라가지 않는 도구도 이 노드를 회사로 알아보게 하려는 것입니다. */
    '@type': ['Organization', 'ProfessionalService'],
    '@id': ORG_ID,
    /* name 은 '검색결과에 나오는 이름'입니다 — 브랜드를 씁니다.
       법인명은 legalName 으로, 사람들이 함께 부르는 다른 이름은 alternateName 으로
       따로 밝힙니다. 셋을 구분해 두어야 검색엔진이 같은 주체로 묶습니다. */
    name: COMPANY.brand,
    legalName: COMPANY.legalName,
    alternateName: [COMPANY.shortName, COMPANY.name, COMPANY.nameEn].filter(Boolean),
    slogan: COMPANY.brandSubline,
    description: COMPANY.description,
    telephone: COMPANY.tel,
    email: COMPANY.email,
    url: SITE_URL,
    image: absUrl(SITE_URL, (SITE.meta && SITE.meta.image) || FALLBACK_IMAGE),
    logo: {
      '@type': 'ImageObject',
      url: absUrl(SITE_URL, 'assets/images/brand/logo.png')
    },
    address: {
      '@type': 'PostalAddress',
      streetAddress: COMPANY.streetAddress,
      addressLocality: COMPANY.addressLocality,
      addressRegion: COMPANY.addressRegion,
      addressCountry: 'KR'
    },
    areaServed: [
      { '@type': 'AdministrativeArea', name: '제주특별자치도' },
      { '@type': 'City', name: '제주시' },
      { '@type': 'City', name: '서귀포시' }
    ],
    knowsAbout: COMPANY.knowsAbout,
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: '전문 분야',
      itemListElement: [
        { '@type': 'Offer', itemOffered: { '@type': 'Service', name: '제주 노출콘크리트 보수·복원', description: '곰보·기포 면보수, 층조인트 단차 보정, 색상 및 질감 복원, 오염·백화 하자보수, 발수 및 표면 보호', url: absUrl(SITE_URL, 'concrete.html') } },
        { '@type': 'Offer', itemOffered: { '@type': 'Service', name: '제주 콘크리트 보수보강', description: '균열보수 및 에폭시 인젝션, 단면복구, 철근노출 및 박락 보수, 철판·강재보강, 탄소섬유보강, 보·슬래브·기둥 구조보강', url: absUrl(SITE_URL, 'reinforcement.html') } },
        { '@type': 'Offer', itemOffered: { '@type': 'Service', name: '인젝션 특수방수', description: '누수 경로 추적, 우레탄 인젝션, 배면 그라우팅, 액상고무 도막방수', url: absUrl(SITE_URL, 'waterproof.html') } },
        /* 세 전문 분야 아래의 공정별 상세 — 철판·강재보강은 허브의 해당 절, 나머지는 전용 페이지가 있습니다. */
        { '@type': 'Offer', itemOffered: { '@type': 'Service', name: '제주 철판보강 · 강재보강', description: '보·기둥·슬래브 등 기존 콘크리트 구조물의 철판보강 에폭시 주입공법 및 강재보강 시공. 강판 설치 후 콘크리트와 강판 사이에 에폭시 수지를 주입해 일체화. 보강 여부와 보강량은 구조기술자의 검토와 보강설계에 따름', url: absUrl(SITE_URL, 'reinforcement.html#steel') } },
        { '@type': 'Offer', itemOffered: { '@type': 'Service', name: '제주 에폭시 균열보수 · 저압주입', description: '비구조부 균열보수, 구조부 에폭시 저압주입, 에폭시 기계식 인젝션', url: absUrl(SITE_URL, 'epoxy-crack-repair.html') } },
        { '@type': 'Offer', itemOffered: { '@type': 'Service', name: '제주 탄소섬유 보강 · CFRP 구조보강', description: '구조검토와 보강설계에 따른 보·슬래브·기둥·벽체의 탄소섬유시트(CFRP) 부착 보강', url: absUrl(SITE_URL, 'carbon-fiber-reinforcement.html') } },
        { '@type': 'Offer', itemOffered: { '@type': 'Service', name: '제주 콘크리트 표면강화 · 발수코팅', description: '표면강화와 경화·분진억제, 침투형 발수코팅, 수분·염분 침투 저감', url: absUrl(SITE_URL, 'concrete-surface-protection.html') } },
        /* 콘채 제주총판 — 시공과 함께 자재를 공급합니다. 근거가 있는 사실만 적습니다. */
        { '@type': 'Offer', itemOffered: { '@type': 'Service', name: '노출콘크리트 면보수재 콘채 공급 · 기술지원', description: '제주도 콘채 총판. 노출콘크리트 보수재·색보정 마감재 공급과 배합·시공 기술지원', url: absUrl(SITE_URL, 'materials.html') } }
      ]
    },
    /* 같은 사업자가 운영하는 다른 웹 공간들. 자재 판매 사이트(storeUrl)도
       여기로만 연결합니다 — 이 사이트의 대표 주소로 쓰지 않습니다. */
    sameAs: [COMPANY.storeUrl]
      .concat(['blog', 'youtube', 'instagram']
        .map((k) => EXTERNAL_LINKS[k] && EXTERNAL_LINKS[k].url))
      .filter(Boolean)
  };

  /* 영업시간은 config.js 의 구조화된 값이 있을 때만 넣습니다.
     화면 문구에서 시간을 추측해 만들지 않습니다. */
  if (COMPANY.openingHours && COMPANY.openingHours.opens && COMPANY.openingHours.closes) {
    org.openingHoursSpecification = [{
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: COMPANY.openingHours.days,
      opens: COMPANY.openingHours.opens,
      closes: COMPANY.openingHours.closes
    }];
  }
  /* 아래 값들은 확인되기 전에는 넣지 않습니다 (config.js 의 TODO). */
  if (COMPANY.businessNumber) org.taxID = COMPANY.businessNumber;
  if (COMPANY.foundingDate) org.foundingDate = COMPANY.foundingDate;

  /* 대표자는 founder 로 넣지 않습니다.
     확인된 사실은 '현재 대표자'이지 '설립자'가 아닙니다. 둘은 다를 수 있고,
     schema.org 에는 한국의 '대표이사'에 정확히 대응하는 속성이 없습니다.
     그래서 사람 이름은 회사소개·푸터의 사업자 정보로만 표시하고,
     구조화데이터에는 확인되지 않은 관계를 만들지 않습니다. */

  if (COMPANY.geo && COMPANY.geo.latitude && COMPANY.geo.longitude) {
    org.geo = {
      '@type': 'GeoCoordinates',
      latitude: COMPANY.geo.latitude,
      longitude: COMPANY.geo.longitude
    };
  }

  const website = {
    '@type': 'WebSite',
    '@id': SITE_ID,
    url: SITE_URL,
    name: COMPANY.brand,
    alternateName: '제주 노출콘크리트',
    inLanguage: 'ko-KR',
    publisher: { '@id': ORG_ID }
  };

  return jsonld({ '@context': 'https://schema.org', '@graph': [org, website] });
}

/* ── sitemap ───────────────────────────────────────────────── */
const STATIC_PAGES = [
  ['', 'weekly', '1.0'],
  ['concrete.html', 'monthly', '0.9'],
  ['reinforcement.html', 'monthly', '0.9'],
  ['waterproof.html', 'monthly', '0.9'],
  /* 공정별 상세 페이지 — 서비스 3축 아래의 세부 공법입니다.
     상위 서비스 페이지보다 한 단계 낮은 우선순위를 둡니다. */
  ['carbon-fiber-reinforcement.html', 'monthly', '0.8'],
  ['epoxy-crack-repair.html', 'monthly', '0.8'],
  ['concrete-surface-protection.html', 'monthly', '0.8'],
  ['projects.html', 'weekly', '0.9'],
  ['resources.html', 'weekly', '0.8'],
  ['materials.html', 'monthly', '0.7'],
  ['about.html', 'yearly', '0.6'],
  ['contact.html', 'yearly', '0.7']
];

function buildSitemap(casePages, guidePages) {
  const rows = [];
  rows.push('<?xml version="1.0" encoding="UTF-8"?>');
  rows.push('<!--');
  rows.push('  이 파일은 tools/build-site.js 가 만듭니다. 직접 고치지 마세요.');
  rows.push('  주소는 assets/js/config.js 의 COMPANY.siteUrl 하나에서 나옵니다.');
  rows.push('-->');
  rows.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');

  STATIC_PAGES.forEach(([rel, freq, pri]) => {
    rows.push(`  <url><loc>${absUrl(SITE_URL, rel)}</loc><changefreq>${freq}</changefreq><priority>${pri}</priority></url>`);
  });

  rows.push('');
  rows.push('  <!-- 기술자료 상세 -->');
  guidePages.forEach((g) => {
    const lastmod = g.date ? `<lastmod>${g.date}</lastmod>` : '';
    rows.push(`  <url><loc>${g.canonical}</loc>${lastmod}<priority>0.6</priority></url>`);
  });

  rows.push('');
  rows.push('  <!-- 시공사례 상세 -->');
  casePages.forEach((cp) => {
    const lastmod = cp.date ? `<lastmod>${cp.date}</lastmod>` : '';
    rows.push(`  <url><loc>${cp.canonical}</loc>${lastmod}<priority>0.6</priority></url>`);
  });

  rows.push('</urlset>');
  return rows.join('\n') + '\n';
}

/* ── 옛 주소 → 새 주소 표 (호환용 shim 이 씁니다) ──────────── */
function buildLegacyRoutes(casePages) {
  const caseMap = {};
  PROJECTS.forEach((p) => { caseMap[p.id] = casePath(p.id); });
  /* 별칭도 최종 목적지로 바로 보냅니다. */
  Object.entries(PROJECT_ALIASES || {}).forEach(([from, to]) => {
    if (caseMap[to]) caseMap[from] = caseMap[to];
  });
  const guideMap = {};
  RESOURCES.forEach((r) => { guideMap[r.id] = guidePath(r.id); });

  return `/* ============================================================
   legacy-routes.js — 옛 주소 → 새 주소 (자동 생성 · 직접 고치지 마세요)
   ------------------------------------------------------------
   생성: node tools/build-site.js --write

   예전 주소를 그대로 살려 두기 위한 표입니다.
     project.html?id=<id>   →  case/<slug>.html
     resource.html?id=<id>  →  guide/<id>.html

   목록에 없는 id 는 은퇴했거나 존재한 적이 없는 주소이므로
   해당 목록 페이지로 보냅니다. shim 자체는 noindex 입니다.
   ============================================================ */
var LEGACY_CASE_ROUTES = ${JSON.stringify(caseMap, null, 2)};

var LEGACY_GUIDE_ROUTES = ${JSON.stringify(guideMap, null, 2)};

var RETIRED_CASE_IDS = ${JSON.stringify(RETIRED_PROJECT_IDS || [], null, 2)};
`;
}

/* ── 실행 ──────────────────────────────────────────────────── */
function main() {
  const sorted = PROJECTS.slice().sort(byRecencyDesc);
  const casePages = sorted.map((p, i) => buildCasePage(p, sorted, i));
  const guidePages = RESOURCES.slice().sort(byRecencyDesc).map(buildGuidePage);

  const outputs = [];
  casePages.forEach((c) => outputs.push([c.rel, c.html]));
  guidePages.forEach((g) => outputs.push([g.rel, g.html]));
  outputs.push(['index.html', buildHome()]);
  outputs.push(['sitemap.xml', buildSitemap(casePages, guidePages)]);
  outputs.push(['assets/js/legacy-routes.js', buildLegacyRoutes(casePages)]);
  outputs.push(['.nojekyll', '']);

  /* 손으로 쓴 페이지는 여러 단계를 거칩니다 (껍데기 → 목록 → 위젯).
     각 단계가 파일을 따로 읽어 따로 쓰면 마지막 단계만 남고 앞 단계가
     지워집니다. 그래서 한 장의 내용을 메모리에서 이어 넘깁니다. */
  const pageText = new Map();
  const readPage = (f) => (pageText.has(f) ? pageText.get(f) : D.readRepo(f));

  /* 1단계 — 머리말 · 꼬리말을 render.js 로 통일합니다 (브랜드 일관성) */
  const shells = SHELL_PAGES.filter((f) => fileExists(f)).map((f) => syncShell(f, readPage(f)));
  shells.forEach((s) => pageText.set(s.file, s.next));

  /* 2단계 — 목록 페이지의 카드 */
  const grids = [
    injectGrid('projects.html', 'case', readPage('projects.html')),
    injectGrid('resources.html', 'technical', readPage('resources.html'))
  ];
  grids.forEach((g) => pageText.set(g.file, g.next));

  /* 3단계 — 서비스 · 자재 페이지의 관련 콘텐츠 위젯을 정적으로 채웁니다.
     (projects/resources 는 위에서 이미 처리했으므로 제외) */
  const WIDGET_PAGES = ['concrete.html', 'reinforcement.html', 'waterproof.html',
    'carbon-fiber-reinforcement.html', 'epoxy-crack-repair.html', 'concrete-surface-protection.html',
    'materials.html', 'about.html', 'contact.html'];
  const widgets = WIDGET_PAGES.filter((f) => fileExists(f))
    .map((f) => fillWidgets(f, readPage(f))).filter((w) => w.filled);
  widgets.forEach((w) => pageText.set(w.file, w.next));

  pageText.forEach((text, file) => outputs.push([file, text]));

  /* 4단계 — 모든 페이지의 JS · CSS 주소에 내용 해시를 찍습니다.
     생성 페이지와 손으로 쓴 페이지를 한자리에서 함께 처리해야
     같은 파일이 페이지마다 다른 주소로 갈리지 않습니다. */
  for (let i = 0; i < outputs.length; i++) {
    if (/\.html$/.test(outputs[i][0])) outputs[i][1] = stampAssets(outputs[i][1]);
  }

  console.log('base url        : ' + SITE_URL + (BASE_ARG ? '   (--base 로 지정)' : '   (config.js)'));
  const shellChanged = shells.filter((s) => s.changed.length);
  console.log('머리말·꼬리말   : ' + shells.length + '쪽 대조' +
    (shellChanged.length ? '  → 갱신 ' + shellChanged.map((s) => s.file).join(', ') : '  → 모두 일치'));
  console.log('시공사례 페이지 : ' + casePages.length + '건  → case/');
  console.log('기술자료 페이지 : ' + guidePages.length + '건  → guide/');
  grids.forEach((g) => {
    console.log(`목록 정적화     : ${g.file}  ${g.rendered}/${g.total}건을 HTML 로 (나머지는 '더 보기')`);
  });
  widgets.forEach((w) => {
    console.log(`관련 링크 정적화: ${w.file}  ${w.filled}블록 · ${w.items}건`);
  });
  console.log('sitemap 항목    : ' + (STATIC_PAGES.length + casePages.length + guidePages.length) + '건');

  /* 참조 이미지가 실제로 있는지 — 없으면 생성 자체를 중단합니다. */
  const missing = [];
  casePages.concat(guidePages).forEach((page) => {
    const re = /<img\b[^>]*\bsrc="\.\.\/([^"]+)"/g;
    let m;
    while ((m = re.exec(page.html))) {
      if (!/^https?:/.test(m[1]) && !fileExists(m[1])) missing.push(`${page.rel} → ${m[1]}`);
    }
  });
  if (missing.length) {
    console.log(`\n■ 이미지 파일 없음 (${missing.length}개) — 생성을 중단합니다.`);
    missing.slice(0, 20).forEach((s) => console.log('  ✗ ' + s));
    process.exit(1);
  }

  if (!WRITE) {
    console.log('\n미리보기입니다. 실제로 반영하려면 --write 를 붙이세요.');
    return;
  }

  /* 지워진 사례의 페이지가 남지 않도록 생성 폴더를 먼저 비웁니다. */
  ['case', 'guide'].forEach((dir) => {
    const abs = path.join(REPO_ROOT, dir);
    if (!fs.existsSync(abs)) return;
    const keep = new Set(outputs.map(([rel]) => rel));
    fs.readdirSync(abs).forEach((f) => {
      if (!keep.has(dir + '/' + f)) {
        fs.unlinkSync(path.join(abs, f));
        console.log('  - 삭제 ' + dir + '/' + f);
      }
    });
  });

  let changed = 0;
  outputs.forEach(([rel, content]) => { if (writeFileIfChanged(rel, content)) changed++; });
  console.log(`\n${outputs.length}개 파일 중 ${changed}개를 새로 썼습니다.`);
  console.log('이어서 node tools/check-site.js 로 검증하세요.');
}

main();
