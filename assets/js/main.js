/* ============================================================
   main.js — 공통 동작 + 페이지별 렌더러
   ------------------------------------------------------------
   · 빌드 도구 없이 동작하는 Vanilla JS (ES5+/ES2018 문법)
   · 페이지 구분은 <body data-page="..."> 값으로 합니다
   · 데이터는 projects.js / resources.js, 설정은 config.js
   ============================================================ */
(function () {
  'use strict';

  var $  = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };
  var hasProjects  = typeof PROJECTS  !== 'undefined';
  var hasResources = typeof RESOURCES !== 'undefined';
  var hasContent   = typeof CONTENT   !== 'undefined';

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function qs(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  }
  /* 'YYYY' · 'YYYY-MM' 도 비교할 수 있게 맞춥니다 (없으면 빈 문자열 그대로). */
  function normDate(d) {
    var s = String(d || '').trim();
    if (/^\d{4}$/.test(s)) return s + '-01-01';
    if (/^\d{4}-\d{2}$/.test(s)) return s + '-01';
    return s;
  }

  /* ── 목록 정렬 규칙 (사이트 전체 공통) ─────────────────────────
     가장 최근 항목이 항상 맨 위에 오게 합니다.

       1) 날짜 내림차순      기술자료 = 등록일, 시공사례 = 시공일
       2) 날짜가 없으면      사례번호 내림차순 (번호가 곧 기록 순서)
       3) 그래도 같으면      제목순 — 새로고침마다 자리가 바뀌지 않도록

     ▶ 날짜가 비어 있는 항목에 임의 날짜를 만들지 않습니다.
       시공사례는 현재 원본 노트에 시공일이 없어 2)로 정렬되며,
       날짜를 채우면 그때부터 자동으로 1)이 적용됩니다.
     ▶ 목록 · 카테고리 페이지 · 메인 노출 영역이 모두 이 규칙을 씁니다.
       main.js · content.js · tools/lib/site-data.js 세 곳의 구현이
       항상 같아야 합니다. */
  function byRecencyDesc(a, b) {
    var da = normDate(a.date), db = normDate(b.date);
    if (da !== db) {
      if (!da) return 1;
      if (!db) return -1;
      return db.localeCompare(da);
    }
    var na = String(a.case_no || a.caseNo || '');
    var nb = String(b.case_no || b.caseNo || '');
    if (na !== nb) return nb.localeCompare(na);
    return String(a.title || '').localeCompare(String(b.title || ''), 'ko');
  }
  function fmtDate(d) { return (d || '').replace(/-/g, '.'); }
  function img(src) { return src || FALLBACK_IMAGE; }

  /* 상세 페이지 주소 — 실제 파일입니다 (?id= 를 쓰지 않습니다).
     content.js · tools/lib/site-data.js 와 같은 규칙이어야 합니다.
     이 파일은 content.js 없이 쓰이는 페이지(concrete/waterproof 등)에서도
     불리므로 여기에 따로 둡니다. */
  function caseHref(id) {
    return 'case/' + String(id || '').replace(/^obsidian-/, '') + '.html';
  }
  function guideHref(id) {
    return 'guide/' + String(id || '') + '.html';
  }

  /* 시공기술사례 이미지 역할 정규화 (case-images.js).
     화면 코드는 직접 thumbnail/after/before 를 고르지 않고 항상 이 결과를 씁니다. */
  function caseImages(p) {
    if (typeof CaseImages !== 'undefined') return CaseImages.normalize(p);
    return {
      representativeImage: (p && (p.thumbnail || p.after)) || '',
      representativeImages: p && (p.thumbnail || p.after) ? [p.thumbnail || p.after] : [],
      beforeImages: p && p.before ? [p.before] : [],
      processImages: [],
      afterImages: p && p.after ? [p.after] : [],
      galleryImages: (p && p.images ? p.images.slice() : []),
      hasBefore: !!(p && p.before), hasProcess: false, hasAfter: !!(p && p.after),
      showComparison: !!(p && p.before), source: 'fallback'
    };
  }

  /* ── 1. 헤더 / 내비게이션 ─────────────────────────────── */
  function initHeader() {
    var header = $('#header');
    var burger = $('#burger');
    var gnb = $('#gnb');
    if (!header) return;

    var onScroll = function () {
      header.classList.toggle('is-solid', window.scrollY > 24);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    if (!burger || !gnb) return;

    var close = function () {
      header.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
      burger.setAttribute('aria-label', '메뉴 열기');
      document.body.classList.remove('is-locked');
    };
    burger.addEventListener('click', function () {
      var open = header.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      burger.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
      document.body.classList.toggle('is-locked', open);
    });
    $$('a', gnb).forEach(function (a) { a.addEventListener('click', close); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth >= 1100) close();
    });
  }

  /* ── 2. 회사정보 / 외부링크 주입 ──────────────────────── */
  function initConfigBindings() {
    if (typeof COMPANY === 'undefined') return;

    $$('[data-company]').forEach(function (el) {
      var key = el.getAttribute('data-company');
      var val = COMPANY[key];
      if (!val) return;
      if (el.tagName === 'A' && key === 'tel') { el.href = COMPANY.telHref; el.textContent = val; }
      else if (el.tagName === 'A' && key === 'email') { el.href = 'mailto:' + val; el.textContent = val; }
      else el.textContent = val;
    });

    $$('[data-link]').forEach(function (el) {
      var item = EXTERNAL_LINKS[el.getAttribute('data-link')];
      if (!item) return;
      if (!item.url) {
        el.removeAttribute('href');
        el.removeAttribute('target');
        el.removeAttribute('rel');
        el.setAttribute('aria-disabled', 'true');
        el.setAttribute('aria-label', item.label + ' 주소 준비 중');
        el.setAttribute('title', item.label + ' 주소 준비 중');
        el.classList.add('is-disabled');
        if (el.hasAttribute('data-link-label')) el.textContent = item.label + ' 준비 중';
        return;
      }
      el.href = item.url;
      el.target = '_blank';
      el.rel = 'noopener noreferrer';
      el.removeAttribute('aria-disabled');
      el.removeAttribute('aria-label');
      el.removeAttribute('title');
      el.classList.remove('is-disabled');
      if (el.hasAttribute('data-link-label')) el.textContent = item.label;
    });

    // 사진 상담 채널 (페이지 내 모든 사진상담 버튼에 적용)
    var ch = CONTACT_CHANNELS.usePhotoChannel;
    var mailHref = 'mailto:' + COMPANY.email +
      '?subject=' + encodeURIComponent('[사진 상담] 현장 검토 요청') +
      '&body=' + encodeURIComponent('현장 사진을 첨부해 주세요.\n\n- 현장 위치 :\n- 건축물 종류 :\n- 증상(누수/균열/곰보 등) :\n- 연락처 :\n');
    $$('[data-photo-consult]').forEach(function (photo) {
      if (ch === 'kakao' && CONTACT_CHANNELS.kakao) {
        photo.href = CONTACT_CHANNELS.kakao;
        photo.target = '_blank';
        photo.rel = 'noopener noreferrer';
      } else if (ch === 'sms') {
        photo.href = CONTACT_CHANNELS.sms;
      } else {
        photo.href = mailHref;
      }
    });

    var year = $('[data-year]');
    if (year) year.textContent = new Date().getFullYear();

    /* 푸터 사업자 정보 — config.js 에 값이 있는 항목만 이어 붙입니다.
       (전자상거래법이 표시를 요구하는 항목 기준. 법인등록번호는 대상이 아닙니다) */
    var biz = $('[data-business-number]');
    if (biz) {
      var legal = [
        COMPANY.representative ? '대표 ' + COMPANY.representative : '',
        COMPANY.businessNumber ? '사업자등록번호 ' + COMPANY.businessNumber : '',
        COMPANY.mailOrderNumber ? '통신판매업신고 ' + COMPANY.mailOrderNumber : ''
      ].filter(Boolean).join(' · ');
      if (legal) biz.textContent = legal;
      else biz.remove();
    }
  }

  /* ── 3. 스크롤 등장 ───────────────────────────────────── */
  function initReveal() {
    var items = $$('.reveal');
    if (!items.length) return;
    if (!('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    items.forEach(function (el) { io.observe(el); });
  }

  /* ── 4. Before / After 비교 ───────────────────────────── */
  function setupCompare(root) {
    if (!root || root.getAttribute('data-ba-ready')) return;
    var range = $('.ba__range', root);
    if (!range) return;
    root.setAttribute('data-ba-ready', '1');
    var apply = function (v) { root.style.setProperty('--pos', v + '%'); };
    apply(range.value);
    range.addEventListener('input', function () { apply(range.value); });

    // 터치 / 마우스 드래그
    var dragging = false;
    var move = function (clientX) {
      var rect = root.getBoundingClientRect();
      var pct = ((clientX - rect.left) / rect.width) * 100;
      pct = Math.max(0, Math.min(100, pct));
      range.value = pct;
      apply(pct);
    };
    root.addEventListener('pointerdown', function (e) {
      dragging = true;
      root.setPointerCapture && root.setPointerCapture(e.pointerId);
      move(e.clientX);
    });
    root.addEventListener('pointermove', function (e) { if (dragging) move(e.clientX); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (evt) {
      root.addEventListener(evt, function () { dragging = false; });
    });
  }
  function initCompares() { $$('.ba').forEach(setupCompare); }

  /* ── 5. 카드 및 리스트 마크업 ────────────────────────── */
  function projectCard(p) {
    var ci = caseImages(p);
    var meta = [p.category, p.building, fmtDate(p.date)].filter(Boolean)
      .map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('');
    return '' +
      '<article class="card">' +
        '<a class="card__link" href="' + caseHref(p.id) + '">' +
          '<span class="card__media">' +
            '<img src="' + esc(img(ci.representativeImage)) + '" alt="' + esc(p.representative_alt || p.title + ' 시공 완료 사진') + '"' +
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

  function featuredProjectCard(p, index) {
    var ci = caseImages(p);
    var rep = esc(img(ci.representativeImage));
    var flag = ci.hasBefore ? '<span class="card__flag">BEFORE / AFTER</span>' : '';
    var meta = [p.category, p.building, fmtDate(p.date)].filter(Boolean)
      .map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('');

    if (index === 0) {
      // Split layout (Left text, Right photo)
      return '' +
        '<article class="project-split reveal">' +
          '<div class="project-split__body">' +
            '<p class="eyebrow">FEATURED WORK</p>' +
            '<p class="project-split__meta">' + meta + '</p>' +
            '<h3 class="project-split__ttl">' + esc(p.title) + '</h3>' +
            '<p class="project-split__sum">' + esc(p.summary) + '</p>' +
            '<a class="link-arrow" href="' + caseHref(p.id) + '">시공사례 자세히 보기</a>' +
          '</div>' +
          '<a class="project-split__media" href="' + caseHref(p.id) + '">' +
            '<img src="' + rep + '" alt="' + esc(p.representative_alt || p.title + ' 시공 완료 사진') + '" loading="lazy" />' +
            flag +
          '</a>' +
        '</article>';
    } else if (index === 3) {
      // Banner layout
      return '' +
        '<article class="project-banner reveal">' +
          '<a class="project-banner__link" href="' + caseHref(p.id) + '">' +
            '<div class="project-banner__media">' +
              '<img src="' + rep + '" alt="' + esc(p.representative_alt || p.title + ' 시공 완료 사진') + '" loading="lazy" />' +
              flag +
            '</div>' +
            '<div class="project-banner__body">' +
              '<p class="project-banner__meta">' + meta + '</p>' +
              '<h3 class="project-banner__ttl">' + esc(p.title) + '</h3>' +
              '<p class="project-banner__sum">' + esc(p.summary) + '</p>' +
            '</div>' +
          '</a>' +
        '</article>';
    } else {
      // Standard asymmetric grid items
      return '' +
        '<article class="project-item reveal">' +
          '<a class="project-item__link" href="' + caseHref(p.id) + '">' +
            '<span class="project-item__media">' +
              '<img src="' + rep + '" alt="' + esc(p.representative_alt || p.title + ' 시공 완료 사진') + '" loading="lazy" />' +
              flag +
            '</span>' +
            '<span class="project-item__body">' +
              '<span class="project-item__meta">' + meta + '</span>' +
              '<span class="project-item__ttl">' + esc(p.title) + '</span>' +
              '<span class="project-item__sum">' + esc(p.summary) + '</span>' +
            '</span>' +
          '</a>' +
        '</article>';
    }
  }

  function resourceRow(r) {
    var fileHtml = r.file 
      ? '<div class="resource-row__file"><a class="resource-row__download" href="' + esc(r.file) + '" download>PDF 자료</a></div>' 
      : '<div class="resource-row__file"></div>';
    
    return '' +
      '<article class="resource-row reveal">' +
        '<a class="resource-row__link" href="' + guideHref(r.id) + '">' +
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

  /* 통합 콘텐츠 카드 — 모든 항목에 같은 메타데이터와 시각 패턴을 적용합니다.
     콘텐츠 유형은 내부 데이터로만 유지하며 목록 화면에서는 구분하지 않습니다. */
  function contentCard(item) {
    var meta = [item.category || item.categoryRaw, item.date ? fmtDate(item.date) : '']
      .filter(Boolean)
      .map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('');
    var alt = item.images.alt || item.title + ' 대표 이미지';
    /* 시공 전 사진이 있는 사례에만 비교 표시를 답니다 (기술문서에는 붙지 않습니다) */
    var flag = (item.images.beforeImages && item.images.beforeImages.length)
      ? '<span class="card__flag">BEFORE / AFTER</span>' : '';

    /* 대표 이미지가 아예 없는 항목은 관계없는 대체 이미지를 끼워 넣지 않고
       빈 .card__media 로 둡니다 (tools/lib/render.js contentCard 과 같은 규칙). */
    var own = item.images.thumbnail || item.images.cover;
    var media = own
      ? '<img src="' + esc(img(own)) + '" alt="' + esc(alt) + '"' +
        ' loading="lazy" width="800" height="600" />'
      : '';

    return '' +
      '<article class="card reveal">' +
        '<a class="card__link" href="' + esc(item.url) + '">' +
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

  function emptyState(msg) {
    return '<p class="empty">' + esc(msg) + '</p>';
  }

  /* ── 6-1. 공통 목록 위젯 ──────────────────────────────── */
  /* <div data-works="featured|카테고리명|all" data-limit="3">

     data-built 가 붙어 있으면 tools/build-site.js 가 이미 HTML 로 채운
     상자입니다. 같은 내용을 다시 그리지 않고 그대로 둡니다
     (링크가 서버 HTML 에 남아 있어야 검색·AI 가 따라올 수 있습니다). */
  function initWorkLists() {
    if (!hasProjects) return;
    $$('[data-works]').forEach(function (box) {
      if (box.hasAttribute('data-built')) return;
      var mode = box.getAttribute('data-works');
      var limit = parseInt(box.getAttribute('data-limit'), 10) || 3;
      var list;
      if (mode === 'featured') {
        list = PROJECTS.filter(function (p) { return p.featured; }).sort(byRecencyDesc);
        if (list.length < 3) list = PROJECTS.slice().sort(byRecencyDesc);
      } else if (mode === 'all' || !mode) {
        list = PROJECTS.slice().sort(byRecencyDesc);
      } else {
        list = PROJECTS.filter(function (p) { return p.category === mode; }).sort(byRecencyDesc);
      }
      list = list.slice(0, limit);
      var isAsymmetric = box.classList.contains('works-asymmetric');
      box.innerHTML = list.length ? list.map(function(p, i) {
        return isAsymmetric ? featuredProjectCard(p, i) : projectCard(p);
      }).join('')
        : emptyState('해당 분야의 콘텐츠를 준비 중입니다.');
    });
  }

  /* <div data-resources="카테고리명|all" data-limit="4">
     카테고리는 쉼표로 여러 개를 적을 수 있습니다. 예) data-resources="인젝션,특수방수"

     data-resource-ids="id1,id2" 를 함께 적으면 분류 대신 그 자료만,
     적은 순서 그대로 씁니다. 공정별 상세 페이지의 '관련 기술자료'처럼
     최신순이 아니라 주제로 골라 두어야 하는 자리에 씁니다.
     ※ tools/build-site.js 의 pickResources 와 같은 규칙입니다. */
  function initResourceLists() {
    if (!hasResources) return;
    $$('[data-resources]').forEach(function (box) {
      if (box.hasAttribute('data-built')) return;   // 이미 HTML 로 채워진 상자
      var mode = box.getAttribute('data-resources');
      var ids = box.getAttribute('data-resource-ids');
      var limit = parseInt(box.getAttribute('data-limit'), 10) || 4;
      var list;
      if (ids) {
        list = ids.split(',').map(function (s) { return s.trim(); }).filter(Boolean)
          .map(function (id) {
            return RESOURCES.filter(function (r) { return r.id === id; })[0];
          }).filter(Boolean);
      } else {
        list = RESOURCES.slice().sort(byRecencyDesc);
        if (mode && mode !== 'all') {
          var wanted = mode.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
          list = list.filter(function (r) { return wanted.indexOf(r.category) > -1; });
        }
      }
      list = list.slice(0, limit);
      box.innerHTML = list.length ? list.map(resourceRow).join('')
        : emptyState('등록된 콘텐츠가 없습니다.');
    });
  }

  /* ── 6-2. 메인페이지 Before/After ─────────────────────── */
  function initHome() {
    // Before/After 사례 전환
    var stage = $('#ba');
    var nav = $('#baNav');
    if (stage && nav && hasProjects) {
      var pairs = PROJECTS.map(function (p) {
        var ci = caseImages(p);
        return { p: p, before: ci.beforeImages[0] || '', after: ci.afterImages[0] || ci.representativeImage };
      }).filter(function (x) { return x.before && x.after; })
        .sort(function (a, b) { return byRecencyDesc(a.p, b.p); }).slice(0, 4);
      if (!pairs.length) {
        var section = document.getElementById('compare');
        if (section) section.hidden = true;
        return;
      }
      var beforeEl = $('#baBefore'), afterEl = $('#baAfter');
      var titleEl = $('#baTitle'), noteEl = $('#baNote'), moreEl = $('#baMore');
      if (!beforeEl || !afterEl || !titleEl || !noteEl) {
        stage.hidden = true;
        return;
      }

      var show = function (i) {
        var p = pairs[i].p;
        beforeEl.src = pairs[i].before;
        beforeEl.alt = p.title + ' 시공 전 사진';
        afterEl.src = pairs[i].after;
        afterEl.alt = p.title + ' 시공 후 사진';
        titleEl.textContent = p.title;
        noteEl.textContent = p.problem || p.summary;
        if (moreEl) moreEl.href = caseHref(p.id);
        $$('button', nav).forEach(function (b, bi) {
          b.classList.toggle('is-on', bi === i);
          b.setAttribute('aria-selected', bi === i ? 'true' : 'false');
        });
      };

      nav.innerHTML = pairs.map(function (x, i) {
        return '<button type="button" role="tab" aria-selected="' + (i === 0) + '"' +
               ' class="' + (i === 0 ? 'is-on' : '') + '">' + esc(x.p.category) + ' · ' + esc(fmtDate(x.p.date)) + '</button>';
      }).join('');
      $$('button', nav).forEach(function (b, i) { b.addEventListener('click', function () { show(i); }); });
      show(0);
    }
  }

  /* ── 7. 시공사례 · 기술자료 상세 ──────────────────────
     상세 페이지는 tools/build-site.js 가 case/ · guide/ 아래에 실제 파일로
     만듭니다. 예전에 여기 있던 화면 렌더러(initProjectDetail /
     initResourceDetail / updateMeta)는 그래서 지웠습니다.
     옛 주소(project.html?id=, resource.html?id=)는 noindex shim 이
     assets/js/legacy-routes.js 를 보고 새 주소로 넘겨 줍니다. */

  /* ── 8. 콘텐츠 목록 (시공사례 / 기술자료) ────────────────
     한 벌의 코드로 두 아카이브를 그립니다. 어느 쪽인지는 마크업이 정합니다.
       <div id="contentGrid" data-content-type="case">      → 시공사례만
       <div id="contentGrid" data-content-type="technical"> → 기술자료만
       (값이 없거나 'all' 이면 둘 다)

     주소 파라미터
       ?category=노출콘크리트  (예전 분류명 '인젝션','균열보수' 등도 자동 변환)
       ?q=검색어                                                        */
  function initContentPage() {
    var grid = $('#contentGrid');
    if (!grid || !hasContent) return;

    var STEP = 12;
    var baseType = grid.getAttribute('data-content-type') || 'all';
    var reqCategory = unifyCategory(qs('category'));
    var state = {
      category: reqCategory || 'all',
      q: qs('q') || '',
      shown: STEP
    };

    /* 이 화면이 다루는 항목만 미리 추려 둡니다. */
    var pool = CONTENT.filter(function (item) {
      return baseType === 'all' || item.type === baseType;
    });

    /* 순서는 CONTENT 가 이미 정해 두었습니다 (날짜 → 사례번호 → 제목).
       여기서 다시 정렬하지 않습니다. 화면마다 규칙이 갈리던 원인이었습니다.
       ▶ tools/build-site.js 의 poolFor 와 같아야 합니다.
          (서버가 먼저 12장을 그리고, 그 뒤를 이 코드가 이어받습니다) */

    var catBox  = $('#contentFilters');
    var search  = $('#contentSearch');
    var countEl = $('#contentCount');
    var moreBtn = $('#contentMore');

    function chip(value, label, active) {
      return '<button class="filter' + (active ? ' is-on' : '') + '" type="button" role="tab"' +
             ' aria-selected="' + (active ? 'true' : 'false') + '" data-value="' + esc(value) + '">' +
             esc(label) + '</button>';
    }

    if (catBox) {
      var cats = usedUnifiedCategories(pool);
      /* 분류가 하나뿐이면 '전체'와 다를 게 없으므로 필터 줄을 통째로 감춥니다. */
      if (cats.length < 2) {
        var bar = catBox.closest('.filterbar');
        if (bar) bar.hidden = true;
        state.category = 'all';
      } else {
        catBox.innerHTML = chip('all', '전체', state.category === 'all') +
          cats.map(function (c) { return chip(c, c, state.category === c); }).join('');
      }
    }
    if (search && state.q) search.value = state.q;

    function filtered() {
      var q = state.q.trim().toLowerCase();
      return pool.filter(function (item) {
        if (state.category !== 'all' && item.category !== state.category) return false;
        if (!q) return true;
        return item.searchText.indexOf(q) > -1;
      });
    }

    function render() {
      var list = filtered();
      var view = list.slice(0, state.shown);
      grid.innerHTML = view.length ? view.map(contentCard).join('')
        : emptyState('검색 조건에 맞는 자료가 없습니다. 다른 키워드나 분류를 선택해 보세요.');
      if (countEl) countEl.textContent = list.length;
      if (moreBtn) moreBtn.hidden = state.shown >= list.length;
      initReveal();
    }

    function bind(box, key) {
      if (!box) return;
      box.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-value]');
        if (!btn) return;
        state[key] = btn.getAttribute('data-value');
        state.shown = STEP;
        $$('button', box).forEach(function (b) {
          var on = b === btn;
          b.classList.toggle('is-on', on);
          b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        render();
      });
    }
    bind(catBox, 'category');

    if (search) {
      search.addEventListener('input', function () {
        state.q = search.value;
        state.shown = STEP;
        render();
      });
      search.form && search.form.addEventListener('submit', function (e) { e.preventDefault(); });
    }
    if (moreBtn) moreBtn.addEventListener('click', function () { state.shown += STEP; render(); });

    render();
  }

  /* ── 10. 상담 폼 (메일 앱 연결 — 가짜 전송 없음) ──────── */
  function initQuoteForm() {
    var form = $('#quoteForm');
    if (!form) return;

    if (CONTACT_CHANNELS.externalForm) {
      // 외부 폼(네이버폼/구글폼)이 설정되면 폼 대신 링크로 안내
      form.innerHTML = '<h2 class="form__title">견적문의</h2>' +
        '<p>온라인 견적문의는 아래 폼에서 접수합니다.</p>' +
        '<p><a class="btn btn--dark" href="' + esc(CONTACT_CHANNELS.externalForm) +
        '" target="_blank" rel="noopener noreferrer">견적문의 폼 열기</a></p>';
      return;
    }

    /* 안내 문구에 쓸 항목 이름은 화면의 <label> 에서 그대로 읽습니다 */
    function labelOf(el) {
      var lb = el.id ? form.querySelector('label[for="' + el.id + '"]') : null;
      return (lb ? lb.textContent : el.name || '').replace(/\*/g, '').replace(/\s+/g, ' ').trim();
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      /* 1) 필수 항목 검증 — 비어 있으면 메일 앱을 열지 않습니다 */
      var bad = null;
      $$('[required]', form).forEach(function (el) {
        var ok = el.type === 'checkbox' ? el.checked : el.value.trim() !== '';
        el.setAttribute('aria-invalid', ok ? 'false' : 'true');
        if (!ok && !bad) bad = el;
      });
      if (bad) {
        bad.focus();
        toast(bad.type === 'checkbox'
          ? '개인정보 수집 및 이용에 동의해 주세요.'
          : labelOf(bad) + '을(를) 입력해 주세요.');
        return;
      }

      /* 2) 메일 제목 · 본문 구성 — 한글과 사용자 입력은 encodeURIComponent 로 인코딩 */
      var get = function (n) {
        var el = form.elements[n];
        /* textarea 는 줄바꿈을 LF 로 돌려줍니다. 본문은 아래에서 CRLF 로 이어 붙이므로
           여기서 미리 맞춰 두지 않으면 사용자가 적은 줄만 LF 로 남습니다. */
        return el ? String(el.value).trim().replace(/\r\n?|\n/g, '\r\n') : '';
      };
      var subject = '[홈페이지 상담문의] ' + get('name') + ' - ' + get('type');

      /* 줄바꿈은 CRLF 로 넣습니다. 아웃룩 등 일부 메일 앱은 %0A 만 있으면
         본문을 한 줄로 이어 붙여 버립니다. */
      var CRLF = '\r\n';
      function bodyOf(msg) {
        return [
          '안녕하세요.',
          '제주노출콘크리트 홈페이지를 통해 상담문의를 드립니다.',
          '',
          '성함 / 회사명: ' + get('name'),
          '연락처: ' + get('phone'),
          '현장 위치: ' + (get('place') || '(미입력)'),
          '문의 구분: ' + get('type'),
          '',
          '현장 상태 / 요청사항:',
          msg || '(미입력)',
          '',
          '개인정보 수집 및 이용 동의: 동의'
        ].join(CRLF);
      }
      function mailUrl(msg) {
        return 'mailto:' + COMPANY.email +
          '?subject=' + encodeURIComponent(subject) +
          '&body=' + encodeURIComponent(bodyOf(msg));
      }

      /* 3) 주소 길이 제한 — 윈도우의 mailto 처리기는 주소가 길면 아무 반응 없이
         무시합니다. 한글은 인코딩되면 한 글자가 9자로 늘어나 금방 넘칩니다.
         넘칠 때는 요청사항 뒷부분만 줄이고, 줄였다는 사실을 본문에 남깁니다. */
      var MAX_URL = 1800;
      var CUT_NOTE = '(내용이 길어 일부만 옮겼습니다. 메일에서 이어 적어주세요.)';
      var message = get('message');
      var url = mailUrl(message);
      if (url.length > MAX_URL) {
        while (message && mailUrl(message + CRLF + CUT_NOTE).length > MAX_URL) {
          /* CRLF 쌍 가운데를 자르면 \r 하나가 남으므로 함께 떼어냅니다 */
          message = message.slice(0, Math.max(0, message.length - 40))
            .replace(/\r$/, '');
        }
        url = mailUrl(message + CRLF + CUT_NOTE);
      }

      /* 4) 기본 메일 앱 열기 (정적 사이트이므로 자동 발송은 하지 않습니다).
         location.href 를 바꾸는 대신 링크를 만들어 누릅니다 — 카카오톡 · 네이버
         앱의 인앱 브라우저는 스크립트가 바꾼 주소는 삼키고, 링크 클릭만
         메일 앱으로 넘겨주는 경우가 많습니다. */
      var link = document.createElement('a');
      link.href = url;
      link.rel = 'noopener';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast('메일 앱에 내용을 담았습니다. 열리지 않으면 ' + COMPANY.email + ' 로 보내주세요.');
    });
  }
  var toastTimer;
  function toast(msg) {
    var el = $('#toast');
    if (!el) { alert(msg); return; }
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-on'); }, 3200);
  }

  /* ── 부팅 ─────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    initHeader();
    initConfigBindings();
    initReveal();

    initWorkLists();
    initResourceLists();

    var page = document.body.getAttribute('data-page');
    if (page === 'home') initHome();
    if (page === 'cases' || page === 'resources') initContentPage();
    initQuoteForm();
    initCompares();
  });
})();
