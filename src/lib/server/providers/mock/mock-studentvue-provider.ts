import afterFixture from '../../../../../fixtures/studentvue/gradebook-after.json';
import beforeFixture from '../../../../../fixtures/studentvue/gradebook-before.json';
import type { GradeSnapshot } from '$lib/models';
import type { GradebookProvider } from '../contracts';
import {
  normalizeStudentVueAssignments,
  normalizeStudentVueCourseGrades,
  normalizeStudentVueCourses,
  normalizeStudentVueSnapshot
} from '../studentvue/normalize';
import { studentVueGradebookSchema } from '../studentvue/schema';

export type MockGradebookVersion = 'before' | 'after';

export class MockStudentVueProvider implements GradebookProvider {
  private readonly fixture;

  constructor(version: MockGradebookVersion = 'after') {
    this.fixture = studentVueGradebookSchema.parse(
      version === 'before' ? beforeFixture : afterFixture
    );
  }

  async getCourses() {
    return normalizeStudentVueCourses(this.fixture);
  }

  async getCourseGrades() {
    return normalizeStudentVueCourseGrades(this.fixture);
  }

  async getGradebookAssignments() {
    return normalizeStudentVueAssignments(this.fixture);
  }

  async getSnapshot(): Promise<GradeSnapshot> {
    return normalizeStudentVueSnapshot(this.fixture);
  }
}
