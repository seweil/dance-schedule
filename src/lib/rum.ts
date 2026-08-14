import { AwsRum, type AwsRumConfig } from 'aws-rum-web'

// CloudWatch RUM client telemetry — device/browser/OS, page performance, JS
// and HTTP errors, sent straight from the browser. Config comes from the
// Amplify build environment (see infra/README.md); the AWS resources
// themselves live in infra/monitoring.yaml, not this repo's runtime code.
// No-ops (rather than throwing) whenever the env vars are absent, so local
// dev and any build predating the stack's deployment are unaffected.
let awsRum: AwsRum | undefined

export function initRum(): void {
  if (!import.meta.env.PROD) return

  const applicationId = import.meta.env.VITE_RUM_APP_MONITOR_ID
  const identityPoolId = import.meta.env.VITE_RUM_IDENTITY_POOL_ID
  const region = import.meta.env.VITE_RUM_REGION
  if (!applicationId || !identityPoolId || !region) return

  const config: AwsRumConfig = {
    sessionSampleRate: 1,
    identityPoolId,
    endpoint: `https://dataplane.rum.${region}.amazonaws.com`,
    telemetries: ['errors', 'performance', 'http'],
    allowCookies: true,
    enableXRay: false,
  }

  try {
    awsRum = new AwsRum(applicationId, __BUILD_NUMBER__, region, config)
  } catch {
    // RUM must never break the app it's observing.
  }
}

// App-specific usage events (date/level-filter/text-size selections — see
// docs/design/monitoring.md) — requires infra/monitoring.yaml's CustomEvents
// to be enabled server-side, or CloudWatch RUM silently drops them. No-ops
// the same way initRum does: outside production, or before init has run/
// succeeded (missing env vars, construction failure).
export function trackEvent(type: string, data: Record<string, unknown>): void {
  if (!awsRum) return
  try {
    awsRum.recordEvent(type, data)
  } catch {
    // Telemetry must never break the app it's observing.
  }
}
