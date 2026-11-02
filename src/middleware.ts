import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/signup", "/api/auth/login", "/api/auth/signup", "/api/sms/inbound", "/api/health"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // CSRF defence: state-changing requests must come from our own origin
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && pathname !== "/api/sms/inbound") {
    const origin = req.headers.get("origin");
    if (origin && new URL(origin).host !== req.headers.get("host")) {
      return NextResponse.json({ error: { code: "BAD_ORIGIN", message: "Cross-origin request blocked" } }, { status: 403 });
    }
  }
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  if (!req.cookies.get("compte_session")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Please log in" } }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"] };
