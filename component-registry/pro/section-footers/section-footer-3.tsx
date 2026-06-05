"use client";

import {Button} from '@/components/ui/button';

export function SectionFooter3() {
  return (
    <div className="bg-background py-4 border-t border-border">
      <div className="container mx-auto lg:px-6 px-4 gap-4 flex md:flex-row flex-col justify-between md:items-center items-start flex-col-reverse">
        <div className="flex items-center gap-2">
          <Button>Save</Button>
          <Button variant="outline">Edit</Button>
          <Button variant="outline">View</Button>
        </div>
        <div className="text-sm text-muted-foreground w-full md:text-right">
          Replace this text with your content
        </div>
      </div>
    </div>
  );
}
