/* ============================================================
   tools/lib/raw-cases.js
   ------------------------------------------------------------
   사례 원본(이미지 분류의 정본)을 읽는 단 하나의 창구입니다.

     Vault/에릭_vault/사이트원본/01.1 노출콘기술/   ← 에릭 원본 노트 (읽기 전용)
       노출콘크리트 시공기술사례 - NNN.md
     data/case-sources/NNN.md                       ← 저장소 안에 두는 원본

   (예전 위치 Raw/노출콘 시공기술사례 는 vault 정리 때 위 폴더로 옮겨졌습니다.
    다른 위치를 쓰려면 --raw-dir="vault 기준 상대경로" 또는 AINSAFE_RAW_DIR)

   저장소 원본은 한 파일 안에 발행대기 본문과 '# 이미지분류' 를 함께 담습니다.
   같은 번호가 양쪽에 있으면 **저장소 원본을 씁니다** — 사이트 쪽에서 본문과
   사진을 따로 다듬어 둔 사례이기 때문입니다. 두 곳의 사진 수가 다르면 알려 줍니다.

   ▶ 노트 서식 (에릭이 확정한 고정 스키마)
       # 작업내용
       (기술 본문)
       # 이미지분류
       ## 대표사진   ![](url) 또는 ![[파일명]]   ← 카드·아카이브 대표 이미지 1장
       ## 시공전     ![](url) …  또는  사진없음
       ## 시공중     ![](url) …  또는  사진없음
       ## 시공후     ![](url) …  또는  사진없음

   ▶ 규칙
     · 이미지의 "순서"는 노트에 적힌 그대로가 정답입니다. 재정렬하지 않습니다.
     · '사진없음' 은 "사진이 의도적으로 없다" 는 뜻입니다(= 화면에서 구간 숨김).
     · 이 파일은 추론을 하지 않습니다. 노트에 없는 이미지는 만들어 내지 않습니다.
       (예전 PDF·네이버 링크·발행대기 노트·사이트 데이터에서 되살리지 않습니다)
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

/** vault 안의 원본 노트 폴더 (vault 기준 상대경로). --raw-dir= 로 바꿀 수 있습니다. */
const DEFAULT_RAW_DIR = path.join('사이트원본', '01.1 노출콘기술');

function rawDirOf() {
  const { argValue } = require('./case-source');
  return path.normalize(argValue('raw-dir', process.env.AINSAFE_RAW_DIR || DEFAULT_RAW_DIR));
}
const NOTE_RE = /^노출콘크리트 시공기술사례 - (\d{3})\.md$/;

/* 이미지 역할 — 노트의 소제목 → 사이트 데이터 항목 이름 */
const ROLES = [
  { heading: '대표사진', key: 'representative' },
  { heading: '시공전',   key: 'before' },
  { heading: '시공중',   key: 'process' },
  { heading: '시공후',   key: 'after' }
];
const HEADING_TO_KEY = ROLES.reduce((m, r) => (m[r.heading] = r.key, m), {});

const NO_PHOTO = '사진없음';

/* 마크다운 이미지 — ![alt](url).
   한 줄에 여러 장이 붙어 있는 노트가 많아 전역 검색으로 훑습니다. */
const IMAGE_RE = /!\[([^\]]*)\]\(\s*(<[^>]*>|[^)\s]+)[^)]*\)/g;

/* 옵시디언 첨부 — ![[파일명.jpg]] / ![[파일명.jpg|300]].
   주소가 아니라 vault 안의 파일이므로 { wiki: 파일명 } 으로 따로 표시합니다. */
const WIKI_IMAGE_RE = /!\[\[([^\]|#]+?)(?:[|#][^\]]*)?\]\]/g;

/** 제목 줄에서 소제목만 떼어 냅니다. ('## 시공후![](url)' 처럼 붙여 쓴 노트가 있습니다) */
function splitHeading(rest) {
  const cut = rest.search(/!\[|\[/);
  const title = (cut === -1 ? rest : rest.slice(0, cut)).trim();
  const tail = cut === -1 ? '' : rest.slice(cut);
  return { title, tail };
}

/** 구간 본문에서 이미지 URL 을 적힌 순서 그대로 뽑습니다. */
function imagesIn(body) {
  const out = [];
  let m;
  IMAGE_RE.lastIndex = 0;
  while ((m = IMAGE_RE.exec(body)) !== null) {
    let url = m[2].trim();
    if (url[0] === '<' && url[url.length - 1] === '>') url = url.slice(1, -1);
    if (url) out.push({ at: m.index, alt: m[1].trim(), url });
  }
  WIKI_IMAGE_RE.lastIndex = 0;
  while ((m = WIKI_IMAGE_RE.exec(body)) !== null) {
    const name = m[1].trim();
    if (name) out.push({ at: m.index, alt: '', url: name, wiki: name });
  }
  /* 두 형식이 섞여 있어도 노트에 적힌 순서 그대로 둡니다 */
  return out.sort((a, b) => a.at - b.at).map(({ at, ...img }) => img);
}

/* ── 옵시디언 첨부 찾기 ─────────────────────────────────────
   옵시디언처럼 파일 이름으로 찾습니다: Assets 폴더를 먼저 보고,
   없으면 vault 전체(숨김 폴더 제외)에서 같은 이름을 찾습니다.
   이름이 같은 파일이 여러 개면 고르지 않고 오류로 알립니다. */
const _vaultFiles = new Map();
function vaultFileIndex(vaultDir) {
  if (_vaultFiles.has(vaultDir)) return _vaultFiles.get(vaultDir);
  const index = new Map();
  const walk = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    entries.forEach((e) => {
      if (e.name[0] === '.') return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(jpe?g|png|gif|webp|avif)$/i.test(e.name)) {
        if (!index.has(e.name)) index.set(e.name, []);
        index.get(e.name).push(full);
      }
    });
  };
  walk(vaultDir);
  _vaultFiles.set(vaultDir, index);
  return index;
}

/** ![[파일명]] → { file } 또는 { error } */
function resolveWikiImage(vaultDir, name) {
  const base = path.basename(name);
  const direct = path.join(vaultDir, 'Assets', base);
  if (fs.existsSync(direct)) return { file: direct };
  const hits = vaultFileIndex(vaultDir).get(base) || [];
  if (hits.length === 1) return { file: hits[0] };
  if (!hits.length) return { error: `첨부 파일을 vault 에서 찾을 수 없습니다: ${name}` };
  return { error: `같은 이름의 첨부가 ${hits.length}개 있습니다 (고르지 않습니다): ${name}` };
}

/**
 * 노트 한 장 → { work, images:{ representative, before, process, after }, notes[] }
 * images 의 각 항목은 { declaredNone:Boolean, list:[{alt,url}] } 입니다.
 */
function parseRawNote(raw) {
  const lines = String(raw).replace(/^﻿/, '').replace(/\r\n/g, '\n').split('\n');

  const bodies = {};                 // key → 구간 본문
  const order = [];                  // 노트에 나타난 구간 순서
  let work = '';
  let bucket = null;
  let buf = [];

  const flush = () => {
    if (bucket === null) return;
    const text = buf.join('\n');
    if (bucket === 'work') work = text.trim();
    else bodies[bucket] = (bodies[bucket] || '') + '\n' + text;
    buf = [];
  };

  for (const line of lines) {
    const h = /^#{1,6}\s*(.*)$/.exec(line);
    if (!h) { buf.push(line); continue; }

    const { title, tail } = splitHeading(h[1]);
    flush();
    if (title === '작업내용') bucket = 'work';
    else if (HEADING_TO_KEY[title]) { bucket = HEADING_TO_KEY[title]; order.push(bucket); }
    else bucket = null;             // '이미지분류' 등 묶음 제목 — 본문을 버립니다
    buf = tail ? [tail] : [];
  }
  flush();

  const images = {};
  ROLES.forEach(({ key }) => {
    const body = bodies[key];
    images[key] = body == null
      ? { declared: false, declaredNone: false, list: [] }
      : { declared: true, declaredNone: body.indexOf(NO_PHOTO) > -1, list: imagesIn(body) };
  });

  return { work, images, sectionOrder: order };
}

/**
 * Raw 폴더 + 저장소 원본을 사례 번호 오름차순으로 읽습니다.
 * 같은 번호가 양쪽에 있으면 vault 의 Raw 노트를 씁니다.
 */
function loadRawCases(vaultDir) {
  const repo = loadRepoRawCases();
  const byNo = new Map(repo.map((c) => [c.case_no, c]));
  const vault = loadVaultRawCases(vaultDir).filter((c) => {
    const r = byNo.get(c.case_no);
    if (!r) return true;
    /* 저장소 원본이 우선입니다. vault 노트와 사진 수가 다르면 알려 줍니다. */
    const diff = ROLES.map(({ key, heading }) =>
      c.images[key].list.length !== r.images[key].list.length
        ? `${heading} vault ${c.images[key].list.length} · 저장소 ${r.images[key].list.length}` : '')
      .filter(Boolean);
    if (diff.length) {
      r.notices = (r.notices || []).concat({
        level: 'warn',
        text: 'vault 원본과 저장소 원본의 사진 수가 다릅니다 (' + diff.join(', ') + ') — 저장소 원본을 씁니다'
      });
    }
    r.vault_note = c.source_note;
    return false;
  });
  return vault.concat(repo).sort((a, b) => a.case_no.localeCompare(b.case_no));
}

/** 저장소 원본(data/case-sources/NNN.md)을 Raw 노트와 같은 모양으로 읽습니다. */
function loadRepoRawCases(repoRoot) {
  const { REPO_ROOT, REPO_SOURCE_DIR, REPO_SOURCE_RE } = require('./case-source');
  const dir = path.join(repoRoot || REPO_ROOT, REPO_SOURCE_DIR);
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .map((file) => ({ file, m: REPO_SOURCE_RE.exec(file) }))
    .filter((x) => x.m)
    .sort((a, b) => a.m[1].localeCompare(b.m[1]))
    .map(({ file, m }) => Object.assign(
      {
        case_no: m[1],
        file,
        source_note: REPO_SOURCE_DIR.split(path.sep).join('/') + '/' + file,
        repoSource: true
      },
      parseRawNote(fs.readFileSync(path.join(dir, file), 'utf8'))
    ));
}

/** vault 의 Raw 폴더를 사례 번호 오름차순으로 읽습니다. */
function loadVaultRawCases(vaultDir) {
  const EOL = String.fromCharCode(10);
  const rawDir = rawDirOf();
  const dir = path.join(vaultDir, rawDir);
  if (!fs.existsSync(vaultDir)) {
    const err = new Error([
      'vault 폴더를 찾을 수 없습니다: ' + vaultDir,
      '  --vault="…/에릭_vault" 또는 AINSAFE_VAULT 환경변수로 위치를 지정하세요.'
    ].join(EOL));
    err.code = 'ENOVAULT';
    throw err;
  }
  if (!fs.existsSync(dir)) {
    const err = new Error([
      '사례 원본 폴더를 찾을 수 없습니다: ' + dir,
      '  기대하는 위치: <vault>/' + rawDir.replace(/\\/g, '/'),
      '  폴더가 옮겨졌다면 --raw-dir="vault 기준 상대경로" 또는 AINSAFE_RAW_DIR 로 지정하세요.'
    ].join(EOL));
    err.code = 'ENORAW';
    throw err;
  }
  const notes = fs.readdirSync(dir)
    .map((file) => ({ file, m: NOTE_RE.exec(file) }))
    .filter((x) => x.m);
  if (!notes.length) {
    const err = new Error('사례 원본 폴더에 "노출콘크리트 시공기술사례 - NNN.md" 노트가 없습니다: ' + dir);
    err.code = 'ENORAW';
    throw err;
  }
  return notes
    .sort((a, b) => a.m[1].localeCompare(b.m[1]))
    .map(({ file, m }) => {
      const parsed = parseRawNote(fs.readFileSync(path.join(dir, file), 'utf8'));
      const notices = [];
      /* 옵시디언 첨부는 vault 안의 실제 파일로 풀어 둡니다 */
      ROLES.forEach(({ key }) => parsed.images[key].list.forEach((img) => {
        if (!img.wiki) return;
        const hit = resolveWikiImage(vaultDir, img.wiki);
        if (hit.file) img.local = hit.file;
        else notices.push({ level: 'error', text: hit.error });
      }));
      return Object.assign(
        { case_no: m[1], file, source_note: rawDir.replace(/\\/g, '/') + '/' + file, notices },
        parsed
      );
    });
}

/**
 * 노트가 스키마를 지키는지 확인합니다. 고쳐 주지 않고, 그대로 알려만 줍니다.
 * (대표사진이 없는 사례를 다른 사진으로 몰래 채우지 않기 위한 장치입니다)
 */
function auditRawCase(c) {
  const issues = (c.notices || []).slice();
  const rep = c.images.representative;

  if (!rep.declared) issues.push({ level: 'error', text: '대표사진 구간이 없습니다' });
  else if (rep.list.length === 0 && !rep.declaredNone) issues.push({ level: 'error', text: '대표사진이 비어 있습니다' });
  else if (rep.declaredNone) issues.push({ level: 'error', text: "대표사진이 '사진없음' 입니다" });
  else if (rep.list.length > 1) issues.push({ level: 'warn', text: `대표사진이 ${rep.list.length}장입니다 (첫 장을 사용)` });

  ['before', 'process', 'after'].forEach((key) => {
    const ko = ROLES.find((r) => r.key === key).heading;
    const s = c.images[key];
    if (!s.declared) { issues.push({ level: 'warn', text: `${ko} 구간이 없습니다` }); return; }
    if (!s.declaredNone && s.list.length === 0) {
      issues.push({ level: 'warn', text: `${ko} 구간이 비어 있습니다 ('사진없음' 표기 없음 — 사진 없음으로 처리)` });
    }
  });

  return issues;
}

module.exports = {
  DEFAULT_RAW_DIR, rawDirOf, ROLES, parseRawNote, resolveWikiImage,
  loadRawCases, loadVaultRawCases, loadRepoRawCases,
  auditRawCase
};
