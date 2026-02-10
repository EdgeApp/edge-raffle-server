# Raffle Campaigns Feature

## Overview

Create a new `raffle_campaigns` CouchDB database that stores multiple campaign documents. Each campaign defines the title, subtitle, and entry mode for its raffle page. The campaign is selected via a **URI parameter** on the base domain (e.g., `https://example.com/?campaign=monerokon2026`).

## Raffle Campaign Document

Stored in a new `raffle_campaigns` database. Each document represents one campaign:

- **`_id`**: The campaign ID (used as the URI parameter, e.g., `monerokon2026`)
- **`_rev`**: CouchDB revision
- **`title`**: Display title shown on the raffle page (e.g., `"MoneroKon 2026 Raffle"`)
- **`subtitle`**: Descriptive text shown below the title (e.g., `"Enter your details for a chance to win"`)
- **`mode`**: `"email"` or `"handle"`

## Modes

### `email` mode

- UI collects a **name** and **email address**
- Current raffle page behavior

### `handle` mode

- UI collects only a **handle** (username, social handle, etc.)
- No name or email fields shown

## Data Storage

All entries are stored in the existing `raffle_entries` database regardless of mode. The entry schema accommodates fields from both modes, with unused fields left empty or null.

## Flow

1. User visits `https://example.com/?campaign=monerokon2026`
2. Client reads the `campaign` query parameter from the URL
3. Client fetches campaign config from the server using the campaign ID
4. Server looks up the campaign document in the `raffle_campaigns` database
5. Client renders the page using the campaign's `title`, `subtitle`, and conditionally shows email/name inputs or a handle input based on `mode`
6. On submit, entry is stored in `raffle_entries` with a reference to the campaign ID

## Affected Areas

- **CouchDB**: New `raffle_campaigns` database with campaign documents
- **Server**: New endpoint to fetch campaign config by ID; update `POST /api/addEntry` to accept the campaign ID and mode-appropriate fields
- **Client (`RaffleEntry.tsx`)**: Read `campaign` query parameter from URL, fetch config on mount, dynamically render form fields and text based on campaign config
