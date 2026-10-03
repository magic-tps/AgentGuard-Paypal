import "server-only";
import { configuredAppUrl } from "./environment";

export function appUrl() {
  return configuredAppUrl().origin;
}
