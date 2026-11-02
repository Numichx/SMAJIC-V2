import AppShell from "@/components/shell/AppShell";

export default function Layout({ children }: LayoutProps<"/sank">) {
  return <AppShell odjeljak="sank">{children}</AppShell>;
}
