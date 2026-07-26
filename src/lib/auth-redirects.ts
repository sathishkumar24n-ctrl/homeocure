const HOSTED_APP_ORIGIN = "https://homeocure-doctor-test.sathishkumar24n.chatgpt.site";

export function appOrigin() {
  if (typeof window === "undefined") return HOSTED_APP_ORIGIN;

  const currentOrigin = window.location.origin;
  const isLocal =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "::1";

  return import.meta.env.DEV && !isLocal ? currentOrigin : HOSTED_APP_ORIGIN;
}

export function authRedirectTo(path = "/") {
  return new URL(path, appOrigin()).toString();
}
