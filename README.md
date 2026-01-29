# Obsidian Dataview Tests

A standalone test suite for validating complex Obsidian Dataview scripts outside of the Obsidian environment. This project mocks the Dataview API to run unit tests against script logic, ensuring stability and correct behavior before deploying to the vault.

## 📂 Structure

- **`content-metadata-view.js`**: The production script used in the Obsidian vault (copied here for testing).
- **`content-view.test.js`**: The Jest test suite containing the `MockDataview` class, mock vault data, and test cases.

## 🚀 Getting Started

### Prerequisites
- Node.js (LTS recommended)

### Installation
1. Clone this repository (or navigate to the folder).
2. Install dependencies:
   ```bash
   npm install
```


### Running Tests

Execute the test suite with Jest:

```bash
npm test
```


## 🧪 Test Coverage

The suite (`content-view.test.js`) verifies the following logic:

1. **Recursion \& Inheritance**:
    - Ensures `#parent` queries find `#parent/child` tags.
    - Verifies page-level tags are correctly inherited by list items.
2. **Filtering \& Exclusion**:
    - Validates `exclude_folders` and `exclude_current` logic.
    - Tests exact vs. partial tag matching.
3. **Metadata Extraction**:
    - checks if inline fields (`key:: value`) are correctly parsed into columns.
    - Verifies data formatting (e.g., `true` → `✅`).
4. **Link Logic**:
    - Tests matching via Wikilinks (`[[Link]]`) and plain text.

## 🛠 Maintenance

When updating the Obsidian script:

1. Copy the updated `content-metadata-view.js` from your vault to this folder.
2. Run `npm test` to verify no regressions.
3. If adding new features, extend `mockVault` in the test file to cover new edge cases.
```