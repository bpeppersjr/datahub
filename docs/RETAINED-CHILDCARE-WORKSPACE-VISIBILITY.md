# Retained childcare evidence in simplified workspaces

Coverage and Industries show a separate retained childcare county panel below national coverage. Select Pennsylvania or Maryland using the existing state selector, then select a county GEOID or the state total in the panel. Other states remain unavailable, not zero. A supported county with no assigned retained source points has an observed zero for this derivative only.

The panel reads the existing map catalog for geography compatibility and the existing retained-childcare-counties GET endpoint for verified aggregate evidence. It neither changes national metrics nor calls the coverage preparation adapter. No acquisition, replay, publication, integration or public export is performed.

Counts represent retained source-point relationships, not verified sites, current operations or industry completeness. Publisher cohorts and assigned geography remain separate. Assignment gaps cover the entire retained derivative, including cohorts outside the county display; each source cohort also shows its own assignment denominator and unassigned rows.

The derivative creation date is displayed separately. The aggregate API does not supply original source observation dates, so the panel explicitly says they are unavailable here and remain in retained source receipts. Derivative creation must not be interpreted as source freshness.

Focused UI verification: `node --test runner/retained-county-panel.test.mjs runner/workspace-views-ui.test.mjs`. Tests cover both workspace mounts, PA/MD scope, unsupported states, observed county zero, parent-state changes, geography failure/mismatch, ZIP withholding and stale responses. No data migration is required; rollback consists of removing the workspace panel mount and reverting the related panel/test changes.
