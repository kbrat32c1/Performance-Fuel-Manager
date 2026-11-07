import type { KeyboardEvent } from "react";

/**
 * Keyboard handler for clickable non-button elements (role="button").
 * Enter or Space on the element itself fires its onClick, like a real button.
 * Keys pressed inside nested controls are ignored so they keep their own behavior.
 */
export function activateOnKey(e: KeyboardEvent<HTMLElement>) {
  if (e.target !== e.currentTarget) return;
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    e.currentTarget.click();
  }
}
