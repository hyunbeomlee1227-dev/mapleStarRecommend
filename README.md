# Maple Star Recommend

메이플스토리 캐릭터의 장비와 잠재능력을 분석하고, 솔로 보스전 성능 증가 대비 메소 효율을 기준으로 강화 우선순위를 추천하는 웹 서비스입니다.

## 로컬 개발

Node.js 22 이상이 필요합니다.

```powershell
Copy-Item .env.example .env
npm ci
npm run dev
```

`.env`에 `NEXON_API_KEY`를 입력한 뒤 `http://127.0.0.1:5173`에서 확인할 수 있습니다. `.env`와 `.env.*`는 Git에서 제외됩니다.

## 운영 실행

```powershell
npm ci
npm run build
$env:NODE_ENV = 'production'
$env:NEXON_API_KEY = '<secret>'
npm start
```

운영 모드는 기본적으로 `0.0.0.0`과 호스팅 서비스가 제공하는 `PORT`에 바인딩합니다. 상태 확인 경로는 `/healthz`입니다.

## Docker 배포

```powershell
docker build -t maple-star-recommend .
docker run --rm -p 5173:5173 -v maple-runtime:/app/.runtime -e NEXON_API_KEY='<secret>' maple-star-recommend
```

API 키는 Docker 이미지에 넣지 말고 배포 플랫폼의 비밀 환경 변수로 등록해야 합니다. `TRUST_PROXY_HOPS`는 보안을 위해 기본값이 `0`입니다. 일반적인 단일 리버스 프록시 환경에서는 배포 환경 변수로 `TRUST_PROXY_HOPS=1`을 지정합니다. 프록시 단계가 다르다면 실제 구성에 맞게 변경해야 IP 기반 요청 제한이 올바르게 동작합니다.

현재 Nexon API 일일 사용량은 `.runtime` 파일에 기록됩니다. 재배포 후에도 제한 기록을 유지하려면 이 경로에 영구 볼륨을 연결하고 운영 인스턴스는 하나만 실행해야 합니다. 여러 인스턴스로 확장하려면 공유 저장소 기반 사용량 제한으로 교체해야 합니다.

## Render 배포

루트의 `render.yaml`은 Singapore 리전의 단일 무료 Docker 웹 서비스를 정의합니다. 무료 서비스에는 [Render 영구 디스크](https://render.com/docs/disks)를 연결할 수 없으므로 `.runtime`의 NEXON API 사용량 기록은 재시작이나 재배포 시 초기화될 수 있습니다. NEXON 자체 호출 한도는 계속 적용되며, 한도 초과 시 서비스가 안전한 오류를 표시합니다.

현재 공개 서비스: [maple-star-recommend.onrender.com](https://maple-star-recommend.onrender.com)

1. Render Dashboard에서 **New > Blueprint**를 선택하고 이 GitHub 저장소를 연결합니다.
2. Blueprint 생성 화면에서 `NEXON_API_KEY`를 Render 비밀 환경 변수로 입력합니다. 저장소나 이미지에는 값을 기록하지 않습니다.
3. 모든 리소스가 무료 플랜인지 확인한 뒤 Blueprint를 적용합니다. 유료 플랜이나 디스크를 추가하지 마세요.
4. 배포된 `onrender.com` 주소의 `/healthz`가 `{"status":"ok"}`를 반환하는지 확인합니다.

`render.yaml`은 GitHub 검사가 통과한 커밋만 자동 배포하도록 선언합니다. 현재 서비스는 공개 저장소 URL로 연결되어 자동 배포를 사용할 수 없으므로, GitHub Actions 성공을 확인한 뒤 Render에서 최신 커밋을 수동 배포해야 합니다. GitHub App 저장소 연결을 완료하면 `autoDeployTrigger: checksPass`가 적용됩니다.

Render에서는 `TRUST_PROXY_MODE=render`를 사용해 Cloudflare가 호출자 값을 덮어쓰는 `CF-Connecting-IP`를 요청 제한 기준으로 사용하며, 위조 가능한 `X-Forwarded-For`는 신뢰하지 않습니다. 다른 호스팅 환경에는 이 값을 설정하지 마세요.

배포 상태 확인, 장애 구분, 롤백과 키 교체 방법은 [Render 운영 절차](docs/render-operations.md)를 참고하세요.
