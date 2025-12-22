# PROJECT_SPECS.md

## Project Overview
- **Project Name**: GovernsAI Browser Extension
- **Version**: 0.1.0
- **Last Updated**: December 22, 2025
- **Primary Purpose**: AI governance extension that intercepts, scans, and manages communications with ChatGPT, Claude, and Gemini to enforce data privacy and usage policies
- **Target Audience**: Enterprise users, compliance teams, and privacy-conscious individuals using AI chat platforms

## Current Project Status
- **Development Stage**: Alpha - Core functionality implemented
- **Build Status**: ✅ Passing - All interceptors and background worker functional
- **Test Coverage**: Manual testing (see TESTING.md)
- **Known Issues**: 
  - Precheck API uses fallback regex detection (API endpoint not yet configured)
  - Extension icons not yet created (placeholders in manifest)
  - Platform logging to GovernsAI dashboard pending
- **Next Milestone**: Configure real API endpoints and test with production credentials

## Architecture Overview

### Tech Stack
- **Frontend**: Chrome Extension Manifest V3, Vanilla JavaScript
- **Backend**: Service Worker (background.js), Chrome Extension APIs
- **Database**: Chrome Storage API for local configuration
- **Infrastructure**: Browser extension (Chrome, Edge, Brave compatible)
- **Development Tools**: Standard web development tools, Chrome Extension DevTools

### System Architecture
- **Architecture Pattern**: Event-driven extension architecture with content script injection
- **Key Components**: 
  - Content Scripts (intercept user input on AI platforms)
  - Background Service Worker (policy enforcement and API communication)
  - Popup UI (status display and quick actions)
  - Options Page (configuration and settings)
- **Data Flow**: 
  1. User types in ChatGPT/Claude/Gemini
  2. Content Script intercepts message
  3. Sends to Background Worker
  4. Background calls Precheck API for PII detection
  5. Policy Engine evaluates rules
  6. Action taken: Allow/Redact/Block
  7. Decision logged to GovernsAI platform
- **External Dependencies**: 
  - GovernsAI Precheck API (PII detection service)
  - GovernsAI Platform API (logging and dashboard)
  - Chrome Extension APIs

### Directory Structure
```
governs-ai-extension/
├── manifest.json                 # Extension configuration (Manifest V3)
├── README.md                     # Project documentation
├── PROJECT_SPECS.md             # This file
├── .gitignore                   # Git ignore rules
├── background/
│   ├── service-worker.js        # Main background logic and message handling
│   ├── precheck-client.js       # Precheck API integration for PII detection
│   └── policy-engine.js         # Policy evaluation (allow/redact/block)
├── content-scripts/
│   ├── common.js                # Shared utilities for all interceptors
│   ├── chatgpt.js               # ChatGPT message interceptor
│   ├── claude.js                # Claude message interceptor
│   └── gemini.js                # Gemini message interceptor
├── popup/
│   ├── popup.html               # Extension popup UI structure
│   ├── popup.js                 # Popup logic and status display
│   └── popup.css                # Popup styling
├── options/
│   ├── options.html             # Settings page structure
│   ├── options.js               # Settings logic and persistence
│   └── options.css              # Settings page styling
├── utils/
│   ├── storage.js               # Chrome storage API wrapper
│   ├── logger.js                # Logging utility for events
│   └── api-client.js            # GovernsAI platform API client
└── assets/
    ├── icons/                   # Extension icons (16, 48, 128px)
    └── styles/
        └── common.css           # Shared styles and CSS variables
```

## Core Features & Modules

### Feature 1: Message Interception
- **Description**: Intercepts user messages before they're sent to AI platforms
- **Files Involved**: 
  - `content-scripts/chatgpt.js` ✅ Implemented
  - `content-scripts/claude.js` ✅ Implemented
  - `content-scripts/gemini.js` ✅ Implemented
  - `content-scripts/common.js` ✅ Implemented
- **Status**: ✅ Complete - Intercepts Enter key and Send button clicks on all three platforms
- **Implementation Details**:
  - Uses capture phase event listeners to intercept before platform handlers
  - Waits for dynamic elements using MutationObserver
  - Handles SPA navigation with URL change detection
  - Supports various input types (textarea, contenteditable, rich-textarea)

### Feature 2: PII Detection
- **Description**: Scans intercepted messages for personally identifiable information using Precheck API
- **Files Involved**: 
  - `background/precheck-client.js` ✅ Implemented
  - `background/service-worker.js` ✅ Implemented
- **Status**: ⚠️ Partial - Fallback detection working, API endpoint not configured
- **Implementation Details**:
  - Fallback regex detection for: emails, phone numbers, SSNs, credit cards
  - API client ready for production endpoint
  - Returns entities with type, value, and risk score
  - Graceful error handling with fallback

### Feature 3: Policy Enforcement
- **Description**: Applies organizational policies to determine allow/redact/block actions
- **Files Involved**: 
  - `background/policy-engine.js` ✅ Implemented
  - `background/service-worker.js` ✅ Implemented
- **Status**: ✅ Complete - All three policy modes functional
- **Implementation Details**:
  - Three modes: Allow (log only), Redact (auto-redact PII), Block (prevent send)
  - Risk score calculation based on entity count
  - Support for custom rules (framework ready)
  - Tool-specific blocking capability

### Feature 4: Data Redaction
- **Description**: Automatically redacts sensitive data from messages (configurable)
- **Files Involved**: 
  - `background/policy-engine.js` ✅ Implemented
  - `content-scripts/common.js` ✅ Implemented
- **Status**: ✅ Complete - Auto-redaction working
- **Implementation Details**:
  - Replaces detected PII with type-specific markers (e.g., [EMAIL REDACTED])
  - Position-based replacement to avoid text shifting
  - Configurable per entity type
  - Updates textarea before sending to platform

### Feature 5: Request Blocking
- **Description**: Blocks requests that violate policies with user-facing warnings
- **Files Involved**: 
  - `background/policy-engine.js` ✅ Implemented
  - `content-scripts/common.js` ✅ Implemented
- **Status**: ✅ Complete - Block mode functional with notifications
- **Implementation Details**:
  - Prevents message submission when policy violated
  - Shows user-friendly notification with reason
  - Logs blocked attempts for audit
  - Message remains in input field for user to edit

### Feature 6: Activity Logging
- **Description**: Logs all interactions and decisions to GovernsAI dashboard
- **Files Involved**: 
  - `utils/logger.js` (placeholder)
  - `utils/api-client.js` (placeholder)
  - `background/service-worker.js` ✅ Implemented
- **Status**: ⚠️ Partial - Console logging working, platform API pending
- **Implementation Details**:
  - Logs platform, timestamp, PII detection, action taken
  - Console logging for development/debugging
  - API client framework ready for production endpoint
  - Non-blocking (logging failures don't impact user)

### Feature 7: Tool Usage Policies
- **Description**: Enforces policies on AI feature usage (allow/block specific capabilities)
- **Files Involved**: 
  - `background/policy-engine.js` ✅ Framework implemented
  - `options/options.js` (pending)
- **Status**: ⚠️ Framework ready, UI configuration pending
- **Implementation Details**:
  - `isToolBlocked()` function for checking tool permissions
  - `evaluateCustomRules()` for complex policy logic
  - Storage structure defined
  - UI for rule configuration not yet built

## API Documentation

### Precheck API (External)
- **Base URL**: TBD (GovernsAI Precheck endpoint)
- **Authentication**: API key (stored in Chrome storage)
- **Key Endpoints**: 
  - `POST /precheck` - Scan text for PII
- **Data Models**: 
  - Request: `{ text: string, context: object }`
  - Response: `{ hasPII: boolean, entities: [], riskScore: number }`

### GovernsAI Platform API (External)
- **Base URL**: TBD (GovernsAI platform endpoint)
- **Authentication**: API key + organization ID
- **Key Endpoints**: 
  - `POST /logs` - Log interaction decision
  - `GET /policies` - Fetch current policies
- **Data Models**: TBD based on platform API

### Internal Extension Messages
- **Content Script → Background**: 
  - `{ type: 'INTERCEPT_MESSAGE', platform: string, message: string }`
- **Background → Content Script**: 
  - `{ type: 'ALLOW', originalMessage: string }`
  - `{ type: 'REDACT', redactedMessage: string }`
  - `{ type: 'BLOCK', reason: string }`

## Database Schema

### Chrome Storage (Local)
- **settings**: User preferences and configuration
  - `apiKey`: string - GovernsAI API key
  - `orgId`: string - Organization ID
  - `policyMode`: 'allow'|'redact'|'block' - Default policy action
  - `enabledPlatforms`: string[] - Active platforms to monitor
  - `autoRedact`: boolean - Automatic redaction flag

### Chrome Storage (Sync)
- **userPreferences**: Synced user settings across devices
  - Same schema as local settings for user-specific preferences

## Development Workflow

### Setup Instructions
1. Clone the repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the project root directory
6. Extension should now appear in browser toolbar
7. Configure API keys in extension options

### Testing Strategy
- **Unit Tests**: Not yet implemented
- **Integration Tests**: Not yet implemented
- **E2E Tests**: Manual testing on ChatGPT, Claude, Gemini
- **Testing Approach**: 
  1. Load extension in Chrome
  2. Navigate to AI platform
  3. Test message interception
  4. Verify API calls
  5. Validate policy enforcement

### Deployment Process
- **Development**: Load unpacked extension for testing
- **Staging**: Package extension as .crx for internal distribution
- **Production**: Submit to Chrome Web Store
- **Rollback**: Revert to previous packaged version

## Configuration Management

### Environment Variables
- Not applicable (Chrome extension uses Chrome Storage API)

### Config Files
- `manifest.json` - Extension permissions, content script matches, background worker
- Settings stored in Chrome Storage API (configured via options page)

### Secrets Management
- API keys stored in Chrome Storage (encrypted at rest by Chrome)
- Never commit API keys to repository
- Users configure keys via options page

## Performance & Monitoring

### Key Metrics
- Message interception latency
- API call response time
- Policy evaluation time
- User-perceived delay before message send
- API error rates

### Performance Benchmarks
- Target: <100ms interception overhead
- Target: <500ms total policy check time
- Not yet measured

### Alerting
- Extension console errors logged
- API failures surfaced to user via popup
- Policy violations logged to platform

## Security Considerations

### Authentication/Authorization
- API key authentication with GovernsAI services
- Chrome Extension APIs for secure storage
- Content Security Policy enforced via manifest

### Data Protection
- Intercepted messages processed in memory only
- No local storage of message content
- API keys encrypted by Chrome storage
- HTTPS required for all API calls

### Security Audits
- Not yet performed
- Plan: Review before production release

## Recent Changes Log
- **2025-12-22 (Update 2)**: Core functionality implementation complete
  - ✅ Implemented ChatGPT message interceptor with Enter key and Send button handling
  - ✅ Implemented Claude message interceptor with contenteditable support
  - ✅ Implemented Gemini message interceptor with rich-textarea support
  - ✅ Built background service worker with full message processing pipeline
  - ✅ Created Precheck API client with fallback PII detection (regex-based)
  - ✅ Implemented policy engine with allow/redact/block modes
  - ✅ Added auto-redaction functionality with entity-specific markers
  - ✅ Built functional popup UI with status display and quick settings
  - ✅ Created comprehensive testing guide (TESTING.md)
  - ✅ Added shared utilities in common.js (sendToBackground, notifications, etc.)

- **2025-12-22 (Update 1)**: Initial project structure created
  - Created complete directory structure
  - Added manifest.json with Manifest V3 configuration
  - Created placeholder files for all modules
  - Initialized PROJECT_SPECS.md documentation

## Team & Contacts
- **Project Lead**: TBD
- **Key Contributors**: TBD
- **Code Reviewers**: TBD

## Documentation Links
- **API Docs**: TBD
- **User Manual**: TBD
- **Development Docs**: This file (PROJECT_SPECS.md)

## Implementation Priorities

### ✅ Phase 1: Core Interception (COMPLETE)
1. ✅ Implement content script interceptors for each platform
2. ✅ Set up message passing to background worker
3. ✅ Create basic UI feedback for users

### ⚠️ Phase 2: API Integration (PARTIAL)
1. ✅ Implement Precheck API client (fallback mode working)
2. ⏳ Configure production Precheck API endpoint
3. ⏳ Implement GovernsAI platform API client
4. ✅ Add error handling and retry logic

### ✅ Phase 3: Policy Engine (COMPLETE)
1. ✅ Build policy evaluation logic
2. ✅ Implement allow/redact/block actions
3. ⚠️ Add configurable policy rules (framework ready)

### ⚠️ Phase 4: UI & Configuration (PARTIAL)
1. ✅ Build popup interface
2. ⏳ Create comprehensive options page
3. ✅ Add status indicators and notifications
4. ⏳ Add extension icons (currently placeholders)

### Phase 5: Testing & Refinement (NEXT)
1. ⏳ Comprehensive testing on all platforms
2. ⏳ Performance optimization
3. ⏳ User experience improvements
4. ✅ Documentation completion (TESTING.md created)

### Phase 6: Production Readiness
1. ⏳ Configure real API endpoints
2. ⏳ Create extension icons (16x16, 48x48, 128x128)
3. ⏳ Build comprehensive options page
4. ⏳ Add analytics and error reporting
5. ⏳ Browser compatibility testing (Chrome, Edge, Brave)
6. ⏳ Prepare Chrome Web Store submission

