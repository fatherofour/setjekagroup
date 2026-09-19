// Setjeka Group's own project delivery stage standard (Requirements
// Register R17, confirmed verbatim in the 3rd client meeting) - not the
// generic external PROCSA stage numbering.
export type ProjectStage =
  | 'INITIATION'
  | 'INCEPTION'
  | 'CONCEPT'
  | 'DESIGN'
  | 'DOCUMENTATION_PROCUREMENT'
  | 'CONSTRUCTION'
  | 'CLOSEOUT';

export const PROJECT_STAGES: { value: ProjectStage; number: number; label: string }[] = [
  { value: 'INITIATION', number: 0, label: 'Initiation' },
  { value: 'INCEPTION', number: 1, label: 'Inception' },
  { value: 'CONCEPT', number: 2, label: 'Concept' },
  { value: 'DESIGN', number: 3, label: 'Design' },
  { value: 'DOCUMENTATION_PROCUREMENT', number: 4, label: 'Documentation & Procurement' },
  { value: 'CONSTRUCTION', number: 5, label: 'Construction' },
  { value: 'CLOSEOUT', number: 6, label: 'Closeout' },
];

export function projectStageInfo(stage: ProjectStage) {
  return PROJECT_STAGES.find((s) => s.value === stage) ?? PROJECT_STAGES[0];
}
