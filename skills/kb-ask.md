---
name: kb-ask
description: Ask a question and get an AI-synthesized answer with citations from your knowledge base
---

Answer a question using content from the omykb knowledge base. Like NotebookLM, every answer is grounded in your KB documents with explicit citations.

## Usage

`/kb:ask <question>` or just `/kb:ask` for interactive mode.

## Steps

1. Read `.omykb/config.json` and `.omykb/index.json`. Abort with helpful message if KB is not initialized or empty.

2. If no question was provided, ask the user what they'd like to know.

3. **Load relevant documents**:
   - Read `.omykb/index.json` to get the list of all documents.
   - For each document, use Glob + Read to load its content from `config.storage.path`.
   - If there are more than 10 documents, do a keyword pre-filter: scan for documents whose title or content contains words from the question (use Grep).
   - Load the top 5-8 most relevant documents (by keyword overlap).

4. **Synthesize the answer**:
   Using the loaded document content as context, answer the user's question with these rules:
   - Be accurate and grounded — only state what the documents support.
   - If the documents don't contain enough information, explicitly say so.
   - Cite every factual claim with a reference: `[Source: <document title>, <section>]`.
   - Structure the answer clearly: use headers for multi-part answers.
   - At the end, list all cited documents in a **Sources** section.

5. **Format**:
   ```
   ## Answer
   
   <synthesized answer with inline citations>
   
   ---
   ## Sources
   - [1] <document title> — <storage path>
   - [2] <document title> — <storage path>
   ```

6. After answering, offer follow-up options:
   - "Ask a follow-up question?"
   - "Search for more specific content? (`/kb:search`)"
   - "See the full document? (`/kb:search <term>`)"

## Answer Quality Rules

- Never hallucinate facts not in the KB.
- If two documents contradict each other, surface the contradiction explicitly.
- Prefer longer, more detailed answers for complex questions.
- For simple factual questions, a single paragraph with one citation is fine.
- Always include the Sources section, even for simple answers.
