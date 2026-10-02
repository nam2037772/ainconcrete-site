/* ============================================================
   tools/lib/case-plan.js
   ------------------------------------------------------------
   에릭 검수본 Raw 노트 + 발행대기 노트를 합쳐, 사이트가 쓸
   "사례 계획(plan)" 한 벌을 만듭니다.

     Raw (이미지 분류의 정본)  ─┐
                               ├→ plan ─→ 이미지 내려받기 (fetch-case-images.js)
     발행대기 (제목·본문)      ─┘         └→ projects.js 재작성 (rebuild-cases.js)

   ▶ 이미지 파일 이름은 에릭이 적어 둔 "순서"를 그대로 씁니다.
       representative.jpg
       before-01.jpg  before-02.jpg …
       process-01.jpg process-02.jpg …
       after-01.jpg   after-02.jpg  …
     같은 사진이 대표와 시공후에 함께 쓰이면 먼저 정해진 경로를 다시 씁니다.
     (= 같은 파일을 두 번 내려받지 않습니다)
   ============================================================ */
'use strict';

const { CASE_IMAGE_ROOT, loadRepoSources } = require('./case-source');
const { loadRawCases, auditRawCase } = require('./raw-cases');

/** 공개를 중단(은퇴)한 사례 번호 — 원본(vault Raw · 발행대기 · 저장소 원본)은
    손대지 않고, 사이트 생성 단계에서만 건너뜁니다. rebuild-cases 가 이 번호를
    "이번에는 없는 사례"로 보고 자동으로 RETIRED_PROJECT_IDS 로 옮기므로,
    옛 주소는 죽지 않고 "게시가 종료되었습니다" 안내로 이어집니다.
    다시 공개하려면 이 목록에서 번호를 빼기만 하면 됩니다. */
const RETIRED_CASE_NUMBERS = new Set([
  '046' // 제주 협재 UHPC 패널 균열 노출콘크리트 면보수 — 건물주 요청으로 공개 중단 (2026-08-23)
]);

/** URL 에서 확장자를 얻습니다. 알 수 없으면 .jpg 로 둡니다. */
function extensionOf(url) {
  const clean = String(url).split(/[?#]/)[0];
  const m = /\.(jpe?g|png|gif|webp|avif)$/i.exec(clean);
  return m ? '.' + m[1].toLowerCase().replace('jpeg', 'jpg') : '.jpg';
}

/**
 * 사례 하나의 이미지 배치를 정합니다.
 * @returns {{ dir, representative, before[], process[], after[], downloads[] }}
 *   각 항목은 { url, file, path } 이며 downloads 는 중복을 뺀 실제 내려받기 목록입니다.
 */
function planImages(rawCase, slug) {
  const dir = `${CASE_IMAGE_ROOT}/case-${rawCase.case_no}-${slug}`;
  const seen = new Map();          // url → 사이트 경로
  const downloads = [];

  /* img.local — 옵시디언 첨부(![[파일명]])가 가리키는 vault 안의 실제 파일.
     이런 사진은 내려받지 않고 복사합니다 (fetch-case-images.js). */
  const assign = (img, file) => {
    const url = img.url;
    if (seen.has(url)) return { url, file: seen.get(url).split('/').pop(), path: seen.get(url), reused: true };
    const p = `${dir}/${file}`;
    seen.set(url, p);
    downloads.push(img.local ? { url, path: p, local: img.local } : { url, path: p });
    return { url, file, path: p, reused: false };
  };

  /* 대표사진 — 카드에는 첫 장만 씁니다. 노트에 여러 장이 적혀 있으면
     나머지도 대표 구간에 적힌 순서대로 함께 보여 줍니다. (골라내지 않습니다) */
  const repList = rawCase.images.representative.list.map((img, i) =>
    assign(img, i === 0
      ? 'representative' + extensionOf(img.url)
      : `representative-${String(i + 1).padStart(2, '0')}${extensionOf(img.url)}`));

  const role = (key, prefix) => rawCase.images[key].list.map((img, i) =>
    assign(img, `${prefix}-${String(i + 1).padStart(2, '0')}${extensionOf(img.url)}`));

  return {
    dir,
    representative: repList[0] || null,
    extraRepresentative: repList.slice(1),
    before: role('before', 'before'),
    process: role('process', 'process'),
    after: role('after', 'after'),
    downloads
  };
}

/**
 * Raw 전체 + 본문 노트 색인 → 사례 계획 목록.
 * Raw 에 있는 사례만 만듭니다. (지워진 번호는 되살리지 않습니다)
 *
 * 저장소 원본(data/case-sources/NNN.md)은 한 파일에 이미지분류와 본문이 함께 있으므로
 * 같은 파일끼리 맞춥니다. 우연히 번호가 같은 vault 발행대기 노트와 섞이지 않습니다.
 */
function buildCasePlans(vaultDir, drafts) {
  const raws = loadRawCases(vaultDir).filter((raw) => !RETIRED_CASE_NUMBERS.has(raw.case_no));
  const repoDrafts = loadRepoSources();
  const plans = [];
  const problems = [];

  raws.forEach((raw) => {
    const draft = raw.repoSource ? repoDrafts[raw.case_no] : drafts[raw.case_no];
    if (!draft) {
      problems.push({
        case_no: raw.case_no,
        level: 'error',
        text: '발행대기 노트가 없어 제목·본문을 만들 수 없습니다 — ' +
              `vault Wiki/홈페이지/발행대기 에 case_no: ${Number(raw.case_no)} 노트를 두거나 ` +
              `저장소에 data/case-sources/${raw.case_no}.md 를 만드세요 (사례는 이번에 추가되지 않습니다)`
      });
      auditRawCase(raw).filter((i) => i.level === 'error')
        .forEach((i) => problems.push({ case_no: raw.case_no, level: i.level, text: i.text }));
      return;
    }
    /* 같은 번호를 vault 노트도 쓰고 있으면 조용히 넘어가지 않고 알려 줍니다. */
    if (raw.repoSource && drafts[raw.case_no] && drafts[raw.case_no].path !== draft.path) {
      problems.push({
        case_no: raw.case_no,
        level: 'warn',
        text: '같은 번호의 vault 발행대기 노트가 있습니다 (' + drafts[raw.case_no].file +
              ') — 저장소 원본 ' + draft.file + ' 을 씁니다'
      });
    }
    auditRawCase(raw).forEach((i) => problems.push({ case_no: raw.case_no, level: i.level, text: i.text }));

    const images = planImages(raw, draft.slug);
    plans.push({
      case_no: raw.case_no,
      slug: draft.slug,
      id: `obsidian-case-${raw.case_no}-${draft.slug}`,
      raw,
      draft,
      images,
      /* '사진없음' 이거나 실제 사진이 없는 구간 — 화면에서 숨겨야 합니다 */
      hidden: ['before', 'process', 'after'].filter((k) => images[k].length === 0)
    });
  });

  return { plans, problems };
}

module.exports = { extensionOf, planImages, buildCasePlans, RETIRED_CASE_NUMBERS };
