interface ProgressBarProps {
  current: number;
  total: number;
}

export function ProgressBar({ current, total }: ProgressBarProps) {
  const percentage = Math.min(100, Math.round((current / total) * 100));

  return (
    <div className="sticky top-0 z-10 w-full bg-background/90 px-1 pb-3 pt-2 backdrop-blur">
      <div className="mb-1.5 text-right text-sm font-medium text-foreground/60">
        {current} / {total}
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/10">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
