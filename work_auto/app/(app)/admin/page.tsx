import { ChannelHub } from "@/components/shared/ChannelHub";
import { getChannel } from "@/lib/registry";

export const metadata = { title: getChannel("admin").hubTitle };

/** 사이트 관리 허브 (관리자 전용. ChannelHub 가 adminOnly 허브를 확인한다) */
export default function Page() {
  return <ChannelHub channelId="admin" />;
}
