BEGIN;

INSERT INTO source_documents (
  canonical_url, title, publisher, source_type, first_published_at
) VALUES
  (
    'https://bdsmovement.net/bds-guidelines/bds-guide-strategic-campaigning-palestinian-rights',
    'BDS Guide to Strategic Campaigning for Palestinian Rights',
    'Palestinian BDS National Committee',
    'campaign',
    '2026-06-23T00:00:00Z'
  ),
  (
    'https://bdsmovement.net/Get-involved-divestment',
    'Get Involved - Divestment',
    'Palestinian BDS National Committee',
    'campaign',
    NULL
  )
ON CONFLICT (canonical_url) DO UPDATE SET
  title = EXCLUDED.title,
  publisher = EXCLUDED.publisher,
  source_type = EXCLUDED.source_type,
  first_published_at = COALESCE(EXCLUDED.first_published_at, source_documents.first_published_at),
  updated_at = now();

INSERT INTO reason_authority_sources (reason_code, source_document_id, authority_role)
SELECT seed.reason_code, sd.id, seed.authority_role
FROM (
  VALUES
    ('C14', 'https://bdsmovement.net/bds-guidelines/bds-guide-strategic-campaigning-palestinian-rights', 'methodology'),
    ('C15', 'https://bdsmovement.net/bds-guidelines/bds-guide-strategic-campaigning-palestinian-rights', 'methodology'),
    ('C25', 'https://bdsmovement.net/bds-guidelines/bds-guide-strategic-campaigning-palestinian-rights', 'methodology'),
    ('C16', 'https://bdsmovement.net/Get-involved-divestment', 'authoritative-list')
) AS seed(reason_code, source_url, authority_role)
JOIN source_documents sd ON sd.canonical_url = seed.source_url
ON CONFLICT DO NOTHING;

COMMIT;
