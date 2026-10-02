/* ============================================================
   content.js — 통합 콘텐츠 모델 (기술자료 = 기술문서 + 시공사례)
   ------------------------------------------------------------
   ▶ 이 파일은 데이터를 "저장"하지 않습니다.
     실제 데이터는 그대로 두 파일에 있습니다.
       · assets/js/projects.js  → PROJECTS  (시공사례)
       · assets/js/resources.js → RESOURCES (기술문서)
     이 파일은 두 데이터를 **하나의 공통 형태**로 변환해
     통합 목록(resources.html)에서 함께 보여주는 역할만 합니다.

   ▶ 왜 이렇게 했나요?
     · 사장님이 쓰던 편집 방법(projects.js / resources.js 에 항목 추가)이
       바뀌지 않습니다.
     · 상세 페이지는 tools/build-site.js 가 case/ · guide/ 아래에 실제 파일로
       만듭니다. 예전 주소(project.html?id=, resource.html?id=)는 호환용
       shim 이 새 주소로 넘겨 주므로 밖에 나가 있는 링크도 그대로 동작합니다.
     · 나중에 옵시디언(.md) 원고를 넣을 때는, 아래 "통합 항목 형태" 그대로
       만들어 CONTENT 에 합치기만 하면 됩니다.

   ------------------------------------------------------------
   ■ 통합 항목 형태 (Obsidian .md 프론트매터와 1:1로 대응)

     ---
     title:       노출콘크리트 층조인트 단차 보수   → item.title
     category:    노출콘크리트                     → item.category
     type:        case                             → item.type ('technical' | 'case')
     date:        2026-08-14                       → item.date
     description: 한 줄 요약                        → item.description
     representative_image: representative.jpg      → item.images.thumbnail
     before_images:        [before-01.jpg]         → item.images.beforeImages
     process_images:       [process-01.jpg]        → item.images.processImages
     after_images:         [after-01.jpg]          → item.images.afterImages
     ---
     (본문 마크다운)                                 → item.body (HTML)

   ■ 실제 객체
     {
       id, type, title,
       category,      // 통합 필터용 (UNIFIED_CATEGORIES 중 하나)
       categoryRaw,   // 원본 데이터에 적힌 분류 (상세페이지 표기용)
       date,          // 'YYYY-MM' 또는 'YYYY-MM-DD'
       sortKey,       // 정렬용으로 보정한 'YYYY-MM-DD'
       description,   // 목록 카드에 노출되는 한 줄 요약
       images: { thumbnail, cover, before, gallery[],
                 beforeImages[], processImages[], afterImages[] },
                      // thumbnail = 대표 이미지 = 옵시디언 노트의 '대표사진'
                      // 선택 규칙은 assets/js/case-images.js 한 곳에만 있습니다
       body,          // 상세 본문 HTML ('' 이면 상세페이지가 자체 구성)
       tags[],        // 검색 키워드
       url,           // 상세 주소 (기존 주소 그대로)
       meta: { ... }  // 유형별 부가정보 (현장 위치, 공법, 첨부파일 등)
     }
   ============================================================ */

/* 통합 필터 — 화면에 표시되는 순서대로.
   세 전문 분야(노출콘크리트 보수 · 콘크리트 보수보강 · 인젝션 특수방수)만 남깁니다.
   '표면보호'는 독립 분류로 두지 않고 노출콘크리트 보수 안의 한 공정으로 묶습니다. */
var UNIFIED_CATEGORIES = ['노출콘크리트', '보수보강', '인젝션 특수방수'];

/* 콘텐츠 유형 — 기술문서 / 시공사례 */
var CONTENT_TYPES = [
  { value: 'technical', label: '기술자료' },
  { value: 'case',      label: '시공사례' }
];

/* 기존 분류 → 통합 필터 대응표.
   앞으로 새 글을 쓸 때는 통합 필터 이름(UNIFIED_CATEGORIES)을 그대로 써도 됩니다.
   '보수보강' = 균열보수 · 에폭시 주입 · 단면복구 · 철근노출 및 박락 보수 (콘크리트 보수보강 페이지).
   '표면보호' · '발수' · '표면강화'는 노출콘크리트 보수 페이지의 발수 및 표면 보호 공정으로 묶습니다.

   ▶ 보수보강 실적을 올릴 때 쓰는 세부 분류
     화면의 필터는 위 세 갈래(UNIFIED_CATEGORIES)로만 나뉩니다. 아래 세부
     분류는 그 안에서 어느 공정의 기록인지 남기는 이름이며, 상세 페이지의
     서비스 링크(tools/build-site.js 의 SERVICE_BY_CATEGORY)를 정합니다.

       에폭시저압주입 · 에폭시인젝션 → 에폭시주입  → epoxy-crack-repair.html
       탄소섬유                                    → carbon-fiber-reinforcement.html
       단면복구 · 철근노출                          → reinforcement.html
       표면강화 · 발수 · 표면보호                    → concrete-surface-protection.html

     ※ 아직 사례가 없는 분류를 화면에 미리 만들지 않습니다. 필터는
       usedUnifiedCategories 가 실제 자료를 보고 만들므로, 사례를 올리는
       순간 저절로 나타납니다. 없는 실적을 있는 것처럼 두지 않기 위함입니다. */
var CATEGORY_ALIASES = {
  '노출콘크리트': '노출콘크리트',
  '면보수':       '노출콘크리트',
  '색상재현':     '노출콘크리트',
  '시공기준':     '노출콘크리트',
  '표면보호':     '노출콘크리트',
  '표면강화':     '노출콘크리트',
  '발수':         '노출콘크리트',
  '보수보강':     '보수보강',
  '균열보수':     '보수보강',
  '균열·보수':    '보수보강',
  '에폭시주입':   '보수보강',
  '에폭시저압주입': '보수보강',
  '에폭시인젝션': '보수보강',
  '단면복구':     '보수보강',
  '철근노출':     '보수보강',
  '탄소섬유':     '보수보강',
  '인젝션':       '인젝션 특수방수',
  '누수보수':     '인젝션 특수방수',
  '특수방수':     '인젝션 특수방수'
};

/* 분류 이름을 통합 필터 값으로 바꿉니다. 대응표에 없으면 '' (→ '전체'에서만 노출) */
function unifyCategory(raw) {
  var v = CATEGORY_ALIASES[raw];
  return v || '';
}

/* ── 상세 페이지 주소 ─────────────────────────────────────────
   상세 페이지는 실제 파일입니다. 주소 파라미터(?id=) 를 쓰지 않습니다.

     시공사례  obsidian-case-045-songpa-…  →  case/case-045-songpa-….html
     기술자료  crack-repair-004            →  guide/crack-repair-004.html

   'obsidian-' 접두만 떼어 이미지 폴더명과 같은 이름을 씁니다.
     assets/images/case-studies/case-045-songpa-…/
   ※ tools/lib/site-data.js 의 caseSlug/casePath/guidePath 와 같은 규칙입니다.
      한쪽을 고치면 다른 쪽도 함께 고쳐 주세요. */
function caseUrl(id) {
  return 'case/' + String(id || '').replace(/^obsidian-/, '') + '.html';
}
function guideUrl(id) {
  return 'guide/' + String(id || '') + '.html';
}

/* 'YYYY-MM' 을 'YYYY-MM-01' 로 보정해 두 데이터의 정렬 기준을 맞춥니다. */
function contentSortKey(date) {
  var d = String(date || '');
  if (/^\d{4}-\d{2}$/.test(d)) return d + '-01';
  if (/^\d{4}$/.test(d)) return d + '-01-01';
  return d;
}

/* 시공사례(PROJECTS 항목) → 통합 항목
   이미지 선택은 case-images.js 의 정규화 모델에만 맡깁니다.
   (대표 이미지 = 옵시디언 Raw 노트의 '대표사진') */
function projectToContent(p) {
  var ci = (typeof CaseImages !== 'undefined')
    ? CaseImages.normalize(p)
    : { representativeImage: p.thumbnail || p.after || '',
        beforeImages: p.before ? [p.before] : [],
        processImages: [],
        afterImages: p.after ? [p.after] : [],
        galleryImages: (p.images || []).slice() };

  return {
    id: p.id,
    type: 'case',
    /* 목록 정렬(사례 번호 내림차순)에 씁니다 — '001' 처럼 세 자리로 맞춰 둔 문자열입니다. */
    caseNo: p.case_no || '',
    title: p.title,
    category: unifyCategory(p.category),
    categoryRaw: p.category,
    date: p.date,
    sortKey: contentSortKey(p.date),
    description: p.summary,
    images: {
      thumbnail: ci.representativeImage,
      cover: ci.representativeImage,
      /* 대표사진 대체 텍스트 — 사례에 따로 적은 경우에만 (없으면 카드 기본 문구) */
      alt: p.representative_alt || '',
      before: ci.beforeImages[0] || '',
      gallery: ci.galleryImages,
      beforeImages: ci.beforeImages,
      processImages: ci.processImages,
      afterImages: ci.afterImages
    },
    body: '',
    tags: [p.category, p.building, p.location].filter(Boolean),
    url: caseUrl(p.id),
    meta: {
      location: p.location || '',
      building: p.building || '',
      period: p.period || '',
      problem: p.problem || '',
      method: p.method || '',
      result: p.result || '',
      featured: !!p.featured,
      file: ''
    }
  };
}

/* 기술문서(RESOURCES 항목) → 통합 항목 */
function resourceToContent(r) {
  return {
    id: r.id,
    type: 'technical',
    title: r.title,
    category: unifyCategory(r.category),
    categoryRaw: r.category,
    date: r.date,
    sortKey: contentSortKey(r.date),
    description: r.summary,
    images: {
      thumbnail: r.thumbnail || '',
      cover: r.thumbnail || '',
      before: '',
      gallery: [],
      beforeImages: [],
      processImages: [],
      afterImages: []
    },
    body: r.content || '',
    tags: (r.tags || []).concat([r.category]).filter(Boolean),
    url: guideUrl(r.id),
    meta: {
      location: '', building: '', period: '',
      problem: '', method: '', result: '',
      featured: false,
      file: r.file || ''
    }
  };
}

/* 검색용 문자열 — 제목·요약·분류·태그·현장정보를 한 덩어리로 */
function contentSearchText(item) {
  var m = item.meta || {};
  return [
    item.title, item.description, item.category, item.categoryRaw,
    m.building, m.location, m.problem, m.method, m.result
  ].concat(item.tags || []).filter(Boolean).join(' ').toLowerCase();
}

/* ── 통합 목록 ────────────────────────────────────────────────
   기술문서 + 시공사례를 합쳐 날짜 최신순으로 정렬합니다.
   새로 올린 자료가 목록 맨 앞에 오게 하기 위한 규칙입니다.

   날짜가 없는 항목에는 임의 날짜를 만들지 않습니다. 대신 사례번호 내림차순으로
   놓고(번호가 곧 기록 순서), 그래도 같으면 제목순으로 순서를 고정합니다
   (같은 자료가 새로고침마다 자리를 바꾸지 않도록).

   ▶ main.js 의 byRecencyDesc · tools/lib/site-data.js 의 byRecencyDesc 와
     같은 규칙입니다. 시공사례는 현재 원본 노트에 시공일이 없어 사례번호로
     정렬되며, 날짜를 채우면 그때부터 자동으로 날짜순이 됩니다.
   ▶ tools/build-site.js 의 poolFor 와 main.js 의 initContentPage 가
     이 순서를 그대로 이어받습니다. 여기만 고치면 세 곳이 함께 바뀝니다.
   (앞으로 옵시디언 .md 를 변환해 넣을 때도 여기에 concat 하면 됩니다) */
var CONTENT = (function () {
  var list = [];
  if (typeof RESOURCES !== 'undefined') list = list.concat(RESOURCES.map(resourceToContent));
  if (typeof PROJECTS !== 'undefined') list = list.concat(PROJECTS.map(projectToContent));
  list.forEach(function (item) { item.searchText = contentSearchText(item); });
  return list.sort(function (a, b) {
    var ka = a.sortKey || '';
    var kb = b.sortKey || '';
    if (ka !== kb) {
      if (!ka) return 1;
      if (!kb) return -1;
      return kb.localeCompare(ka);
    }
    var na = String(a.caseNo || '');
    var nb = String(b.caseNo || '');
    if (na !== nb) return nb.localeCompare(na);
    return String(a.title || '').localeCompare(String(b.title || ''), 'ko');
  });
})();

/* 실제로 항목이 존재하는 통합 필터만 반환 (빈 필터를 화면에 두지 않기 위함).
   list 를 넘기면 그 목록 기준으로, 넘기지 않으면 전체 기준으로 계산합니다. */
function usedUnifiedCategories(list) {
  var src = list || CONTENT;
  return UNIFIED_CATEGORIES.filter(function (c) {
    return src.some(function (item) { return item.category === c; });
  });
}
