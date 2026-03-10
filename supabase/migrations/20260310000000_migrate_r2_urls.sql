-- Migrate existing R2 file URLs from old S3 API endpoint to new public R2.dev domain
-- Old: https://fa68ce09af0aed91a99ce2408c9043c4.r2.cloudflarestorage.com/ah-crm
-- New: https://pub-e80a2e1e103a4f2e8c534f99eb473cca.r2.dev

UPDATE tasks
SET proof_url = REPLACE(
  proof_url,
  'https://fa68ce09af0aed91a99ce2408c9043c4.r2.cloudflarestorage.com/ah-crm',
  'https://pub-e80a2e1e103a4f2e8c534f99eb473cca.r2.dev'
)
WHERE proof_url LIKE '%fa68ce09af0aed91a99ce2408c9043c4.r2.cloudflarestorage.com%';

UPDATE proof_of_activities
SET file_url = REPLACE(
  file_url,
  'https://fa68ce09af0aed91a99ce2408c9043c4.r2.cloudflarestorage.com/ah-crm',
  'https://pub-e80a2e1e103a4f2e8c534f99eb473cca.r2.dev'
)
WHERE file_url LIKE '%fa68ce09af0aed91a99ce2408c9043c4.r2.cloudflarestorage.com%';
