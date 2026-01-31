"use client"

import * as React from "react"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react"
import { DayButton, DayPicker, getDefaultClassNames } from "react-day-picker"
import "react-day-picker/src/style.css"

import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"]
}) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "bg-background group/calendar p-3",
        "[--rdp-accent-color:hsl(var(--primary))]",
        "[--rdp-accent-background-color:hsl(var(--accent))]",
        "[--rdp-day-height:2.75rem] [--rdp-day-width:2.75rem]",
        "[--rdp-day_button-height:2.5rem] [--rdp-day_button-width:2.5rem]",
        "[--rdp-day_button-border-radius:0.5rem]",
        "[--rdp-today-color:hsl(var(--primary))]",
        "[--rdp-selected-border:2px_solid_hsl(var(--primary))]",
        "[--rdp-outside-opacity:0.3]",
        "[--rdp-disabled-opacity:0.3]",
        className
      )}
      captionLayout={captionLayout}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString("default", { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn(defaultClassNames.root),
        months: cn(defaultClassNames.months),
        month: cn(defaultClassNames.month),
        month_grid: cn(defaultClassNames.month_grid),
        nav: cn(defaultClassNames.nav),
        button_previous: cn(
          defaultClassNames.button_previous,
          "hover:bg-muted/60 rounded-lg"
        ),
        button_next: cn(
          defaultClassNames.button_next,
          "hover:bg-muted/60 rounded-lg"
        ),
        month_caption: cn(
          defaultClassNames.month_caption,
          "text-sm font-bold"
        ),
        dropdowns: cn(defaultClassNames.dropdowns),
        dropdown_root: cn(defaultClassNames.dropdown_root),
        dropdown: cn(defaultClassNames.dropdown),
        caption_label: cn(
          defaultClassNames.caption_label,
          "text-sm font-bold"
        ),
        weekdays: cn(defaultClassNames.weekdays),
        weekday: cn(
          defaultClassNames.weekday,
          "text-muted-foreground text-xs font-semibold"
        ),
        week: cn(defaultClassNames.week),
        day: cn(defaultClassNames.day),
        day_button: cn(
          defaultClassNames.day_button,
          "text-sm font-normal hover:bg-muted/60 transition-colors"
        ),
        today: cn(
          defaultClassNames.today,
          "!bg-primary/15 font-bold"
        ),
        selected: cn(
          defaultClassNames.selected,
          "!text-base"
        ),
        outside: cn(defaultClassNames.outside),
        disabled: cn(defaultClassNames.disabled),
        hidden: cn(defaultClassNames.hidden),
        range_start: cn(defaultClassNames.range_start),
        range_middle: cn(defaultClassNames.range_middle),
        range_end: cn(defaultClassNames.range_end),
        ...classNames,
      }}
      components={{
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left") {
            return (
              <ChevronLeftIcon className={cn("size-4", className)} {...props} />
            )
          }
          return (
            <ChevronRightIcon className={cn("size-4", className)} {...props} />
          )
        },
        ...components,
      }}
      {...props}
    />
  )
}

export { Calendar }
