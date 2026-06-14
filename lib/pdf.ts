import { existsSync } from 'node:fs';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

function escapeHtml(input: string) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeMarkdown(markdown: string) {
  return markdown.replace(/\r\n?/g, '\n').split('\n');
}

function renderInline(input: string) {
  const codeSpans: string[] = [];
  let output = input.replace(/`([^`]+)`/g, (_, code: string) => {
    const marker = `%%CODE_SPAN_${codeSpans.length}%%`;
    codeSpans.push(`<code>${escapeHtml(code)}</code>`);
    return marker;
  });

  output = escapeHtml(output);
  output = output.replace(/\[([^\]]+)]\(([^)\s]+)\)/g, (_, label: string, href: string) => {
    const safeHref = /^(https?:|mailto:|#)/i.test(href) ? href : '#';
    return `<a href="${escapeHtml(safeHref)}">${label}</a>`;
  });
  output = output.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  output = output.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  return codeSpans.reduce((html, code, index) => html.replace(`%%CODE_SPAN_${index}%%`, code), output);
}

function isTableRow(line: string) {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.includes('|', 1);
}

function isTableSeparator(line: string) {
  const cells = line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim());

  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseTableRow(line: string) {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim());
}

function markdownToHtml(markdown: string): string {
  const lines = normalizeMarkdown(markdown);
  const html: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      html.push('<hr />');
      index += 1;
      continue;
    }

    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('>')) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ''));
        index += 1;
      }
      html.push(`<blockquote>${markdownToHtml(quoteLines.join('\n'))}</blockquote>`);
      continue;
    }

    if (isTableRow(line) && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      const headerCells = parseTableRow(line);
      const bodyRows: string[][] = [];
      index += 2;
      while (index < lines.length && isTableRow(lines[index])) {
        bodyRows.push(parseTableRow(lines[index]));
        index += 1;
      }

      const header = headerCells.map((cell) => `<th>${renderInline(cell)}</th>`).join('');
      const body = bodyRows
        .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join('')}</tr>`)
        .join('');
      html.push(`<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`);
      continue;
    }

    const unorderedList = line.match(/^\s*[-*+]\s+(.+)$/);
    if (unorderedList) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*[-*+]\s+(.+)$/);
        if (!item) {
          break;
        }
        items.push(`<li>${renderInline(item[1])}</li>`);
        index += 1;
      }
      html.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    const orderedList = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (orderedList) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*\d+[.)]\s+(.+)$/);
        if (!item) {
          break;
        }
        items.push(`<li>${renderInline(item[1])}</li>`);
        index += 1;
      }
      html.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    const paragraphLines: string[] = [trimmed];
    index += 1;
    while (index < lines.length) {
      const next = lines[index];
      const nextTrimmed = next.trim();
      const startsNextBlock =
        !nextTrimmed ||
        nextTrimmed.startsWith('```') ||
        /^(#{1,6})\s+/.test(nextTrimmed) ||
        nextTrimmed.startsWith('>') ||
        /^(-{3,}|\*{3,}|_{3,})$/.test(nextTrimmed) ||
        /^\s*[-*+]\s+/.test(next) ||
        /^\s*\d+[.)]\s+/.test(next) ||
        (isTableRow(next) && index + 1 < lines.length && isTableSeparator(lines[index + 1]));

      if (startsNextBlock) {
        break;
      }

      paragraphLines.push(nextTrimmed);
      index += 1;
    }
    html.push(`<p>${renderInline(paragraphLines.join(' '))}</p>`);
  }

  return html.join('\n');
}

async function resolveExecutablePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  try {
    const candidate = await chromium.executablePath();
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  } catch {
    // ignore and continue fallback
  }

  const localFallbacks = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];

  return localFallbacks.find((entry) => existsSync(entry)) ?? null;
}

export async function renderReportPdf(markdown: string, title = 'Career Ops Report') {
  const executablePath = await resolveExecutablePath();
  if (!executablePath) {
    throw new Error('No Chromium executable found for PDF generation.');
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [...chromium.args, '--no-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1280, height: 720 },
  });

  try {
    const page = await browser.newPage();

    const html = `
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(title)}</title>
          <style>
            :root { color-scheme: light; }
            body {
              margin: 0;
              padding: 0;
              font-family: "DM Sans", "Avenir Next", "Segoe UI", Arial, sans-serif;
              color: #0f172a;
              background: #ffffff;
              line-height: 1.55;
              font-size: 14px;
            }
            .page {
              padding: 34px 38px 36px;
            }
            .header {
              margin-bottom: 22px;
            }
            .eyebrow {
              font-size: 11px;
              letter-spacing: 0.22em;
              text-transform: uppercase;
              color: #0f766e;
              margin-bottom: 10px;
              font-weight: 700;
            }
            .title {
              margin: 0;
              font-family: "Space Grotesk", "Avenir Next Condensed", "Segoe UI", sans-serif;
              font-size: 28px;
              line-height: 1.1;
              letter-spacing: -0.03em;
              color: #0f172a;
            }
            .meta {
              margin-top: 10px;
              font-size: 12px;
              color: #64748b;
            }
            .accent {
              height: 2px;
              margin-top: 14px;
              background: linear-gradient(to right, hsl(187, 74%, 32%), hsl(270, 70%, 45%));
              border-radius: 999px;
            }
            h1, h2, h3, h4, h5, h6 {
              margin: 1.2em 0 0.55em;
              line-height: 1.15;
              color: #0f172a;
            }
            h1 {
              font-family: "Space Grotesk", "Avenir Next Condensed", "Segoe UI", sans-serif;
              font-size: 24px;
            }
            h2 {
              font-family: "Space Grotesk", "Avenir Next Condensed", "Segoe UI", sans-serif;
              font-size: 13px;
              text-transform: uppercase;
              letter-spacing: 0.08em;
              color: hsl(187, 74%, 32%);
            }
            h3 {
              font-family: "Space Grotesk", "Avenir Next Condensed", "Segoe UI", sans-serif;
              font-size: 17px;
            }
            p { margin: 0 0 0.75em; }
            ul, ol { margin: 0 0 0.9em 1.15em; padding: 0; }
            li { margin: 0.24em 0; }
            strong { color: #111827; }
            blockquote {
              margin: 0.9em 0;
              padding: 0.75em 0.9em;
              background: #f8fafc;
              border-left: 3px solid #0f766e;
              color: #334155;
            }
            code {
              font-family: "IBM Plex Mono", "SFMono-Regular", "Menlo", monospace;
              font-size: 0.92em;
              background: #f1f5f9;
              padding: 0.1em 0.28em;
              border-radius: 4px;
            }
            pre {
              font-family: "IBM Plex Mono", "SFMono-Regular", "Menlo", monospace;
              background: #0f172a;
              color: #e2e8f0;
              padding: 12px 14px;
              border-radius: 10px;
              overflow: hidden;
              white-space: pre-wrap;
            }
            pre code {
              background: transparent;
              padding: 0;
              color: inherit;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 0.8em 0 1.1em;
              font-size: 12px;
            }
            th, td {
              border: 1px solid #dbe2ea;
              padding: 8px 9px;
              vertical-align: top;
              text-align: left;
            }
            th {
              background: #f8fafc;
              color: #0f172a;
              font-weight: 700;
            }
            tr:nth-child(even) td {
              background: #fcfdff;
            }
          </style>
        </head>
        <body>
          <main class="page">
            <header class="header">
              <div class="eyebrow">Career-Ops Report</div>
              <h1 class="title">${escapeHtml(title)}</h1>
              <div class="meta">Generated ${new Date().toISOString()}</div>
              <div class="accent"></div>
            </header>
            ${markdownToHtml(markdown)}
          </main>
        </body>
      </html>
    `;

    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '24px',
        right: '24px',
        bottom: '24px',
        left: '24px',
      },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
