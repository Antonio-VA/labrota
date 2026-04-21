-- Change staff_skills.skill from enum to text so it can store técnica codes
ALTER TABLE staff_skills ALTER COLUMN skill TYPE text;
