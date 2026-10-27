import type { NextConfig } from 'next'
// allowedDevOrigins: dev-only, lets the site be previewed from the LAN IP.
const config: NextConfig = { devIndicators: false, allowedDevOrigins: ['192.168.68.104'] }
export default config
