import { env as privateEnvironment } from '$env/dynamic/private';
import type { DashboardRuntimeEnvironment } from './dashboard-service';

export interface DashboardEnvironment extends DashboardRuntimeEnvironment {
  CANVAS_WEB_URL?: string;
  STUDENTVUE_WEB_URL?: string;
  BELLLOGIC_WEB_URL?: string;
}

export function getDashboardEnvironment(): DashboardEnvironment {
  return {
    SCHOOLDAY_DB_PATH: privateEnvironment.SCHOOLDAY_DB_PATH,
    SCHOOLDAY_DISPLAY_NAME: privateEnvironment.SCHOOLDAY_DISPLAY_NAME,
    CANVAS_BASE_URL: privateEnvironment.CANVAS_BASE_URL,
    CANVAS_TOKEN: privateEnvironment.CANVAS_TOKEN,
    CANVAS_WEB_URL: privateEnvironment.CANVAS_WEB_URL,
    BELLLOGIC_API_URL: privateEnvironment.BELLLOGIC_API_URL,
    BELLLOGIC_REQUEST_ORIGIN: privateEnvironment.BELLLOGIC_REQUEST_ORIGIN,
    BELLLOGIC_WEB_URL: privateEnvironment.BELLLOGIC_WEB_URL,
    STUDENTVUE_BASE_URL: privateEnvironment.STUDENTVUE_BASE_URL,
    STUDENTVUE_USERNAME: privateEnvironment.STUDENTVUE_USERNAME,
    STUDENTVUE_PASSWORD: privateEnvironment.STUDENTVUE_PASSWORD,
    STUDENTVUE_WEB_URL: privateEnvironment.STUDENTVUE_WEB_URL
  };
}
