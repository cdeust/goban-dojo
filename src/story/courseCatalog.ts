import { SCHOOL_MODULES, type SchoolExercise } from '../domain/school.ts';
import { TACTICS_MODULES, type AdvancedTacticExercise } from '../domain/advancedTactics.ts';
import { ENDGAME_MODULES, type EndgameExercise } from '../domain/endgameCourse.ts';
import { STRATEGY_MODULES, type StrategyLesson } from './strategyCourse.ts';
import schoolCatalog from './schoolCatalog.json';
import advancedCatalog from './advancedCatalog.json';
import strategyCatalog from './strategyCatalog.json';
import endgameCatalog from './endgameCatalog.json';

export type CourseExercise =
  SchoolExercise | AdvancedTacticExercise | StrategyLesson | EndgameExercise;
export const ALL_MODULES = [
  ...SCHOOL_MODULES,
  ...TACTICS_MODULES,
  ...STRATEGY_MODULES,
  ...ENDGAME_MODULES,
];
export const ALL_EXERCISES: CourseExercise[] = [
  ...(schoolCatalog as SchoolExercise[]),
  ...(advancedCatalog as AdvancedTacticExercise[]),
  ...(strategyCatalog as StrategyLesson[]),
  ...(endgameCatalog as EndgameExercise[]),
];
