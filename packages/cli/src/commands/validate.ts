/**
 * Validate command
 * Compare generated footprints/symbols against JLCPCB reference
 */

import * as p from '@clack/prompts';
import chalk from 'chalk';
import { writeFileSync } from 'fs';
import {
  fetchReferenceSVG,
  extractFromReferenceSVG,
  extractFromKiCadFootprint,
  compareFootprints,
  formatComparisonResult,
  extractSymbolFromReferenceSVG,
  extractFromKiCadSymbol,
  compareSymbols,
  formatSymbolComparisonResult,
  generateValidationReport,
  generateBatchReport,
  TEST_CATEGORIES,
  getAllTestComponents,
  getTestComponentsByCategory,
  getCategoryNames,
  renderFootprintSvg,
  renderSymbolSvg,
  type ValidationResult,
  type ReportSvgs,
  easyedaClient,
  footprintConverter,
  symbolConverter,
} from '@jlcpcb/core';

interface ValidateOptions {
  footprintOnly?: boolean;
  symbolOnly?: boolean;
  category?: string;
  all?: boolean;
  html?: string;
  json?: boolean;
}

/**
 * Validate a single component
 */
async function validateComponent(
  lcscCode: string,
  options: { footprint: boolean; symbol: boolean }
): Promise<ValidationResult> {
  const startTime = Date.now();
  const normalizedCode = lcscCode.replace(/^C/i, '');
  const fullCode = `C${normalizedCode}`;

  try {
    // Fetch reference SVG
    const reference = await fetchReferenceSVG(fullCode);

    // Fetch component data
    const componentData = await easyedaClient.getComponentData(fullCode);
    if (!componentData) {
      return {
        lcscCode: fullCode,
        componentName: fullCode,
        passed: false,
        footprint: null,
        symbol: null,
        timestamp: new Date(),
        durationMs: Date.now() - startTime,
        error: 'Failed to fetch component data from EasyEDA',
      };
    }

    let footprintResult = null;
    let symbolResult = null;

    // Validate footprint
    if (options.footprint && reference.footprintSvg) {
      const kicadContent = footprintConverter.convert(componentData, {});

      const refData = extractFromReferenceSVG(reference.footprintSvg);
      const genData = extractFromKiCadFootprint(kicadContent);

      footprintResult = compareFootprints(refData, genData, {
        sizeWarningsOnly: true,
        positionTolerance: 50,
      });
    }

    // Validate symbol
    if (options.symbol && reference.symbolSvg) {
      const kicadContent = symbolConverter.convert(componentData, {
        symbolName: componentData.info.name,
      });

      const refData = extractSymbolFromReferenceSVG(reference.symbolSvg);
      const genData = extractFromKiCadSymbol(kicadContent);

      symbolResult = compareSymbols(refData, genData, {
        positionTolerance: 50,
      });
    }

    const passed =
      (!footprintResult || footprintResult.passed) && (!symbolResult || symbolResult.passed);

    return {
      lcscCode: fullCode,
      componentName: componentData.info.name || fullCode,
      passed,
      footprint: footprintResult,
      symbol: symbolResult,
      timestamp: new Date(),
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      lcscCode: fullCode,
      componentName: fullCode,
      passed: false,
      footprint: null,
      symbol: null,
      timestamp: new Date(),
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function validateCommand(
  id: string | undefined,
  options: ValidateOptions
): Promise<void> {
  const validateFootprint = !options.symbolOnly;
  const validateSymbol = !options.footprintOnly;

  // Single component validation
  if (id && !options.category && !options.all) {
    const spinner = p.spinner();
    spinner.start(`Validating ${id}...`);

    const result = await validateComponent(id, {
      footprint: validateFootprint,
      symbol: validateSymbol,
    });

    spinner.stop(result.passed ? chalk.green('✓ Validation passed') : chalk.red('✗ Validation failed'));

    // Display results
    console.log();
    console.log(chalk.bold(`${result.componentName} (${result.lcscCode})`));
    console.log(chalk.dim(`Duration: ${result.durationMs}ms`));
    console.log();

    if (result.error) {
      console.log(chalk.red(`Error: ${result.error}`));
      process.exit(1);
    }

    if (result.footprint) {
      console.log(formatComparisonResult(result.footprint));
    }

    if (result.symbol) {
      console.log(formatSymbolComparisonResult(result.symbol));
    }

    // JSON output
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    }

    // HTML output
    if (options.html) {
      const reference = await fetchReferenceSVG(id);
      const componentData = await easyedaClient.getComponentData(id);

      const svgs: ReportSvgs = {
        footprintRef: reference.footprintSvg || undefined,
        symbolRef: reference.symbolSvg || undefined,
      };

      // Generate our KiCad output and render to SVG
      if (componentData) {
        if (validateFootprint) {
          const kicadFootprint = footprintConverter.convert(componentData, {});
          svgs.footprintGen = renderFootprintSvg(kicadFootprint);
        }
        if (validateSymbol) {
          const kicadSymbol = symbolConverter.convert(componentData, {
            symbolName: componentData.info.name,
          });
          svgs.symbolGen = renderSymbolSvg(kicadSymbol);
        }
      }

      const html = generateValidationReport(result, svgs);
      writeFileSync(options.html, html);
      console.log(chalk.dim(`HTML report: ${options.html}`));
    }

    process.exit(result.passed ? 0 : 1);
  }

  // Batch validation
  let components = options.all
    ? getAllTestComponents()
    : options.category
      ? getTestComponentsByCategory(options.category)
      : [];

  if (components.length === 0 && !id) {
    // Interactive category selection
    const categories = getCategoryNames();
    const selected = await p.select({
      message: 'Select a category to validate:',
      options: [
        { value: 'all', label: 'All categories' },
        ...categories.map((c) => ({ value: c, label: c })),
      ],
    });

    if (p.isCancel(selected)) {
      p.cancel('Validation cancelled');
      process.exit(0);
    }

    components =
      selected === 'all' ? getAllTestComponents() : getTestComponentsByCategory(selected as string);
  }

  // Filter out skipped components
  components = components.filter((c) => !c.skip);

  if (components.length === 0) {
    p.log.warn('No components to validate');
    process.exit(0);
  }

  console.log(chalk.bold(`\nValidating ${components.length} components...\n`));

  const results: ValidationResult[] = [];
  let passed = 0;
  let failed = 0;
  let errors = 0;

  for (const component of components) {
    process.stdout.write(`  ${component.lcsc.padEnd(12)} ${component.name.slice(0, 40).padEnd(42)} `);

    const result = await validateComponent(component.lcsc, {
      footprint: validateFootprint,
      symbol: validateSymbol,
    });

    results.push(result);

    if (result.error) {
      errors++;
      console.log(chalk.yellow('⚠ ERROR'));
    } else if (result.passed) {
      passed++;
      console.log(chalk.green('✓ PASS'));
    } else {
      failed++;
      console.log(chalk.red('✗ FAIL'));
    }
  }

  // Summary
  console.log();
  console.log(chalk.bold('Summary:'));
  console.log(`  ${chalk.green(`${passed} passed`)}  ${chalk.red(`${failed} failed`)}  ${chalk.yellow(`${errors} errors`)}`);
  console.log();

  // JSON output
  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
  }

  // HTML output
  if (options.html) {
    const html = generateBatchReport(results, 'JLC-CLI Validation Report');
    writeFileSync(options.html, html);
    console.log(chalk.dim(`HTML report: ${options.html}`));
  }

  process.exit(failed > 0 || errors > 0 ? 1 : 0);
}
