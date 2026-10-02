import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { LinkButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/States";
import { SectionCard } from "@/components/ui/SectionCard";
import { ROLE_LABEL, canAccess, lowestTierFor } from "@/lib/permissions";
import { getSession } from "@/lib/server/auth";
import { FeaturePageHeader } from "./FeaturePageHeader";
import { PageContainer } from "./PageContainer";

/**
 * 기능(3차) 페이지 공통 틀: PageContainer + 헤더 + 권한 확인.
 * 권한이 없으면 children 대신 "접근 권한 없음" 안내를 보여준다 (화면 로직은 실행되지 않는다).
 *
 *   <FeaturePage featureId="yt-trends" width="wide"><YouTubeTrendExplorer /></FeaturePage>
 */
export async function FeaturePage({
  featureId,
  width = "default",
  header,
  children,
}: {
  /** 권한 키 (Registry 기능 ID 또는 단독 페이지 ID) */
  featureId: string;
  width?: "default" | "wide";
  /** 기본 헤더(FeaturePageHeader) 대신 쓸 헤더 */
  header?: ReactNode;
  children: ReactNode;
}) {
  const session = await getSession();
  const allowed = session ? canAccess(session.allowed, featureId) : false;

  return (
    <PageContainer width={width}>
      {header ?? <FeaturePageHeader featureId={featureId} />}
      {allowed ? children : <NoAccess featureId={featureId} roleLabel={session ? ROLE_LABEL[session.role] : "비로그인"} />}
    </PageContainer>
  );
}

function NoAccess({ featureId, roleLabel }: { featureId: string; roleLabel: string }) {
  const tier = lowestTierFor(featureId);
  return (
    <SectionCard>
      <EmptyState
        icon={Lock}
        title="이 기능을 사용할 권한이 없습니다"
        description={
          <>
            현재 등급: <b className="text-fg">{roleLabel}</b>
            {tier && (
              <>
                {" "}
                · <b className="text-fg">{ROLE_LABEL[tier]}</b> 등급부터 사용할 수 있습니다.
              </>
            )}
            <br />
            등급 변경은 관리자에게 문의해 주세요.
          </>
        }
        action={<LinkButton href="/">홈으로</LinkButton>}
        className="py-20"
      />
    </SectionCard>
  );
}

/** 관리자 전용 페이지 틀 */
export async function AdminPage({ featureId, children }: { featureId: string; children: ReactNode }) {
  const session = await getSession();
  return (
    <PageContainer width="wide">
      <FeaturePageHeader featureId={featureId} />
      {session?.role === "admin" ? (
        children
      ) : (
        <SectionCard>
          <EmptyState icon={Lock} title="관리자만 볼 수 있는 화면입니다" action={<LinkButton href="/">홈으로</LinkButton>} className="py-20" />
        </SectionCard>
      )}
    </PageContainer>
  );
}

