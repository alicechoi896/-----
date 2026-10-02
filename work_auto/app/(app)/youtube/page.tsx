import { ChannelHub } from "@/components/shared/ChannelHub";
import { getChannel } from "@/lib/registry";

export const metadata = { title: getChannel("youtube").hubTitle };

/** 2차 화면: Registry 에 등록된 "youtube" 기능 카드 목록 */
export default function Page() {
  return <ChannelHub channelId="youtube" />;
}
