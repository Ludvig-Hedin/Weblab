import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface LeaderboardItem {
  name: string;
  value: number;
  maxValue?: number;
}

interface Leaderboard1Props {
  title?: string;
  description?: string;
  items?: LeaderboardItem[];
  valuePrefix?: string;
  className?: string;
}

const defaultItems: LeaderboardItem[] = [
  { name: "United States", value: 4520 },
  { name: "United Kingdom", value: 3210 },
  { name: "Germany", value: 2890 },
  { name: "France", value: 1890 },
  { name: "Canada", value: 1240 },
];

const Leaderboard1 = ({
  title = "Top Countries",
  description = "Visitors by country",
  items = defaultItems,
  valuePrefix = "",
  className,
}: Leaderboard1Props) => {
  const maxValue = items[0]?.value || 1;

  return (
    <Card className={cn("w-full max-w-2xl", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map((item, index) => (
          <div key={index} className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{item.name}</span>
              <span className="text-slate-500 dark:text-slate-400">
                {valuePrefix}
                {item.value.toLocaleString()}
              </span>
            </div>
            <Progress value={(item.value / maxValue) * 100} className="h-2" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export { Leaderboard1 };
