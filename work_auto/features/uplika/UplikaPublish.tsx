"use client";

import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { Button, Input, Modal, Notice, Textarea } from "@/components/ui";

/** v0.9.195 완성 영상 → 업리카로 인스타그램 릴스·틱톡·스레드·페이스북 (확인 후 1번 = 1번) */
interface Account {
  id: string;
  platform: string;
  handle: string;
  displayName: string;
  status: string;
  label: string;
}
interface Target {
  platform: string;
  status: string;
  url: string | null;
  error: string | null;
}
interface Post {
  id: string;
  status: string;
  targets: Target[];
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" }, cache: "no-store" });
  const j = (await res.json().catch(() => null)) as { ok: boolean; data: T; error?: { message: string } } | null;
  if (!j?.ok) throw new Error(j?.error?.message ?? "요청하지 못했습니다.");
  return j.data;
}
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const STATUS: Record<string, string> = { publishing: "올리는 중", published: "올라감", failed: "실패", scheduled: "예약됨", draft: "임시 저장", partial: "일부만" };

export function UplikaPublishButton({ jobId, caption, productId }: { jobId: string; caption?: string; productId?: string | null }) {
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [connectUrl, setConnectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [text, setText] = useState(caption ?? "");
  const [comment, setComment] = useState("");
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [post, setPost] = useState<Post | null>(null);
  const [pubs, setPubs] = useState<string[]>([]);
  const [reqId, setReqId] = useState(newId);

  useEffect(() => {
    if (!open || accounts) return;
    void call<{ accounts: Account[]; connectUrl: string | null }>("/api/uplika")
      .then((r) => {
        setAccounts(r.accounts);
        setConnectUrl(r.connectUrl);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "계정을 읽지 못했습니다."));
  }, [open, accounts]);
  // 게시 상태 확인 (무료): 올리는 중일 때만 6초마다
  const pending = Boolean(post?.targets.some((t) => t.status === "publishing"));
  useEffect(() => {
    if (!post || !pending) return;
    const t = setInterval(() => void call<Post>(`/api/uplika?postId=${encodeURIComponent(post.id)}&pubs=${pubs.join(",")}`).then(setPost).catch(() => undefined), 6000);
    return () => clearInterval(t);
  }, [post, pending, pubs]);

  async function publish() {
    const names = (accounts ?? []).filter((a) => picked.has(a.id)).map((a) => `${a.label} @${a.handle}`);
    if (!window.confirm(`${names.join(", ")} 에 ${when ? `${new Date(when).toLocaleString("ko-KR")} 예약으로` : "지금 바로"} 올릴까요?\n실제 계정에 공개 게시됩니다 (틱톡은 앱의 임시 저장으로). 한 번 누르면 바로 진행됩니다.`)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await call<{ post: Post; publicationIds: string[] }>("/api/uplika", { method: "POST", body: JSON.stringify({ jobId, accountIds: [...picked], caption: text, firstComment: comment, scheduledAt: when ? new Date(when).toISOString() : null, productId, clientRequestId: reqId, confirmed: true }) });
      setPost(r.post);
      setPubs(r.publicationIds);
      setReqId(newId());
    } catch (e) {
      setError(e instanceof Error ? e.message : "올리지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="secondary" icon={Send} onClick={() => setOpen(true)} data-uplika-open>
        SNS 에 올리기 (업리카)
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="SNS 에 올리기 (업리카)" description="인스타그램 릴스·틱톡·스레드·페이스북. 유튜브는 [유튜브에 올리기]로 올립니다.">
        <div className="space-y-3 text-[13px]" data-uplika>
          {error && <Notice tone="warning">{error}</Notice>}
          {!accounts && !error && <p className="text-fg-subtle">연결된 계정을 읽는 중…</p>}
          {accounts && !accounts.length && (
            <Notice tone="info">
              업리카에 연결된 계정이 없습니다.{" "}
              <a href={connectUrl ?? "https://uplika.com/ko/dashboard/connections"} target="_blank" rel="noreferrer" className="text-brand underline">
                업리카 › Connections
              </a>
              에서 인스타그램 등을 연결한 뒤 다시 열어 주세요.
            </Notice>
          )}
          {accounts && accounts.length > 0 && (
            <>
              <div className="space-y-1">
                <p className="text-[12px] font-medium text-fg-muted">올릴 계정</p>
                {accounts.map((a) => (
                  <label key={a.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={picked.has(a.id)}
                      disabled={a.status !== "active"}
                      onChange={(e) =>
                        setPicked((o) => {
                          const n = new Set(o);
                          if (e.target.checked) n.add(a.id);
                          else n.delete(a.id);
                          return n;
                        })
                      }
                      className="accent-[var(--color-brand)]"
                    />
                    {a.label} · @{a.handle}
                    {a.status !== "active" && <span className="text-danger">({a.status} — 업리카에서 다시 연결)</span>}
                  </label>
                ))}
              </div>
              <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="올릴 글 (캡션, 해시태그 포함)" aria-label="캡션" />
              <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="인스타그램 첫 댓글 (선택, 해시태그 등)" aria-label="첫 댓글" />
              <label className="flex flex-wrap items-center gap-2 text-[12px] text-fg-muted">
                예약 (선택, 10분 뒤 이후)
                <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="h-8 rounded-control border border-line bg-canvas px-2 text-[12.5px] text-fg" />
              </label>
              <Button variant="primary" icon={Send} loading={busy} disabled={!picked.size || !text.trim() || busy || pending} onClick={() => void publish()} data-uplika-go>
                {when ? "예약하기" : "올리기"} ({picked.size}개 계정)
              </Button>
            </>
          )}
          {post && (
            <div className="space-y-1 rounded-control border border-line p-2" data-uplika-result>
              {post.targets.map((t, i) => (
                <p key={i}>
                  {t.platform} · {STATUS[t.status] ?? t.status}
                  {t.url && (
                    <a href={t.url} target="_blank" rel="noreferrer" className="ml-1 text-brand underline">
                      열기
                    </a>
                  )}
                  {t.error && <span className="ml-1 text-danger">{t.error}</span>}
                </p>
              ))}
              <p className="text-[11.5px] text-fg-subtle">업로드 관리에 기록했습니다. 올라가면 주소가 채워집니다.</p>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
