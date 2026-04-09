import * as React from "react";

import { cn } from "../../lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[120px] w-full rounded-[24px] border border-input bg-[#132433] px-5 py-4 font-mono text-sm leading-6 text-slate-100 shadow-editor placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f08c48] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);

Textarea.displayName = "Textarea";

export { Textarea };
