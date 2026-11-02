import AppShell from "@/components/shell/AppShell";

export default function Layout({ children }: LayoutProps<"/sefica">) {
  return <AppShell odjeljak="sefica">{children}</AppShell>;
}
