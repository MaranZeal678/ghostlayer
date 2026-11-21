import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtected = createRouteMatcher(["/dashboard(.*)", "/api/(.*)"]);
const isPublicApi = createRouteMatcher(["/api/github/webhooks", "/api/worker"]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtected(req) && !isPublicApi(req)) await auth.protect();
});

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)"],
};
