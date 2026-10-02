import Link from "next/link";

/** 로그인 계열 화면 하단: 약관 링크 */
export function AuthFooter() {
  return (
    <p className="mt-6 flex justify-center gap-3 text-xs text-fg-subtle">
      <Link href="/terms" className="hover:text-fg">
        이용약관
      </Link>
      <span aria-hidden>·</span>
      <Link href="/privacy" className="font-medium hover:text-fg">
        개인정보처리방침
      </Link>
    </p>
  );
}
