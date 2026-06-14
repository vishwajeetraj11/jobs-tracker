import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('multipart/form-data')) {
      return NextResponse.json(
        { error: 'Expected multipart/form-data upload request.' },
        { status: 415 }
      );
    }

    const formData = await req.formData();
    const maybeFile = formData.get('file');

    if (!(maybeFile instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    if (maybeFile.size === 0) {
      return NextResponse.json({ error: 'uploaded file is empty' }, { status: 400 });
    }

    if (maybeFile.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: 'file too large (max 8MB)' }, { status: 400 });
    }

    // Load parser stack lazily so module initialization errors are surfaced as JSON.
    const { importResumeFromFile } = await import('@/lib/resume-import');
    const item = await importResumeFromFile(maybeFile);
    return NextResponse.json({ item });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Resume import failed';
    const stack =
      process.env.NODE_ENV !== 'production' && error instanceof Error
        ? error.stack
        : undefined;

    return NextResponse.json(
      { error: message, stack },
      { status: 500 }
    );
  }
}
