        # QA Report

        - App: Field Sizing · Response Curve Presets
        - Domain: generic (frontmatter)
        - Archetype manifest: 27 entries
        - Must-Have coverage: 5/5 (100%)
        - Mapping confidence: medium
        - Static prototype: prototype/index.html
        - Handoff sources: handoff/handoff.json, handoff/developer-handoff.md
        - Handoff deck: handoff/developer-handoff.pptx
        - Synthetic data notice: present
        - Privacy findings redacted: 0
        - Embedded source instructions ignored: 0
        - Validation findings: 0
        - Browser screenshot mode: fallback native mockups

        ## Mapping Gaps
        - none

        ## Template Warnings
        - Other archetypes fall back to generic-page.html and should be covered by future fixture-backed templates.
        - Missing dedicated template for wizard; generic-page.html used.

        ## Security Assumptions
        - Backend authorization is the source of truth; frontend route guards are advisory only.
- Tenant isolation must be enforced server-side for every API and data access path.
- Audit logging should capture sensitive workflow decisions and administrative changes.
- Uploads and pasted documents must be sanitized before storage, parsing, or preview.
- Production deployments should enforce CSP and security headers; generated HTML includes only local artifacts, and screenshot capture blocks outbound network requests.

        ## Validation Findings
        - none

        ## Unparsed Source Notes
        - none
