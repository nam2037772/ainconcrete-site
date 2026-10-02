/* ============================================================
   tools/lib/render.js — 정적 마크업 생성기
   ------------------------------------------------------------
   ▶ 이 파일이 만드는 마크업은 지금까지 main.js 가 화면에서
     만들던 것과 **글자 단위로 같아야 합니다**.
     디자인을 바꾸는 것이 목적이 아니라, 같은 결과를 자바스크립트
     없이도 보이게 하는 것이 목적입니다.

       main.js projectCard()   → card()
       main.js resourceRow()   → resourceRow()
       main.js contentCard()   → contentCard()
       main.js initProjectDetail()  → caseBody()
       main.js initResourceDetail() → guideBody()

     한쪽을 고치면 다른 쪽도 같이 고쳐 주세요.
     tools/check-site.js 가 카드 개수·링크·이미지를 대조합니다.

   ▶ prefix
     하위 폴더(case/, guide/)에 놓이는 페이지는 문서 기준 상대경로
     앞에 '../' 가 필요합니다. 모든 링크·이미지 경로에 prefix 를 붙입니다.
   ============================================================ */
'use strict';

const {
  esc, fmtDate, casePath, guidePath, sizeAttrs, imgOr
} = require('./site-data');

/* ── 공통 조각 ──────────────────────────────────────────────── */

const NAV_ITEMS = [
  ['index.html', 'HOME'],
  ['concrete.html', '제주노출콘크리트'],
  ['reinforcement.html', '제주콘크리트보수보강'],
  ['waterproof.html', '인젝션·특수방수'],
  ['projects.html', '시공사례'],
  ['resources.html', '기술자료'],
  ['materials.html', '자재구매'],
  ['about.html', '회사소개']
];

/* 헤더 · 푸터의 브랜드 표기는 assets/js/config.js 의 COMPANY 한 곳에서만 옵니다.
   여기에 이름을 직접 적지 마세요 — 적는 순간 페이지마다 이름이 갈라집니다. */
function header(prefix, current, COMPANY) {
  const items = NAV_ITEMS.map(([href, label]) => {
    const on = href === current ? ' aria-current="page"' : '';
    return `        <li><a href="${prefix}${href}"${on}>${label}</a></li>`;
  }).join('\n');
  const quoteOn = current === 'contact.html' ? ' aria-current="page"' : '';
  return `<header class="header" id="header">
  <div class="header__bar">
    <a class="brand" href="${prefix}index.html">
      <img class="brand__mark" src="${prefix}assets/images/brand/logo.png" alt="" width="38" height="38" />
      <span class="brand__text"><strong>${esc(COMPANY.headerBrand || COMPANY.brand)}</strong><em>${esc(COMPANY.headerSubline || COMPANY.brandSubline)}</em></span>
    </a>
    <nav class="gnb" id="gnb" aria-label="주요 메뉴">
      <ul class="gnb__list">
${items}
        <li><a class="gnb__quote" href="${prefix}contact.html"${quoteOn}>상담문의</a></li>
      </ul>
      <p class="gnb__tel"><a href="tel:16604019">대표전화 1660-4019</a></p>
    </nav>
    <a class="header__tel" href="tel:16604019" aria-label="대표전화 1660-4019로 전화 걸기"><span>T.</span><strong>1660-4019</strong></a>
    <button class="burger" id="burger" type="button" aria-expanded="false" aria-controls="gnb">
      <span class="burger__box" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="sr-only">메뉴 열기</span>
    </button>
  </div>
</header>`;
}

/* 푸터 사업자 정보 한 줄 — config.js 에 값이 있는 항목만 이어 붙입니다.
   생성 페이지는 자바스크립트 없이도 보이도록 여기서 미리 넣어 둡니다.
   (main.js 의 [data-business-number] 렌더러가 같은 문자열을 다시 쓰므로
    config.js 를 고치면 손으로 쓴 페이지도 함께 갱신됩니다)
   ※ 법인등록번호는 넣지 않습니다 — 표시 의무 항목이 아닙니다. */
function legalLine(COMPANY) {
  return [
    /* 브랜드(제주노출콘크리트)를 실제로 운영하는 법인을 맨 앞에 밝힙니다.
       화면에 보이는 이름과 계약 상대가 다르다는 사실을 숨기지 않기 위함입니다. */
    COMPANY.name || '',
    COMPANY.representative ? '대표 ' + COMPANY.representative : '',
    COMPANY.businessNumber ? '사업자등록번호 ' + COMPANY.businessNumber : '',
    COMPANY.mailOrderNumber ? '통신판매업신고 ' + COMPANY.mailOrderNumber : ''
  ].filter(Boolean).join(' · ');
}

function footer(prefix, COMPANY, EXTERNAL_LINKS) {
  const L = EXTERNAL_LINKS || {};
  const ext = (key, fallbackLabel) => {
    const item = L[key];
    if (!item || !item.url) return '';
    return `        <li><a data-link="${key}" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.label || fallbackLabel)}</a></li>\n`;
  };
  return `<footer class="footer">
  <div class="wrap footer__grid">
    <div class="footer__brand">
      <img src="${prefix}assets/images/brand/logo.png" alt="${esc(COMPANY.brand)} 로고" width="40" height="40" loading="lazy" />
      <p class="footer__name">${esc(COMPANY.footerBrand || COMPANY.brand)}</p>
      <p class="footer__tag">${esc(COMPANY.footerSummary)}</p>
      <p class="footer__trust">${esc(COMPANY.trustLine)}</p>
      <p class="footer__tel"><a href="${esc(COMPANY.telHref)}">대표전화 ${esc(COMPANY.tel)}</a></p>
      <address>${esc(COMPANY.address)}</address>
    </div>
    <!-- 전문 분야 — 핵심 두 축(노출콘크리트 · 콘크리트 보수보강)을 맨 위에 두고,
         그 아래에 공종별 상세 페이지를 적습니다. 메뉴만으로는 에폭시 주입·CFRP·
         표면보호 같은 공종 페이지가 전역 어디에서도 닿지 않기 때문입니다.
         철근부식·단면복구와 철판·강재보강은 상세 페이지가 없으므로 허브의 해당 절로 보냅니다. -->
    <nav class="footer__col" aria-label="전문 분야">
      <h2 class="footer__ttl">전문 분야</h2>
      <ul>
        <li><a href="${prefix}concrete.html">제주노출콘크리트 보수·복원</a></li>
        <li><a href="${prefix}reinforcement.html">제주콘크리트보수보강</a></li>
        <li><a href="${prefix}epoxy-crack-repair.html">에폭시 균열주입</a></li>
        <li><a href="${prefix}reinforcement.html#steel">철판 · 강재보강</a></li>
        <li><a href="${prefix}carbon-fiber-reinforcement.html">CFRP 탄소섬유 구조보강</a></li>
        <li><a href="${prefix}reinforcement.html#rebar">철근부식 · 단면복구</a></li>
        <li><a href="${prefix}waterproof.html">우레탄 인젝션 특수방수</a></li>
        <li><a href="${prefix}concrete-surface-protection.html">표면강화 · 발수보호</a></li>
      </ul>
    </nav>
    <nav class="footer__col" aria-label="사이트 메뉴">
      <h2 class="footer__ttl">바로가기</h2>
      <ul>
        <li><a href="${prefix}projects.html">시공사례</a></li>
        <li><a href="${prefix}resources.html">기술자료</a></li>
        <li><a href="${prefix}materials.html">자재구매</a></li>
        <li><a href="${prefix}about.html">회사소개</a></li>
        <li><a href="${prefix}contact.html">상담문의</a></li>
        <li><a href="${prefix}privacy.html">개인정보처리방침</a></li>
      </ul>
    </nav>
    <nav class="footer__col" aria-label="외부 채널">
      <h2 class="footer__ttl">채널</h2>
      <ul>
        <li><a href="${prefix}materials.html">보수재 · 방수재 · 발수제 구매</a></li>
${ext('blog', '네이버 블로그')}${ext('youtube', '유튜브')}${ext('instagram', '인스타그램')}      </ul>
    </nav>
  </div>
  <div class="wrap footer__bottom">
    <small>© <span data-year>2026</span> ${esc(COMPANY.footerBrand || COMPANY.brand)}. All rights reserved.</small>
    <small data-business-number>${esc(legalLine(COMPANY))}</small>
  </div>
</footer>

<div class="cta-bar">
  <a class="cta-bar__tel" href="${esc(COMPANY.telHref)}">전화상담</a>
  <a class="cta-bar__photo" data-photo-consult href="mailto:${esc(COMPANY.email)}">사진상담</a>
  <a class="cta-bar__quote" href="${prefix}contact.html">견적문의</a>
</div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>`;
}

/* 글꼴은 홈에서 검증된 방식(첫 화면을 막지 않음)을 모든 페이지에 그대로 씁니다. */
const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300..700&family=Noto+Serif+KR:wght@300..500&display=swap';
const FONT_LINKS =
`<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" media="print" onload="this.media='all'" href="${FONT_HREF}" />
<noscript><link rel="stylesheet" href="${FONT_HREF}" /></noscript>`;

/* ── 카드 · 목록 (main.js 와 1:1) ──────────────────────────── */

/* main.js projectCard() */
function projectCard(p, ci, prefix, FALLBACK_IMAGE) {
  const meta = [p.category, p.building, fmtDate(p.date)].filter(Boolean)
    .map((t) => '<span>' + esc(t) + '</span>').join('');
  const src = imgOr(ci.representativeImage, FALLBACK_IMAGE);
  return '' +
    '<article class="card">' +
      '<a class="card__link" href="' + prefix + casePath(p.id) + '">' +
        '<span class="card__media">' +
          '<img src="' + prefix + esc(src) + '" alt="' + esc(p.representative_alt || p.title + ' 시공 완료 사진') + '"' +
          ' loading="lazy" width="800" height="600" />' +
          (ci.hasBefore ? '<span class="card__flag">BEFORE / AFTER</span>' : '') +
        '</span>' +
        '<span class="card__body">' +
          '<span class="card__meta">' + meta + '</span>' +
          '<span class="card__ttl">' + esc(p.title) + '</span>' +
          '<span class="card__sum">' + esc(p.summary) + '</span>' +
        '</span>' +
      '</a>' +
    '</article>';
}

/* main.js resourceRow() */
function resourceRow(r, prefix) {
  const fileHtml = r.file
    ? '<div class="resource-row__file"><a class="resource-row__download" href="' + prefix + esc(r.file) + '" download>PDF 자료</a></div>'
    : '<div class="resource-row__file"></div>';
  return '' +
    '<article class="resource-row reveal">' +
      '<a class="resource-row__link" href="' + prefix + guidePath(r.id) + '">' +
        '<span class="resource-row__cat">' + esc(r.category) + '</span>' +
        '<span class="resource-row__content">' +
          '<span class="resource-row__ttl">' + esc(r.title) + '</span>' +
          '<span class="resource-row__sum">' + esc(r.summary) + '</span>' +
        '</span>' +
        '<span class="resource-row__date">' + fmtDate(r.date) + '</span>' +
      '</a>' +
      fileHtml +
    '</article>';
}

/* main.js contentCard() — 통합 아카이브(시공사례 · 기술자료) 카드 */
function contentCard(item, prefix, FALLBACK_IMAGE) {
  const meta = [item.category || item.categoryRaw, item.date ? fmtDate(item.date) : '']
    .filter(Boolean).map((t) => '<span>' + esc(t) + '</span>').join('');
  const alt = item.images.alt || item.title + ' 대표 이미지';
  const flag = (item.images.beforeImages && item.images.beforeImages.length)
    ? '<span class="card__flag">BEFORE / AFTER</span>' : '';
  /* 대표 이미지가 아예 없는 항목은 관계없는 대체 이미지를 끼워 넣지 않고
     빈 .card__media 로 둡니다. .card__media 는 aspect-ratio:4/3 과 배경색을
     이미 갖고 있어서, 그리드 정렬이 흐트러지지 않고 깨진 이미지도 뜨지 않습니다.
     썸네일이 있는 항목의 출력은 이전과 완전히 동일합니다. */
  const own = item.images.thumbnail || item.images.cover;
  const src = imgOr(own, FALLBACK_IMAGE);
  const media = own
    ? '<img src="' + prefix + esc(src) + '" alt="' + esc(alt) + '"' +
      ' loading="lazy" width="800" height="600" />'
    : '';
  return '' +
    '<article class="card reveal">' +
      '<a class="card__link" href="' + prefix + esc(item.url) + '">' +
        '<span class="card__media">' +
          media +
          flag +
        '</span>' +
        '<span class="card__body">' +
          '<span class="card__meta">' + meta + '</span>' +
          '<span class="card__ttl">' + esc(item.title) + '</span>' +
          '<span class="card__sum">' + esc(item.description) + '</span>' +
        '</span>' +
      '</a>' +
    '</article>';
}

/* ── 시공사례 상세 본문 (main.js initProjectDetail 과 1:1) ──── */
function caseBody(p, ci, prefix, FALLBACK_IMAGE) {
  const rows = [
    ['사례 번호', p.case_no ? 'No. ' + p.case_no : ''],
    ['시공 분야', p.category], ['건축물', p.building], ['현장 위치', p.location],
    ['시공 시기', fmtDate(p.date)], ['작업 기간', p.period]
  ].filter((r) => r[1]);

  /* 본문 — 절 서식 원고(sections)가 있으면 그 소제목과 순서를 그대로 쓰고,
     없으면 기존 세 칸(하자 · 공법 · 결과)을 씁니다. 마크업은 같습니다. */
  const blocks = (p.sections && p.sections.length)
    ? p.sections.map((s) => [s.heading, s.paragraphs])
    : [['주요 하자 · 문제점', p.problem], ['적용 공법', p.method], ['시공 결과', p.result]]
      .filter((r) => r[1]).map((r) => [r[0], [r[1]]]);

  const headMeta = [p.category, p.building, p.location, fmtDate(p.date), p.period]
    .filter(Boolean).map((t) => '<span>' + esc(t) + '</span>').join('');

  /* 시공 전 / 시공 중 / 시공 후 — 노트의 분류와 순서를 그대로 따릅니다.
     '사진없음' 인 구간은 통째로 만들지 않습니다. */
  function phaseSection(kind, ko, en, list) {
    if (!list.length) return '';
    return '<div class="ba-set__col ba-set__col--' + kind + '">' +
      '<h3 class="ba-set__ttl"><span class="ba-set__tag">' + en + '</span>' + esc(ko) + '</h3>' +
      '<div class="ba-set__shots">' + list.map((src, i) =>
        '<figure class="ba-set__shot">' +
          '<img src="' + prefix + esc(src) + '" alt="' + esc(p.title) + ' ' + esc(ko) +
          (list.length > 1 ? ' ' + (i + 1) : '') + ' 사진" loading="lazy"' + sizeAttrs(src) + ' />' +
        '</figure>').join('') + '</div>' +
    '</div>';
  }

  let phasesHtml = '';
  if (ci.showComparison) {
    const phases = phaseSection('before', '시공 전', 'BEFORE', ci.beforeImages) +
                   phaseSection('process', '시공 중', 'PROCESS', ci.processImages) +
                   phaseSection('after', '시공 후', 'AFTER', ci.afterImages);
    phasesHtml =
      '<section class="wrap ba-set-wrap" aria-label="시공 단계별 사진">' +
        '<div class="ba-set ba-set--phases">' + phases + '</div>' +
      '</section>';
  }

  const repList = ci.representativeImages.length
    ? ci.representativeImages
    : [imgOr(ci.representativeImage, FALLBACK_IMAGE)];
  /* 대표사진 첫 장은 이 페이지의 LCP 요소입니다 — 지연 로딩하지 않습니다. */
  /* representative_fit: contain — 첫 대표사진을 자르지 않고 전체를 보여 줍니다.
     (라벨이 있는 시공 전·후 비교 이미지처럼 잘리면 안 되는 사진)
     카드용 773px 와 고화질본을 srcset 으로 함께 주어 화면 폭에 맞는 것을 고르게 합니다.
     그 밖의 사례는 지금까지와 같은 전체 폭 · 고정 높이 · 가운데 자르기입니다. */
  const contain = p.representative_fit === 'contain';
  const repHtml = repList.map((src, i) => {
    const s = imgOr(src, FALLBACK_IMAGE);
    const load = i === 0 ? ' fetchpriority="high"' : ' loading="lazy"';
    const alt = esc(i === 0 && p.representative_alt ? p.representative_alt
      : p.title + ' 대표 사진' + (repList.length > 1 ? ' ' + (i + 1) : ''));
    if (contain && i === 0) {
      const hd = p.representative_hd || '';
      const w = (rel) => (/ width="(\d+)"/.exec(sizeAttrs(rel)) || [])[1];
      const srcset = hd && w(s) && w(hd)
        ? ' srcset="' + prefix + esc(s) + ' ' + w(s) + 'w, ' + prefix + esc(hd) + ' ' + w(hd) + 'w"' +
          ' sizes="(min-width: 1100px) 1040px, 100vw"'
        : '';
      return '<figure class="detail__figure detail__figure--contain"><img src="' + prefix + esc(s) + '"' +
        srcset + ' alt="' + alt + '"' + load + sizeAttrs(hd || s) + ' /></figure>';
    }
    return '<figure class="detail__figure"><img src="' + prefix + esc(s) +
      '" alt="' + alt + '"' + load + sizeAttrs(s) + ' /></figure>';
  }).join('');

  return '' +
    '<div class="wrap detail__head">' +
      '<p class="eyebrow">ARCHIVE</p>' +
      '<h1 class="h2">' + esc(p.title) + '</h1>' +
      (headMeta ? '<p class="detail__meta">' + headMeta + '</p>' : '') +
      '<p class="lead">' + esc(p.summary) + '</p>' +
    '</div>' +
    repHtml +
    '<div class="wrap detail__grid">' +
      '<div class="detail__body">' +
        blocks.map((b) =>
          '<section class="detail__block"><h2 class="h3">' + esc(b[0]) + '</h2>' +
            b[1].map((t) => '<p>' + esc(t) + '</p>').join('') + '</section>'
        ).join('') +
        (ci.galleryImages.length ? '<div class="detail__gallery">' + ci.galleryImages.map((src) =>
          '<img src="' + prefix + esc(src) + '" alt="' + esc(p.title) + ' 추가 사진" loading="lazy"' + sizeAttrs(src) + ' />'
        ).join('') + '</div>' : '') +
      '</div>' +
      '<aside class="detail__side">' +
        '<dl class="spec">' + rows.map((r) =>
          '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>'
        ).join('') + '</dl>' +
        '<a class="btn btn--dark btn--block" href="' + prefix + 'contact.html">같은 유형으로 상담하기</a>' +
      '</aside>' +
    '</div>' +
    phasesHtml;
}

/* ── 기술자료 상세 본문 (main.js initResourceDetail 과 1:1) ─── */
function guideBody(r, prefix) {
  /* content 는 데이터 파일에 손으로 쓴 HTML 조각입니다 — 글은 그대로 씁니다.
     다만 이 페이지가 guide/ 하위로 내려갔으므로, 본문 안의 사이트 내부 경로
     (이미지 · 링크)에는 prefix 를 붙여야 합니다.
     http(s)·data·mailto·tel·앵커(#)·이미 상대 위로 올라간 것은 건드리지 않습니다. */
  const RELATIVE = /(<(?:img|a)\b[^>]*\b(?:src|href)=")(?!https?:|data:|mailto:|tel:|#|\/|\.\.\/)/gi;
  const body = String(r.content || '').replace(RELATIVE, (m, head) => head + prefix);
  return '' +
    '<div class="wrap detail__head">' +
      '<p class="eyebrow">ARCHIVE</p>' +
      '<p class="doc__meta"><span>' + esc(r.category) + '</span><span>' + fmtDate(r.date) + '</span></p>' +
      '<h1 class="h2">' + esc(r.title) + '</h1>' +
      '<p class="lead">' + esc(r.summary) + '</p>' +
    '</div>' +
    /* 이 표지 사진은 화면에 나오지 않습니다.
       homepage-subpages.css 의 body[data-page=resource] .detail__figure{display:none}
       이 가리고 있어서, 우선순위를 높이면 보이지도 않는 사진을 먼저 내려받게 됩니다.
       (기술자료 8쪽 합계 약 1.5MB) loading="lazy" 로 두면 브라우저가
       display:none 안의 사진을 받지 않습니다. 마크업은 그대로 두어
       CSS 를 되돌리면 사진이 다시 보이도록 합니다. */
    (r.thumbnail
      ? '<figure class="detail__figure"><img src="' + prefix + esc(r.thumbnail) + '" alt="' + esc(r.title) +
        ' 관련 시공 사진" loading="lazy"' + sizeAttrs(r.thumbnail) + ' /></figure>'
      : '') +
    '<div class="wrap doc__body">' + body +
      (r.file ? '<p class="doc__file"><a class="btn btn--line" href="' + prefix + esc(r.file) + '" download>자료 내려받기 (PDF)</a></p>' : '') +
      ((r.tags || []).length ? '<ul class="doc__tags">' + r.tags.map((t) =>
        '<li>#' + esc(t) + '</li>').join('') + '</ul>' : '') +
    '</div>';
}

module.exports = {
  header, footer, FONT_LINKS, legalLine,
  projectCard, resourceRow, contentCard,
  caseBody, guideBody
};
