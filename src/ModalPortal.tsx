import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

let bodyLocks = 0;
let originalOverflow = "";

/** Keeps fixed dialogs outside animated or translated page containers. */
export default function ModalPortal({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (bodyLocks === 0) originalOverflow = document.body.style.overflow;
    bodyLocks += 1;
    document.body.style.overflow = "hidden";
    return () => {
      bodyLocks = Math.max(0, bodyLocks - 1);
      if (bodyLocks === 0) document.body.style.overflow = originalOverflow;
    };
  }, []);
  return typeof document === "undefined" ? null : createPortal(children, document.body);
}
