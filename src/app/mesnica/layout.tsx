import AppShell from "@/components/shell/AppShell";

export default function Layout({ children }: LayoutProps<"/mesnica">) {
  return <AppShell odjeljak="mesnica">{children}</AppShell>;
}
