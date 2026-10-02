#!/usr/bin/env node
/* ============================================================
   tools/fetch-case-images.js
   ------------------------------------------------------------
   에릭 검수본 Raw 노트가 "지금" 가리키는 이미지만 내려받아
   사이트의 사례 이미지 폴더에 고정 경로로 저장합니다.

     node tools/fetch-case-images.js                # 미리보기
     node tools/fetch-case-images.js --write        # 실제로 내려받기
     node tools/fetch-case-images.js --write --prune  # 노트에서 빠진 파일도 정리
     node tools/fetch-case-images.js --vault="D:\\경로\\에릭_vault"

   ▶ 원칙
     · 노트에 없는 이미지는 내려받지 않습니다. (에릭이 뺀 사진을 되살리지 않습니다)
     · 같은 사진이 대표·시공후에 겹치면 한 번만 내려받습니다.
     · 이미 있는 파일은 건너뜁니다. (--force 로 다시 받습니다)
     · 원본이 주소가 아니라 사이트 경로면(저장소 원본 data/case-sources) 이미
       저장소 안에 있는 사진이므로 내려받지 않고 있는지만 확인합니다.
     · 옵시디언 첨부(![[파일명]])는 vault 의 파일을 찾아 복사합니다.
       기존 사례와 같은 가로 773px 로 줄이고 EXIF(GPS 포함)는 지웁니다.
       (tools/lib/local-image.js — Python Pillow 필요)
     · 사이트 이미지는 저장소 안에만 만듭니다. vault 안에는 쓰지 않습니다.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const {
  REPO_ROOT, CASE_IMAGE_ROOT, resolveVault, loadDrafts, assertWritable
} = require('./lib/case-source');
const { buildCasePlans } = require('./lib/case-plan');
const { copyLocalImage } = require('./lib/local-image');

const WRITE = process.argv.includes('--write');
const FORCE = process.argv.includes('--force');
const PRUNE = process.argv.includes('--prune');
const VAULT = resolveVault();

/* 네이버 CDN 은 리퍼러 없이도 열리지만, 블로그와 같은 조건으로 요청합니다. */
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
  Referer: 'https://blog.naver.com/ainsafe',
  Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
};

function download(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('리다이렉트가 너무 많습니다'));
    const lib = url.startsWith('http://') ? http : https;
    const req = lib.get(url, { headers: HEADERS, timeout: 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        return resolve(download(next, dest, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (buf.length < 1024) return reject(new Error('내용이 너무 작습니다 (' + buf.length + ' bytes)'));
        assertWritable(dest);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, buf);
        resolve(buf.length);
      });
    });
    req.on('timeout', () => req.destroy(new Error('시간 초과')));
    req.on('error', reject);
  });
}

async function main() {
  const drafts = loadDrafts(VAULT);
  const { plans, problems } = buildCasePlans(VAULT, drafts);

  const wanted = new Map();       // 사이트 경로 → url
  const localOf = new Map();      // 사이트 경로 → vault 안의 첨부 파일
  plans.forEach((p) => p.images.downloads.forEach((d) => {
    wanted.set(d.path, d.url);
    if (d.local) localOf.set(d.path, d.local);
  }));

  /* 원본이 주소인 것만 내려받습니다. 사이트 경로로 적힌 것(저장소 원본)은
     이미 저장소 안에 있는 사진이라 받을 것이 없습니다. */
  const isRemote = (url) => url.indexOf('http://') === 0 || url.indexOf('https://') === 0;
  const inRepo = [...wanted].filter(([dest, url]) => !isRemote(url) && !localOf.has(dest));
  const missingInRepo = inRepo.filter(([dest]) => !fs.existsSync(path.join(REPO_ROOT, dest)));
  const todo = [...wanted].filter(([dest, url]) =>
    (isRemote(url) || localOf.has(dest)) && (FORCE || !fs.existsSync(path.join(REPO_ROOT, dest))));

  console.log('vault        : ' + VAULT);
  console.log('사례          : ' + plans.length + '건');
  console.log('참조 이미지   : ' + wanted.size + '개 (중복 제거 후)');
  console.log('저장소 안     : ' + inRepo.length + '개 (내려받지 않음)');
  console.log('vault 첨부    : ' + localOf.size + '개 (복사 · 가로 773px)');
  console.log('가져올 대상   : ' + todo.length + '개\n');

  if (missingInRepo.length) {
    console.log('■ 저장소 안에 있어야 하는데 파일이 없습니다 (' + missingInRepo.length + '개)');
    missingInRepo.forEach(([dest]) => console.log('  x ' + dest));
    console.log('');
  }

  const errors = [];
  if (WRITE) {
    let done = 0;
    for (const [dest, url] of todo) {
      try {
        const size = localOf.has(dest)
          ? copyLocalImage(localOf.get(dest), path.join(REPO_ROOT, dest))
          : await download(url, path.join(REPO_ROOT, dest));
        done++;
        if (done % 25 === 0 || done === todo.length) console.log(`  ${done}/${todo.length} …`);
        void size;
      } catch (e) {
        errors.push(`${dest}\n      ${url}\n      ${e.message}`);
      }
    }
  } else {
    todo.slice(0, 10).forEach(([dest]) => console.log('  · ' + dest));
    if (todo.length > 10) console.log(`  … 외 ${todo.length - 10}개`);
  }

  /* 노트에서 빠진 파일 — 에릭이 뺀 사진이 사이트에 남지 않도록 알려 줍니다. */
  const caseDirs = new Set(plans.map((p) => p.images.dir));
  const root = path.join(REPO_ROOT, CASE_IMAGE_ROOT);
  const stale = [];
  if (fs.existsSync(root)) {
    fs.readdirSync(root).forEach((name) => {
      const rel = `${CASE_IMAGE_ROOT}/${name}`;
      const full = path.join(root, name);
      if (!fs.statSync(full).isDirectory()) return;
      if (!caseDirs.has(rel)) { stale.push(rel + '/  (사례 폴더 전체)'); return; }
      fs.readdirSync(full).forEach((f) => {
        if (!wanted.has(`${rel}/${f}`)) stale.push(`${rel}/${f}`);
      });
    });
  }

  if (stale.length) {
    console.log(`\n■ 노트에 없는 파일 (${stale.length}개)`);
    stale.slice(0, 40).forEach((s) => console.log('  - ' + s));
    if (stale.length > 40) console.log(`  … 외 ${stale.length - 40}개`);
    if (WRITE && PRUNE) {
      stale.forEach((s) => {
        const target = path.join(REPO_ROOT, s.replace(/\s.*$/, '').replace(/\/$/, ''));
        assertWritable(target);
        fs.rmSync(target, { recursive: true, force: true });
      });
      console.log('  → 삭제했습니다.');
    } else if (!PRUNE) {
      console.log('  (--prune 을 붙이면 삭제합니다)');
    }
  }

  const errs = problems.filter((p) => p.level === 'error').concat(missingInRepo);
  if (problems.length) {
    console.log(`\n■ 노트 확인 필요 (${problems.length}건)`);
    problems.forEach((p) => console.log(`  ${p.level === 'error' ? '✗' : '!'} ${p.case_no} — ${p.text}`));
  }
  if (errors.length) {
    console.log(`\n■ 내려받기 실패 (${errors.length}건)`);
    errors.forEach((e) => console.log('  ✗ ' + e));
  }

  if (!WRITE) console.log('\n미리보기입니다. 실제로 받으려면 --write 를 붙이세요.');
  process.exit(errors.length || errs.length ? 1 : 0);
}

main().catch((e) => {
  /* 경로를 못 찾는 등 예상한 오류는 안내문만 보여 줍니다 (스택 대신) */
  console.error(e.code && /^E(NO|VAULT)/.test(e.code) ? '✗ ' + e.message : e);
  process.exit(1);
});
