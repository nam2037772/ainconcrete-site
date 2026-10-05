#!/usr/bin/env node
/* ============================================================
   tools/check-site.js — 배포 전 사이트 검증
   ------------------------------------------------------------
   빌드 서버가 없는 사이트이므로, 올리기 전에 이 스크립트로 확인합니다.

     node tools/build-site.js --write
     node tools/check-cases.js     # 사례 데이터 · 이미지 분류
     node tools/check-site.js      # 생성된 페이지 (이 파일)

   검사 항목
      1. 홈 화면이 자바스크립트 없이도 H1 과 본문을 갖는가
      2. 시공사례 정적 파일이 데이터 건수만큼 있는가
      3. 기술자료 정적 파일이 데이터 건수만큼 있는가
      4. 생성된 페이지의 <title> 이 모두 다른가
      5. canonical 이 자기 자신을 가리키는가
      6. sitemap 에 ?id= 상세 주소가 남아 있지 않은가
      7. sitemap 의 주소가 모두 실제 파일인가
      8. 자료에 날짜가 있는 항목에 lastmod 가 있는가
      9. 정적 링크만 따라가도 모든 상세 페이지에 닿는가
     10. 발행된 사례 · 기술자료 중 고아가 없는가
     11. 생성되지 않은 주소는 파일이 없는가 (404 로 떨어짐)
     12. 옛 id 가 새 주소로 연결되는가
     13. 깨진 내부 이미지 참조가 없는가
     14. 조직 @id 가 사이트에 하나뿐인가
     15. 모든 JSON-LD 가 파싱되는가
     16. 카드 이미지가 case-images 규칙과 같은가
     17. 낡은 흔적(?id= 링크 · meta keywords · 렌더링 차단 글꼴)이 없는가
     18. 생성 마크업이 가로 스크롤을 만들지 않는가 (폭 고정 요소 검사)
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const D = require('./lib/site-data');
const { REPO_ROOT, casePath, guidePath, caseSlug } = D;

const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(REPO_ROOT, rel));

let checks = 0, failures = 0;
function ok(msg) { checks++; console.log('  ✓ ' + msg); }
function fail(msg) { checks++; failures++; console.log('  ✗ ' + msg); }
function assert(cond, msg) { cond ? ok(msg) : fail(msg); }

const data = D.loadData();
const { COMPANY, PROJECTS, PROJECT_ALIASES, RESOURCES, CONTENT, CaseImages } = data;
const SITE_URL = D.siteUrlOf(COMPANY);

const ROOT_PAGES = ['index.html', 'concrete.html', 'reinforcement.html', 'waterproof.html',
  'carbon-fiber-reinforcement.html', 'epoxy-crack-repair.html', 'concrete-surface-protection.html',
  'steel-plate-reinforcement.html', 'vintage-concrete-finish.html',
  'projects.html',
  'resources.html', 'materials.html', 'about.html', 'contact.html',
  'privacy.html', '404.html', 'project.html', 'resource.html'];

const casePages = PROJECTS.map((p) => casePath(p.id));
const guidePages = RESOURCES.map((r) => guidePath(r.id));
const generated = casePages.concat(guidePages);

/* 태그를 걷어내고 사람이 읽는 글자만 남깁니다 (script/style 제외). */
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}
function tagText(html, tag) {
  const m = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i').exec(html);
  return m ? visibleText(m[1]) : '';
}
function attrOf(html, re) {
  const m = re.exec(html);
  return m ? m[1] : '';
}

/* ── 1. 홈 화면이 자바스크립트 없이도 읽히는가 ─────────────── */
console.log('\n[1] 홈 화면 정적 렌더링');
{
  const home = read('index.html');
  const h1 = tagText(home, 'h1');
  assert(h1.length > 0, `홈 H1 이 HTML 안에 있음: "${h1.slice(0, 40)}"`);

  const h2s = (home.match(/<h2[^>]*>[\s\S]*?<\/h2>/gi) || []).map(visibleText).filter(Boolean);
  assert(h2s.length >= 6, `홈 H2 ${h2s.length}개가 모두 채워져 있음`);

  /* <script> 를 지운 뒤 남는 글자 = 자바스크립트 없이 보이는 분량 */
  const body = home.slice(home.indexOf('<body'));
  const text = visibleText(body);
  assert(text.length > 1200, `자바스크립트 없이 읽히는 본문 ${text.length}자`);

  const emptyHeading = /<h[123][^>]*>\s*<\/h[123]>/i.test(body);
  assert(!emptyHeading, '빈 제목 태그 없음');

  ['projects.js', 'resources.js', 'case-images.js'].forEach((f) => {
    assert(home.indexOf(f) === -1, `홈에서 ${f} 를 더 이상 불러오지 않음`);
  });
}

/* ── 2·3. 생성 파일 개수 ───────────────────────────────────── */
console.log('\n[2] 생성 파일');
{
  const missingCases = casePages.filter((f) => !exists(f));
  assert(missingCases.length === 0,
    `시공사례 정적 파일 ${casePages.length}/${PROJECTS.length}건${missingCases.length ? ' — 없음: ' + missingCases.slice(0, 3).join(', ') : ''}`);

  const missingGuides = guidePages.filter((f) => !exists(f));
  assert(missingGuides.length === 0,
    `기술자료 정적 파일 ${guidePages.length}/${RESOURCES.length}건${missingGuides.length ? ' — 없음: ' + missingGuides.slice(0, 3).join(', ') : ''}`);

  /* 데이터에 없는 페이지가 폴더에 남아 있지 않은지 */
  const strays = [];
  ['case', 'guide'].forEach((dir) => {
    if (!exists(dir)) return;
    fs.readdirSync(path.join(REPO_ROOT, dir)).forEach((f) => {
      if (generated.indexOf(dir + '/' + f) === -1) strays.push(dir + '/' + f);
    });
  });
  assert(strays.length === 0,
    `데이터에 없는 잔여 페이지 없음${strays.length ? ' — ' + strays.join(', ') : ''}`);
}

/* ── 4·5. title / canonical ────────────────────────────────── */
console.log('\n[3] title · canonical');
const pageInfo = new Map();
{
  const all = ROOT_PAGES.filter(exists).concat(generated);
  all.forEach((rel) => {
    const html = read(rel);
    pageInfo.set(rel, {
      html,
      title: tagText(html, 'title'),
      canonical: attrOf(html, /<link rel="canonical" href="([^"]+)"/),
      robots: attrOf(html, /<meta name="robots" content="([^"]+)"/)
    });
  });

  /* 색인되는 페이지만 제목 중복을 봅니다 (noindex shim 은 제외) */
  const indexable = all.filter((r) => (pageInfo.get(r).robots || '').indexOf('noindex') === -1);
  const byTitle = new Map();
  indexable.forEach((r) => {
    const t = pageInfo.get(r).title;
    if (!byTitle.has(t)) byTitle.set(t, []);
    byTitle.get(t).push(r);
  });
  const dupes = [...byTitle.entries()].filter(([, v]) => v.length > 1);
  assert(dupes.length === 0,
    `색인 대상 ${indexable.length}쪽의 <title> 이 모두 다름${dupes.length ? ' — 중복: ' + dupes.map(([t, v]) => `${v.join('/')} "${t}"` ).join(' | ') : ''}`);

  const emptyTitle = indexable.filter((r) => !pageInfo.get(r).title);
  assert(emptyTitle.length === 0, '빈 <title> 없음');

  /* canonical 이 자기 자신을 가리키는가 (?id= 같은 파라미터가 붙지 않았는가) */
  const badCanon = [];
  generated.forEach((rel) => {
    const want = SITE_URL + rel;
    if (pageInfo.get(rel).canonical !== want) badCanon.push(`${rel} → ${pageInfo.get(rel).canonical}`);
  });
  assert(badCanon.length === 0,
    `생성 페이지 ${generated.length}쪽의 canonical 이 자기 자신${badCanon.length ? ' — ' + badCanon.slice(0, 3).join(', ') : ''}`);

  const paramCanon = all.filter((r) => /[?&]id=/.test(pageInfo.get(r).canonical));
  assert(paramCanon.length === 0, 'canonical 에 ?id= 가 남아 있지 않음');
}

/* ── 6·7·8. sitemap ────────────────────────────────────────── */
console.log('\n[4] sitemap');
{
  const xml = read('sitemap.xml');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  assert(!/[?&]id=/.test(xml), `sitemap 에 ?id= 상세 주소 없음 (${locs.length}건 중 0건)`);

  const outside = locs.filter((u) => u.indexOf(SITE_URL) !== 0);
  assert(outside.length === 0, `모든 주소가 사이트 기준(${SITE_URL})`);

  const missing = locs.map((u) => u.slice(SITE_URL.length))
    .filter((rel) => rel && !exists(rel));
  assert(missing.length === 0,
    `sitemap 주소가 모두 실제 파일${missing.length ? ' — 없음: ' + missing.slice(0, 3).join(', ') : ''}`);

  /* 색인 대상인데 sitemap 에 빠진 페이지 */
  const listed = new Set(locs.map((u) => u.slice(SITE_URL.length) || 'index.html'));
  const shouldList = generated.concat(
    ROOT_PAGES.filter((r) => exists(r) && (pageInfo.get(r).robots || '').indexOf('noindex') === -1)
  );
  const notListed = shouldList.filter((r) => !listed.has(r));
  assert(notListed.length === 0,
    `색인 대상이 모두 sitemap 에 있음${notListed.length ? ' — 빠짐: ' + notListed.join(', ') : ''}`);

  /* sitemap 에 들어간 noindex 페이지가 없는지 */
  const noindexListed = [...listed].filter((r) =>
    pageInfo.has(r) && (pageInfo.get(r).robots || '').indexOf('noindex') > -1);
  assert(noindexListed.length === 0,
    `noindex 페이지가 sitemap 에 없음${noindexListed.length ? ' — ' + noindexListed.join(', ') : ''}`);

  /* lastmod — 자료에 날짜가 있는 항목에는 반드시 있어야 합니다 */
  const dated = RESOURCES.filter((r) => r.date).map((r) => SITE_URL + guidePath(r.id))
    .concat(PROJECTS.filter((p) => p.date).map((p) => SITE_URL + casePath(p.id)));
  const blocks = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
  const lastmodOf = new Map();
  blocks.forEach((b) => {
    const loc = /<loc>([^<]+)<\/loc>/.exec(b);
    const lm = /<lastmod>([^<]+)<\/lastmod>/.exec(b);
    if (loc) lastmodOf.set(loc[1], lm ? lm[1] : '');
  });
  const noLastmod = dated.filter((u) => !lastmodOf.get(u));
  assert(noLastmod.length === 0,
    `날짜가 있는 ${dated.length}건에 lastmod 존재${noLastmod.length ? ' — 빠짐: ' + noLastmod.length + '건' : ''}`);

  const badFormat = [...lastmodOf.values()].filter((v) => v && !/^\d{4}-\d{2}(-\d{2})?$/.test(v));
  assert(badFormat.length === 0, 'lastmod 날짜 형식 정상');
}

/* ── 9·10. 정적 링크로 도달 가능한가 (고아 없음) ───────────── */
console.log('\n[5] 정적 내부 링크 · 고아 페이지');
{
  /* 각 페이지의 href 를 문서 기준으로 풀어 사이트 상대경로로 만듭니다. */
  function linksOf(rel, html) {
    const dir = path.posix.dirname(rel.replace(/\\/g, '/'));
    return [...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((h) => !/^(https?:|mailto:|tel:|#|javascript:)/i.test(h))
      .map((h) => h.split('#')[0].split('?')[0])
      .filter(Boolean)
      .map((h) => path.posix.normalize(dir === '.' ? h : dir + '/' + h));
  }

  const reachable = new Set();
  const allPages = ROOT_PAGES.filter(exists).concat(generated);
  allPages.forEach((rel) => {
    linksOf(rel, pageInfo.get(rel).html).forEach((t) => reachable.add(t));
  });

  const orphanCases = casePages.filter((f) => !reachable.has(f));
  assert(orphanCases.length === 0,
    `시공사례 ${casePages.length}건 모두 정적 링크로 도달 가능${orphanCases.length ? ' — 고아: ' + orphanCases.slice(0, 3).join(', ') : ''}`);

  const orphanGuides = guidePages.filter((f) => !reachable.has(f));
  assert(orphanGuides.length === 0,
    `기술자료 ${guidePages.length}건 모두 정적 링크로 도달 가능${orphanGuides.length ? ' — 고아: ' + orphanGuides.slice(0, 3).join(', ') : ''}`);

  /* 링크가 가리키는 파일이 실제로 있는가 (깨진 링크) */
  const broken = [];
  allPages.forEach((rel) => {
    linksOf(rel, pageInfo.get(rel).html).forEach((t) => {
      if (!exists(t)) broken.push(`${rel} → ${t}`);
    });
  });
  assert(broken.length === 0,
    `내부 링크 깨짐 없음${broken.length ? ' — ' + broken.slice(0, 5).join(', ') : ''}`);

  /* 서비스 → 기술자료 → 사례 → 자재 의 정적 연결이 실제로 있는가.
     ※ 지금 공개된 사례는 모두 '노출콘크리트' 입니다. 특수방수 사례가 없는데
        있는 것처럼 링크하지 않기 위해, 페이지마다 기대치를 따로 둡니다. */
  const EXPECT = {
    'concrete.html':      { cases: 3, guides: 3, material: true },
    /* 인젝션·특수방수 기술자료는 2건뿐입니다(균열보수는 콘크리트 보수보강으로 이동) —
       없는 것을 있는 것처럼 기대치를 부풀리지 않습니다. */
    'waterproof.html':    { cases: 3, guides: 2, material: true },
    /* 보수보강 기술자료는 1건뿐입니다(공개 사례가 아직 없어 사례 링크는 기대하지 않습니다) */
    'reinforcement.html': { cases: 0, guides: 1, material: true },
    /* 공정별 상세 페이지 — 아직 해당 공정의 공개 사례가 없으므로 사례 링크는
       기대하지 않습니다. 관련 기술자료는 페이지마다 골라 둔 2건 이상이 있어야
       합니다(없는 실적 대신 근거가 되는 자료로 잇습니다). */
    'carbon-fiber-reinforcement.html': { cases: 0, guides: 2, material: true },
    'epoxy-crack-repair.html':         { cases: 0, guides: 2, material: true },
    'concrete-surface-protection.html':{ cases: 0, guides: 2, material: true },
    /* 철판보강은 공개할 수 있는 완료 사례가 아직 없습니다 — 사례 링크를 기대하지 않습니다. */
    'steel-plate-reinforcement.html':  { cases: 0, guides: 2, material: true },
    /* 빈티지마감은 실제 콘채 질감마감 사례(석고보드·상가·식당 등)로 잇습니다. */
    'vintage-concrete-finish.html':    { cases: 3, guides: 1, material: true },
    'materials.html':     { cases: 3, guides: 3, material: false }
  };
  Object.entries(EXPECT).forEach(([page, want]) => {
    const links = linksOf(page, pageInfo.get(page).html);
    const toCase = links.filter((h) => h.indexOf('case/') === 0).length;
    const toGuide = links.filter((h) => h.indexOf('guide/') === 0).length;
    const toMaterial = links.indexOf('materials.html') > -1;
    const okAll = toCase >= want.cases && toGuide >= want.guides &&
                  (!want.material || toMaterial);
    assert(okAll,
      `${page} 정적 연결 — 사례 ${toCase}건 · 기술자료 ${toGuide}건` +
      (want.material ? ` · 자재 ${toMaterial ? '연결' : '없음'}` : ''));
  });
}

/* ── 11·12. 생성되지 않은 주소 / 옛 주소 호환 ──────────────── */
console.log('\n[6] 주소 호환');
{
  assert(!exists('case/does-not-exist.html') && !exists('guide/does-not-exist.html'),
    '없는 상세 주소는 파일이 없음 → GitHub Pages 가 404.html 로 응답');

  const routes = read('assets/js/legacy-routes.js');
  const box = {};
  new (require('vm').Script)(routes + ';({LEGACY_CASE_ROUTES,LEGACY_GUIDE_ROUTES,RETIRED_CASE_IDS})')
    .runInNewContext(box);
  const { LEGACY_CASE_ROUTES, LEGACY_GUIDE_ROUTES } = box.__proto__ === undefined ? box : box;
  const R = new (require('vm').Script)(routes + ';({c:LEGACY_CASE_ROUTES,g:LEGACY_GUIDE_ROUTES,r:RETIRED_CASE_IDS})')
    .runInNewContext({});

  const missingCaseRoute = PROJECTS.filter((p) => R.c[p.id] !== casePath(p.id));
  assert(missingCaseRoute.length === 0,
    `옛 사례 id ${PROJECTS.length}건이 새 주소로 연결됨`);

  const aliasKeys = Object.keys(PROJECT_ALIASES || {});
  const badAlias = aliasKeys.filter((k) => !R.c[k] || !exists(R.c[k]));
  assert(badAlias.length === 0,
    `사례 별칭 ${aliasKeys.length}건도 새 주소로 연결됨${badAlias.length ? ' — ' + badAlias.join(', ') : ''}`);

  const missingGuideRoute = RESOURCES.filter((r) => R.g[r.id] !== guidePath(r.id));
  assert(missingGuideRoute.length === 0,
    `옛 기술자료 id ${RESOURCES.length}건이 새 주소로 연결됨`);

  const deadTarget = Object.values(R.c).concat(Object.values(R.g)).filter((t) => !exists(t));
  assert(deadTarget.length === 0, '주소표의 목적지가 모두 실제 파일');

  ['project.html', 'resource.html'].forEach((f) => {
    const html = pageInfo.get(f).html;
    assert((pageInfo.get(f).robots || '').indexOf('noindex') > -1, `${f} 는 noindex`);
    assert(html.indexOf('legacy-routes.js') > -1, `${f} 가 주소표를 불러옴`);
    assert(visibleText(html.slice(html.indexOf('<body'))).length < 200,
      `${f} 에 색인될 만한 본문이 없음`);
  });
}

/* ── 13. 이미지 참조 ───────────────────────────────────────── */
console.log('\n[7] 이미지 참조');
{
  /* <style>·<script> 안의 글자는 마크업이 아닙니다.
     (홈은 CSS 를 본문에 넣어 두어, 주석에 적힌 <img> 같은 글자가
      진짜 이미지로 잘못 잡힐 수 있습니다) */
  const markupOf = (rel) => pageInfo.get(rel).html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ');

  const broken = [];
  let total = 0, noSize = 0;
  const allPages = ROOT_PAGES.filter(exists).concat(generated);
  allPages.forEach((rel) => {
    const dir = path.posix.dirname(rel.replace(/\\/g, '/'));
    /* src 로 바로 넣은 것과, 넘길 때 채우는 것(data-src)·WebP 후보(srcset)를
       모두 같은 기준으로 확인합니다 — 어느 쪽이든 파일이 없으면 깨집니다. */
    [...markupOf(rel).matchAll(/<(?:img|source)\b([^>]*)>/g)].forEach((m) => {
      const tag = m[1];
      const isImg = /^<img/i.test(m[0]);
      /* srcset 은 "경로 1000w, 경로 1600w" 처럼 후보를 여러 개 담을 수 있습니다.
         값 전체를 경로 하나로 보면 실제로 있는 파일도 '없음' 으로 잡힙니다.
         쉼표로 나눈 뒤 뒤에 붙는 크기·배율 서술자를 떼고 확인합니다. */
      const plain = ['src', 'data-src']
        .map((k) => attrOf(tag, new RegExp('\\b' + k + '="([^"]+)"')))
        .filter(Boolean);
      const sets = ['srcset', 'data-srcset']
        .map((k) => attrOf(tag, new RegExp('\\b' + k + '="([^"]+)"')))
        .filter(Boolean)
        .reduce((acc, v) => acc.concat(
          v.split(',').map((c) => c.trim().split(/\s+/)[0]).filter(Boolean)
        ), []);
      const refs = plain.concat(sets);
      refs.forEach((src) => {
        if (/^(https?:|data:)/i.test(src)) return;
        total++;
        const target = path.posix.normalize(dir === '.' ? src : dir + '/' + src);
        if (!exists(target)) broken.push(`${rel} → ${src}`);
      });
      /* 크기 속성은 <img> 에만 해당합니다 */
      if (isImg && refs.length && (!/\bwidth="/.test(tag) || !/\bheight="/.test(tag))) noSize++;
    });
  });
  assert(broken.length === 0,
    `내부 이미지 ${total}개 모두 존재${broken.length ? ' — 없음: ' + broken.slice(0, 5).join(', ') : ''}`);
  assert(noSize === 0, `모든 이미지에 width/height 있음 (레이아웃 밀림 방지)${noSize ? ` — ${noSize}개 빠짐` : ''}`);

  /* alt 누락 — 장식용 빈 alt("") 는 정상입니다 */
  let noAlt = 0;
  allPages.forEach((rel) => {
    [...markupOf(rel).matchAll(/<img\b([^>]*)>/g)].forEach((m) => {
      if (!/\balt=/.test(m[1])) noAlt++;
    });
  });
  assert(noAlt === 0, `모든 이미지에 alt 속성 있음${noAlt ? ` — ${noAlt}개 빠짐` : ''}`);
}

/* ── 14·15. 구조화 데이터 ──────────────────────────────────── */
console.log('\n[8] 구조화 데이터 (JSON-LD)');
{
  let blocks = 0, orgNodes = 0, siteNodes = 0;
  const parseErrors = [];
  const allPages = ROOT_PAGES.filter(exists).concat(generated);

  allPages.forEach((rel) => {
    [...pageInfo.get(rel).html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .forEach((m) => {
        blocks++;
        let obj;
        try { obj = JSON.parse(m[1]); }
        catch (e) { parseErrors.push(`${rel}: ${e.message}`); return; }

        const nodes = obj['@graph'] || [obj];
        nodes.forEach((n) => {
          if (n['@id'] && n['@id'].indexOf('#organization') > -1 && n['@type']) orgNodes++;
          if (n['@id'] && n['@id'].indexOf('#website') > -1 && n['@type']) siteNodes++;
        });
      });
  });

  assert(parseErrors.length === 0,
    `JSON-LD ${blocks}블록 모두 파싱 성공${parseErrors.length ? ' — ' + parseErrors.slice(0, 3).join(' | ') : ''}`);
  assert(orgNodes === 1, `조직 노드(#organization) 정의가 사이트에 하나뿐 (${orgNodes}개)`);
  assert(siteNodes === 1, `WebSite 노드 정의가 하나뿐 (${siteNodes}개)`);

  /* @id 로 조직을 참조하는 페이지들이 같은 주소를 쓰는지 */
  const orgId = SITE_URL + '#organization';
  const refs = [];
  allPages.forEach((rel) => {
    const html = pageInfo.get(rel).html;
    [...html.matchAll(/"@id":\s*"([^"]*#organization)"/g)].forEach((m) => {
      if (m[1] !== orgId) refs.push(`${rel} → ${m[1]}`);
    });
  });
  assert(refs.length === 0,
    `조직 참조가 모두 같은 @id${refs.length ? ' — 어긋남: ' + refs.slice(0, 3).join(', ') : ''}`);

  /* 만들지 않기로 한 마크업이 들어가지 않았는지 */
  const forbidden = ['AggregateRating', '"Review"', '"HowTo"', '"FAQPage"', '"priceCurrency"'];
  const found = [];
  allPages.forEach((rel) => {
    const ld = [...pageInfo.get(rel).html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => m[1]).join('');
    forbidden.forEach((f) => { if (ld.indexOf(f.replace(/"/g, '')) > -1 && ld.indexOf(f) > -1) found.push(`${rel}: ${f}`); });
  });
  assert(found.length === 0,
    `근거 없는 마크업(Review·평점·가격·FAQ·HowTo) 없음${found.length ? ' — ' + found.join(', ') : ''}`);
}

/* ── 16. 카드 이미지가 case-images 규칙과 같은가 ───────────── */
console.log('\n[9] 카드 이미지 = case-images 규칙');
{
  const grid = read('projects.html');
  const region = grid.slice(grid.indexOf('<!-- BUILD:grid -->'), grid.indexOf('<!-- /BUILD:grid -->'));
  const cards = [...region.matchAll(/href="(case\/[^"]+)"[\s\S]*?<img src="([^"]+)"/g)];

  let bad = 0;
  cards.forEach(([, href, src]) => {
    const slug = href.replace(/^case\//, '').replace(/\.html$/, '');
    const p = PROJECTS.find((x) => caseSlug(x.id) === slug);
    if (!p) { bad++; return; }
    const want = CaseImages.normalize(p).representativeImage;
    if (src !== want) bad++;
  });
  assert(cards.length > 0 && bad === 0,
    `목록 카드 ${cards.length}장의 이미지가 정규화 대표 이미지와 일치`);

  /* 상세 페이지의 시공 전/중/후 사진 수가 데이터와 같은가 */
  let mismatch = 0;
  PROJECTS.forEach((p) => {
    const html = read(casePath(p.id));
    const ci = CaseImages.normalize(p);
    ['before', 'process', 'after'].forEach((role) => {
      const list = ci[role + 'Images'];
      const present = list.filter((s) => html.indexOf('../' + s) > -1).length;
      if (present !== list.length) mismatch++;
    });
  });
  assert(mismatch === 0, `상세 ${PROJECTS.length}쪽의 시공 전·중·후 사진이 데이터와 일치`);
}

/* ── 17. 낡은 흔적 ─────────────────────────────────────────── */
console.log('\n[10] 낡은 흔적');
{
  const allPages = ROOT_PAGES.filter(exists).concat(generated);
  const withParamLink = allPages.filter((rel) =>
    /href="[^"]*(project|resource)\.html\?id=/.test(pageInfo.get(rel).html));
  assert(withParamLink.length === 0,
    `?id= 상세 링크 없음${withParamLink.length ? ' — ' + withParamLink.join(', ') : ''}`);

  const withKeywords = allPages.filter((rel) => /<meta name="keywords"/.test(pageInfo.get(rel).html));
  assert(withKeywords.length === 0,
    `meta keywords 없음${withKeywords.length ? ' — ' + withKeywords.join(', ') : ''}`);

  const blockingFont = allPages.filter((rel) => {
    const html = pageInfo.get(rel).html;
    return [...html.matchAll(/<link\b[^>]*fonts\.googleapis\.com\/css2[^>]*>/g)]
      .some((m) => m[0].indexOf('media="print"') === -1 && html.indexOf('<noscript>' + m[0]) === -1);
  });
  assert(blockingFont.length === 0,
    `첫 화면을 막는 글꼴 요청 없음${blockingFont.length ? ' — ' + blockingFont.join(', ') : ''}`);

  /* 하드코딩된 운영 주소 — 다음 도메인 이전 때 손으로 고쳐야 할 곳.
     검사 대상 호스트는 config.js 의 siteUrl 에서 뽑습니다. 옛 도메인을 이 파일에
     적어 두면 이전한 뒤로는 영영 0건만 나오는 죽은 검사가 됩니다. */
  const host = SITE_URL.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const hostRe = new RegExp(host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  const hardcoded = [];
  const scan = (rel) => {
    const n = (read(rel).match(hostRe) || []).length;
    if (n) hardcoded.push(`${rel}:${n}`);
  };
  ROOT_PAGES.filter(exists).forEach(scan);
  generated.forEach(scan);
  ['robots.txt', 'sitemap.xml', 'assets/js/config.js'].filter(exists).forEach(scan);
  console.log(`    · 현재 운영 주소(${host})가 박혀 있는 파일 ${hardcoded.length}개 ` +
    `(총 ${hardcoded.reduce((n, s) => n + Number(s.split(':').pop()), 0)}곳)`);
  const nonGenerated = hardcoded.filter((s) => {
    const f = s.slice(0, s.lastIndexOf(':'));
    return generated.indexOf(f) === -1 && f !== 'index.html' && f !== 'sitemap.xml';
  });
  console.log('      손으로 고쳐야 하는 곳: ' + (nonGenerated.join(', ') || '없음'));

  /* 옛 도메인 흔적이 하나도 남지 않았는지 (이전 후 회귀 방지) */
  const OLD_HOSTS = ['nam2037772.github.io'];
  const leftover = [];
  ROOT_PAGES.filter(exists).concat(generated, ['robots.txt', 'sitemap.xml', 'assets/js/config.js'].filter(exists))
    .forEach((rel) => {
      OLD_HOSTS.forEach((h) => { if (read(rel).indexOf(h) > -1) leftover.push(`${rel} (${h})`); });
    });
  assert(leftover.length === 0,
    `옛 도메인 흔적 없음${leftover.length ? ' — ' + leftover.slice(0, 5).join(', ') : ''}`);

  /* CNAME 은 siteUrl 의 호스트와 정확히 같아야 합니다.
     어긋나면 GitHub Pages 가 의도와 다른 주소로 서비스합니다. */
  if (exists('CNAME')) {
    const cname = read('CNAME').trim();
    assert(cname === host, `CNAME(${cname}) == siteUrl 호스트(${host})`);
    assert(!/^www\./.test(cname), 'CNAME 이 www 없는 대표 주소');
  } else {
    fail('CNAME 파일 없음 — 사용자 지정 도메인 배포에 필요합니다');
  }
}

/* ── 18. 가로 스크롤 위험 ──────────────────────────────────── */
console.log('\n[11] 모바일 · 가로 스크롤 위험');
{
  const allPages = ROOT_PAGES.filter(exists).concat(generated);
  const risky = [];
  allPages.forEach((rel) => {
    const html = pageInfo.get(rel).html;
    const body = html.slice(html.indexOf('<body'));
    /* 인라인 style 에 고정 폭이 들어간 요소 (뷰포트보다 넓으면 밀려납니다).
       max-width / min-width 는 반응형에 안전하므로 제외합니다. */
    [...body.matchAll(/style="[^"]*?(?:^|[^-])\bwidth:\s*(\d+)px/g)].forEach((m) => {
      if (Number(m[1]) > 360) risky.push(`${rel}: width:${m[1]}px`);
    });
    /* 이미지에 max-width 를 무력화하는 인라인 폭 지정 */
    [...body.matchAll(/<img\b[^>]*style="[^"]*\bmin-width/g)].forEach(() => {
      risky.push(`${rel}: img min-width`);
    });
  });
  assert(risky.length === 0,
    `뷰포트를 넘길 수 있는 고정 폭 없음${risky.length ? ' — ' + risky.slice(0, 5).join(', ') : ''}`);

  /* <div> 짝이 맞는지 — 목록을 채워 넣는 과정에서 태그가 어긋나면
     레이아웃이 통째로 밀립니다. (예전에 실제로 한 번 났던 사고입니다:
     카드 안의 <div> 때문에 컨테이너 끝을 잘못 찾아 내용이 겹쳐 쌓였습니다) */
  const unbalanced = allPages.filter((rel) => {
    const h = pageInfo.get(rel).html;
    return (h.match(/<div\b/g) || []).length !== (h.match(/<\/div>/g) || []).length ||
           (h.match(/<article\b/g) || []).length !== (h.match(/<\/article>/g) || []).length;
  });
  assert(unbalanced.length === 0,
    `모든 페이지의 <div> · <article> 짝이 맞음${unbalanced.length ? ' — ' + unbalanced.join(', ') : ''}`);

  /* 생성 페이지가 기존 페이지와 같은 레이아웃 껍데기를 쓰는지 */
  const shellBad = generated.filter((rel) => {
    const h = pageInfo.get(rel).html;
    return h.indexOf('assets/css/style.css') === -1 ||
           h.indexOf('assets/css/homepage-subpages.css') === -1 ||
           h.indexOf('name="viewport"') === -1 ||
           h.indexOf('class="wrap') === -1;
  });
  assert(shellBad.length === 0,
    `생성 ${generated.length}쪽이 기존과 같은 레이아웃 껍데기(.wrap · 같은 CSS · viewport) 사용`);
}

/* ── 요약 ──────────────────────────────────────────────────── */
console.log(`\n검사 ${checks}건 중 실패 ${failures}건`);
console.log(`생성: 시공사례 ${casePages.length}쪽 · 기술자료 ${guidePages.length}쪽`);
process.exit(failures ? 1 : 0);
