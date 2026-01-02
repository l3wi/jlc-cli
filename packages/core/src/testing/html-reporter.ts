/**
 * HTML Reporter for Footprint/Symbol Validation
 *
 * Generates side-by-side HTML reports comparing reference vs generated output
 */

import type {
  ValidationResult,
  FootprintComparisonResult,
  SymbolComparisonResult,
  PadDiff,
  PinDiff,
} from './types.js';

// =============================================================================
// HTML Report Generation
// =============================================================================

export interface ReportSvgs {
  footprintRef?: string;
  footprintGen?: string;
  symbolRef?: string;
  symbolGen?: string;
}

/**
 * Generate an HTML report for a single validation result
 */
export function generateValidationReport(
  result: ValidationResult,
  svgs?: ReportSvgs
): string {
  const statusClass = result.passed ? 'pass' : 'fail';
  const statusText = result.passed ? 'PASS' : 'FAIL';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Validation: ${result.lcscCode} - ${result.componentName}</title>
  <style>${getStyles()}</style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${result.componentName}</h1>
      <div class="meta">
        <span class="lcsc">LCSC: ${result.lcscCode}</span>
        <span class="status ${statusClass}">${statusText}</span>
        <span class="duration">${result.durationMs}ms</span>
      </div>
    </header>

    ${result.error ? `<div class="error-banner">${escapeHtml(result.error)}</div>` : ''}

    <div class="main-columns">
      ${(svgs?.footprintRef || svgs?.footprintGen || result.footprint) ? `
      <div class="main-column">
        <h2 class="column-header">Footprint</h2>
        ${(svgs?.footprintRef || svgs?.footprintGen) ? `
        <div class="svg-comparison">
          <div class="svg-panel">
            <h3>Reference (EasyEDA/JLCPCB)</h3>
            <div class="svg-container">${svgs?.footprintRef || '<div class="no-preview">Not available</div>'}</div>
          </div>
          <div class="svg-panel">
            <h3>Generated (JLC-CLI)</h3>
            <div class="svg-container">${svgs?.footprintGen || '<div class="no-preview">Not available</div>'}</div>
          </div>
        </div>
        ` : ''}
        ${result.footprint ? generateFootprintSection(result.footprint) : ''}
      </div>
      ` : ''}

      ${(svgs?.symbolRef || svgs?.symbolGen || result.symbol) ? `
      <div class="main-column">
        <h2 class="column-header">Symbol</h2>
        ${(svgs?.symbolRef || svgs?.symbolGen) ? `
        <div class="svg-comparison">
          <div class="svg-panel">
            <h3>Reference (EasyEDA/JLCPCB)</h3>
            <div class="svg-container">${svgs?.symbolRef || '<div class="no-preview">Not available</div>'}</div>
          </div>
          <div class="svg-panel">
            <h3>Generated (JLC-CLI)</h3>
            <div class="svg-container">${svgs?.symbolGen || '<div class="no-preview">Not available</div>'}</div>
          </div>
        </div>
        ` : ''}
        ${result.symbol ? generateSymbolSection(result.symbol) : ''}
      </div>
      ` : ''}
    </div>

    <footer>
      <p>Generated: ${result.timestamp.toISOString()}</p>
      <p>JLC-CLI Validation Report</p>
    </footer>
  </div>
</body>
</html>`;
}

/**
 * Generate a batch report for multiple validation results
 */
export function generateBatchReport(
  results: ValidationResult[],
  title = 'Validation Report'
): string {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const errorCount = results.filter((r) => r.error).length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>${getStyles()}</style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${title}</h1>
      <div class="summary">
        <span class="stat pass">${passed} passed</span>
        <span class="stat fail">${failed} failed</span>
        <span class="stat error">${errorCount} errors</span>
        <span class="stat total">${results.length} total</span>
      </div>
    </header>

    <section class="results-table">
      <table>
        <thead>
          <tr>
            <th>LCSC</th>
            <th>Component</th>
            <th>Footprint</th>
            <th>Symbol</th>
            <th>Status</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          ${results.map((r) => generateResultRow(r)).join('\n')}
        </tbody>
      </table>
    </section>

    ${generateDetailedResults(results)}

    <footer>
      <p>Generated: ${new Date().toISOString()}</p>
      <p>JLC-CLI Validation Report</p>
    </footer>
  </div>
</body>
</html>`;
}

// =============================================================================
// Section Generators
// =============================================================================

function generateFootprintSection(result: FootprintComparisonResult): string {
  const statusClass = result.passed ? 'pass' : 'fail';

  return `
    <section class="validation-section footprint">
      <h2>Footprint Validation <span class="${statusClass}">${result.passed ? '✓' : '✗'}</span></h2>

      <div class="stats-grid">
        <div class="stat-item">
          <span class="label">Pad Count</span>
          <span class="value ${result.padCountMatch ? 'pass' : 'fail'}">
            ${result.generatedPadCount}/${result.referencePadCount}
          </span>
        </div>
        <div class="stat-item">
          <span class="label">Via Count</span>
          <span class="value ${result.viaCountMatch ? 'pass' : 'fail'}">
            ${result.generatedViaCount}/${result.referenceViaCount}
          </span>
        </div>
        <div class="stat-item">
          <span class="label">Errors</span>
          <span class="value ${result.errors.length > 0 ? 'fail' : 'pass'}">
            ${result.errors.length}
          </span>
        </div>
        <div class="stat-item">
          <span class="label">Warnings</span>
          <span class="value warn">${result.warnings.length}</span>
        </div>
      </div>

      ${
        result.errors.length > 0
          ? `
      <div class="diff-list errors">
        <h3>Errors</h3>
        ${result.errors.map((d) => formatPadDiff(d)).join('\n')}
      </div>
      `
          : ''
      }

      ${
        result.warnings.length > 0
          ? `
      <div class="diff-list warnings">
        <h3>Warnings</h3>
        ${result.warnings.map((d) => formatPadDiff(d)).join('\n')}
      </div>
      `
          : ''
      }
    </section>
  `;
}

function generateSymbolSection(result: SymbolComparisonResult): string {
  const statusClass = result.passed ? 'pass' : 'fail';

  return `
    <section class="validation-section symbol">
      <h2>Symbol Validation <span class="${statusClass}">${result.passed ? '✓' : '✗'}</span></h2>

      <div class="stats-grid">
        <div class="stat-item">
          <span class="label">Pin Count</span>
          <span class="value ${result.pinCountMatch ? 'pass' : 'fail'}">
            ${result.generatedPinCount}/${result.referencePinCount}
          </span>
        </div>
        <div class="stat-item">
          <span class="label">Errors</span>
          <span class="value ${result.errors.length > 0 ? 'fail' : 'pass'}">
            ${result.errors.length}
          </span>
        </div>
        <div class="stat-item">
          <span class="label">Warnings</span>
          <span class="value warn">${result.warnings.length}</span>
        </div>
      </div>

      ${
        result.errors.length > 0
          ? `
      <div class="diff-list errors">
        <h3>Errors</h3>
        ${result.errors.map((d) => formatPinDiff(d)).join('\n')}
      </div>
      `
          : ''
      }

      ${
        result.warnings.length > 0
          ? `
      <div class="diff-list warnings">
        <h3>Warnings</h3>
        ${result.warnings.map((d) => formatPinDiff(d)).join('\n')}
      </div>
      `
          : ''
      }
    </section>
  `;
}

function generateResultRow(result: ValidationResult): string {
  const status = result.passed ? 'pass' : result.error ? 'error' : 'fail';
  const fpStatus = result.footprint
    ? result.footprint.passed
      ? '✓'
      : '✗'
    : result.error
      ? '⚠'
      : '-';
  const symStatus = result.symbol ? (result.symbol.passed ? '✓' : '✗') : result.error ? '⚠' : '-';

  return `
    <tr class="${status}">
      <td><a href="#${result.lcscCode}">${result.lcscCode}</a></td>
      <td>${escapeHtml(result.componentName)}</td>
      <td class="center">${fpStatus}</td>
      <td class="center">${symStatus}</td>
      <td class="status">${result.passed ? 'PASS' : result.error ? 'ERROR' : 'FAIL'}</td>
      <td class="right">${result.durationMs}ms</td>
    </tr>
  `;
}

function generateDetailedResults(results: ValidationResult[]): string {
  const failedResults = results.filter((r) => !r.passed);
  if (failedResults.length === 0) return '';

  return `
    <section class="detailed-results">
      <h2>Detailed Results</h2>
      ${failedResults
        .map(
          (r) => `
        <div class="result-detail" id="${r.lcscCode}">
          <h3>${r.lcscCode} - ${escapeHtml(r.componentName)}</h3>
          ${r.error ? `<div class="error-message">${escapeHtml(r.error)}</div>` : ''}
          ${r.footprint ? generateFootprintSection(r.footprint) : ''}
          ${r.symbol ? generateSymbolSection(r.symbol) : ''}
        </div>
      `
        )
        .join('\n')}
    </section>
  `;
}

// =============================================================================
// Formatters
// =============================================================================

function formatPadDiff(diff: PadDiff): string {
  const icon = diff.severity === 'error' ? '✗' : diff.severity === 'warning' ? '⚠' : 'ℹ';
  return `
    <div class="diff-item ${diff.severity}">
      <span class="icon">${icon}</span>
      <span class="pad">Pad ${diff.padNumber}</span>
      <span class="field">${diff.field}</span>
      <span class="message">${escapeHtml(diff.message)}</span>
    </div>
  `;
}

function formatPinDiff(diff: PinDiff): string {
  const icon = diff.severity === 'error' ? '✗' : diff.severity === 'warning' ? '⚠' : 'ℹ';
  return `
    <div class="diff-item ${diff.severity}">
      <span class="icon">${icon}</span>
      <span class="pin">Pin ${diff.pinNumber}</span>
      <span class="field">${diff.field}</span>
      <span class="message">${escapeHtml(diff.message)}</span>
    </div>
  `;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// =============================================================================
// Styles
// =============================================================================

function getStyles(): string {
  return `
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      color: #333;
      line-height: 1.6;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 2rem;
    }

    header {
      background: #fff;
      padding: 1.5rem;
      border-radius: 8px;
      margin-bottom: 2rem;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    h1 {
      font-size: 1.5rem;
      margin-bottom: 0.5rem;
    }

    .meta {
      display: flex;
      gap: 1rem;
      align-items: center;
    }

    .lcsc {
      font-family: monospace;
      background: #e8e8e8;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
    }

    .status {
      font-weight: bold;
      padding: 0.25rem 0.75rem;
      border-radius: 4px;
    }

    .status.pass, .pass { color: #22c55e; }
    .status.fail, .fail { color: #ef4444; }
    .status.error { color: #f59e0b; }
    .warn { color: #f59e0b; }

    .summary {
      display: flex;
      gap: 1rem;
      margin-top: 1rem;
    }

    .stat {
      padding: 0.5rem 1rem;
      border-radius: 4px;
      background: #f0f0f0;
    }

    .stat.pass { background: #dcfce7; }
    .stat.fail { background: #fee2e2; }
    .stat.error { background: #fef3c7; }

    .error-banner {
      background: #fee2e2;
      color: #b91c1c;
      padding: 1rem;
      border-radius: 8px;
      margin-bottom: 2rem;
    }

    .comparison {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2rem;
      margin-bottom: 2rem;
    }

    .svg-panel {
      background: #fff;
      padding: 1rem;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .svg-panel h2 {
      font-size: 1rem;
      margin-bottom: 1rem;
      color: #666;
    }

    .main-columns {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
      gap: 2rem;
      margin-bottom: 2rem;
    }

    .main-column {
      background: #fff;
      border-radius: 8px;
      padding: 1.5rem;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .column-header {
      font-size: 1.25rem;
      margin-bottom: 1.5rem;
      color: #333;
      text-align: center;
      border-bottom: 2px solid #e0e0e0;
      padding-bottom: 0.75rem;
    }

    .svg-comparison {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .svg-panel {
      background: #f8f8f8;
      border-radius: 8px;
      padding: 0.75rem;
    }

    .svg-panel h3 {
      font-size: 0.75rem;
      color: #666;
      margin-bottom: 0.5rem;
      text-align: center;
    }

    .svg-container {
      background: #1a1a1a;
      padding: 0.75rem;
      border-radius: 4px;
      overflow: hidden;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 220px;
    }

    .svg-container svg {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .svg-container .no-preview {
      color: #888;
      font-style: italic;
      font-size: 0.875rem;
    }

    .validation-section {
      background: #f8f8f8;
      padding: 1rem;
      border-radius: 8px;
    }

    .validation-section h2 {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1rem;
      font-size: 1rem;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .stat-item {
      background: #f8f8f8;
      padding: 0.75rem;
      border-radius: 4px;
      text-align: center;
    }

    .stat-item .label {
      display: block;
      font-size: 0.75rem;
      color: #666;
      margin-bottom: 0.25rem;
    }

    .stat-item .value {
      font-size: 1.25rem;
      font-weight: bold;
    }

    .diff-list {
      margin-top: 1rem;
    }

    .diff-list h3 {
      font-size: 0.875rem;
      color: #666;
      margin-bottom: 0.5rem;
    }

    .diff-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem;
      background: #f8f8f8;
      border-radius: 4px;
      margin-bottom: 0.25rem;
      font-size: 0.875rem;
    }

    .diff-item.error { background: #fee2e2; }
    .diff-item.warning { background: #fef3c7; }
    .diff-item.info { background: #e0f2fe; }

    .diff-item .icon { width: 1rem; }
    .diff-item .pad, .diff-item .pin {
      font-weight: bold;
      min-width: 4rem;
    }
    .diff-item .field {
      color: #666;
      min-width: 5rem;
    }
    .diff-item .message {
      flex: 1;
    }

    .results-table {
      background: #fff;
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 2rem;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th, td {
      padding: 0.75rem 1rem;
      text-align: left;
      border-bottom: 1px solid #eee;
    }

    th {
      background: #f8f8f8;
      font-weight: 600;
    }

    tr.pass { background: #f0fdf4; }
    tr.fail { background: #fef2f2; }
    tr.error { background: #fffbeb; }

    .center { text-align: center; }
    .right { text-align: right; }

    .detailed-results {
      margin-top: 2rem;
    }

    .result-detail {
      background: #fff;
      padding: 1.5rem;
      border-radius: 8px;
      margin-bottom: 1.5rem;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .result-detail h3 {
      margin-bottom: 1rem;
    }

    .error-message {
      background: #fee2e2;
      color: #b91c1c;
      padding: 0.75rem;
      border-radius: 4px;
      margin-bottom: 1rem;
    }

    footer {
      text-align: center;
      color: #666;
      font-size: 0.875rem;
      margin-top: 2rem;
      padding-top: 2rem;
      border-top: 1px solid #ddd;
    }

    @media (max-width: 768px) {
      .comparison {
        grid-template-columns: 1fr;
      }
    }
  `;
}
