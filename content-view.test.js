const fs = require('fs');
const path = require('path');

// --- 1. ROBUST MOCK DATAVIEW API ---
class MockDataview {
    constructor(vaultData, currentFilePath) {
        this.vaultData = vaultData;
        this.currentPath = currentFilePath;
        this.output = [];
    }

    current() {
        const file = this.vaultData.find(p => p.file.path === this.currentPath);
        // Default minimal structure if not found
        return file || { file: { name: "Untitled", path: "Untitled.md", outlinks: [], tags: new Set() } };
    }

    page(path) {
        if (!path) return null;
        const cleanPath = path.replace(/[[\]]/g, '').split('|')[0];
        // Match path even if partial
        return this.vaultData.find(p => p.file.path.includes(cleanPath)) || null;
    }

    pages(query) {
        let results = this.vaultData;
        const parts = query.split(' AND ');

        parts.forEach(part => {
            const cleanPart = part.replace(/"/g, '').trim();
            if (cleanPart === '') return;

            // 1. Exclusion
            if (cleanPart.startsWith('-')) {
                const exclusionPath = cleanPart.substring(1);
                results = results.filter(p => !p.file.path.startsWith(exclusionPath));
                return;
            }

            // 2. Tag Search
            if (cleanPart.startsWith('#')) {
                const searchTag = cleanPart.toLowerCase();
                results = results.filter(p => {
                    const fmTags = p.file.frontmatter?.tags || [];
                    const etags = p.file.etags || [];
                    const allPageTags = [...new Set([...fmTags, ...etags])];
                    return allPageTags.some(t => {
                        const ft = t.startsWith('#') ? t.toLowerCase() : "#" + t.toLowerCase();
                        return ft === searchTag || ft.startsWith(searchTag + "/");
                    });
                });
                return;
            }

            // 3. Path/Link Search
            if (cleanPart.length > 0) {
                results = results.filter(p => p.file.path.toLowerCase().includes(cleanPart.toLowerCase()));
            }
        });
        return results;
    }

    array(arr) { return arr; }
    paragraph(text) { this.output.push({ type: 'paragraph', content: text }); }
    table(headers, rows) { this.output.push({ type: 'table', headers, rows }); }
}

// --- 2. ADVANCED MOCK VAULT ---
// CRITICAL: Every file must have 'outlinks', 'tags' (Set), and 'lists' to prevent crashes
const mockVault = [
    {
        file: {
            name: "Current Dashboard",
            path: "System/Dashboard.md",
            link: "[[System/Dashboard.md|Current Dashboard]]",
            folder: "System",
            tags: new Set(),
            outlinks: [],
            lists: []
        }
    },
    {
        file: {
            name: "Work Project",
            path: "Projects/Work.md",
            link: "[[Projects/Work.md|Work Project]]",
            folder: "Projects",
            tags: new Set(["#work/active"]),
            etags: ["#work/active"],
            frontmatter: { tags: ["work/active"] },
            outlinks: [], // Ensure outlinks exists!
            lists: [
                {
                    text: "Finish report",
                    tags: [],
                    outlinks: [], // Ensure outlinks exists on items too!
                    link: { path: "Projects/Work.md" }
                }
            ]
        }
    },
    {
        file: {
            name: "Personal Todo",
            path: "Personal/Groceries.md",
            link: "[[Personal/Groceries.md|Personal Todo]]",
            folder: "Personal",
            tags: new Set(["#personal"]),
            etags: ["#personal"],
            frontmatter: { tags: ["personal"] },
            outlinks: [],
            lists: [
                {
                    text: "Buy milk urgent:: true cost:: 5",
                    tags: ["#urgent"],
                    // Manual extraction: Real Dataview does this automatically.
                    // For the test, we must manually populate the properties the script looks for.
                    urgent: "true",
                    cost: "5",
                    outlinks: [],
                    link: { path: "Personal/Groceries.md" }
                },
                {
                    text: "Call Mom",
                    tags: [],
                    outlinks: [],
                    link: { path: "Personal/Groceries.md" }
                }
            ]
        }
    },
    {
        file: {
            name: "Archived Item",
            path: "Archive/Old.md",
            link: "[[Archive/Old.md|Archived Item]]",
            folder: "Archive",
            tags: new Set(["#work"]),
            etags: ["#work"],
            frontmatter: { tags: ["work"] },
            outlinks: [],
            lists: [{ text: "Old stuff", tags: [], outlinks: [] }]
        }
    },
    {
        file: {
            name: "Link Logic Note",
            path: "Notes/LinkLogic.md",
            link: "[[Notes/LinkLogic.md|Link Logic Note]]",
            folder: "Notes",
            tags: new Set(),
            outlinks: [{ path: "System/Dashboard.md" }], // File has outlinks too
            lists: [
                {
                    text: "Reference to [[System/Dashboard]] here",
                    tags: [],
                    outlinks: [{ path: "System/Dashboard.md" }],
                    link: { path: "Notes/LinkLogic.md" }
                },
                {
                    text: "Just text match: Dashboard",
                    tags: [],
                    outlinks: [],
                    link: { path: "Notes/LinkLogic.md" }
                }
            ]
        }
    }
];

// --- 3. RUNNER ---
const runScript = (scriptPath, inputs, currentFile = "System/Dashboard.md") => {
    const rawScript = fs.readFileSync(scriptPath, 'utf8');
    const dv = new MockDataview(mockVault, currentFile);
    const input = inputs;
    const runner = new Function('dv', 'input', rawScript);
    runner(dv, input);
    return dv.output;
};

// --- 4. ROBUST TEST SUITE ---
describe('Robust Content Metadata View', () => {
    const scriptPath = path.join(__dirname, 'content-metadata-view.js');

    // --- TAG LOGIC ---

    test('Recursion: #work should find #work/active', () => {
        const results = runScript(scriptPath, { subject: "#work" });
        const table = results.find(r => r.type === 'table');
        const content = table.rows.map(r => r[0]);
        expect(content.some(t => t.includes("Work Project"))).toBe(true);
        expect(content.some(t => t.includes("Archived Item"))).toBe(true);
    });

    test('Exact Tag: #work/active should NOT find parent #work', () => {
        const results = runScript(scriptPath, { subject: "#work/active" });
        const table = results.find(r => r.type === 'table');
        const content = table.rows.map(r => r[0]);
        expect(content.some(t => t.includes("Work Project"))).toBe(true);
        expect(content.some(t => t.includes("Archived Item"))).toBe(false);
    });

    test('Implicit Inheritance: File Tag applies to list items', () => {
        const results = runScript(scriptPath, { subject: "#personal", show_pages: false });
        const table = results.find(r => r.type === 'table');
        const content = table.rows.map(r => r[0]);
        expect(content.some(t => t.includes("Call Mom"))).toBe(true);
    });

    // --- LINK LOGIC ---

    test('Link Matching: Outlinks and Text', () => {
        const results = runScript(scriptPath, { subject: "Dashboard" });
        const table = results.find(r => r.type === 'table');
        const content = table.rows.map(r => r[0]);
        expect(content.some(t => t.includes("Reference to"))).toBe(true);
        expect(content.some(t => t.includes("Just text match"))).toBe(true);
    });

    // --- METADATA & COLUMNS ---

    test('Auto Columns: Metadata Extraction & Formatting', () => {
        // Search for #personal to catch the Groceries note
        const results = runScript(scriptPath, {
            subject: "#personal",
            auto_columns: true,
            show_pages: false
        });

        const table = results.find(r => r.type === 'table');
        const headers = table.headers;

        // Fix: Case sensitivity check. Script capitalizes headers.
        expect(headers).toContain("Urgent");
        expect(headers).toContain("Cost");

        const row = table.rows.find(r => r[0].includes("Buy milk"));
        const urgentIndex = headers.indexOf("Urgent");
        expect(row[urgentIndex]).toBe("✅");
    });

    // --- EXCLUSION LOGIC ---

    test('Exclusion: exclude_folders', () => {
        const results = runScript(scriptPath, {
            subject: "#work",
            exclude_folders: ["Archive"]
        });
        const table = results.find(r => r.type === 'table');
        const content = table.rows.map(r => r[0]);
        expect(content.some(t => t.includes("Work Project"))).toBe(true);
        expect(content.some(t => t.includes("Archived Item"))).toBe(false);
    });

    test('Exclusion: exclude_current', () => {
        // Pretend we are IN the Link Logic Note
        // Search for "Link Logic Note" (which matches the page itself)
        const results = runScript(scriptPath, {
            subject: "Link Logic Note",
            exclude_current: true
        }, "Notes/LinkLogic.md");

        // If results exist (maybe items match?), ensure Page itself is excluded
        const table = results.find(r => r.type === 'table');

        if (table) {
            const content = table.rows.map(r => r[0]);
            // The Page Link "📄 **[[Notes/LinkLogic.md|Link Logic Note]]**" should NOT be present
            expect(content.some(t => t.includes("📄") && t.includes("Link Logic Note"))).toBe(false);
        } else {
            // If no table returned at all, that's also valid exclusion
            expect(true).toBe(true);
        }
    });
});
