-- StudentVUE LinkColumn cells were previously stored as raw JSON. Their hidden
-- link parameters could also be misread as assignment scores. Clear only those
-- corrupted assignment records so the next live sync can rebuild them cleanly.
DELETE FROM studentvue_cache
WHERE EXISTS (
  SELECT 1
  FROM gradebook_assignment_snapshots
  WHERE title LIKE '{"href":%'
    AND title LIKE '%"hrefAttributes":%'
    AND title LIKE '%"dataType":"LinkColumn"%'
);

DELETE FROM grade_changes
WHERE assignment_title LIKE '{"href":%'
  AND assignment_title LIKE '%"hrefAttributes":%'
  AND assignment_title LIKE '%"dataType":"LinkColumn"%';

DELETE FROM gradebook_assignment_snapshots
WHERE title LIKE '{"href":%'
  AND title LIKE '%"hrefAttributes":%'
  AND title LIKE '%"dataType":"LinkColumn"%';
