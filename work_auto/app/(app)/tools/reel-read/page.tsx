import { redirect } from "next/navigation";

/** v0.9.180 릴스 읽기는 인스타그램 › 인스타그램 트렌드 찾기 › [릴스 읽기] 탭으로 옮겼다 */
export default function Page() {
  redirect("/instagram/trends?tab=read");
}
