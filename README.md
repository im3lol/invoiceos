# InvoiceOS — Seller Suite

A billing / invoicing app for e‑commerce sellers, built with **Next.js 15 (App Router) +
React 19 + TypeScript** and backed by **Supabase**. Originally ported from a Claude Design
component, then grown into a full invoice system with a WYSIWYG template builder.

## Features

- **Dashboard** — sales / invoice / product / outstanding metrics, a monthly billing‑trend
  bar chart and a collection‑rate curve, plus a recent‑invoices table.
- **Invoices** — every saved invoice with search, status filters (Paid / Pending / Overdue),
  sorting, and full control per row: **View, Edit, Duplicate, Delete, inline status change**.
- **Create / Edit wizard** — a 4‑step flow: **Template → Parties → Products → Review**.
  Pick a template, choose the selling company + customer (or quick‑add a new one), add
  products (search‑as‑you‑type or browse), watch a **live preview**, then review the full
  invoice before saving.
- **Template Builder** — a real WYSIWYG drop‑canvas: drag elements from the palette onto an
  A4 page, reorder by dragging, edit content inline, and configure the **product table**
  (bind each column to a field, hide columns, add custom columns, change alignment).
  Live preview, undo/redo, Save & Publish.
- **Companies / Customers / Products** — CRUD directories. Companies support a **logo upload**
  (auto‑resized) and a website, both shown on invoices.
- **Currency** — EGP (default), USD, SAR, EUR.
- **Print / PDF** — print any invoice (only the invoice paper prints, sized to A4).

Everything (companies, customers, products, templates, invoices) persists to Supabase, with a
localStorage fallback when Supabase isn't configured.

## Getting started

```bash
git clone https://github.com/im3lol/invoiceos.git
cd invoiceos
npm install
cp .env.example .env.local      # or set your own Supabase project values
npm run dev                     # http://localhost:3000
```

On first run the app seeds three starter templates and a set of demo invoices if the
database is empty.

### Supabase schema

The app expects these tables (see the app's migrations / `lib/*Api.ts`):

| table | shape |
| --- | --- |
| `suppliers` / `customers` / `products` | `id text pk`, `data jsonb`, `created_at` |
| `invoice_templates` | `id uuid`, `name`, `doc jsonb`, `published`, timestamps |
| `invoices` | filterable columns (`number`, `status`, `total`, …) + full `doc jsonb` snapshot |

RLS is enabled with anon‑open policies for the demo (no auth yet).

## Project structure

| path | purpose |
| --- | --- |
| `app/` | Next.js App Router entry, layout, global + print CSS |
| `components/InvoiceOS.tsx` | app shell — loads data, dashboard, companies/customers/products, routing |
| `components/InvoicesView.tsx` | invoices list, filters & row actions |
| `components/InvoiceWizard.tsx` | create/edit invoice flow |
| `components/InvoicePaper.tsx` | data‑driven invoice renderer (template style + real data) |
| `components/TemplateBuilder.tsx` | WYSIWYG template designer |
| `lib/` | domain types, calc helpers, Supabase client & data APIs, seed data |

## Scripts

- `npm run dev` — dev server
- `npm run build` / `npm start` — production build & serve
- `npm run lint` — lint

## Notes

- The bundled `.env.example` uses **publishable** Supabase keys with anon‑open RLS — convenient
  for trying the app, not for production. Use your own project and add auth + per‑user RLS
  before deploying for real.
