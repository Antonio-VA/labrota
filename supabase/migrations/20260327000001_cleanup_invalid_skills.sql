-- Remove all staff_skills records that are not one of the five canonical skills.
-- Valid skills: biopsy, icsi, egg_collection, embryo_transfer, denudation

DELETE FROM staff_skills
WHERE skill NOT IN ('biopsy', 'icsi', 'egg_collection', 'embryo_transfer', 'denudation');
