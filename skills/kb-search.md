---
name: kb-search
description: Search the knowledge base with semantic + keyword matching, return ranked results with snippets
---

Search across all documents in the omykb knowledge base. Returns ranked results with context snippets.

## Usage

`/kb:search <query>` — search for a term or phrase

## Steps

1. Read `.omykb/config.json` and `.omykb/index.json`.

2. If no query provided, prompt the user for one.

3. **Multi-strategy search**:

   **A. Exact keyword search** (always run first):
   - Use Grep with the query against all files in `config.storage.path`.
   - Collect matching files and line numbers.
   - Score: +1 per match, +3 per match in title/heading.

   **B. Fuzzy phrase search**:
   - Split query into individual words (stop words filtered).
   - Use Grep for each word separately.
   - Combine scores across words.

   **C. Semantic matching** (heuristic, no embeddings required):
   - Look for related terms: synonyms, domain-specific variations.
   - Example: "cost" matches documents containing "price", "budget", "expense".
   - Apply a small score boost for semantically related terms found.

4. **Rank and deduplicate** results:
   - Sort by total score descending.
   - Show top 10 results maximum.
   - For each result, extract a 3-5 line snippet around the matching text.

5. **Display results**:
   ```
   omykb> Search: "<query>" — <n> results
   
   1. [Document Title]
      Source: <path>
      Ingested: <date>
      ...snippet with matching terms highlighted in **bold**...
   
   2. [Document Title]
      ...
   ```

6. After results, offer:
   - "Open a document? (provide number)"
   - "Ask a question about these results? (`/kb:ask`)"
   - "Refine search with different terms?"

## Display Modes

- If 0 results: suggest checking spelling, trying broader terms, or running `/kb:add` to ingest relevant content.
- If 1-3 results: show full snippets (10 lines each).
- If 4-10 results: show short snippets (3 lines each).
- If >10 results: show top 10 with a count of total matches.
