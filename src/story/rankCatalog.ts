import type { RankForm } from '../domain/rankAssessment.ts';
import rankCatalog from './rankCatalog.json';

/** Version 1 bank is immutable once released; replacement forms must have new identifiers. */
export const RANK_FORMS = rankCatalog as RankForm[];
