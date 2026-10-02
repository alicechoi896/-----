import { LEGAL_INFO } from "@/lib/legal";
import { LegalDocument, type LegalSection } from "../LegalDocument";

export const metadata = { title: "개인정보처리방침" };

const S = LEGAL_INFO;

const sections: LegalSection[] = [
  {
    title: "개인정보의 처리 목적",
    body: (
      <>
        <p>{S.operatorName}(이하 &ldquo;운영자&rdquo;)는 다음 목적을 위해 개인정보를 처리하며, 목적이 바뀌면 미리 동의를 받습니다.</p>
        <ul>
          <li>회원 식별, 가입 신청 확인과 승인, 등급 관리</li>
          <li>서비스 제공: 제품 정보·생성 결과물·스타일 저장, 외부 API 연결</li>
          <li>보안과 부정 이용 방지: 로그인·주요 활동 기록</li>
          <li>문의 응대와 공지</li>
        </ul>
      </>
    ),
  },
  {
    title: "처리하는 개인정보 항목",
    body: (
      <table>
        <thead>
          <tr>
            <th>구분</th>
            <th>항목</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>회원가입 (필수)</td>
            <td>이메일, 이름, 비밀번호 (비밀번호는 복원할 수 없는 방식으로 암호화하여 저장)</td>
          </tr>
          <tr>
            <td>서비스 이용 중 생성</td>
            <td>로그인·로그아웃 시각, 주요 활동 기록, 가입·승인 일시, 약관 동의 일시, 회원이 저장한 제품 정보·생성 결과물·피드백</td>
          </tr>
          <tr>
            <td>회원이 입력 (선택)</td>
            <td>외부 API 키 (OpenAI, YouTube, NAVER). 서버에서 AES-256-GCM 방식으로 암호화하여 저장</td>
          </tr>
          <tr>
            <td>자동 수집</td>
            <td>로그인 유지를 위한 세션 쿠키</td>
          </tr>
        </tbody>
      </table>
    ),
  },
  {
    title: "개인정보의 보유 및 이용 기간",
    body: (
      <ul>
        <li>회원 정보와 회원이 저장한 데이터: 회원 탈퇴 시 즉시 파기</li>
        <li>
          활동 기록(수행자 이메일·이름 포함): 보안 사고 대응과 분쟁 해결을 위해 탈퇴 후 {S.auditLogRetention}간 보관한 뒤 파기
        </li>
        <li>가입 신청이 거절된 경우: 거절 후 30일 이내 파기</li>
        <li>관계 법령에서 보존을 요구하는 경우 해당 기간 동안 보관</li>
      </ul>
    ),
  },
  {
    title: "개인정보의 제3자 제공",
    body: (
      <>
        <p>운영자는 회원의 개인정보를 제3자에게 제공하지 않습니다. 다만 법령에 근거가 있거나 수사기관이 법령에 정해진 절차에 따라 요청하는 경우는 예외로 합니다.</p>
        <p>회원이 외부 API 를 연결해 기능을 실행하면, 회원의 요청에 따라 기능 실행에 필요한 입력 내용(제품 정보, 주제, 키워드 등)이 회원 본인의 API 키로 해당 외부 서비스(OpenAI, Google, NAVER)에 전송됩니다.</p>
      </>
    ),
  },
  {
    title: "개인정보 처리의 위탁 및 국외 이전",
    body: (
      <>
        <p>운영자는 서비스 운영을 위해 아래와 같이 처리를 위탁하며, 일부는 국외에서 처리될 수 있습니다.</p>
        <table>
          <thead>
            <tr>
              <th>수탁자</th>
              <th>위탁 업무</th>
              <th>처리 국가</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Supabase, Inc.</td>
              <td>회원 인증, 데이터베이스 보관</td>
              <td>데이터 보관: 대한민국(서울 리전) / 운영사: 미국</td>
            </tr>
            <tr>
              <td>Vercel, Inc.</td>
              <td>웹 서비스 호스팅, 요청 처리</td>
              <td>미국 등 (요청 처리 지역)</td>
            </tr>
          </tbody>
        </table>
        <p>이전 항목은 제2조의 개인정보이며, 서비스 이용 시 네트워크를 통해 전송되고 위탁 계약 기간 또는 회원 탈퇴 시까지 보관됩니다. 국외 이전을 원하지 않으면 회원 탈퇴로 거부할 수 있으나, 이 경우 서비스를 이용할 수 없습니다.</p>
      </>
    ),
  },
  {
    title: "개인정보의 파기 절차와 방법",
    body: <p>보유 기간이 끝났거나 처리 목적을 달성한 개인정보는 지체 없이 파기합니다. 전자 파일은 복구할 수 없는 방법으로 삭제합니다.</p>,
  },
  {
    title: "정보주체의 권리와 행사 방법",
    body: (
      <ul>
        <li>열람·정정: &lsquo;내 정보&rsquo; 화면에서 언제든 확인하고 이름을 바꿀 수 있습니다</li>
        <li>삭제: &lsquo;내 정보 → 회원 탈퇴&rsquo;로 계정과 데이터를 즉시 삭제할 수 있습니다</li>
        <li>처리 정지 등 그 밖의 요청: 아래 개인정보 보호책임자에게 연락하면 지체 없이 조치합니다</li>
      </ul>
    ),
  },
  {
    title: "개인정보의 안전성 확보 조치",
    body: (
      <ul>
        <li>비밀번호 단방향 암호화, 외부 API 키 암호화 저장 (키는 화면에 일부만 표시)</li>
        <li>데이터베이스 행 단위 접근 통제: 회원은 본인 데이터만 접근 가능</li>
        <li>관리자 승인제 가입, 등급별 접근 권한 관리</li>
        <li>로그인·권한 변경 등 주요 활동 기록 보관</li>
        <li>전송 구간 암호화 (HTTPS)</li>
      </ul>
    ),
  },
  {
    title: "쿠키의 사용",
    body: <p>서비스는 로그인 상태를 유지하기 위한 세션 쿠키만 사용하며, 광고나 행태 분석을 위한 쿠키는 사용하지 않습니다. 브라우저 설정에서 쿠키를 거부할 수 있으나, 이 경우 로그인이 유지되지 않습니다.</p>,
  },
  {
    title: "개인정보 보호책임자",
    body: (
      <p>
        개인정보 보호책임자: {S.privacyOfficer} ({S.privacyOfficerEmail})
        <br />
        개인정보 침해 신고·상담: 개인정보침해신고센터(privacy.kisa.or.kr, 국번 없이 118), 개인정보분쟁조정위원회(kopico.go.kr, 1833-6972)
      </p>
    ),
  },
  {
    title: "개인정보처리방침의 변경",
    body: <p>이 방침은 {S.effectiveDate}부터 적용됩니다. 내용이 바뀌면 시행 7일 전부터 서비스 화면에 공지합니다.</p>,
  },
];

export default function Page() {
  return <LegalDocument title="개인정보처리방침" sections={sections} />;
}
