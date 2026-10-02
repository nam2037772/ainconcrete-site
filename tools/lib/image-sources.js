/* ============================================================
   tools/lib/image-sources.js
   ------------------------------------------------------------
   사이트 사례 이미지가 "어느 원본에서 왔는지" 적어 두는 장부입니다.

     data/case-image-sources.json
       { "assets/images/case-studies/case-047-…/representative.png":
           { "source": "vault:Assets/콘크리트 벽 보수 전후 비교 (1).png",
             "sha256": "3f864a8f…" },                       ← vault 첨부
         "assets/images/case-studies/case-045-…/after-01.jpg":
           { "source": "https://postfiles.pstatic.net/…" } }  ← 네이버 주소

   왜 필요한가
     예전에는 같은 경로에 파일이 "있기만 하면" 건너뛰었습니다.
     옵시디언에서 대표사진을 다른 사진으로 바꿔도 사이트 파일 이름이 같으면
     옛 사진이 그대로 남았습니다. 이제는 원본이 바뀌었는지를 이 장부로 판단합니다.
       · vault 첨부   — 원본 파일 이름이나 내용(sha256)이 바뀌면 다시 복사
       · 네이버 주소  — 주소가 바뀌면 다시 내려받기
     장부에 아직 없는 네이버 사진은 지금 파일을 그 주소에서 받은 것으로 보고
     기준만 적어 둡니다 (다시 받지 않습니다). vault 첨부는 복사가 결정적이라
     장부에 없으면 다시 복사합니다.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { REPO_ROOT, writeFileSafe } = require('./case-source');

const MANIFEST = path.join(REPO_ROOT, 'data', 'case-image-sources.json');

function loadManifest() {
  try { return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch (e) { return {}; }
}

function saveManifest(map) {
  const sorted = {};
  Object.keys(map).sort().forEach((k) => { sorted[k] = map[k]; });
  writeFileSafe(MANIFEST, JSON.stringify(sorted, null, 2) + '\n');
}

const _hash = new Map();
function sha256(file) {
  if (!_hash.has(file)) {
    _hash.set(file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
  }
  return _hash.get(file);
}

/** 계획의 내려받기 항목 하나 → 장부에 적을 값 */
function fingerprint(d, vaultDir) {
  if (d.local) {
    const rel = path.relative(vaultDir, d.local).split(path.sep).join('/');
    const fp = { source: 'vault:' + rel, sha256: sha256(d.local) };
    if (d.width) fp.width = d.width;          // 고화질본 등 기본(773px)이 아닌 크기
    return fp;
  }
  return { source: d.url };
}

/**
 * 사이트 파일을 원본에서 다시 가져와야 하는지.
 * @returns {'missing'|'changed'|'unrecorded'|null}  null = 최신
 */
function staleReason(d, vaultDir, manifest) {
  if (!fs.existsSync(path.join(REPO_ROOT, d.path))) return 'missing';
  const entry = manifest[d.path];
  const fp = fingerprint(d, vaultDir);
  if (!entry) return d.local ? 'unrecorded' : null;
  if (entry.source !== fp.source) return 'changed';
  if (fp.sha256 && entry.sha256 !== fp.sha256) return 'changed';
  if ((entry.width || 0) !== (fp.width || 0)) return 'changed';
  return null;
}

module.exports = { MANIFEST, loadManifest, saveManifest, fingerprint, staleReason };
