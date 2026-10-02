/* ============================================================
   tools/lib/local-image.js
   ------------------------------------------------------------
   옵시디언 첨부(![[파일명]]) 사진을 사이트 이미지로 복사합니다.

   네이버 블로그 사진은 이미 가로 773px(type=w773)로 내려오지만,
   vault 첨부는 휴대폰 원본(가로 4000px · 3MB 안팎)입니다.
   그래서 기존 사례와 같은 규격으로 맞춰 저장합니다.
     · 가로 773px 보다 크면 773px 로 줄임 (비율 유지, 자르지 않음)
     · 휴대폰 회전 정보(EXIF Orientation)를 반영한 뒤
     · EXIF(촬영 위치 GPS 포함)는 지우고 저장
     · JPEG 품질 86

   Node 에는 이미지 라이브러리가 없어 Python Pillow 를 씁니다.
   없으면 조용히 원본을 복사하지 않고, 설치 방법을 적어 멈춥니다.
   ============================================================ */
'use strict';

const { spawnSync } = require('child_process');
const { assertWritable } = require('./case-source');

const SITE_WIDTH = 773;

const PY = [
  'import sys',
  'from PIL import Image, ImageOps',
  'src, dst, width = sys.argv[1], sys.argv[2], int(sys.argv[3])',
  'im = ImageOps.exif_transpose(Image.open(src))',
  'if im.width > width:',
  '    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)',
  'if dst.lower().endswith(".png"):',
  '    im.save(dst, "PNG", optimize=True)',
  'else:',
  '    im.convert("RGB").save(dst, "JPEG", quality=86, optimize=True, progressive=True)',
  'print(im.width, im.height)'
].join('\n');

let pythonCmd = null;
function python() {
  if (pythonCmd) return pythonCmd;
  for (const cmd of ['python', 'python3', 'py']) {
    const r = spawnSync(cmd, ['-c', 'import PIL'], { encoding: 'utf8' });
    if (r.status === 0) return (pythonCmd = cmd);
  }
  const err = new Error([
    'vault 첨부 사진을 줄이려면 Python 과 Pillow 가 필요합니다.',
    '  설치: python -m pip install Pillow'
  ].join(String.fromCharCode(10)));
  err.code = 'ENOPILLOW';
  throw err;
}

/** vault 의 사진(src) → 사이트 이미지(dest, 절대경로). { width, height } 를 돌려줍니다. */
function copyLocalImage(src, dest) {
  const fs = require('fs');
  const path = require('path');
  assertWritable(dest);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const r = spawnSync(python(), ['-c', PY, src, dest, String(SITE_WIDTH)], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('사진 변환 실패: ' + src + ' — ' + (r.stderr || '').trim().split('\n').pop());
  const [width, height] = String(r.stdout).trim().split(/\s+/).map(Number);
  return { width, height };
}

module.exports = { SITE_WIDTH, copyLocalImage };
