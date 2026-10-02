/**
 * 영상 다운로드 명령 만들기 (내 PC 에서 yt-dlp 로 실행).
 *
 * 왜 사이트에서 바로 받지 않나:
 *  - YouTube·샤오홍슈 모두 영상 파일 다운로드 API 가 없다.
 *  - 서버(Vercel = 데이터센터 IP)에서 받으면 봇 확인·로그인 요구로 막히고, 영상이 서버를 지나가 트래픽 비용이 든다.
 *  → 사용자 PC 에서 받으면 서버 비용 0, 내 로그인 정보도 쓸 수 있다.
 *
 * 음성 제거: 받은 직후 ffmpeg 로 소리 트랙만 뺀다 (FFmpegCopyStream + -an). 다시 인코딩하지 않아 화질이 그대로다.
 *  - 영상 트랙만 따로 주는 사이트(YouTube)는 처음부터 영상 트랙만 받는다 (bv)
 *  - 영상+소리가 한 파일인 사이트(샤오홍슈)는 받은 뒤 소리를 뺀다
 *  2026-10 에 yt-dlp 2026.08.19 + ffmpeg 로 소리 트랙이 빠지는 것을 확인했다.
 */

/** 저장 폴더 (yt-dlp 가 ~ 를 사용자 폴더로 바꾼다) */
export const DOWNLOAD_DIR = "~/Downloads/work_auto";

/** Windows 설치 명령 (처음 한 번). ffmpeg 는 소리 제거에 필요하다 */
export const INSTALL_COMMANDS = ["winget install yt-dlp.yt-dlp", "winget install Gyan.FFmpeg"];

/**
 * 로그인 정보 (샤오홍슈는 로그인하지 않으면 영상을 보여주지 않는 경우가 많다).
 * 브라우저에 저장된 로그인 쿠키를 yt-dlp 가 읽는다. 이 사이트 서버로는 보내지 않는다.
 */
export type CookieSource = "none" | "firefox" | "chrome" | "edge" | "file";

export const COOKIE_OPTIONS: { value: CookieSource; label: string; hint: string }[] = [
  { value: "none", label: "사용 안 함", hint: "YouTube 는 보통 필요 없습니다." },
  { value: "firefox", label: "Firefox 로그인", hint: "Firefox 에서 샤오홍슈에 로그인해 두세요. 가장 잘 됩니다." },
  { value: "chrome", label: "Chrome 로그인", hint: "Chrome 을 완전히 닫고 실행하세요. 최신 Chrome 은 실패할 수 있습니다." },
  { value: "edge", label: "Edge 로그인", hint: "Edge 를 완전히 닫고 실행하세요." },
  { value: "file", label: "cookies.txt 파일", hint: "브라우저 확장 'Get cookies.txt LOCALLY' 로 받은 파일을 다운로드 폴더에 cookies.txt 로 두세요." },
];

const quote = (u: string) => `"${u.replace(/"/g, "")}"`;

function cookieArgs(source: CookieSource): string[] {
  if (source === "none") return [];
  if (source === "file") return ['--cookies "~/Downloads/cookies.txt"'];
  return [`--cookies-from-browser ${source}`];
}

/** 소리 없는 영상으로 받는 명령. URL 여러 개를 한 줄에 넣을 수 있다 */
export function downloadCommand(urls: string[], cookies: CookieSource = "none"): string {
  return [
    "yt-dlp",
    '-f "bv[ext=mp4]/bv/b[ext=mp4]/b"', // 영상 트랙만 있으면 그것, 없으면 영상+소리 파일
    '--use-postprocessor FFmpegCopyStream --ppa "CopyStream:-an"', // 받은 뒤 소리 트랙 제거 (재인코딩 없음)
    ...cookieArgs(cookies),
    `-P "${DOWNLOAD_DIR}"`,
    '-o "%(title).60s_음성없음 [%(id)s].%(ext)s"',
    ...urls.map(quote),
  ].join(" ");
}
