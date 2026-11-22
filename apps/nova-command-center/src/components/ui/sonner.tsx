import { Toaster as SonnerToaster, type ToasterProps } from "sonner";

/** Application toast surface; uses the already-declared sonner dependency. */
export function Toaster(props: ToasterProps) {
  return <SonnerToaster theme="dark" position="top-right" richColors closeButton {...props} />;
}
