-- Migrate old skill enum values to técnica codes
-- This maps the legacy skill names to the new técnica codes

UPDATE staff_skills SET skill = 'OPU' WHERE skill = 'egg_collection';
UPDATE staff_skills SET skill = 'ICS' WHERE skill = 'icsi';
UPDATE staff_skills SET skill = 'ET'  WHERE skill = 'embryo_transfer';
UPDATE staff_skills SET skill = 'BX'  WHERE skill = 'biopsy';
UPDATE staff_skills SET skill = 'DEN' WHERE skill = 'denudation';
UPDATE staff_skills SET skill = 'CNG' WHERE skill = 'sperm_freezing';
UPDATE staff_skills SET skill = 'SEM' WHERE skill = 'semen_analysis';
UPDATE staff_skills SET skill = 'PRE' WHERE skill = 'sperm_prep';

-- Remove any remaining legacy skills that don't map to técnica codes
DELETE FROM staff_skills WHERE skill IN ('iui', 'vitrification', 'thawing', 'witnessing', 'other');
