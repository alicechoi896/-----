/**
 * 영상 다운로드 명령 만들기 (내 PC 에서 yt-dlp 로 실행).
 *
 * 왜 사이트에서 바로 받지 않나:
 *  - YouTube 는 영상 파일 다운로드 API 를 제공하지 않는다.
 *  - 서버(Vercel = 데이터센터 IP)에서 받으면 YouTube 가 봇 확인으로 막고, 영상이 서버를 지나가 트래픽 비용이 든다.
 *  → 사용자의 PC(가정·회사 인터넷)에서 받으면 막히지 않고 서버 비용도 0 이다.
 *
 * 음성 제거: 처음부터 "영상 트랙만"(bv = best video only) 받는다. 소리가 들어 있지 않은 파일이 저장된다.
 * 영상만 따로 제공하지 않는 사이트는 받기가 실패할 수 있다 → 일반 파일로 받은 뒤 '영상 음성 제거' 도구를 쓴다.
 */

/** 저장 폴더 (yt-dlp 가 ~ 를 사용자 폴더로 바꾼다) */
export const DOWNLOAD_DIR = "~/Downloads/work_auto";

/** Windows 설치 명령 (처음 한 번) */
export const INSTALL_COMMAND = "winget install yt-dlp.yt-dlp";

const quote = (u: string) => `"${u.replace(/"/g, "")}"`;

/** 소리 없는 영상(영상 트랙만)으로 받는 명령. URL 여러 개를 한 줄에 넣을 수 있다 */
export function downloadCommand(urls: string[]): string {
  return [
    "yt-dlp",
    '-f "bv[ext=mp4]/bv"', // 영상 트랙만 (MP4 우선) → 소리 없음
    `-P "${DOWNLOAD_DIR}"`,
    '-o "%(title).80s_음성없음 [%(id)s].%(ext)s"',
    ...urls.map(quote),
  ].join(" ");
}
