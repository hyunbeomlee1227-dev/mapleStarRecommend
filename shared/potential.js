export const potentialGradeOrder = ['rare', 'epic', 'unique', 'legendary'];

export const potentialGradeLabels = {
  rare: '레어',
  epic: '에픽',
  unique: '유니크',
  legendary: '레전드리',
};

export function isPotentialGradeAtLeast(grade, minimumGrade) {
  return potentialGradeOrder.indexOf(grade) >= potentialGradeOrder.indexOf(minimumGrade);
}
