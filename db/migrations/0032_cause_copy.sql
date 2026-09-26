BEGIN;

-- Plain-language cause descriptions for the public site and extension settings.
UPDATE causes SET description = 'People who show up in the released Epstein files: the flights, the emails, the meetings, the whole contact book.', updated_at = now() WHERE slug = 'epstein-records';
UPDATE causes SET description = 'People and brands who endorsed, funded or campaigned for Trump and the MAGA movement.', updated_at = now() WHERE slug = 'trump-maga';
UPDATE causes SET description = 'Who signed what, funded what and said what about Israel and Palestine.', updated_at = now() WHERE slug = 'israel-palestine';
UPDATE causes SET description = 'Sanctioned names, companies still cashing in on Russia, and the public cheerleaders for the war on Ukraine.', updated_at = now() WHERE slug = 'russia-ukraine';

COMMIT;
