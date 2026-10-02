import { Compass } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { LinkButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/States";

export default function NotFound() {
  return (
    <PageContainer>
      <EmptyState
        icon={Compass}
        title="페이지를 찾을 수 없습니다"
        description="주소가 바뀌었거나 아직 준비 중인 기능입니다."
        action={<LinkButton href="/" variant="primary">홈으로</LinkButton>}
        className="py-32"
      />
    </PageContainer>
  );
}
