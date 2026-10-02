"use client";

import { Check, Save, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Button, type ButtonSize, type ButtonVariant } from "./Button";

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * 비동기 저장 버튼. idle → saving(스피너) → saved(체크) 상태를 스스로 관리한다.
 * onSave 가 throw 하면 error 상태가 되고 다시 누를 수 있다.
 */
export function SaveButton({
  onSave,
  label = "저장",
  savedLabel = "저장됨",
  icon = Save,
  variant = "primary",
  size = "md",
  saved: savedProp,
  className,
  disabled,
}: {
  onSave: () => Promise<unknown>;
  label?: string;
  savedLabel?: string;
  icon?: LucideIcon;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 외부에서 이미 저장된 상태를 알고 있을 때 */
  saved?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  const [state, setState] = useState<SaveState>("idle");
  const isSaved = savedProp || state === "saved";

  async function handleClick() {
    setState("saving");
    try {
      await onSave();
      setState("saved");
    } catch {
      setState("error");
    }
  }

  return (
    <Button
      variant={isSaved ? "secondary" : variant}
      size={size}
      icon={isSaved ? Check : icon}
      loading={state === "saving"}
      onClick={handleClick}
      disabled={disabled || isSaved}
      className={className}
    >
      {isSaved ? savedLabel : state === "error" ? "저장 실패 · 다시 시도" : label}
    </Button>
  );
}
