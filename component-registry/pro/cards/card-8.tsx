"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link, Download, Trash2 } from "lucide-react";

export function Card8() {
  return (
    <Card className="max-w-lg mx-auto mt-12">
      <CardContent className="p-4 md:p-6 flex items-center gap-3">
        <Link className="w-4 h-4 text-foreground shrink-0" />

        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-card-foreground">
              resume_1.pdf
            </span>
            <span className="text-sm text-muted-foreground">2,4mb</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="icon">
              <Download />
            </Button>
            <Button variant="outline" size="icon">
              <Trash2 />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
