import "../patterns/patterns.css";

export const PatternsShowcase = () => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4 bg-background">
      {Array.from({ length: 30 }, (_, i) => i + 1).map((num) => (
        <div key={num} className="relative aspect-square border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
          <div className={`pattern-${num} w-full h-full`} />
          <div className="absolute min-w-8 text-center bottom-2 left-2 bg-black dark:bg-white px-2 py-1 rounded text-white dark:text-black text-sm font-mono">
            {num}
          </div>
        </div>
      ))}
    </div>
  );
};
