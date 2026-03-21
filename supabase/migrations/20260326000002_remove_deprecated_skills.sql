-- Remove deprecated skill records from all staff.
-- Canonical five going forward: biopsy, icsi, egg_collection, embryo_transfer, denudation.
-- The skills below were either lab-specific (IUI, vitrification, thawing, semen analysis,
-- sperm prep) or repurposed labels (witnessing → denudation, other → embryo_transfer)
-- that are no longer used in the UI.

DELETE FROM staff_skills
WHERE skill IN (
  'iui',
  'vitrification',
  'thawing',
  'semen_analysis',
  'sperm_prep',
  'witnessing',
  'other'
);
