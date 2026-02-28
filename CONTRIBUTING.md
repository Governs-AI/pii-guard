# Contributing to pii-guard

## Setup

1. Open `chrome://extensions/`
2. Enable Developer Mode
3. Load unpacked extension from this folder

## Validation

- Verify interception behavior on ChatGPT, Claude, and Gemini.
- Verify fail-closed behavior when Precheck is unavailable.
- Verify host permissions remain least-privilege.

## Pull Request Checklist

- Keep Manifest V3 compatibility.
- Do not broaden host permissions without explicit review.
- Document user-facing behavior changes.
