const fs = require('fs');
const path = require('path');

// --- 1. MOCK DATAVIEW API ---
// This class simulates what Obsidian's Dataview plugin does
class MockDataview {
    constructor(vaultData, currentFilePath) {
        this.vaultData = vaultData;
        this.currentPath = currentFilePath;
        this.output = []; // Captures table output
    }

    // dv.current()
    current() {
        const file = this.vaultData.find(p => p.file.path === this.currentPath);
        return file || { file: { name: "Untitled", path: "Untitled.md" } };
    }

    // dv.page(path)
    page(path) {
        // Simple mock lookup
        const cleanPath = path.replace(/[[\]]/g, '').split('|')[0];
        return this.vaultData.find(p => p.file.path.includes(cleanPath)) || null;
    }

    // dv.pages(query)
    pages(query) {
        // A simple query parser for our mocks
        // Supports: "#tag", "-_folder", '""' (all)
        let results = this.vaultData;

        if (query.includes('#')) {
            const tag = query.match(/#[\w/-]+/)[0].toLowerCase();
            results = results.filter(p => {
                const fmTags = p.file.frontmatter?.tags || [];
                // Check frontmatter tags
                const hasTag = fmTags.some(t => {
                    const ft = "#" + t.toLowerCase();
                    return ft === tag || ft.startsWith(tag + "/");
                });
                return hasTag;
            });
        }

        // Exclude folders logic (basic)
        const exclusions = query.match(/-"([^"]+)"/g);
        if (exclusions) {
            exclusions.forEach(ex => {
                const folder = ex.replace(/-"|"/g, '');
                results = results.filter(p => !p.file.path.startsWith(folder));
            });
        }

        return results;
    }

    // dv.array(arr)
    array(arr) {
        return arr;
    }

    // dv.paragraph(text)
    paragraph(text) {
        this.output.push({ type: 'paragraph', content: text });
    }

    // dv.table(headers, rows)
    table(headers, rows) {
        this.output.push({ type: 'table', headers, rows });
    }
}

// --- 2. MOCK VAULT DATA ---
// Represents your Markdown files
const mockVault = [
    {
        file: {
            name: "Current File",
            path: "Folder/Current File.md",
            folder: "Folder",
            outlinks: [],
            lists: []
        }
    },
    {
        file: {
            name: "Project A",
            path: "Projects/Project A.md",
            link: "[[Projects/Project A.md|Project A]]",
            folder: "Projects",
            tags: new Set(["#project"]), // Dataview implicit tags
            frontmatter: { tags: ["project"] },
            outlinks: [],
            lists: [
                {
                    text: "Review #urgent task",
                    tags: ["#urgent"], // Dataview inline tags
                    outlinks: [],
                    link: { path: "Projects/Project A.md" }
                },
                {
                    text: "Regular item",
                    tags: [],
                    outlinks: [],
                    link: { path: "Projects/Project A.md" }
                }
            ]
        }
    },
    {
        file: {
            name: "Metadata Note",
            path: "Notes/Metadata Note.md",
            folder: "Notes",
            frontmatter: {},
            outlinks: [],
            lists: [
                {
                    text: "Buy milk priority:: high status:: active",
                    tags: [],
                    priority: "high", // Dataview parses inline fields onto object
                    status: "active",
                    outlinks: [],
                    link: { path: "Notes/Metadata Note.md" }
                }
            ]
        }
    },
    {
        file: {
            name: "Excluded File",
            path: "_utils/Template.md",
            folder: "_utils",
            lists: [{ text: "Should not appear", tags: ["#project"] }]
        }
    }
];

// --- 3. THE RUNNER ---
// This function reads your script file and `eval`s it within the mock context
const runScript = (scriptPath, inputs, currentFile = "Folder/Current File.md") => {
    const rawScript = fs.readFileSync(scriptPath, 'utf8');

    // Create the Mock DV instance
    const dv = new MockDataview(mockVault, currentFile);

    // Inputs variable expected by script
    const input = inputs;

    // Wrap script in a function to isolate scope
    // We use `eval` here to simulate the script execution. 
    // In a real generic runner we might use VM2, but for local tests eval is fine.
    const runner = new Function('dv', 'input', rawScript);

    runner(dv, input);

    return dv.output;
};

// --- 4. TESTS ---

describe('Content Metadata View Script', () => {
    const scriptPath = path.join(__dirname, 'content-metadata-view.js');
    // ^ Ensure you copy your script to the same folder as this test file

    test('Basic Tag Search: #project', () => {
        const results = runScript(scriptPath, { subject: "#project" });
        const table = results.find(r => r.type === 'table');

        expect(table).toBeDefined();
        // Expect 2 rows: 
        // 1. The "Review #urgent task" list item (via inheritance or explicit tag)
        // 2. The "Regular item" list item (via Page inheritance)
        // 3. The Page "Project A" itself

        // Check content of first row
        const rowContent = table.rows.map(r => r[0]);
        expect(rowContent.some(t => t.includes("Review #urgent task"))).toBe(true);
        expect(rowContent.some(t => t.includes("Project A.md"))).toBe(true);
    });

    test('Exclusion: Should ignore _utils folder', () => {
        const results = runScript(scriptPath, { subject: "#project" });
        const table = results.find(r => r.type === 'table');

        const rowContent = table.rows.map(r => r[0]);
        expect(rowContent.some(t => t.includes("Should not appear"))).toBe(false);
    });

    test('Auto Columns: Should extract priority and status', () => {
        // We simulate a search that catches the "Metadata Note"
        // Since we don't have tags on it, let's allow the "empty subject" to scan all (non-excluded)
        // NOTE: Your script requires a valid Subject match. 
        // Let's modify the mock data query to find it, or pass a subject that matches.

        // Update Mock Logic for test: Let's assume we search for text "milk" via subject?
        // Actually, easiest is to search for a tag we add to that item.
        // But let's test Manual Column extraction.

        // We will mock the `dv.pages` query in the runner to strictly return the Metadata Note for this test
        // This requires a slightly more sophisticated mock, but for now let's rely on Subject.
        // Let's assume the Subject is "Buy milk" (Text Match)

        const results = runScript(scriptPath, {
            subject: "Buy milk",
            auto_columns: true
        });

        const table = results.find(r => r.type === 'table');
        const headers = table.headers;

        expect(headers).toContain("Priority");
        expect(headers).toContain("Status");

        const row = table.rows[0];
        // Content, Priority, Status, Related, Where
        expect(row[1]).toBe("high"); // Priority value
    });
});
