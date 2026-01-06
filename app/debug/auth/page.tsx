import { notFound } from "next/navigation";
import { AuthDebugClient } from "./AuthDebugClient";

export default function AuthDebugPage() {
  const allowDebug =
    process.env.NEXT_PUBLIC_DEBUG_AUTH === "true" ||
    process.env.NODE_ENV !== "production";

  if (!allowDebug) {
    notFound();
  }

  return <AuthDebugClient />;
}












