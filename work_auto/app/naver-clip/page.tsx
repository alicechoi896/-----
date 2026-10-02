import { ChannelHub } from "@/components/shared/ChannelHub";
import { getChannel } from "@/lib/registry";

export const metadata = { title: getChannel("naver-clip").hubTitle };

/** 2차 화면: Registry 에 등록된 "naver-clip" 기능 카드 목록 */
export default function Page() {
  return <ChannelHub channelId="naver-clip" />;
}
