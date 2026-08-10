export interface CourseExternalIds {
  canvas?: string;
  studentVue?: string;
  bellLogic?: string;
}

export interface Course {
  id: string;
  externalIds: CourseExternalIds;
  name: string;
  shortName?: string;
  period?: string;
  teacher?: string;
}

export interface CourseMatchResult {
  courses: Course[];
  sourceCourseIdToSchoolDayId: ReadonlyMap<string, string>;
}
