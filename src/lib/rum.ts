import { AwsRum, type AwsRumConfig } from 'aws-rum-web'

// CloudWatch RUM client telemetry — device/browser/OS, page performance, JS
// and HTTP errors, sent straight from the browser. Config comes from the
// Amplify build environment (see infra/README.md); the AWS resources
// themselves live in infra/monitoring.yaml, not this repo's runtime code.
// No-ops (rather than throwing) whenever the env vars are absent, so local
// dev and any build predating the stack's deployment are unaffected.
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
    new AwsRum(applicationId, __BUILD_NUMBER__, region, config)
  } catch {
    // RUM must never break the app it's observing.
  }
}
