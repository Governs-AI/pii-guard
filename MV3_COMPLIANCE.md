# Manifest V3 Compliance Checklist

Verified on February 23, 2026.

## Manifest

- `manifest_version` is set to `3`.
- Background execution uses `background.service_worker` (`background/service-worker.js`).
- No MV2-only background page keys are present.

## API Usage

- Uses MV3-compatible extension APIs:
  - `chrome.runtime`
  - `chrome.storage`
  - `chrome.permissions`
- No use of deprecated MV2-only APIs (`chrome.extension.getBackgroundPage`, persistent background pages, etc.).

## Permission Model

- Required permissions are limited to:
  - `storage`
  - `permissions`
- Host access is restricted to known chat platforms and approved policy endpoints.
- `optional_host_permissions` no longer includes wildcard `<all_urls>`-equivalent patterns.

## Security Behavior

- Message interception now fails closed:
  - Precheck/network/runtime failures return `BLOCK`.
  - Unknown policy actions are treated as blocked.

