import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { extractProfileAndCvFromResume } from './evaluator';

const execFileAsync = promisify(execFile);

function normalizeWhitespace(input: string) {
  return input
    .replace(/\r/g, '')
    .replace(/\t/g, ' ')
    .replace(/[ \f\v]+/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function detectKind(file: File) {
  const name = file.name.toLowerCase();
  const mime = (file.type || '').toLowerCase();

  if (name.endsWith('.pdf') || mime.includes('pdf')) return 'pdf';
  if (
    name.endsWith('.docx') ||
    mime.includes('officedocument.wordprocessingml.document')
  ) {
    return 'docx';
  }
  if (name.endsWith('.txt') || name.endsWith('.md') || mime.startsWith('text/')) {
    return 'text';
  }
  return 'unknown';
}

async function extractPdfText(buffer: Buffer) {
  const runId = randomUUID();
  const tempDir = path.join(os.tmpdir(), `career-ops-resume-${runId}`);
  const inputPath = path.join(tempDir, 'resume.pdf');
  const outputPath = path.join(tempDir, 'resume.txt');

  await fs.mkdir(tempDir, { recursive: true });

  try {
    await fs.writeFile(inputPath, buffer);

    try {
      await execFileAsync('pdftotext', ['-layout', '-enc', 'UTF-8', inputPath, outputPath]);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown pdftotext error';
      throw new Error(
        `PDF extraction failed (pdftotext): ${message}. Install poppler (brew install poppler) or upload DOCX/TXT.`
      );
    }

    const text = await fs.readFile(outputPath, 'utf8').catch(() => '');
    return normalizeWhitespace(text || '');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function extractResumeText(file: File) {
  const kind = detectKind(file);
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (kind === 'pdf') {
    return extractPdfText(buffer);
  }

  if (kind === 'docx') {
    const mammothModule = (await import('mammoth')) as {
      default?: { extractRawText?: (input: { buffer: Buffer }) => Promise<{ value?: string }> };
      extractRawText?: (input: { buffer: Buffer }) => Promise<{ value?: string }>;
    };
    const extractRawText =
      mammothModule.default?.extractRawText ?? mammothModule.extractRawText;

    if (typeof extractRawText !== 'function') {
      throw new Error('DOCX parser is unavailable in the current runtime.');
    }

    const parsed = await extractRawText({ buffer });
    return normalizeWhitespace(parsed.value || '');
  }

  if (kind === 'text' || kind === 'unknown') {
    return normalizeWhitespace(buffer.toString('utf8'));
  }

  return '';
}

export async function importResumeFromFile(file: File) {
  const text = await extractResumeText(file);
  if (!text || text.length < 80) {
    throw new Error('Could not extract enough resume text from the uploaded file.');
  }

  const extracted = await extractProfileAndCvFromResume(text);

  return {
    filename: file.name,
    chars: text.length,
    provider: extracted.provider,
    model: extracted.model,
    profile: extracted.profile,
    cv_md: extracted.cv_md,
  };
}
