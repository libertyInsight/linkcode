# 링크코드

긴 링크를 6자리 숫자 코드로 바꿔, 전자칠판 같은 공용 기기에서 로그인 없이 바로 여는 앱.

- **폰(보내기)**: 링크 붙여넣기 → 6자리 코드
- **칠판(받기)**: 숫자 6개 누르면 바로 열림 · 또는 주소창에 `내주소/123456`
- 코드는 30분 뒤 자동 삭제 (`lib/store.js`의 `TTL_SECONDS`에서 변경)
- 폰에 '홈 화면에 추가'하면 안드로이드 **공유 메뉴**에 링크코드가 생겨, 어떤 앱에서든 공유 → 코드가 바로 나옴

## 배포 (Vercel)

1. 이 폴더를 GitHub 새 저장소에 올리기
2. Vercel → Add New → Project → 저장소 선택 → Deploy (설정 변경 없음)
3. 프로젝트 → **Storage** 탭 → Marketplace에서 **Upstash (Redis)** 선택 → 무료 플랜으로 생성 → 이 프로젝트에 Connect
4. Deployments → 최신 배포 → **Redeploy** (환경변수 반영)

환경변수는 3번에서 자동으로 들어갑니다 (`KV_REST_API_URL`/`KV_REST_API_TOKEN` 또는 `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` 둘 다 인식).

## 전자칠판 설정 (한 번만)

칠판 브라우저에서 배포 주소를 열고 **북마크** 또는 **시작 페이지**로 지정. 큰 화면에서는 자동으로 '받기' 화면이 뜹니다.

## 구조

```
index.html            화면 (받기/보내기)
api/create.js         링크 → 코드 생성
api/open.js           코드 → 링크 조회 / 바로 이동
lib/store.js          Redis 저장 (만료 포함)
vercel.json           /123456 주소를 바로 이동으로 연결
manifest.webmanifest  앱 설치 + 공유 메뉴 등록
```
