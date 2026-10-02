# 주식회사 아인산업안전 — 노출콘크리트 면보수 · 특수방수 전문 홈페이지

무채색 건축 포트폴리오 톤의 정적 웹사이트입니다.
빌드 도구·서버·데이터베이스 없이 **HTML + CSS + Vanilla JS** 로만 동작하며, GitHub Pages에 그대로 올리면 됩니다.

---

## 1. 파일 구조

```
ainsafe-site/
├─ index.html          메인 (전문성 선언 → 두 분야 → 실제 시공사례 → 기술자료 → 자재 → 상담)
├─ concrete.html       노출콘크리트 면보수 (공정별 기준 · 시공 흐름)
├─ reinforcement.html  콘크리트 보수보강 (균열보수 · 단면복구 · 증상별 공법 선택 가이드)
├─ waterproof.html     특수방수 (인젝션 · 배면그라우팅 · 액상고무)
│  ├─ carbon-fiber-reinforcement.html   CFRP 탄소섬유 구조보강 (보수보강 하위 공정)
│  ├─ epoxy-crack-repair.html           에폭시 균열보수 · 저압주입 (보수보강 하위 공정)
│  └─ concrete-surface-protection.html  표면강화 · 발수코팅 (표면보호 하위 공정)
├─ projects.html       시공사례 목록 ★ (실제 현장 기록 / 검색 · 시공 전후 비교 우선)
├─ project.html        시공사례 상세  → project.html?id=아이디
├─ resources.html      기술자료 목록 ★ (공정별 판단 기준 / 검색 · 분야 필터)
├─ resource.html       기술자료 상세  → resource.html?id=아이디
├─ materials.html      관련 자재 구매 (보수재 · 방수재 · 발수제 안내 → 외부 구매처 연결)
├─ about.html          회사소개
├─ contact.html        상담문의 · 견적문의
├─ privacy.html        개인정보처리방침
├─ 404.html            없는 페이지
├─ robots.txt / sitemap.xml
└─ assets/
   ├─ css/style.css        전체 스타일 (디자인 토큰 → 반응형 순서)
   ├─ js/config.js         회사정보 · 외부링크 · 상담채널  ← 가장 먼저 확인할 파일
   ├─ js/projects.js       시공사례 데이터 (원본)
   ├─ js/resources.js      기술문서 데이터 (원본)
   ├─ js/case-images.js    시공사례 이미지 역할 정규화 (대표 / 시공 전 / 중 / 후) ★
   ├─ js/content.js        통합 콘텐츠 모델 — 위 두 데이터를 하나의 형태로 합칩니다
   ├─ js/main.js           공통 동작 + 페이지별 렌더러
   └─ images/
      ├─ brand/    로고 · SNS 아이콘
      ├─ hero/     히어로 및 공법 설명 이미지
      ├─ projects/ 시공사례 사진 (`-thumb` = 목록용 축소본)
      └─ case-studies/case-<번호>-<slug>/  옵시디언 유래 시공기술사례 사진
└─ tools/                  빌드 도구 없는 사이트를 위한 Node 스크립트 (배포물 아님)
   ├─ fetch-case-images.js Raw 노트가 가리키는 사진만 내려받아 사이트 경로로 저장
   ├─ rebuild-cases.js     Raw + 발행대기 → projects.js 재작성 (사례 데이터 정본화)
   ├─ check-cases.js       시공사례 데이터 검증 + Raw 대조 (배포 전 실행)
   └─ lib/
      ├─ raw-cases.js      에릭 검수본 Raw 노트 파서 (대표/시공전/시공중/시공후)
      ├─ case-plan.js      Raw + 발행대기 → 사례별 이미지 배치 계획
      └─ case-source.js    프론트매터 파서 · 발행대기 색인 · projects.js 읽기/쓰기
```

로컬 확인:

```bash
cd ainsafe-site
python -m http.server 8777
# http://localhost:8777
```

> `index.html`을 더블클릭해도 대부분 동작하지만, 브라우저 보안 정책 때문에
> 목록/상세 렌더가 막힐 수 있습니다. 위 방식으로 확인하세요.

---

## 1-2. 통합 콘텐츠 구조 (기술자료 = 기술문서 + 시공사례)

`시공사례` 메뉴는 `기술자료` 로 **통합**되었습니다. 상단 메뉴 항목은 `기술자료` 하나입니다.

```
                  ┌─ assets/js/resources.js  (기술문서 원본)
resources.html ←──┤                              ↓
 (통합 목록)      └─ assets/js/projects.js   (시공사례 원본)
                                                 ↓
                             assets/js/content.js  ← 두 데이터를 하나의 형태로 변환
                                                 ↓
                                    CONTENT (최신순 정렬된 통합 배열)
```

- **데이터 파일은 그대로입니다.** `projects.js` / `resources.js` 편집 방법도 그대로입니다.
- `content.js` 는 저장소가 아니라 **변환기**입니다. 기존 주소를 하나도 바꾸지 않기 위한 구조입니다.

### 통합 항목 형태 (`content.js`)

| 필드 | 설명 |
| --- | --- |
| `id` | 원본 데이터의 id (그대로) |
| `type` | `'technical'` (기술문서) \| `'case'` (시공사례) |
| `title` | 제목 |
| `category` | 통합 필터값 — 노출콘크리트 / 균열·보수 / 특수방수 / 표면보호 |
| `categoryRaw` | 원본 데이터에 적힌 분류 (상세페이지 표기용) |
| `date` | `YYYY-MM` 또는 `YYYY-MM-DD` (`sortKey` 로 보정해 함께 정렬) |
| `description` | 목록 카드 한 줄 요약 (원본의 `summary`) |
| `images` | `{ thumbnail, cover, before, gallery[], beforeImages[], processImages[], afterImages[] }` — `thumbnail` 은 항상 옵시디언 Raw 노트의 **대표사진**. 선택 규칙은 `case-images.js` 한 곳에만 있습니다 |
| `body` | 상세 본문 HTML (기술문서만. 시공사례는 상세페이지가 자체 구성) |
| `tags` | 검색 키워드 |
| `url` | 상세 주소 — `project.html?id=…` / `resource.html?id=…` (기존 그대로) |
| `meta` | 유형별 부가정보 (`location` `building` `period` `problem` `method` `result` `featured` `file`) |

### 통합 필터 · 기존 분류 대응표

`content.js` 의 `CATEGORY_ALIASES` 가 처리합니다. 예전 분류명으로 된 주소도 자동 변환됩니다.

| 통합 필터 | 여기에 들어오는 기존 분류 |
| --- | --- |
| 노출콘크리트 | 노출콘크리트, 면보수, 색상재현, 시공기준 |
| 균열·보수 | 균열보수 |
| 특수방수 | 인젝션, 누수보수, 특수방수 |
| 표면보호 | 표면보호, 발수 |

### 두 아카이브 — 같은 코드, 다른 자료

시공사례와 기술자료는 `main.js` 의 `initContentPage()` **한 벌**로 그립니다.
어느 쪽을 보여줄지는 마크업이 정합니다.

```html
<div id="contentGrid" data-content-type="case">      <!-- projects.html : 시공사례만 -->
<div id="contentGrid" data-content-type="technical"> <!-- resources.html : 기술자료만 -->
```

- 시공사례는 **시공 전 사진이 있는 사례를 앞에** 둡니다.
  (사례에는 날짜가 없는 경우가 많아 최신순 정렬이 의미가 없고, 비교가 가능한 기록이
  먼저 보이는 편이 이 화면의 목적에 맞기 때문입니다)
- 실제로 쓰이는 분류가 하나뿐이면 필터 줄은 자동으로 숨겨집니다.

| 주소 | 결과 |
| --- | --- |
| `projects.html` | 시공사례 전체 |
| `resources.html` | 기술자료 전체 |
| `projects.html?category=노출콘크리트` | 카테고리 필터 |
| `resources.html?category=인젝션` | 예전 분류명 → `특수방수` 로 자동 변환 |
| `resources.html?q=곰보` | 검색어를 넣은 상태로 열기 |

두 개를 함께 쓸 수 있습니다 → `resources.html?type=case&category=특수방수`

### 앞으로 옵시디언(.md) 원고를 넣을 때

`.md` 프론트매터는 통합 항목과 1:1로 대응하도록 설계했습니다.

```yaml
---
title: 노출콘크리트 층조인트 단차 보수
category: 노출콘크리트     # 통합 필터 이름을 그대로 쓰면 됩니다
type: case                 # technical | case
date: 2026-08-14
description: 목록에 노출되는 한 줄 요약
images: [assets/images/projects/101-1.jpg]
---
(본문 마크다운 → item.body)
```

변환 결과를 `content.js` 의 `CONTENT` 에 `concat` 하기만 하면 통합 목록에 함께 나옵니다.
본문 변환 자동화는 아직 없습니다. **이미지 역할만 자동화되어 있습니다 (아래 1-3).**

---

## 1-3. 시공기술사례 이미지 역할 (대표 / 시공 전 / 시공 중 / 시공 후)

**옵시디언 Raw 노트가 유일한 정본입니다.** 사진을 넣고 빼는 일, 어떤 사진이
대표인지, 어떤 순서로 보일지는 전부 Raw 노트에서 정합니다.
사이트 코드는 그 분류를 **해석하지 않고 그대로 옮기기만** 합니다.

```
사이트원본/01.1 노출콘기술/노출콘크리트 시공기술사례 - NNN.md   ← 정본 (vault, 읽기 전용)
  # 작업내용
  # 이미지분류
  ## 대표사진 / ## 시공전 / ## 시공중 / ## 시공후   ('사진없음' = 의도적으로 없음)
     사진은 ![](네이버 주소) 또는 ![[첨부 파일명]] 둘 다 됩니다
        ↓  node tools/fetch-case-images.js --write
           (주소는 내려받고, ![[첨부]] 는 vault 에서 찾아 가로 773px · EXIF 제거로 복사)
  assets/images/case-studies/case-NNN-<slug>/
    representative.jpg  before-01.jpg …  process-01.jpg …  after-01.jpg …
        ↓  node tools/rebuild-cases.js --write
           (제목·요약·본문은 Wiki/홈페이지/발행대기/<slug>.md 또는 data/case-sources/NNN.md)
  assets/js/projects.js
    representative_image / representative_images
    before_images / process_images / after_images
        ↓  assets/js/case-images.js  ← 이미지 선택 규칙이 있는 유일한 곳
  { representativeImage, representativeImages[], beforeImages[],
    processImages[], afterImages[], galleryImages[], showComparison }
        ↓
아카이브 카드 대표 이미지     상세페이지 시공 전 → 시공 중 → 시공 후 구간
```

### 지켜야 할 규칙

- **에릭의 분류를 다시 해석하지 않습니다.** 더 좋아 보이는 사진이 있어도 대표를 바꾸지 않습니다.
- **순서는 노트에 적힌 그대로**입니다. 코드에서 다시 정렬하지 않습니다.
- **`사진없음` 구간은 화면에서 통째로 숨깁니다.** 빈 제목만 남기지 않습니다.
- **Raw 에 없는 사례 번호는 되살리지 않습니다.** 지워진 사례는 의도적으로 지운 것으로 봅니다.
  주소가 죽지 않도록 `RETIRED_PROJECT_IDS` 로 옮겨 안내 문구를 띄웁니다.
- **대표사진을 읽을 수 없으면 다른 사진으로 대신하지 않습니다.** 그 사례는 보류하고 알립니다.

### 상세페이지 구성 순서

대표 이미지 → 작업내용(기술 본문) → 시공 전 → 시공 중 → 시공 후

### 대표 이미지 우선순위 (`case-images.js`)

| 순위 | 값 |
| --- | --- |
| 1 | `representative_image` (Raw 노트의 `## 대표사진`) |
| 2 | `after_images[0]` |
| 3 | 기존 `thumbnail` → `after` (예전 로직) |
| 4 | `images[0]` → `before_images[0]` → `before` |
| 5 | `FALLBACK_IMAGE` (기존 대체 이미지) |

2순위 아래는 역할 지정이 아예 없는 **예전 데이터를 위한 안전망**일 뿐입니다.
현재 사례는 전부 1순위(Raw 명시값)를 씁니다.

### 도구

```bash
# vault 위치: 기본은 '내 드라이브…/Vault/에릭_vault' 를 찾아 씁니다.
#   다르면 --vault= 또는 AINSAFE_VAULT 로 지정합니다.
# 원본 노트 폴더: 기본은 vault 안의 '사이트원본/01.1 노출콘기술'.
#   옮겨지면 --raw-dir="vault 기준 상대경로" 또는 AINSAFE_RAW_DIR 로 지정합니다.
node tools/fetch-case-images.js                    # 미리보기 — 무엇을 가져올지만 보여줍니다
node tools/fetch-case-images.js --write            # 내려받기 / vault 첨부 복사
node tools/rebuild-cases.js                        # 미리보기 — 추가·변경·그대로·삭제 건수
node tools/rebuild-cases.js --diff                 # 바뀌는 사례를 필드 단위로 보여줌 (쓰기 전에 확인)
node tools/rebuild-cases.js --write                # projects.js 다시 쓰기 (vault 는 고치지 않음)
node tools/build-site.js --write                   # 상세 페이지 · 목록 · sitemap 다시 만들기
node tools/check-cases.js                          # 배포 전 검증 — 실패 시 종료코드 1
```

안전장치: `rebuild-cases --write` 는 지금 사이트에 있는 사례가 하나라도 빠지게 되면
쓰지 않고 멈춥니다(종료코드 2). 원본 폴더나 발행대기 노트가 옮겨졌을 때 사례가 조용히
내려가지 않게 하기 위해서입니다. 정말로 공개를 내릴 때만 `--allow-remove` 를 붙입니다.

새 사례(048, 049 …) 등록 순서
1. vault `사이트원본/01.1 노출콘기술/노출콘크리트 시공기술사례 - NNN.md` 에 사진 분류를 적습니다.
2. 제목·요약·본문은 vault `Wiki/홈페이지/발행대기/<slug>.md` (프론트매터 `type: case`, `case_no: NNN`, `slug`)
   또는 저장소 `data/case-sources/NNN.md` 에 둡니다. 둘 다 없으면 도구가 그 사례를 추가하지 않고 알려 줍니다.
   같은 번호가 저장소에 있으면 저장소 원본이 우선합니다(사진 수가 vault 와 다르면 경고).
   본문을 하자·공법·결과 세 칸이 아니라 원고의 소제목 그대로 쓰려면 프론트매터에 `layout: sections`
   를 적습니다(`## 기술 메모` 절은 화면에 나오지 않습니다 — 047 참고).
3. 위 도구를 미리보기 → `--write` 순서로 실행하고 `check-cases` · `check-site` 로 검증합니다.

`check-cases.js` 가 확인하는 것: 스크립트 문법, 모든 사례의 대표 이미지 존재,
참조 이미지 파일 실재, 원격 링크가 남아 있지 않은지, id 중복·별칭, 통합 목록 항목 수,
분류·검색 색인, 그리고 **Raw 노트와의 대조** — 사례 수, 대표사진, 시공 전·중·후
목록과 순서, `사진없음` 구간, Raw 에 없는 이미지 파일이 남아 있지 않은지.

옵시디언 노트에 적는 방법은 `CONTENT_GUIDE.md` 9-2 절을 참고하세요.

---

## 2. 콘텐츠 추가 방법

### 2-1. 시공사례 추가 — `assets/js/projects.js`

배열 **맨 앞**에 항목 하나를 추가하면 목록·메인·상세·관련사례에 자동 반영됩니다.

```js
{
  id: 'jeju-concrete-101',              // 상세 주소가 됩니다 → project.html?id=jeju-concrete-101
  title: '제주 ○○빌딩 층조인트 면보수',
  location: '제주시',                    // 현장 위치(선택). 상세페이지에만 표시, 분류 기준 아님
  building: '근린생활시설',
  category: '노출콘크리트',              // 노출콘크리트 | 균열보수 | 인젝션 | 특수방수 | 표면보호
  date: '2026-08',                       // 최신순 정렬 기준
  period: '4일',                         // 모르면 '' → 화면에 표시되지 않음
  summary: '파라펫 층조인트 단차 제거 및 색상 재현',
  problem: '…', method: '…', result: '…',// 비어 있으면 해당 블록이 생략됨
  thumbnail: 'assets/images/projects/101-1-thumb.jpg',
  after:     'assets/images/projects/101-1.jpg',
  before:    'assets/images/projects/101-2.jpg', // '' 이면 Before/After 비교 미표시
  images: [], featured: true             // featured: true → 메인 대표사례에 노출
}
```

사진은 `assets/images/projects/` 에 넣습니다.
파일명은 **영문·숫자·하이픈**만 사용하세요(한글 파일명은 서버에 따라 깨질 수 있습니다).
권장 크기 — 상세용 1600×1200 이하, 목록용 `-thumb` 800px 폭, JPEG 품질 80.

### 2-2. 기술자료 추가 — `assets/js/resources.js`

```js
{
  id: 'concrete-repair-009',
  title: '…', category: '노출콘크리트', date: '2026-08-01',
  summary: '목록에 노출되는 2~3줄 요약',
  thumbnail: 'assets/images/resources/xxx.jpg',  // 없으면 '' (대체 이미지 자동)
  file: 'assets/documents/xxx.pdf',              // 없으면 '' (다운로드 버튼 숨김)
  tags: ['검색', '키워드'],
  content: `<h3>소제목</h3><p>본문</p><ul><li>항목</li></ul>`
}
```

카테고리: 노출콘크리트 / 균열보수 / 인젝션 / 특수방수 / 표면보호
(통합 필터 이름 — 노출콘크리트 / 균열·보수 / 특수방수 / 표면보호 — 을 그대로 적어도 됩니다)

> 추가한 항목은 `기술자료`(resources.html) 통합 목록에 **시공사례와 함께** 자동으로 나옵니다.
> 별도 등록 작업은 없습니다.
> 자료를 새로 추가하면 `sitemap.xml` 에도 `resource.html?id=…` 한 줄을 추가해 주세요.
> 특정 자료의 검색 노출을 크게 키우고 싶다면, 그 자료만 별도 HTML 파일
> (예: `note-곰보보수.html`)로 복사해 두는 방식도 가능합니다.

### 2-3. 어떤 목록이 어디에 뜨는가

HTML 안의 아래 속성만 바꾸면 원하는 위치에 목록을 넣을 수 있습니다.

```html
<div class="grid grid--3" data-works="featured" data-limit="6"></div>
<div class="grid grid--3" data-works="인젝션"   data-limit="3"></div>
<div class="grid grid--4" data-resources="all"  data-limit="4"></div>
```

---

## 3. 수정 위치 안내

| 바꾸고 싶은 것 | 파일 / 위치 |
| --- | --- |
| 외부 링크(쇼핑몰·블로그·유튜브·인스타) | `assets/js/config.js` → `EXTERNAL_LINKS` |
| 사진상담 채널(메일 → 카카오톡 등) | `assets/js/config.js` → `CONTACT_CHANNELS.usePhotoChannel`, `kakao` |
| 견적문의를 외부 폼(네이버폼/구글폼)으로 | `assets/js/config.js` → `CONTACT_CHANNELS.externalForm` 에 주소 입력 |
| 사업자등록번호 | `assets/js/config.js` → `COMPANY.businessNumber` (비워두면 표시 안 함) |
| 색상 · 여백 · 폰트 | `assets/css/style.css` 최상단 `:root` 변수 |
| 대표전화 / 주소 문구 | 검색 노출을 위해 각 HTML에 **직접** 적혀 있습니다. 변경 시 전체 파일 찾아 바꾸기 |
| 도메인(canonical·sitemap) | 각 HTML `<link rel="canonical">`, `sitemap.xml`, `robots.txt` |

> 전화번호·주소는 SEO(지역 검색)와 자바스크립트 미동작 환경을 위해 HTML에 그대로 넣었습니다.
> `config.js` 는 버튼 링크·구조화 데이터 등 스크립트가 쓰는 값의 기준입니다. 두 곳을 함께 맞춰 주세요.

---

## 4. GitHub Pages 배포

1. 저장소에 `ainsafe-site` 폴더 내용을 **저장소 루트**로 올리는 것을 권장합니다.
   (하위 폴더로 올려도 모든 경로가 상대경로라 동작합니다.)
2. Settings → Pages → Source: `main` 브랜치 / `/ (root)` 선택.
3. 배포 주소가 정해지면 아래를 실제 주소로 교체합니다.
   - 각 HTML의 `<link rel="canonical">`, `og:url`
   - `sitemap.xml` 의 모든 `<loc>`
   - `robots.txt` 의 `Sitemap:`
   - `assets/js/config.js` 의 `COMPANY.siteUrl`
4. Google Search Console · 네이버 서치어드바이저에 사이트를 등록하고
   `sitemap.xml` 을 제출합니다.

---

## 5. 아직 채워야 할 항목

- [ ] 사업자등록번호 (`config.js`)
- [ ] 실제 도메인 주소 (canonical / sitemap / robots / config)
- [ ] 카카오톡 상담 채널 주소 (개설 시)
- [ ] 시공사례의 건축물 종류 · 작업 기간 등 실제 정보 보완
- [ ] 회사 로고 고해상도 파일(현재 `assets/images/brand/logo.png` 사용 중)
