import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pages retired in the 09-18 audit cleanup. The per-product home pages
  // duplicated the workspace dashboard (its activity panel filters by
  // worker); Autopilot's settings moved to each client's page (Modify →
  // Automation mode); Strategy was an unlinked placeholder. Sub-pages such
  // as /dashboard/reputation-manager/incidents are unaffected (exact match).
  async redirects() {
    return [
      { source: "/dashboard/showtime", destination: "/dashboard", permanent: false },
      { source: "/dashboard/reputation-manager", destination: "/dashboard", permanent: false },
      { source: "/dashboard/autopilot", destination: "/dashboard", permanent: false },
      { source: "/dashboard/strategy", destination: "/dashboard", permanent: false },
    ];
  },
};

export default nextConfig;
