import AppShell from "@/components/shell/AppShell";

export default function Layout({ children }: LayoutProps<"/pecenjara">) {
  return <AppShell odjeljak="pecenjara">{children}</AppShell>;
}
