---
name: kb-graph
description: Generate a Mermaid knowledge graph showing relationships between documents, topics, and concepts
---

Generate a visual knowledge graph of the omykb knowledge base using Mermaid diagrams.

## Usage

`/kb:graph` — full knowledge graph
`/kb:graph --topic <tag>` — graph for a specific topic cluster
`/kb:graph --doc <title>` — graph centered on a specific document
`/kb:graph --format mermaid|dot|json` — output format (default: mermaid)

## Steps

1. Read `.omykb/config.json` and `.omykb/index.json`.

2. **Extract relationships**:

   a. **Tag relationships**: Documents sharing the same tag are related.
   
   b. **Wiki-link relationships**: Scan all documents for `[[double bracket links]]` using Grep. These are explicit document references.
   
   c. **Keyword co-occurrence**: For each pair of documents, compute shared keyword frequency. If two documents share >5 significant keywords, mark them as related (weight proportional to overlap).
   
   d. **Temporal clusters**: Documents ingested from the same source (git repo, website) are grouped.
   
   e. **Topic → Document**: Topics (tags) are parent nodes; documents are child nodes.

3. **Build graph data**:
   ```json
   {
     "nodes": [
       { "id": "topic:auth", "type": "topic", "label": "Authentication" },
       { "id": "doc:auth-guide", "type": "doc", "label": "Auth Guide" }
     ],
     "edges": [
       { "from": "topic:auth", "to": "doc:auth-guide", "type": "contains" },
       { "from": "doc:auth-guide", "to": "doc:jwt-spec", "type": "links-to" }
     ]
   }
   ```

4. **Generate Mermaid output**:

   For `--format mermaid`:
   ```
   omykb> Knowledge Graph
   
   ```mermaid
   graph LR
     classDef topic fill:#6366f1,stroke:#4f46e5,color:#fff
     classDef doc fill:#1e293b,stroke:#475569,color:#e2e8f0
     classDef cluster fill:#0f172a,stroke:#334155
   
     subgraph topic_auth["Authentication"]
       doc_auth_guide["Auth Guide"]
       doc_jwt_spec["JWT Spec"]
     end
     
     doc_auth_guide --> doc_jwt_spec
     doc_jwt_spec --> doc_oauth_flow["OAuth Flow"]
   ```
   ```

5. **Apply filters**:
   - `--topic <tag>`: Show only nodes reachable from that topic node.
   - `--doc <title>`: Show only nodes within 2 hops of the specified document.

6. **Size limits**:
   - If >50 nodes, show only topic-level graph with document counts per topic.
   - Suggest `--topic` to drill into specific areas.

7. **Output options**:
   - `mermaid`: Print Mermaid diagram code (renders in GitHub, Obsidian, etc.)
   - `json`: Print the raw graph JSON for use in other tools
   - `dot`: Print Graphviz DOT format

8. Print the graph followed by stats:
   ```
   Nodes: <n> topics · <n> documents
   Edges: <n> relationships
   Clusters: <n> topic groups
   
   Tip: Copy the Mermaid code to https://mermaid.live to visualize interactively.
   ```
