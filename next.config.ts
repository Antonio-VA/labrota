import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./i18n/request.ts")

const nextConfig: NextConfig = {
  experimental: {
    reactCompiler: true,
  },
}

export default withNextIntl(nextConfig)
