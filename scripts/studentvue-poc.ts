import { StudentVueWebProvider } from '../src/lib/server/providers/studentvue/web-provider.ts';

const required = ['STUDENTVUE_BASE_URL', 'STUDENTVUE_USERNAME', 'STUDENTVUE_PASSWORD'] as const;
const missing = required.filter((name) => !process.env[name]?.trim());

if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exitCode = 1;
} else {
  try {
    const provider = new StudentVueWebProvider({
      baseUrl: process.env.STUDENTVUE_BASE_URL!,
      username: process.env.STUDENTVUE_USERNAME!,
      password: process.env.STUDENTVUE_PASSWORD!
    });
    const [courses, grades, assignments] = await Promise.all([
      provider.getCourses(),
      provider.getCourseGrades(),
      provider.getGradebookAssignments()
    ]);
    const checks = {
      'Web portal authentication': true,
      'Class list': courses.length > 0,
      'Current course grades endpoint': true,
      'Gradebook assignments endpoint': true
    };

    for (const [name, passed] of Object.entries(checks)) {
      console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
    }
    console.log(
      `Counts: ${courses.length} classes, ${grades.length} course grades, ${assignments.length} assignments`
    );
    if (!checks['Class list']) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'StudentVUE proof of concept failed');
    process.exitCode = 1;
  }
}
