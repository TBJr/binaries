import { Link, useLocation } from "react-router-dom";

import { APP_NAME } from "@/lib/brand";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { findDashboardNavItem } from "@/lib/dashboard-nav";

export function DashboardHeader() {
  const { pathname } = useLocation();
  const current = findDashboardNavItem(pathname);
  const pageTitle = current?.title ?? APP_NAME;

  return (
    <header className="workspace-topbar sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b border-border bg-background/90 backdrop-blur-sm supports-[backdrop-filter]:bg-background/75">
      <div className="flex min-w-0 flex-1 items-center gap-2 px-4 lg:px-6">
        <SidebarTrigger className="size-11 shrink-0 md:size-8" />
        <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
        <Breadcrumb className="min-w-0">
          <BreadcrumbList className="flex-nowrap">
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink asChild>
                <Link to="/app/">{APP_NAME}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbPage className="block max-w-[46vw] truncate sm:max-w-xs md:max-w-md" title={pageTitle}>
                {pageTitle}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </header>
  );
}
