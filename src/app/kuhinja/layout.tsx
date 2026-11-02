import AppShell from "@/components/shell/AppShell";

export default function Layout({ children }: LayoutProps<"/kuhinja">) {
  return <AppShell odjeljak="kuhinja">{children}</AppShell>;
}
