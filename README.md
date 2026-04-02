# adplist-tracker

Track frontend job opportunities at companies whose employees mentor on ADPList.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```
DATABASE_URL=postgresql://localhost:5432/jobs_platform
```

### 3. Initialize the database

```bash
psql jobs_platform -f schema.sql
```

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Pipeline

The pipeline scrapes ADPList for frontend mentors, upserts their employers into the companies table, then checks each known ATS for open frontend roles.

**Runs automatically:** every Monday at 9am (started via `instrumentation.ts` on server boot).

**Trigger manually** via the dashboard "Run Pipeline" button or:

```bash
curl -X POST http://localhost:3000/api/pipeline/run
```

Console output will log new opportunities — companies with `status = 'new'`, open frontend roles, and their mentor LinkedIn profiles.

## ATS map

Known company → ATS mappings live in `lib/ats-map.ts`. Add more entries there to expand role coverage.

## API

| Method | Path | Description |
|--------|------|-------------|
| `PATCH` | `/api/companies/[name]/status` | Update company status |
| `POST` | `/api/pipeline/run` | Trigger pipeline manually |
