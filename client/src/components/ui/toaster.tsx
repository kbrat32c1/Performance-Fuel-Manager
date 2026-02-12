import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider swipeDirection="up" swipeThreshold={50}>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        return (
          <Toast key={id} variant={variant} {...props}>
            {/* Left accent bar */}
            <div className={
              variant === "destructive"
                ? "absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-destructive"
                : "absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-primary"
            } />
            <div className="grid gap-0.5 pl-2">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
