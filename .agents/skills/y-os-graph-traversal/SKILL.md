---
name: y-os-graph-traversal
description: "Handles Knowledge Graph and Code Graph vertex-edge registrations, dependency walk queries, and AST parser fallback operations in Y-OS."
---

# Y-OS Graph Traversal Skill

This skill outlines guidelines for managing dependency graphs, analyzing import/export linkages, and scanning code hierarchies.

## 1. Graph Operations

* **Nodes and Edges**: Represent files as node vertices, and reference dependencies as weighted edges in the database.
* **Isolation Boundary**: Traversals and neighbor searches must be strictly restricted to the caller's active project ID.
* **Sync Triggers**: Ensure any incremental indexing or file modification updates the edge weighting.

## 2. AST Extraction & Fallbacks

* Identify ES Module imports and exports to map references.
* **Syntax Recovery**: If file compilation fails due to broken syntax, apply regex pattern matches to extract symbols gracefully instead of throwing exceptions.
