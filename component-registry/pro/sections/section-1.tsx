"use client";

export function Section1() {
  return (
    <div className="bg-background"> {/* Add border border-border shadow-sm and rounded-lg class to make this section look like a card */}
      {/* Section header */}
      <div className=" pt-4 md:pt-6">
        <div className="container mx-auto lg:px-6 px-4 flex flex-col gap-6">
          {/* Main content */}
          <div className="w-full text-muted-foreground p-6 border border-border rounded-md bg-muted text-center border-dashed">
            Replace this div with your content
          </div>
        </div>
      </div>
      {/* Section body */}
      <div className="container mx-auto lg:px-6 px-4 py-6">
        <div className="w-full text-muted-foreground p-6 border border-border rounded-md bg-muted text-center border-dashed">
          Replace this div with your content
        </div>
      </div>
      {/* Section footer */}
      <div className="border-t border-border py-4">
        <div className="container mx-auto lg:px-6 px-4 flex flex-col gap-6">
          <div className="w-full text-muted-foreground p-6 border border-border rounded-md bg-muted text-center border-dashed">
            Replace this div with your content
          </div>
        </div>
      </div>
    </div>
  );
}