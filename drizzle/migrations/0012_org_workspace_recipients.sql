-- Shared recipient pool owner for all super-admins.
INSERT INTO "user" (
  id,
  name,
  email,
  email_verified,
  role,
  banned,
  ban_reason,
  must_change_password,
  two_factor_enabled,
  created_at,
  updated_at
) VALUES (
  'org_workspace',
  'Organization workspace',
  'workspace@system.local',
  true,
  'user',
  true,
  'system_workspace',
  false,
  false,
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

-- Super-admin role matcher (supports comma-separated Better Auth roles).
-- Matches: "super-admin", "super-admin,admin", "admin,super-admin", etc.

-- Remap list memberships that point at duplicate emails onto the workspace contact,
-- then drop the super-admin's conflicting contact rows.
UPDATE contact_list_members clm
SET contact_id = workspace.id
FROM contacts source
INNER JOIN "user" u ON u.id = source.user_id
INNER JOIN contacts workspace
  ON workspace.user_id = 'org_workspace'
 AND workspace.email = source.email
WHERE clm.contact_id = source.id
  AND (
    u.role = 'super-admin'
    OR u.role LIKE 'super-admin,%'
    OR u.role LIKE '%,super-admin'
    OR u.role LIKE '%,super-admin,%'
  )
  AND source.user_id <> 'org_workspace'
  AND NOT EXISTS (
    SELECT 1
    FROM contact_list_members existing
    WHERE existing.list_id = clm.list_id
      AND existing.contact_id = workspace.id
  );

DELETE FROM contact_list_members clm
USING contacts source
INNER JOIN "user" u ON u.id = source.user_id
INNER JOIN contacts workspace
  ON workspace.user_id = 'org_workspace'
 AND workspace.email = source.email
WHERE clm.contact_id = source.id
  AND (
    u.role = 'super-admin'
    OR u.role LIKE 'super-admin,%'
    OR u.role LIKE '%,super-admin'
    OR u.role LIKE '%,super-admin,%'
  )
  AND source.user_id <> 'org_workspace';

DELETE FROM contacts source
USING "user" u
WHERE source.user_id = u.id
  AND (
    u.role = 'super-admin'
    OR u.role LIKE 'super-admin,%'
    OR u.role LIKE '%,super-admin'
    OR u.role LIKE '%,super-admin,%'
  )
  AND source.user_id <> 'org_workspace'
  AND EXISTS (
    SELECT 1 FROM contacts workspace
    WHERE workspace.user_id = 'org_workspace'
      AND workspace.email = source.email
  );

-- Move remaining non-conflicting contacts.
UPDATE contacts c
SET user_id = 'org_workspace',
    updated_at = now()
FROM "user" u
WHERE c.user_id = u.id
  AND (
    u.role = 'super-admin'
    OR u.role LIKE 'super-admin,%'
    OR u.role LIKE '%,super-admin'
    OR u.role LIKE '%,super-admin,%'
  )
  AND c.user_id <> 'org_workspace'
  AND NOT EXISTS (
    SELECT 1 FROM contacts workspace
    WHERE workspace.user_id = 'org_workspace'
      AND workspace.email = c.email
  );

-- Remap members of conflicting-named lists onto the workspace list, then delete sources.
UPDATE contact_list_members clm
SET list_id = workspace.id
FROM contact_lists source
INNER JOIN "user" u ON u.id = source.user_id
INNER JOIN contact_lists workspace
  ON workspace.user_id = 'org_workspace'
 AND workspace.name = source.name
WHERE clm.list_id = source.id
  AND (
    u.role = 'super-admin'
    OR u.role LIKE 'super-admin,%'
    OR u.role LIKE '%,super-admin'
    OR u.role LIKE '%,super-admin,%'
  )
  AND source.user_id <> 'org_workspace'
  AND NOT EXISTS (
    SELECT 1
    FROM contact_list_members existing
    WHERE existing.list_id = workspace.id
      AND existing.contact_id = clm.contact_id
  );

DELETE FROM contact_list_members clm
USING contact_lists source
INNER JOIN "user" u ON u.id = source.user_id
INNER JOIN contact_lists workspace
  ON workspace.user_id = 'org_workspace'
 AND workspace.name = source.name
WHERE clm.list_id = source.id
  AND (
    u.role = 'super-admin'
    OR u.role LIKE 'super-admin,%'
    OR u.role LIKE '%,super-admin'
    OR u.role LIKE '%,super-admin,%'
  )
  AND source.user_id <> 'org_workspace';

DELETE FROM contact_lists source
USING "user" u
WHERE source.user_id = u.id
  AND (
    u.role = 'super-admin'
    OR u.role LIKE 'super-admin,%'
    OR u.role LIKE '%,super-admin'
    OR u.role LIKE '%,super-admin,%'
  )
  AND source.user_id <> 'org_workspace'
  AND EXISTS (
    SELECT 1 FROM contact_lists workspace
    WHERE workspace.user_id = 'org_workspace'
      AND workspace.name = source.name
  );

-- Move remaining non-conflicting lists.
UPDATE contact_lists cl
SET user_id = 'org_workspace',
    updated_at = now()
FROM "user" u
WHERE cl.user_id = u.id
  AND (
    u.role = 'super-admin'
    OR u.role LIKE 'super-admin,%'
    OR u.role LIKE '%,super-admin'
    OR u.role LIKE '%,super-admin,%'
  )
  AND cl.user_id <> 'org_workspace'
  AND NOT EXISTS (
    SELECT 1 FROM contact_lists workspace
    WHERE workspace.user_id = 'org_workspace'
      AND workspace.name = cl.name
  );

-- Suppressions: drop conflicting source rows, move the rest.
DELETE FROM email_suppressions source
USING "user" u
WHERE source.user_id = u.id
  AND (
    u.role = 'super-admin'
    OR u.role LIKE 'super-admin,%'
    OR u.role LIKE '%,super-admin'
    OR u.role LIKE '%,super-admin,%'
  )
  AND source.user_id <> 'org_workspace'
  AND EXISTS (
    SELECT 1 FROM email_suppressions workspace
    WHERE workspace.user_id = 'org_workspace'
      AND workspace.email = source.email
  );

UPDATE email_suppressions s
SET user_id = 'org_workspace',
    updated_at = now()
FROM "user" u
WHERE s.user_id = u.id
  AND (
    u.role = 'super-admin'
    OR u.role LIKE 'super-admin,%'
    OR u.role LIKE '%,super-admin'
    OR u.role LIKE '%,super-admin,%'
  )
  AND s.user_id <> 'org_workspace'
  AND NOT EXISTS (
    SELECT 1 FROM email_suppressions workspace
    WHERE workspace.user_id = 'org_workspace'
      AND workspace.email = s.email
  );

-- Consent events follow contacts ownership for super-admin actors.
UPDATE contact_consent_events e
SET user_id = 'org_workspace'
FROM "user" u
WHERE e.user_id = u.id
  AND (
    u.role = 'super-admin'
    OR u.role LIKE 'super-admin,%'
    OR u.role LIKE '%,super-admin'
    OR u.role LIKE '%,super-admin,%'
  )
  AND e.user_id <> 'org_workspace';
