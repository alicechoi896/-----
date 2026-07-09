interface ProgressBarProps {
  current: number;
  total: number;
}

export function ProgressBar({ current, total }: ProgressBarProps) {
  const percentage = Math.min(100, Math.round((current / total) * 100));

  return (
    <div className="sticky top-0 z-10 w-full bg-background/90 px-1 pt-6 pb-4 backdrop-blur">
      <div className="mb-2 text-right text-sm font-medium text-foreground/50">
        {current} / {total}
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-foreground/8">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
