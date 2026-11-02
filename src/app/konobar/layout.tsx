import AppShell from "@/components/shell/AppShell";

export default function Layout({ children }: LayoutProps<"/konobar">) {
  return <AppShell odjeljak="konobar">{children}</AppShell>;
}
