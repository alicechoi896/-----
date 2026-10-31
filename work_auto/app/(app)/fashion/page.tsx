import { ChannelHub } from "@/components/shared/ChannelHub";
import { getChannel } from "@/lib/registry";

export const metadata = { title: getChannel("fashion").hubTitle };

/** v0.9.116: 2차 화면 — Registry 에 등록된 "fashion" 기능 카드 목록 */
export default function Page() {
  return <ChannelHub channelId="fashion" />;
}
