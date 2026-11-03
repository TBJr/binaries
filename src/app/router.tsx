import { createBrowserRouter } from "react-router-dom";

import { StandaloneRouteError } from "@/components/errors/RouteErrorPage";
import { appRoutes } from "@/app/routes";

export const router = createBrowserRouter([
  { errorElement: <StandaloneRouteError />, children: appRoutes },
]);
